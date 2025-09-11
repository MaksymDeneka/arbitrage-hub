/* eslint-disable @typescript-eslint/no-explicit-any */
import { TokenConfig, ConnectionStatus, MarketType } from './types';
import { ExchangeFactory } from './exchanges';
import { dexPriceFetcher } from './dex/price-fetcher';
import { priceStore } from './price-store';
import { BaseExchange } from './exchanges/base-exchange';
import { tokenDiscovery } from './token-discovery';


interface ActiveConnection {
  exchange?: BaseExchange;
  dexMonitor?: () => void;
  status: ConnectionStatus;
  marketType: MarketType;
}

export class ConnectionManager {
  private activeConnections = new Map<string, ActiveConnection>();
  private statusCallbacks = new Set<(status: ConnectionStatus) => void>();

  async startMonitoring(config: TokenConfig): Promise<void> {
    const { ticker, exchanges, dexContracts, thresholdPercent } = config;
    
    console.log(`🚀 Starting monitoring for ${ticker}`);
    console.log(`📊 Threshold: ${thresholdPercent}%`);
    
    // Set arbitrage threshold in price store
    priceStore.setThreshold(ticker, thresholdPercent);
    
    try {
      //start all exchange connections in parallel
      const exchangePromises: Promise<void>[] = [];
      
      for (const exchangeConfig of exchanges) {
        for (const market of exchangeConfig.markets) {
          exchangePromises.push(
            this.connectToExchange(ticker, exchangeConfig.name, market)
          );
        }
      }
      
      //start DEX monitoring for each contract
      const dexPromises = Object.entries(dexContracts).map(([chain, contract]) => {
        if (contract) {
          return this.startDEXMonitoring(ticker, chain, contract);
        }
        return Promise.resolve();
      });
      
      //wait for all connections
      await Promise.allSettled([...exchangePromises, ...dexPromises]);
      
      console.log(`✅ Monitoring started for ${ticker}`);
      
    } catch (error) {
      console.error(`❌ Failed to start monitoring for ${ticker}:`, error);
      throw error;
    }
  }

  async startMonitoringAuto(ticker: string, thresholdPercent: number = 1): Promise<void> {
    console.log(`🔍 Auto-discovering configuration for ${ticker}...`);
    
    try {
      const config = await tokenDiscovery.getRecommendedConfig(ticker, thresholdPercent);
      
      console.log(`📋 Auto-generated configuration:`);
      config.recommendations.forEach((rec: any) => console.log(`  ${rec}`));
      
      if (config.exchanges.length === 0) {
        throw new Error(`No exchanges found for ticker ${ticker}. Please verify the symbol.`);
      }
      
      await this.startMonitoring(config);
      
    } catch (error) {
      console.error(`❌ Auto-monitoring failed for ${ticker}:`, error);
      throw error;
    }
  }

  private async connectToExchange(
    ticker: string, 
    exchangeName: string, 
    marketType: MarketType
  ): Promise<void> {
    const connectionKey = `${ticker}-${exchangeName}-${marketType}`;
    
    try {
      //create or get existing exchange instance
      let exchange = this.getExchangeFromConnections(ticker, exchangeName);
      
      if (!exchange) {
        exchange = ExchangeFactory.createExchange(exchangeName) ?? undefined;
        if (!exchange) {
          throw new Error(`Failed to create exchange: ${exchangeName}`);
        }
      }
      
      //set up status callback
      exchange.onStatusUpdate = (status: ConnectionStatus) => {
        this.updateConnectionStatus(connectionKey, status);
      };
      
      //initialize connection record
      this.activeConnections.set(connectionKey, {
        exchange,
        marketType,
        status: {
          exchange: `${exchangeName}${marketType === 'futures' ? '-futures' : ''}`,
          ticker,
          status: 'connecting',
          marketType
        }
      });
      
      //connect to specific market
      await exchange.connect(ticker, [marketType]);
      
      console.log(`✅ Connected to ${exchangeName} ${marketType.toUpperCase()} for ${ticker}`);
      
    } catch (error) {
      console.error(`❌ Failed to connect to ${exchangeName} ${marketType}:`, error);
      
      this.updateConnectionStatus(connectionKey, {
        exchange: `${exchangeName}${marketType === 'futures' ? '-futures' : ''}`,
        ticker,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        marketType
      });
    }
  }

  private getExchangeFromConnections(ticker: string, exchangeName: string): BaseExchange | undefined {
    //look for existing exchange instance for this ticker and exchange
    for (const [key, connection] of this.activeConnections) {
      if (key.startsWith(`${ticker}-${exchangeName}-`) && connection.exchange) {
        return connection.exchange;
      }
    }
    return undefined;
  }

  private async startDEXMonitoring(ticker: string, chain: string, contractAddress: string): Promise<void> {
    const connectionKey = `${ticker}-${chain}-dex`;
    
    try {
      console.log(`🔗 Starting DEX monitoring: ${chain} - ${contractAddress}`);
      
      //start monitoring
      const cleanup = dexPriceFetcher.startMonitoring(chain, contractAddress, ticker, 500);
      
      this.activeConnections.set(connectionKey, {
        dexMonitor: cleanup,
        marketType: 'dex',
        status: {
          exchange: `${chain}-dex`,
          ticker,
          status: 'connected',
          marketType: 'dex'
        }
      });
      
      this.updateConnectionStatus(connectionKey, {
        exchange: `${chain}-dex`,
        ticker,
        status: 'connected',
        marketType: 'dex'
      });
      
      console.log(`✅ DEX monitoring started: ${chain} - ${ticker}`);
      
    } catch (error) {
      console.error(`❌ Failed to start DEX monitoring for ${chain}:`, error);
      
      this.updateConnectionStatus(connectionKey, {
        exchange: `${chain}-dex`,
        ticker,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'DEX monitoring failed',
        marketType: 'dex'
      });
    }
  }

  async stopMonitoring(ticker: string): Promise<void> {
    console.log(`🛑 Stopping monitoring for ${ticker}`);
    
    const connectionsToStop = Array.from(this.activeConnections.entries())
      .filter(([key]) => key.startsWith(`${ticker}-`));
    
    for (const [connectionKey, connection] of connectionsToStop) {
      try {
        if (connection.exchange) {
          //only disconnect the specific market type if there are other connections for this exchange
          const otherConnections = Array.from(this.activeConnections.entries())
            .filter(([key, conn]) => 
              key !== connectionKey && 
              key.startsWith(`${ticker}-`) &&
              conn.exchange === connection.exchange
            );
          
          if (otherConnections.length === 0) {
            connection.exchange.disconnect();
          } else {
            connection.exchange.disconnect([connection.marketType]);
          }
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
        console.error(`❌ Error stopping connection ${connectionKey}:`, error);
      }
    }
    
    //clear price store data
    priceStore.clearTicker(ticker);
    
    console.log(`✅ Monitoring stopped for ${ticker}`);
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
  
  //manual reconnect
  async reconnectExchange(
    ticker: string, 
    exchangeName: string, 
    marketType: MarketType = 'spot'
  ): Promise<void> {
    const connectionKey = `${ticker}-${exchangeName}-${marketType}`;
    const connection = this.activeConnections.get(connectionKey);
    
    if (connection?.exchange) {
      console.log(`🔄 Reconnecting ${exchangeName} ${marketType} for ${ticker}`);
      await connection.exchange.reconnect([marketType]);
    } else {
      console.log(`🔄 Connection not found, creating new connection for ${exchangeName} ${marketType}`);
      await this.connectToExchange(ticker, exchangeName, marketType);
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
        console.error('❌ Status callback error:', error);
      }
    });
  }
  
  onStatusUpdate(callback: (status: ConnectionStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    
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

  async healthCheck(): Promise<{ 
    healthy: number; 
    total: number; 
    issues: string[];
    byMarketType: { [key in MarketType]: { healthy: number; total: number } };
  }> {
    const connections = Array.from(this.activeConnections.values());
    const total = connections.length;
    let healthy = 0;
    const issues: string[] = [];
    
    const byMarketType: { [key in MarketType]: { healthy: number; total: number } } = {
      spot: { healthy: 0, total: 0 },
      futures: { healthy: 0, total: 0 },
      dex: { healthy: 0, total: 0 }
    };
    
    for (const connection of connections) {
      const marketType = connection.marketType;
      byMarketType[marketType].total++;
      
      if (connection.status.status === 'connected') {
        healthy++;
        byMarketType[marketType].healthy++;
      } else if (connection.status.status === 'error') {
        issues.push(`${connection.status.exchange} ${marketType}: ${connection.status.errorMessage}`);
      }
    }
    
    return { healthy, total, issues, byMarketType };
  }
  
  async emergencyDisconnectAll(): Promise<void> {
    console.log('🚨 Emergency disconnect - stopping all monitoring');
    
    const tickers = this.getMonitoredTickers();
    
    for (const ticker of tickers) {
      try {
        await this.stopMonitoring(ticker);
      } catch (error) {
        console.error(`❌ Error during emergency disconnect for ${ticker}:`, error);
      }
    }
    
    console.log('✅ Emergency disconnect completed');
  }

  //get detailed monitoring info
  getMonitoringInfo(): {
    tickers: string[];
    connections: { [ticker: string]: ConnectionStatus[] };
    totalConnections: number;
    healthyConnections: number;
  } {
    const tickers = this.getMonitoredTickers();
    const connections: { [ticker: string]: ConnectionStatus[] } = {};
    
    for (const ticker of tickers) {
      connections[ticker] = this.getConnectionStatus(ticker);
    }
    
    const totalConnections = this.activeConnections.size;
    const healthyConnections = Array.from(this.activeConnections.values())
      .filter(conn => conn.status.status === 'connected').length;
    
    return {
      tickers,
      connections,
      totalConnections,
      healthyConnections
    };
  }
}

export const connectionManager = new ConnectionManager();