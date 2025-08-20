import { TokenConfig, ConnectionStatus } from './types';
import { ExchangeFactory } from './exchanges';
import { dexPriceFetcher } from './dex/price-fetcher';
import { priceStore } from './price-store';
import { BaseExchange } from './exchanges/base-exchange';

interface ActiveConnection {
  exchange?: BaseExchange;
  dexMonitor?: () => void; //cleanup function for DEX monitoring
  status: ConnectionStatus;
}

export class ConnectionManager {
  private activeConnections = new Map<string, ActiveConnection>();
  private statusCallbacks = new Set<(status: ConnectionStatus) => void>();
  

  async startMonitoring(config: TokenConfig): Promise<void> {
    const { ticker, exchanges, dexContracts, thresholdPercent } = config;
    
    console.log(`Starting monitoring for ${ticker}`);
    console.log(`Threshold: ${thresholdPercent}%`);
    
    //set arbitrage threshold in price store
    priceStore.setThreshold(ticker, thresholdPercent);
    
    try {
      //start all exchange connections in parallel
      const exchangePromises = exchanges.map(exchangeName => 
        this.connectToExchange(ticker, exchangeName)
      );
      
      //start DEX monitoring for each contract
      const dexPromises = Object.entries(dexContracts).map(([chain, contract]) => {
        if (contract) {
          return this.startDEXMonitoring(ticker, chain, contract);
        }
        return Promise.resolve();
      });
      
      //wait for all connections
      await Promise.allSettled([...exchangePromises, ...dexPromises]);
      
      console.log(`Monitoring started for ${ticker}`);
      
    } catch (error) {
      console.error(`Failed to start monitoring for ${ticker}:`, error);
      throw error;
    }
  }
  

  private async connectToExchange(ticker: string, exchangeName: string): Promise<void> {
    const connectionKey = `${ticker}-${exchangeName}`;
    
    try {
      //create exchange instance
      const exchange = ExchangeFactory.createExchange(exchangeName);
      if (!exchange) {
        throw new Error(`Failed to create exchange: ${exchangeName}`);
      }
      
      //set up status callback
      exchange.onStatusUpdate = (status: ConnectionStatus) => {
        this.updateConnectionStatus(connectionKey, status);
      };
      
      //initialize connection record
      this.activeConnections.set(connectionKey, {
        exchange,
        status: {
          exchange: exchangeName,
          ticker,
          status: 'connecting'
        }
      });
      
      //connect
      await exchange.connect(ticker);
      
      console.log(`Connected to ${exchangeName} for ${ticker}`);
      
    } catch (error) {
      console.error(`Failed to connect to ${exchangeName}:`, error);
      
      this.updateConnectionStatus(connectionKey, {
        exchange: exchangeName,
        ticker,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async startDEXMonitoring(ticker: string, chain: string, contractAddress: string): Promise<void> {
    const connectionKey = `${ticker}-${chain}-dex`;
    
    try {
      console.log(`Starting DEX monitoring: ${chain} - ${contractAddress}`);
      
      //start monitoring with 0.5-second intervals for speed
      const cleanup = dexPriceFetcher.startMonitoring(chain, contractAddress, ticker, 500);
      
      // Store connection
      this.activeConnections.set(connectionKey, {
        dexMonitor: cleanup,
        status: {
          exchange: `${chain}-dex`,
          ticker,
          status: 'connected'
        }
      });
      
      this.updateConnectionStatus(connectionKey, {
        exchange: `${chain}-dex`,
        ticker,
        status: 'connected'
      });
      
      console.log(`DEX monitoring started: ${chain} - ${ticker}`);
      
    } catch (error) {
      console.error(`Failed to start DEX monitoring for ${chain}:`, error);
      
      this.updateConnectionStatus(connectionKey, {
        exchange: `${chain}-dex`,
        ticker,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'DEX monitoring failed'
      });
    }
  }
  

  async stopMonitoring(ticker: string): Promise<void> {
    console.log(`Stopping monitoring for ${ticker}`);
    
    const connectionsToStop = Array.from(this.activeConnections.entries())
      .filter(([key]) => key.startsWith(`${ticker}-`));
    
    for (const [connectionKey, connection] of connectionsToStop) {
      try {
        if (connection.exchange) {
          connection.exchange.disconnect();
        }
        
        if (connection.dexMonitor) {
          connection.dexMonitor();
        }

        this.activeConnections.delete(connectionKey);
        
        this.updateConnectionStatus(connectionKey, {
          ...connection.status,
          status: 'disconnected'
        });
        
      } catch (error) {
        console.error(`Error stopping connection ${connectionKey}:`, error);
      }
    }
    
    //clear price store data
    priceStore.clearTicker(ticker);
    
    console.log(`Monitoring stopped for ${ticker}`);
  }
  
  getConnectionStatus(ticker?: string): ConnectionStatus[] {
    const connections = Array.from(this.activeConnections.entries());
    
    if (ticker) {
      return connections
        .filter(([key]) => key.startsWith(`${ticker}-`))
        .map(([, connection]) => connection.status);
    }
    
    return connections.map(([, connection]) => connection.status);
  }
  
	//manual exchange reconnect
  async reconnectExchange(ticker: string, exchangeName: string): Promise<void> {
    const connectionKey = `${ticker}-${exchangeName}`;
    const connection = this.activeConnections.get(connectionKey);
    
    if (connection?.exchange) {
      console.log(`Reconnecting ${exchangeName} for ${ticker}`);
      connection.exchange.reconnect();
    } else {
      console.log(`Connection not found, creating new connection for ${exchangeName}`);
      await this.connectToExchange(ticker, exchangeName);
    }
  }
  
  private updateConnectionStatus(connectionKey: string, status: ConnectionStatus): void {
    const connection = this.activeConnections.get(connectionKey);
    if (connection) {
      connection.status = status;
    }

    this.statusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Status callback error:', error);
      }
    });
  }
  
  onStatusUpdate(callback: (status: ConnectionStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    
    //return unsubscribe function
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }
  
  getActiveConnectionsCount(): number {
    return Array.from(this.activeConnections.values())
      .filter(conn => conn.status.status === 'connected').length;
  }

  getMonitoredTickers(): string[] {
    const tickers = new Set<string>();
    
    for (const [key] of this.activeConnections) {
      const ticker = key.split('-')[0];
      tickers.add(ticker);
    }
    
    return Array.from(tickers);
  }

  async healthCheck(): Promise<{ healthy: number; total: number; issues: string[] }> {
    const connections = Array.from(this.activeConnections.values());
    const total = connections.length;
    let healthy = 0;
    const issues: string[] = [];
    
    for (const connection of connections) {
      if (connection.status.status === 'connected') {
        healthy++;
      } else if (connection.status.status === 'error') {
        issues.push(`${connection.status.exchange}: ${connection.status.errorMessage}`);
      }
    }
    
    return { healthy, total, issues };
  }
  
  async emergencyDisconnectAll(): Promise<void> {
    console.log('Emergency disconnect - stopping all monitoring');
    
    const tickers = this.getMonitoredTickers();
    
    for (const ticker of tickers) {
      try {
        await this.stopMonitoring(ticker);
      } catch (error) {
        console.error(`Error during emergency disconnect for ${ticker}:`, error);
      }
    }
    
    console.log('Emergency disconnect completed');
  }
}

export const connectionManager = new ConnectionManager();