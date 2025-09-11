'use client';

import { useState, useEffect } from 'react';
import { PriceData, ConnectionStatus } from '@/lib/types';
import { priceStore } from '@/lib/price-store';
import { connectionManager } from '@/lib/connection-manager';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
// import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

interface PriceCardProps {
  exchange: string;
  ticker: string;
}

// export function ExchangeCard({ exchange, ticker }: PriceCardProps) {
//   const formatPrice = (price: number) => price.toFixed(6);
//   const formatVolume = (volume: number) => {
//     if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
//     if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
//     return volume.toString();
//   };

//   const isPositiveChange = exchange.prices.change24h > 0;

//   return (
//     <Card className="bg-card border-border">
//       <CardHeader className="pb-2">
//         <div className="flex items-center justify-between">
//           <CardTitle className="text-sm font-medium text-card-foreground">
//             {exchange.name}
//           </CardTitle>
//           <div className="flex items-center gap-1">
//             {exchange.type === 'dex' && exchange.chain && (
//               <Badge variant="outline" className="text-xs">
//                 {exchange.chain}
//               </Badge>
//             )}
//             <div
//               className={`w-2 h-2 rounded-full ${exchange.available ? 'bg-chart-4' : 'bg-chart-3'}`}
//             />
//           </div>
//         </div>
//       </CardHeader>
//       <CardContent className="space-y-3">
//         {/* Spot Price */}
//         {exchange.prices.spot && (
//           <div className="space-y-1">
//             <div className="flex items-center justify-between">
//               <span className="text-xs text-muted-foreground">Spot</span>
//               <div className="flex items-center gap-1">
//                 {isPositiveChange ? (
//                   <ArrowUpIcon className="w-3 h-3 text-chart-4" />
//                 ) : (
//                   <ArrowDownIcon className="w-3 h-3 text-chart-3" />
//                 )}
//                 <span className={`text-xs ${isPositiveChange ? 'text-chart-4' : 'text-chart-3'}`}>
//                   {Math.abs(exchange.prices.change24h).toFixed(2)}%
//                 </span>
//               </div>
//             </div>
//             <div className="text-lg font-mono font-semibold text-card-foreground">
//               ${formatPrice(exchange.prices.spot)}
//             </div>
//           </div>
//         )}

//         {/* Futures Price */}
//         {exchange.prices.futures && (
//           <div className="space-y-1">
//             <div className="flex items-center justify-between">
//               <span className="text-xs text-muted-foreground">Futures</span>
//               <Badge variant="secondary" className="text-xs">
//                 PERP
//               </Badge>
//             </div>
//             <div className="text-lg font-mono font-semibold text-card-foreground">
//               ${formatPrice(exchange.prices.futures)}
//             </div>
//           </div>
//         )}

//         {/* Volume */}
//         <div className="pt-2 border-t border-border">
//           <div className="flex items-center justify-between text-xs">
//             <span className="text-muted-foreground">24h Volume</span>
//             <span className="text-card-foreground font-medium">
//               ${formatVolume(exchange.volume24h)}
//             </span>
//           </div>
//         </div>
//       </CardContent>
//     </Card>
//   );
// }

export function PriceCard({ exchange, ticker }: PriceCardProps) {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus['status']>('disconnected');
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'same'>('same');
  // const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  useEffect(() => {
    //subscribe to price updates
    const updatePrice = () => {
      const prices = priceStore.getPrices(ticker);
      const currentPrice = prices.get(exchange);

      if (currentPrice) {
        //determine price direction
        if (lastPrice !== null) {
          if (currentPrice.price > lastPrice) {
            setPriceDirection('up');
          } else if (currentPrice.price < lastPrice) {
            setPriceDirection('down');
          } else {
            setPriceDirection('same');
          }
        }

        setLastPrice(currentPrice.price);
        setPriceData(currentPrice);
        // setLastUpdate(Date.now());

        //reset price direction after animation
        setTimeout(() => setPriceDirection('same'), 500);
      }
    };

    //subscribe to connection status
    const unsubscribeStatus = connectionManager.onStatusUpdate((status) => {
      if (status.exchange === exchange && status.ticker === ticker) {
        setConnectionStatus(status.status);
      }
    });

    //initial price fetch
    updatePrice();

    //set up periodic updates (fallback)
    const interval = setInterval(updatePrice, 1000);

    return () => {
      clearInterval(interval);
      unsubscribeStatus();
    };
  }, [exchange, ticker, lastPrice]);

  // const getExchangeIcon = (exchangeName: string): string => {
  //   const icons: Record<string, string> = {
  //     binance: '🟡',
  //     okx: '⚫',
  //     bybit: '🟠',
  //     'binance-futures': '🟡📈',
  //     'okx-futures': '⚫📈',
  //     'bybit-futures': '🟠📈',
  //     'eth-dex': '🔷',
  //     'bsc-dex': '🟨',
  //     'polygon-dex': '🟣',
  //     'arbitrum-dex': '🔵',
  //   };
  //   return icons[exchangeName] || '📊';
  // };

  // const getStatusColor = (status: ConnectionStatus['status']): string => {
  //   const colors = {
  //     connected: 'text-green-400',
  //     connecting: 'text-yellow-400',
  //     disconnected: 'text-gray-400',
  //     error: 'text-red-400',
  //   };
  //   return colors[status];
  // };

  // const getStatusText = (status: ConnectionStatus['status']): string => {
  //   const texts = {
  //     connected: 'Live',
  //     connecting: 'Connecting...',
  //     disconnected: 'Offline',
  //     error: 'Error',
  //   };
  //   return texts[status];
  // };

  const formatPrice = (price: number): string => {
    if (price < 0.01) {
      return price.toFixed(8);
    } else if (price < 1) {
      return price.toFixed(6);
    } else if (price < 100) {
      return price.toFixed(4);
    } else {
      return price.toFixed(2);
    }
  };

  // const getTimeSinceUpdate = (): string => {
  //   const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
  //   if (seconds < 60) return `${seconds}s ago`;
  //   const minutes = Math.floor(seconds / 60);
  //   if (minutes < 60) return `${minutes}m ago`;
  //   const hours = Math.floor(minutes / 60);
  //   return `${hours}h ago`;
  // };

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-card-foreground">
              {exchange.replace('-', ' ')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Spot Price */}
          {priceData && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Spot</span>
              </div>
              <div className={`text-lg font-mono font-semibold text-card-foreground transition-colors duration-200 ${
                  priceDirection === 'up'
                    ? 'price-up'
                    : priceDirection === 'down'
                    ? 'price-down'
                    : 'text-white'
                }`}>
                ${formatPrice(priceData.price)}
              </div>
            </div>
          )}

          {/* Futures Price */}
          {priceData && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Futures</span>
                <Badge variant="secondary" className="text-xs">
                  PERP
                </Badge>
              </div>
              <div className={`text-lg font-mono font-semibold text-card-foreground transition-colors duration-200 ${
                  priceDirection === 'up'
                    ? 'price-up'
                    : priceDirection === 'down'
                    ? 'price-down'
                    : 'text-white'
                }`}>
                ${formatPrice(priceData.price)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
			{/* /////////////////////////////////////// */}
      {/* <div
        className={`bg-neutral-800 rounded-lg p-4 border transition-all duration-200 ${
          connectionStatus === 'connected' ? 'border-neutral-600' : 'border-neutral-700'
        } ${priceDirection === 'up' ? 'flash-update bg-green-900/20' : ''} ${
          priceDirection === 'down' ? 'flash-update bg-red-900/20' : ''
        }`}> */}
        {/* HEADER */}
        {/* <div className="flex justify-between items-start mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{getExchangeIcon(exchange)}</span>
            <div>
              <h4 className="font-medium text-white text-sm capitalize">
                {exchange.replace('-', ' ')}
              </h4>
              <div className="flex items-center space-x-2">
                <span className={`text-xs ${getStatusColor(connectionStatus)}`}>
                  {getStatusText(connectionStatus)}
                </span>
                {connectionStatus === 'connecting' && (
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                )}
              </div>
            </div>
          </div>

          {priceData && (
            <div className="text-right">
              <div className="text-xs text-gray-400">{priceData.type.toUpperCase()}</div>
              {priceData.volume !== undefined && priceData.volume > 0 && (
                <div className="text-xs text-gray-500">
                  Vol: {priceData.volume.toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div> */}

        {/* PRICE DISPLAY */}
        {/* <div className="space-y-2">
          {priceData ? (
            <>
              <div
                className={`text-2xl font-bold font-mono transition-colors duration-200 ${
                  priceDirection === 'up'
                    ? 'price-up'
                    : priceDirection === 'down'
                    ? 'price-down'
                    : 'text-white'
                }`}>
                ${formatPrice(priceData.price)}
              </div>

              <div className="flex justify-between items-center text-xs text-gray-400">
                <span>{getTimeSinceUpdate()}</span>
                <span className="font-mono">
                  {new Date(priceData.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-neutral-500 font-mono">
                {connectionStatus === 'connecting' ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                ) : (
                  '-- --'
                )}
              </div>
              <div className="text-xs text-neutral-500">
                {connectionStatus === 'error' ? 'Connection failed' : 'Waiting for data...'}
              </div>
            </>
          )}
        </div> */}

        {/* CONNECTION ACTIONS */}
        {/* {connectionStatus === 'error' && (
          <button
            onClick={() => connectionManager.reconnectExchange(ticker, exchange)}
            className="mt-3 w-full px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors">
            🔄 Reconnect
          </button>
        )}
      </div> */}
    </>
  );
}

// export function PriceCard({ exchange, ticker }: PriceCardProps) {
//   const [priceData, setPriceData] = useState<PriceData | null>(null);
//   const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus['status']>('disconnected');
//   const [lastPrice, setLastPrice] = useState<number | null>(null);
//   const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'same'>('same');
//   const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

//   useEffect(() => {
//     //subscribe to price updates
//     const updatePrice = () => {
//       const prices = priceStore.getPrices(ticker);
//       const currentPrice = prices.get(exchange);

//       if (currentPrice) {
//         //determine price direction
//         if (lastPrice !== null) {
//           if (currentPrice.price > lastPrice) {
//             setPriceDirection('up');
//           } else if (currentPrice.price < lastPrice) {
//             setPriceDirection('down');
//           } else {
//             setPriceDirection('same');
//           }
//         }

//         setLastPrice(currentPrice.price);
//         setPriceData(currentPrice);
//         setLastUpdate(Date.now());

//         //reset price direction after animation
//         setTimeout(() => setPriceDirection('same'), 500);
//       }
//     };

//     //subscribe to connection status
//     const unsubscribeStatus = connectionManager.onStatusUpdate((status) => {
//       if (status.exchange === exchange && status.ticker === ticker) {
//         setConnectionStatus(status.status);
//       }
//     });

//     //initial price fetch
//     updatePrice();

//     //set up periodic updates (fallback)
//     const interval = setInterval(updatePrice, 1000);

//     return () => {
//       clearInterval(interval);
//       unsubscribeStatus();
//     };
//   }, [exchange, ticker, lastPrice]);

//   const getExchangeIcon = (exchangeName: string): string => {
//     const icons: Record<string, string> = {
//       'binance': '🟡',
//       'okx': '⚫',
//       'bybit': '🟠',
//       'binance-futures': '🟡📈',
//       'okx-futures': '⚫📈',
//       'bybit-futures': '🟠📈',
//       'eth-dex': '🔷',
//       'bsc-dex': '🟨',
//       'polygon-dex': '🟣',
//       'arbitrum-dex': '🔵'
//     };
//     return icons[exchangeName] || '📊';
//   };

//   const getStatusColor = (status: ConnectionStatus['status']): string => {
//     const colors = {
//       'connected': 'text-green-400',
//       'connecting': 'text-yellow-400',
//       'disconnected': 'text-gray-400',
//       'error': 'text-red-400'
//     };
//     return colors[status];
//   };

//   const getStatusText = (status: ConnectionStatus['status']): string => {
//     const texts = {
//       'connected': 'Live',
//       'connecting': 'Connecting...',
//       'disconnected': 'Offline',
//       'error': 'Error'
//     };
//     return texts[status];
//   };

//   const formatPrice = (price: number): string => {
//     if (price < 0.01) {
//       return price.toFixed(8);
//     } else if (price < 1) {
//       return price.toFixed(6);
//     } else if (price < 100) {
//       return price.toFixed(4);
//     } else {
//       return price.toFixed(2);
//     }
//   };

//   const getTimeSinceUpdate = (): string => {
//     const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
//     if (seconds < 60) return `${seconds}s ago`;
//     const minutes = Math.floor(seconds / 60);
//     if (minutes < 60) return `${minutes}m ago`;
//     const hours = Math.floor(minutes / 60);
//     return `${hours}h ago`;
//   };

//   return (
//     <div className={`bg-neutral-800 rounded-lg p-4 border transition-all duration-200 ${
//       connectionStatus === 'connected' ? 'border-neutral-600' : 'border-neutral-700'
//     } ${priceDirection === 'up' ? 'flash-update bg-green-900/20' : ''} ${
//       priceDirection === 'down' ? 'flash-update bg-red-900/20' : ''
//     }`}>
//       {/* HEADER */}
//       <div className="flex justify-between items-start mb-3">
//         <div className="flex items-center space-x-2">
//           <span className="text-lg">{getExchangeIcon(exchange)}</span>
//           <div>
//             <h4 className="font-medium text-white text-sm capitalize">
//               {exchange.replace('-', ' ')}
//             </h4>
//             <div className="flex items-center space-x-2">
//               <span className={`text-xs ${getStatusColor(connectionStatus)}`}>
//                 {getStatusText(connectionStatus)}
//               </span>
//               {connectionStatus === 'connecting' && (
//                 <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
//               )}
//             </div>
//           </div>
//         </div>

//         {priceData && (
//           <div className="text-right">
//             <div className="text-xs text-gray-400">
//               {priceData.type.toUpperCase()}
//             </div>
//             {priceData.volume !== undefined && priceData.volume > 0 && (
//               <div className="text-xs text-gray-500">
//                 Vol: {priceData.volume.toLocaleString()}
//               </div>
//             )}
//           </div>
//         )}
//       </div>

//       {/* PRICE DISPLAY */}
//       <div className="space-y-2">
//         {priceData ? (
//           <>
//             <div className={`text-2xl font-bold font-mono transition-colors duration-200 ${
//               priceDirection === 'up' ? 'price-up' :
//               priceDirection === 'down' ? 'price-down' : 'text-white'
//             }`}>
//               ${formatPrice(priceData.price)}
//             </div>

//             <div className="flex justify-between items-center text-xs text-gray-400">
//               <span>{getTimeSinceUpdate()}</span>
//               <span className="font-mono">
//                 {new Date(priceData.timestamp).toLocaleTimeString()}
//               </span>
//             </div>
//           </>
//         ) : (
//           <>
//             <div className="text-2xl font-bold text-neutral-500 font-mono">
//               {connectionStatus === 'connecting' ? (
//                 <div className="flex items-center space-x-2">
//                   <div className="w-6 h-6 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin"></div>
//                   <span>Loading...</span>
//                 </div>
//               ) : (
//                 '-- --'
//               )}
//             </div>
//             <div className="text-xs text-neutral-500">
//               {connectionStatus === 'error' ? 'Connection failed' : 'Waiting for data...'}
//             </div>
//           </>
//         )}
//       </div>

//       {/* CONNECTION ACTIONS */}
//       {connectionStatus === 'error' && (
//         <button
//           onClick={() => connectionManager.reconnectExchange(ticker, exchange)}
//           className="mt-3 w-full px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
//         >
//           🔄 Reconnect
//         </button>
//       )}
//     </div>
//   );
// }
