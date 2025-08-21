'use client'

import { useState } from "react";
import { TokenConfig } from "@/lib/types";
import { dexPriceFetcher } from "@/lib/dex/price-fetcher";
import { ExchangeFactory } from "@/lib/exchanges";

interface AddTokenFormProps {
  onSubmit: (config: TokenConfig) => Promise<void>;
  isLoading: boolean;
}

export function AddTokenForm({ onSubmit, isLoading }: AddTokenFormProps) {
  const [ticker, setTicker] = useState('');
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>([]);
  const [dexContracts, setDexContracts] = useState({
    bsc: '',
    eth: '',
    polygon: '',
    arbitrum: ''
  });
  const [thresholdPercent, setThresholdPercent] = useState(1);
  
  const availableExchanges = ExchangeFactory.getSpotExchanges();
  const availableChains = dexPriceFetcher.getSupportedChains();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!ticker.trim()) {
      alert('Please enter a ticker symbol');
      return;
    }
    
    if (selectedExchanges.length === 0 && Object.values(dexContracts).every(contract => !contract.trim())) {
      alert('Please select at least one exchange or enter at least one DEX contract');
      return;
    }
    
    //filter empty DEX contracts
    const filteredDexContracts = Object.fromEntries(
      Object.entries(dexContracts).filter(([, contract]) => contract.trim())
    );
    
    const config: TokenConfig = {
      ticker: ticker.trim().toUpperCase(),
      exchanges: selectedExchanges,
      dexContracts: filteredDexContracts,
      thresholdPercent
    };
    
    await onSubmit(config);
    
    //reset form
    setTicker('');
    setSelectedExchanges([]);
    setDexContracts({ bsc: '', eth: '', polygon: '', arbitrum: '' });
    setThresholdPercent(1);
  };
  
  const handleExchangeToggle = (exchange: string) => {
    setSelectedExchanges(prev => 
      prev.includes(exchange)
        ? prev.filter(e => e !== exchange)
        : [...prev, exchange]
    );
  };
  
  const handleDexContractChange = (chain: string, value: string) => {
    setDexContracts(prev => ({
      ...prev,
      [chain]: value
    }));
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* TICKER INPUT */}
      <div>
        <label htmlFor="ticker" className="block text-sm font-medium text-gray-300 mb-2">
          Token Ticker Symbol
        </label>
        <input
          id="ticker"
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="e.g. DAM, PEPE, etc."
          className="w-full px-3 py-2 bg-slate-800 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          disabled={isLoading}
          autoComplete="off"
        />
      </div>
      
      {/* EXCHANGES SELECTION */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Select Exchanges
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {availableExchanges.map(exchange => (
            <label key={exchange} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedExchanges.includes(exchange)}
                onChange={() => handleExchangeToggle(exchange)}
                disabled={isLoading}
                className="rounded border-gray-600 text-green-600 focus:ring-green-500 focus:ring-offset-0 bg-slate-800"
              />
              <span className="text-sm text-gray-300 capitalize">{exchange}</span>
            </label>
          ))}
        </div>
      </div>
      
      {/* DEX CONTRACTS */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          DEX Contract Addresses (Optional)
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableChains.map(chain => (
            <div key={chain}>
              <label htmlFor={`${chain}-contract`} className="block text-xs text-gray-400 mb-1">
                {chain.toUpperCase()} Contract
              </label>
              <input
                id={`${chain}-contract`}
                type="text"
                value={dexContracts[chain as keyof typeof dexContracts] || ''}
                onChange={(e) => handleDexContractChange(chain, e.target.value)}
                placeholder={`0x${chain === 'eth' ? 'ethereum' : chain} contract address`}
                className="w-full px-3 py-2 bg-slate-800 border border-gray-600 rounded-md text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                disabled={isLoading}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Enter Uniswap V2 style pair contract addresses for DEX price monitoring
        </p>
      </div>
      
      {/* THRESHOLD SETTING */}
      <div>
        <label htmlFor="threshold" className="block text-sm font-medium text-gray-300 mb-2">
          Arbitrage Threshold ({thresholdPercent}%)
        </label>
        <div className="flex items-center space-x-4">
          <input
            id="threshold"
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={thresholdPercent}
            onChange={(e) => setThresholdPercent(parseFloat(e.target.value))}
            disabled={isLoading}
            className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
          />
          <input
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            value={thresholdPercent}
            onChange={(e) => setThresholdPercent(parseFloat(e.target.value) || 1)}
            disabled={isLoading}
            className="w-20 px-2 py-1 bg-slate-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <span className="text-sm text-gray-400">%</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Minimum spread percentage to trigger arbitrage alerts
        </p>
      </div>
      
      {/* SUBMIT BUTTON */}
      <button
        type="submit"
        disabled={isLoading || !ticker.trim()}
        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-slate-900"
      >
        {isLoading ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Starting Monitoring...</span>
          </div>
        ) : (
          '🚀 Start Monitoring'
        )}
      </button>
      
      {/* FORM VALIDATION SUMMARY */}
      <div className="text-xs text-gray-500 space-y-1">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${ticker.trim() ? 'bg-green-500' : 'bg-gray-500'}`}></div>
          <span>Ticker symbol entered</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            selectedExchanges.length > 0 || Object.values(dexContracts).some(c => c.trim()) 
              ? 'bg-green-500' 
              : 'bg-gray-500'
          }`}></div>
          <span>At least one exchange or DEX contract selected</span>
        </div>
      </div>
    </form>
  );
}

/* CUSTOM SLIDER STYLING */
const sliderStyles = `
.slider::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: #10b981;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px #10b981;
}

.slider::-moz-range-thumb {
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: #10b981;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px #10b981;
}
`;

//inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.innerText = sliderStyles;
  document.head.appendChild(styleSheet);
}

