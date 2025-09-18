// lib/exchanges/base-exchange.ts
import { PriceData, ConnectionStatus, MarketType } from '../types';
import { priceStore } from '../price-store';

export abstract class BaseExchange {
  protected ws?: WebSocket;
  protected futuresWs?: WebSocket;
  protected reconnectAttempts = new Map<MarketType, number>();
  protected maxReconnectAttempts = 5;
  protected reconnectDelay = 1000;
  protected isConnecting = new Set<MarketType>();
  protected ticker = '';
  protected exchangeName = '';
  protected supportedMarkets: MarketType[] = ['spot'];

  //marking stream/sub connections
  protected requiresSubscription: { [key in MarketType]?: boolean } = {
    spot: false,
    futures: false,
  };

  protected autoPong = true;

  //spot
  protected onMessageBound = this.onMessage.bind(this);
  protected onOpenBound = this.onOpen.bind(this);
  protected onCloseBound = this.onClose.bind(this);
  protected onErrorBound = this.onError.bind(this);

  //futures
  protected onFuturesMessageBound = this.onFuturesMessage.bind(this);
  protected onFuturesOpenBound = this.onFuturesOpen.bind(this);
  protected onFuturesCloseBound = this.onFuturesClose.bind(this);
  protected onFuturesErrorBound = this.onFuturesError.bind(this);

  constructor(exchangeName: string, supportedMarkets: MarketType[] = ['spot']) {
    this.exchangeName = exchangeName;
    this.supportedMarkets = supportedMarkets;

    //reconnect attempts for each market type
    supportedMarkets.forEach((market) => {
      this.reconnectAttempts.set(market, 0);
    });
  }

  abstract connectSpot(ticker: string): Promise<void>;
  abstract connectFutures?(ticker: string): Promise<void>;
  abstract parseMessage(data: unknown, marketType: MarketType): PriceData | null;
  abstract subscribe(ticker: string, marketType: MarketType): void;
  abstract checkTokenListing(ticker: string): Promise<{
    spot: boolean;
    futures: boolean;
    symbol?: string;
  }>;

  async connect(ticker: string, marketTypes: MarketType[] = ['spot']): Promise<void> {
    this.ticker = ticker;

    const validMarketTypes = marketTypes.filter((type) => this.supportedMarkets.includes(type));

    if (validMarketTypes.length === 0) {
      throw new Error(
        `Exchange ${
          this.exchangeName
        } doesn't support any of the requested market types: ${marketTypes.join(', ')}`,
      );
    }

    const connectionPromises = validMarketTypes.map(async (marketType) => {
      try {
        if (marketType === 'spot') {
          await this.connectSpot(ticker);
        } else if (marketType === 'futures' && this.connectFutures) {
          await this.connectFutures(ticker);
        }
      } catch (error) {
        console.error(`Failed to connect to ${this.exchangeName} ${marketType}:`, error);
        this.updateConnectionStatus(
          marketType,
          'error',
          error instanceof Error ? error.message : 'Connection failed',
        );
      }
    });

    await Promise.allSettled(connectionPromises);
  }

  protected setupWebSocket(url: string, ticker: string, marketType: MarketType = 'spot'): void {
    const ws = marketType === 'spot' ? 'ws' : 'futuresWs';

    if (this[ws] && this[ws]!.readyState === WebSocket.OPEN) {
      this[ws]!.close();
    }

    this.ticker = ticker;
    this.isConnecting.add(marketType);

    try {
      this[ws] = new WebSocket(url);

      if (marketType === 'spot') {
        this.ws!.onopen = this.onOpenBound;
        this.ws!.onmessage = this.onMessageBound;
        this.ws!.onclose = this.onCloseBound;
        this.ws!.onerror = this.onErrorBound;
      } else {
        this.futuresWs!.onopen = this.onFuturesOpenBound;
        this.futuresWs!.onmessage = this.onFuturesMessageBound;
        this.futuresWs!.onclose = this.onFuturesCloseBound;
        this.futuresWs!.onerror = this.onFuturesErrorBound;
      }

      setTimeout(() => {
        const websocket = this[ws];
        if (websocket?.readyState === WebSocket.CONNECTING) {
          websocket.close();
          this.handleConnectionTimeout(marketType);
        }
      }, 5000);
    } catch (error) {
      this.handleError(`${marketType} connection failed`, error, marketType);
    }
  }

  private onOpen(): void {
    // console.log(`${this.exchangeName} SPOT connected for ${this.ticker}`);
    this.handleConnectionSuccess('spot');
  }

  private onMessage(event: MessageEvent): void {
    this.handleMessage(event, 'spot');
  }

  private onClose(event: CloseEvent): void {
    console.log(`${this.exchangeName} SPOT disconnected:`, event.reason);
    this.handleDisconnection(event, 'spot');
  }

  private onError(event: Event): void {
    console.error(`${this.exchangeName} SPOT WebSocket error:`, event);
    this.updateConnectionStatus('spot', 'error', 'WebSocket error occurred');
  }

  private onFuturesOpen(): void {
    // console.log(`${this.exchangeName} FUTURES connected for ${this.ticker}`);
    this.handleConnectionSuccess('futures');
  }

  private onFuturesMessage(event: MessageEvent): void {
    this.handleMessage(event, 'futures');
  }

  private onFuturesClose(event: CloseEvent): void {
    console.log(`${this.exchangeName} FUTURES disconnected:`, event.reason);
    this.handleDisconnection(event, 'futures');
  }

  private onFuturesError(event: Event): void {
    console.error(`${this.exchangeName} FUTURES WebSocket error:`, event);
    this.updateConnectionStatus('futures', 'error', 'WebSocket error occurred');
  }

  private handleConnectionSuccess(marketType: MarketType): void {
    this.isConnecting.delete(marketType);
    this.reconnectAttempts.set(marketType, 0);

    this.updateConnectionStatus(marketType, 'connected');

    try {
      this.subscribe(this.ticker, marketType);
    } catch (err) {
      console.error(`${this.exchangeName} subscribe error:`, err);
    }
  }

  private async handleMessage(event: MessageEvent, marketType: MarketType): Promise<void> {
    try {
      const raw = event.data;
      let parsedData: unknown = raw;

      if (raw instanceof Blob) {
        parsedData = await raw.arrayBuffer();
      }

      if (parsedData instanceof ArrayBuffer || parsedData instanceof Uint8Array) {
        //pb
        const priceUpdate = this.parseMessage(parsedData, marketType);
        if (priceUpdate) {
          const exchangeKey =
            marketType === 'spot' ? this.exchangeName : `${this.exchangeName}-futures`;
          priceStore.updatePrice(this.ticker, exchangeKey, priceUpdate);
        }
        return;
      }

      if (typeof raw === 'string') {
        try {
          parsedData = JSON.parse(raw);
        } catch {
          console.warn('Failed to parse JSON:', raw);
          return;
        }
      }

      if (this.handlePing(parsedData, marketType)) {
        console.log('Handled PING → PONG');
        return;
      }

      if (
        parsedData &&
        typeof parsedData === 'object' &&
        'data' in parsedData &&
        ('stream' in parsedData || 'channel' in parsedData)
      ) {
        console.log('THE FIRST OPTION');
        const innerResult = this.parseMessage(parsedData.data, marketType);
        if (innerResult) {
          const exchangeKey =
            marketType === 'spot' ? this.exchangeName : `${this.exchangeName}-futures`;
          priceStore.updatePrice(this.ticker, exchangeKey, innerResult);
        }
        return;
      }

      if (Array.isArray(parsedData)) {
        console.log('SECOND OPTION');
        for (const item of parsedData) {
          const parsed = this.parseMessage(item, marketType);
          if (parsed) {
            const exchangeKey =
              marketType === 'spot' ? this.exchangeName : `${this.exchangeName}-futures`;
            priceStore.updatePrice(this.ticker, exchangeKey, parsed);
          }
        }
        return;
      }

      const priceUpdate = this.parseMessage(parsedData, marketType);
      if (priceUpdate) {
        console.log('THE THIRD OPTION');
        const exchangeKey =
          marketType === 'spot' ? this.exchangeName : `${this.exchangeName}-futures`;
        priceStore.updatePrice(this.ticker, exchangeKey, priceUpdate);
      }
    } catch (error) {
      console.warn(`${this.exchangeName} ${marketType} message handle error:`, error);
    }
  }

  private handleDisconnection(event: CloseEvent, marketType: MarketType): void {
    this.updateConnectionStatus(marketType, 'disconnected');

    if (
      !event.wasClean &&
      (this.reconnectAttempts.get(marketType) || 0) < this.maxReconnectAttempts
    ) {
      this.scheduleReconnect(marketType);
    }
  }

  private scheduleReconnect(marketType: MarketType): void {
    if (this.isConnecting.has(marketType)) return;

    const currentAttempts = this.reconnectAttempts.get(marketType) || 0;
    this.reconnectAttempts.set(marketType, currentAttempts + 1);

    const jitter = Math.random() * 1000;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, currentAttempts) + jitter, 30000);

    console.log(
      `[${this.exchangeName}] (${marketType}) Scheduling reconnect in ${
        delay / 1000
      }s (attempt ${currentAttempts})`,
    );

    this.updateConnectionStatus(
      marketType,
      'connecting',
      `Reconnecting... (${currentAttempts + 1}/${this.maxReconnectAttempts})`,
    );

    setTimeout(async () => {
      if (this.ticker) {
        try {
          if (marketType === 'spot') {
            await this.connectSpot(this.ticker);
          } else if (marketType === 'futures' && this.connectFutures) {
            await this.connectFutures(this.ticker);
          }
        } catch (error) {
          console.error(`${this.exchangeName} ${marketType} reconnection failed:`, error);
        }
      }
    }, delay);
  }

  private handleConnectionTimeout(marketType: MarketType): void {
    console.warn(`${this.exchangeName} ${marketType} connection timeout`);
    this.updateConnectionStatus(marketType, 'error', 'Connection timeout');
    this.scheduleReconnect(marketType);
  }

  private handleError(message: string, error: unknown, marketType: MarketType): void {
    console.error(`${this.exchangeName} ${marketType} error: ${message}`, error);
    this.updateConnectionStatus(marketType, 'error', message);
  }

  private updateConnectionStatus(
    marketType: MarketType,
    status: ConnectionStatus['status'],
    errorMessage?: string,
  ): void {
    const exchangeKey = marketType === 'spot' ? this.exchangeName : `${this.exchangeName}-futures`;

    const connectionStatus: ConnectionStatus = {
      exchange: exchangeKey,
      ticker: this.ticker,
      status,
      lastUpdate: Date.now(),
      errorMessage,
      marketType,
    };

    this.onStatusUpdate?.(connectionStatus);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected handlePing(raw: any, marketType: MarketType): boolean {
    if (this.autoPong && raw && typeof raw === 'object') {
      if ('ping' in raw) {
        console.log(`[${this.exchangeName}] (${marketType}) Received PING, replying with PONG`);
        const pongMsg = JSON.stringify({ pong: raw.ping });
        this.sendMessage(pongMsg, marketType);
        return true;
      }
      if (raw.op === 'ping') {
        console.log(
          `[${this.exchangeName}] (${marketType}) Received PING (op), replying with PONG`,
        );
        const pong = JSON.stringify({ op: 'pong', ts: Date.now() });
        this.sendMessage(pong, marketType);
        return true;
      }
    }
    return false;
  }

  public async reconnect(marketTypes: MarketType[] = ['spot']): Promise<void> {
    const validMarketTypes = marketTypes.filter((type) => this.supportedMarkets.includes(type));

    for (const marketType of validMarketTypes) {
      if (marketType === 'spot' && this.ws) {
        this.ws.close();
      } else if (marketType === 'futures' && this.futuresWs) {
        this.futuresWs.close();
      }

      this.reconnectAttempts.set(marketType, 0);
    }

    if (this.ticker) {
      await this.connect(this.ticker, validMarketTypes);
    }
  }

  public disconnect(marketTypes: MarketType[] = ['spot', 'futures']): void {
    const validMarketTypes = marketTypes.filter((type) => this.supportedMarkets.includes(type));

    for (const marketType of validMarketTypes) {
      if (marketType === 'spot' && this.ws) {
        this.ws.close(1000, 'Manual disconnect');
        this.ws = undefined;
        this.updateConnectionStatus(marketType, 'disconnected');
      } else if (marketType === 'futures' && this.futuresWs) {
        this.futuresWs.close(1000, 'Manual disconnect');
        this.futuresWs = undefined;
        this.updateConnectionStatus(marketType, 'disconnected');
      }
    }
  }

  public isConnected(marketType: MarketType = 'spot'): boolean {
    if (marketType === 'spot') {
      return this.ws?.readyState === WebSocket.OPEN;
    } else {
      return this.futuresWs?.readyState === WebSocket.OPEN;
    }
  }

  protected sendMessage(message: string, marketType: MarketType = 'spot'): void {
    const ws = marketType === 'spot' ? this.ws : this.futuresWs;

    if (ws?.readyState === WebSocket.OPEN) {
      console.log(`[${this.exchangeName}] (${marketType}) >> Sent message: ${message}`);
      try {
        ws.send(message);
      } catch (err) {
        console.error(`${this.exchangeName} send message error:`, err);
      }
    }
  }

  public getSupportedMarkets(): MarketType[] {
    return [...this.supportedMarkets];
  }

  // Callback for status updates
  public onStatusUpdate?: (status: ConnectionStatus) => void;
}
