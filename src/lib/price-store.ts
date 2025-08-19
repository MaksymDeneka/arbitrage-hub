import { PriceData, ArbitrageOpportunity, TokenConfig } from './types';

const SPREAD_THRESHOLDS = {
  1: 0.01,
  2: 0.02,
  3: 0.03,
  5: 0.05,
  10: 0.10
} as const;

type ArbitrageCallback = (ticker: string, opportunities: ArbitrageOpportunity[]) => void;

class PriceStore {
  //using Maps for faster lookups instead of arrays
  private prices = new Map<string, Map<string, PriceData>>();
  private callbacks = new Map<string, ArbitrageCallback[]>();
  private lastOpportunities = new Map<string, ArbitrageOpportunity[]>();
  private thresholds = new Map<string, number>();
  
  updatePrice(ticker: string, exchange: string, price: PriceData): void {
    //initialize maps only when needed
    if (!this.prices.has(ticker)) {
      this.prices.set(ticker, new Map());
    }
    
    const tickerPrices = this.prices.get(ticker)!;
    tickerPrices.set(exchange, price);
    
    const opportunities = this.calculateArbitrage(ticker, tickerPrices);
    
    //trigger callbacks only if spread changed significantly
    if (this.hasSignificantChange(ticker, opportunities)) {
      this.lastOpportunities.set(ticker, opportunities);
      this.notifyCallbacks(ticker, opportunities);
    }
  }
  

  private calculateArbitrage(ticker: string, prices: Map<string, PriceData>): ArbitrageOpportunity[] {
    const priceArray = Array.from(prices.values());
    if (priceArray.length < 2) return [];
    
    const opportunities: ArbitrageOpportunity[] = [];
    const threshold = this.thresholds.get(ticker) || 1;
    

    let minPrice = priceArray[0];
    let maxPrice = priceArray[0];
    
    for (let i = 1; i < priceArray.length; i++) {
      const current = priceArray[i];
      if (current.price < minPrice.price) minPrice = current;
      if (current.price > maxPrice.price) maxPrice = current;
    }
    
    const spreadPercent = this.calculateSpread(minPrice.price, maxPrice.price);
    
    if (spreadPercent >= threshold) {
      const profit = maxPrice.price - minPrice.price;
      
      opportunities.push({
        buyFrom: minPrice,
        sellTo: maxPrice,
        spread: spreadPercent,
        profit,
        profitPercent: spreadPercent,
        timestamp: Date.now()
      });
    }
    
    //finding all profitable pairs (not just min/max)
    if (opportunities.length > 0) {
      for (let i = 0; i < priceArray.length; i++) {
        for (let j = i + 1; j < priceArray.length; j++) {
          const spread = this.calculateSpread(priceArray[i].price, priceArray[j].price);
          
          if (spread >= threshold) {
            const [lower, higher] = priceArray[i].price < priceArray[j].price 
              ? [priceArray[i], priceArray[j]]
              : [priceArray[j], priceArray[i]];
            
            //avoid duplicates
            const exists = opportunities.some(opp => 
              opp.buyFrom.exchange === lower.exchange && 
              opp.sellTo.exchange === higher.exchange
            );
            
            if (!exists) {
              opportunities.push({
                buyFrom: lower,
                sellTo: higher,
                spread,
                profit: higher.price - lower.price,
                profitPercent: spread,
                timestamp: Date.now()
              });
            }
          }
        }
      }
    }
    
    //sort by highest profit first
    return opportunities.sort((a, b) => b.profit - a.profit);
  }
  
  private calculateSpread(price1: number, price2: number): number {
    const higher = Math.max(price1, price2);
    const lower = Math.min(price1, price2);
    
    return Math.round(((higher - lower) / lower) * 10000) / 100;
  }
  

  //only notify if changes are significant
  private hasSignificantChange(ticker: string, newOpportunities: ArbitrageOpportunity[]): boolean {
    const lastOpps = this.lastOpportunities.get(ticker) || [];
    
    //different number of opportunities - significant change
    if (newOpportunities.length !== lastOpps.length) return true;
    
    //no opportunities - no change needed
    if (newOpportunities.length === 0) return false;
    
    //check if highest spread changed by more than 0.1%
    const newHighest = newOpportunities[0]?.spread || 0;
    const lastHighest = lastOpps[0]?.spread || 0;
    
    return Math.abs(newHighest - lastHighest) >= 0.1;
  }
  
  private notifyCallbacks(ticker: string, opportunities: ArbitrageOpportunity[]): void {
    const callbacks = this.callbacks.get(ticker) || [];
    callbacks.forEach(callback => {
      try {
        callback(ticker, opportunities);
      } catch (error) {
        console.error('Callback error:', error);
      }
    });
  }
  
  subscribe(ticker: string, callback: ArbitrageCallback): void {
    if (!this.callbacks.has(ticker)) {
      this.callbacks.set(ticker, []);
    }
    this.callbacks.get(ticker)!.push(callback);
  }
  
  unsubscribe(ticker: string, callback: ArbitrageCallback): void {
    const callbacks = this.callbacks.get(ticker) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }
  
  setThreshold(ticker: string, threshold: number): void {
    this.thresholds.set(ticker, threshold);
  }

  getPrices(ticker: string): Map<string, PriceData> {
    return this.prices.get(ticker) || new Map();
  }
  
  getOpportunities(ticker: string): ArbitrageOpportunity[] {
    return this.lastOpportunities.get(ticker) || [];
  }
  
  //clear all data for a ticker (when stopping monitoring)
  clearTicker(ticker: string): void {
    this.prices.delete(ticker);
    this.callbacks.delete(ticker);
    this.lastOpportunities.delete(ticker);
    this.thresholds.delete(ticker);
  }
  
  getMonitoredTickers(): string[] {
    return Array.from(this.prices.keys());
  }
}


//single global instance
export const priceStore = new PriceStore();

//STATS
export const getStoreStats = () => ({
  totalTickers: priceStore.getMonitoredTickers().length,
  totalPrices: Array.from(priceStore['prices'].values()).reduce((sum, map) => sum + map.size, 0),
  totalCallbacks: Array.from(priceStore['callbacks'].values()).reduce((sum, arr) => sum + arr.length, 0)
});