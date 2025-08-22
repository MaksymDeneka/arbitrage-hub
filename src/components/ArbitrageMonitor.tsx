'use client';

import { useState, useEffect } from 'react';
import { ArbitrageOpportunity } from '@/lib/types';
import { priceStore } from '@/lib/price-store';

interface ArbitrageMonitorProps {
  ticker: string;
}

export function ArbitrageMonitor({ ticker }: ArbitrageMonitorProps) {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [flashingOpportunity, setFlashingOpportunity] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  

  useEffect(() => {
    const unsubscribe = priceStore.subscribe(ticker, (tickerName, newOpportunities) => {
      if (tickerName !== ticker) return;

      const highProfitOpp = newOpportunities.find(opp => opp.profitPercent >= 5);

      if (highProfitOpp && opportunities.length < newOpportunities.length) {
        const oppId = `${highProfitOpp.buyFrom.exchange}-${highProfitOpp.sellTo.exchange}`;
        setFlashingOpportunity(oppId);
        setTimeout(() => setFlashingOpportunity(null), 1000);

        if (soundEnabled) {
          playNotificationSound();
        }
      }

      setOpportunities(newOpportunities);
    });

    //cleanup
    return () => {
      unsubscribe();
    };
  }, [ticker, opportunities.length, soundEnabled]);
  
  const playNotificationSound = () => {
    //beep sound
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  };
  
  const getProfitLevel = (profitPercent: number): 'low' | 'medium' | 'high' | 'extreme' => {
    if (profitPercent >= 10) return 'extreme';
    if (profitPercent >= 5) return 'high';
    if (profitPercent >= 2) return 'medium';
    return 'low';
  };
  
  const getProfitLevelColor = (level: 'low' | 'medium' | 'high' | 'extreme'): string => {
    const colors = {
      'low': 'border-gray-600 bg-slate-800',
      'medium': 'border-yellow-500 bg-yellow-900/20 glow-yellow',
      'high': 'border-green-500 bg-green-900/20 glow-green',
      'extreme': 'border-red-500 bg-red-900/20 animate-pulse'
    };
    return colors[level];
  };
  
  const getProfitLevelIcon = (level: 'low' | 'medium' | 'high' | 'extreme'): string => {
    const icons = {
      'low': '💰',
      'medium': '🚀',
      'high': '💎',
      'extreme': '🔥'
    };
    return icons[level];
  };
  
  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 1000) return 'Just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return new Date(timestamp).toLocaleTimeString();
  };
  
  const calculatePotentialProfit = (opportunity: ArbitrageOpportunity, investment = 1000): string => {
    const profit = (investment * opportunity.profitPercent) / 100;
    return profit.toFixed(2);
  };
  
  if (opportunities.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-gray-700">
        <div className="text-center">
          <div className="text-4xl mb-2">👀</div>
          <h3 className="text-lg font-medium text-gray-300 mb-1">Watching for Opportunities</h3>
          <p className="text-sm text-gray-500">
            No arbitrage opportunities detected above the threshold
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-green-400">
          🎯 Arbitrage Opportunities ({opportunities.length})
        </h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              soundEnabled 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-600 text-gray-300'
            }`}
          >
            {soundEnabled ? '🔊' : '🔇'} Sound
          </button>
        </div>
      </div>
      
      {/* OPPORTUNITIES LIST */}
      <div className="grid gap-4">
        {opportunities.map((opportunity, index) => {
          const profitLevel = getProfitLevel(opportunity.profitPercent);
          const oppId = `${opportunity.buyFrom.exchange}-${opportunity.sellTo.exchange}`;
          const isFlashing = flashingOpportunity === oppId;
          
          return (
            <div
              key={`${oppId}-${index}`}
              className={`opportunity-card ${profitLevel}-profit p-4 rounded-lg border-2 transition-all duration-300 ${
                getProfitLevelColor(profitLevel)
              } ${isFlashing ? 'flash-profit' : ''}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{getProfitLevelIcon(profitLevel)}</span>
                  <div>
                    <div className="font-bold text-white text-lg">
                      {opportunity.profitPercent.toFixed(2)}% Spread
                    </div>
                    <div className="text-sm text-gray-400">
                      {formatTimestamp(opportunity.timestamp)}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-green-400 font-bold">
                    +${opportunity.profit.toFixed(6)}
                  </div>
                  <div className="text-xs text-gray-400">
                    Per token
                  </div>
                </div>
              </div>
              
              {/* TRADE DETAILS */}
              <div className="space-y-2 bg-slate-900 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm text-gray-400">Buy from</div>
                    <div className="font-medium text-white capitalize">
                      {opportunity.buyFrom.exchange.replace('-', ' ')}
                    </div>
                    <div className="font-mono text-green-400">
                      ${opportunity.buyFrom.price.toFixed(6)}
                    </div>
                  </div>
                  
                  <div className="text-2xl text-gray-400">→</div>
                  
                  <div className="text-right">
                    <div className="text-sm text-gray-400">Sell to</div>
                    <div className="font-medium text-white capitalize">
                      {opportunity.sellTo.exchange.replace('-', ' ')}
                    </div>
                    <div className="font-mono text-red-400">
                      ${opportunity.sellTo.price.toFixed(6)}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* PROFIT CALCULATOR */}
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-400">$100 investment</div>
                    <div className="font-bold text-green-400">
                      +${calculatePotentialProfit(opportunity, 100)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">$1,000 investment</div>
                    <div className="font-bold text-green-400">
                      +${calculatePotentialProfit(opportunity, 1000)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">$10,000 investment</div>
                    <div className="font-bold text-green-400">
                      +${calculatePotentialProfit(opportunity, 10000)}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* RISK WARNING */}
              {profitLevel === 'extreme' && (
                <div className="mt-3 p-2 bg-red-900/30 border border-red-500 rounded text-xs text-red-300">
                  ⚠️ Extreme spread detected - verify data accuracy before trading
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* SUMMARY STATS */}
      <div className="bg-slate-800 rounded-lg p-4 border border-gray-700">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-green-400">
              {opportunities.length}
            </div>
            <div className="text-xs text-gray-400">Total Opportunities</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-400">
              {Math.max(...opportunities.map(o => o.profitPercent)).toFixed(2)}%
            </div>
            <div className="text-xs text-gray-400">Highest Spread</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">
              ${Math.max(...opportunities.map(o => o.profit)).toFixed(4)}
            </div>
            <div className="text-xs text-gray-400">Max Profit/Token</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-400">
              {opportunities.filter(o => o.profitPercent >= 5).length}
            </div>
            <div className="text-xs text-gray-400">High Profit (5%+)</div>
          </div>
        </div>
      </div>
    </div>
  );
}