'use client';

import { useState } from 'react';
import { TokenConfig, ArbitrageOpportunity } from '@/lib/types';
import { AddTokenForm } from './AddTokenForm';
import { ArbitrageMonitor } from './ArbitrageMonitor';
import { PriceCard } from './PriceCard';
import { connectionManager } from '@/lib/connection-manager';
import { priceStore } from '@/lib/price-store';

interface MonitoringToken extends TokenConfig {
  id: string;
  opportunities: ArbitrageOpportunity[];
}

export function Dashboard() {
  const [monitoringTokens, setMonitoringTokens] = useState<MonitoringToken[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleAddToken = async (config: TokenConfig) => {
    setIsLoading(true);
    
    try {
      const tokenId = `${config.ticker}-${Date.now()}`;
      
      //start monitoring
      await connectionManager.startMonitoring(config);
      
      //add to local state
      const newToken: MonitoringToken = {
        ...config,
        id: tokenId,
        opportunities: []
      };
      
      setMonitoringTokens(prev => [...prev, newToken]);
      
      //sub to arbitrage opportunities
      priceStore.subscribe(config.ticker, (ticker, opportunities) => {
        setMonitoringTokens(prev => 
          prev.map(token => 
            token.ticker === ticker 
              ? { ...token, opportunities }
              : token
          )
        );
      });
      
      console.log(`✅ Started monitoring ${config.ticker}`);
      
    } catch (error) {
      console.error('Failed to add token:', error);
      alert(`Failed to start monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };
  

  const handleRemoveToken = async (tokenId: string) => {
    const token = monitoringTokens.find(t => t.id === tokenId);
    if (!token) return;
    
    try {
      //stop monitoring
      await connectionManager.stopMonitoring(token.ticker);
      
      //remove from local state
      setMonitoringTokens(prev => prev.filter(t => t.id !== tokenId));
      
      console.log(`✅ Stopped monitoring ${token.ticker}`);
      
    } catch (error) {
      console.error('Failed to remove token:', error);
      alert(`Failed to stop monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  

  const handleEmergencyStop = async () => {
    if (!confirm('Stop all monitoring? This will disconnect all connections.')) return;
    
    try {
      await connectionManager.emergencyDisconnectAll();
      setMonitoringTokens([]);
      console.log('✅ All monitoring stopped');
    } catch (error) {
      console.error('Emergency stop failed:', error);
    }
  };
  

  const getHighestProfit = (opportunities: ArbitrageOpportunity[]): number => {
    return opportunities.reduce((max, opp) => Math.max(max, opp.profitPercent), 0);
  };
  
  return (
    <div className="space-y-8">
      {/* CONTROL PANEL */}
      <div className="bg-neutral-900 rounded-lg p-6 border border-neutral-700">
        <h2 className="text-xl font-semibold mb-4 text-green-400">Add New Token</h2>
        <AddTokenForm onSubmit={handleAddToken} isLoading={isLoading} />
        
        {/* EMERGENCY CONTROLS */}
        {monitoringTokens.length > 0 && (
          <div className="mt-4 pt-4 border-t border-neutral-700 flex justify-between items-center">
            <div className="text-sm text-gray-400">
              Monitoring {monitoringTokens.length} token{monitoringTokens.length !== 1 ? 's' : ''}
            </div>
            <button
              onClick={handleEmergencyStop}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-sm font-medium transition-colors"
            >
              🚨 Stop All
            </button>
          </div>
        )}
      </div>
      
      {/* MONITORING DASHBOARD */}
      {monitoringTokens.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📈</div>
          <h3 className="text-xl font-medium text-gray-300 mb-2">No Tokens Monitored</h3>
          <p className="text-gray-500">Add a token above to start monitoring arbitrage opportunities</p>
        </div>
      ) : (
        <div className="space-y-6">
          {monitoringTokens.map((token) => (
            <div key={token.id} className="bg-neutral-900 rounded-lg border border-neutral-700 overflow-hidden">
              {/* TOKEN HEADER */}
              <div className="bg-neutral-800 px-6 py-4 border-b border-neutral-700">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      {token.ticker.toUpperCase()}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-400 mt-1">
                      <span>Threshold: {token.thresholdPercent}%</span>
                      <span>•</span>
                      <span>{token.exchanges.length} Exchanges</span>
                      <span>•</span>
                      <span>{Object.keys(token.dexContracts).length} DEX Chains</span>
                      {token.opportunities.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-green-400 font-medium">
                            Max Spread: {getHighestProfit(token.opportunities).toFixed(2)}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveToken(token.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-sm font-medium transition-colors"
                  >
                    Stop
                  </button>
                </div>
              </div>
              
              {/* PRICE CARDS */}
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                  {/* Exchange Price Cards */}
                  {token.exchanges.map(exchange => (
                    <PriceCard
                      key={exchange}
                      exchange={exchange}
                      ticker={token.ticker}
                    />
                  ))}
                  
                  {/* DEX Price Cards */}
                  {Object.entries(token.dexContracts).map(([chain, contract]) => 
                    contract ? (
                      <PriceCard
                        key={`${chain}-dex`}
                        exchange={`${chain}-dex`}
                        ticker={token.ticker}
                      />
                    ) : null
                  )}
                </div>
                
                {/* ARBITRAGE OPPORTUNITIES */}
                <ArbitrageMonitor ticker={token.ticker} />
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* PERFORMANCE STATS */}
      {monitoringTokens.length > 0 && (
        <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Performance Stats</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-400">Active Connections</div>
              <div className="text-green-400 font-mono">
                {connectionManager.getActiveConnectionsCount()}
              </div>
            </div>
            <div>
              <div className="text-gray-400">Total Opportunities</div>
              <div className="text-yellow-400 font-mono">
                {monitoringTokens.reduce((sum, token) => sum + token.opportunities.length, 0)}
              </div>
            </div>
            <div>
              <div className="text-gray-400">Monitored Tickers</div>
              <div className="text-blue-400 font-mono">
                {monitoringTokens.length}
              </div>
            </div>
            <div>
              <div className="text-gray-400">Update Frequency</div>
              <div className="text-purple-400 font-mono">
                Real-time
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}