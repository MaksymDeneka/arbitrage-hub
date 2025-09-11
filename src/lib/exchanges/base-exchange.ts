import { PriceData, ConnectionStatus } from '../types';
import { priceStore } from '../price-store'

export abstract class BaseExchange {
  protected ws?: WebSocket;
  protected reconnectAttempts = 0;
  protected maxReconnectAttempts = 5;
  protected reconnectDelay = 1000;
  protected isConnecting = false;
  protected ticker = '';
  protected exchangeName = '';
  
  protected onMessageBound = this.onMessage.bind(this);
  protected onOpenBound = this.onOpen.bind(this);
  protected onCloseBound = this.onClose.bind(this);
  protected onErrorBound = this.onError.bind(this);
  
  constructor(exchangeName: string) {
    this.exchangeName = exchangeName;
  }
  

  //each exchange will have specific WebSocket URL and logic for connection
  abstract connect(ticker: string): Promise<void>;
  
	//parse incoming messages
  abstract parseMessage(data: unknown): PriceData | null;
  
  //subscribe to ticker after establishing connection
  abstract subscribe(ticker: string): void;
  

  protected setupWebSocket(url: string, ticker: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    
    this.ticker = ticker;
    this.isConnecting = true;
    
    try {
      this.ws = new WebSocket(url);
      
      //using pre-bound methods to avoid function recreation
      this.ws.onopen = this.onOpenBound;
      this.ws.onmessage = this.onMessageBound;
      this.ws.onclose = this.onCloseBound;
      this.ws.onerror = this.onErrorBound;
      
      setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          this.ws.close();
          this.handleConnectionTimeout();
        }
      }, 5000); // 5 second timeout
      
    } catch (error) {
      this.handleError('Connection failed', error);
    }
  }
  

  private onOpen(): void {
    console.log(`${this.exchangeName} connected for ${this.ticker}`);
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    
    this.updateConnectionStatus('connected');
    this.subscribe(this.ticker);
  }
  
  private onMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      const priceUpdate = this.parseMessage(data);
      
      if (priceUpdate) {
        //call to price store
        priceStore.updatePrice(this.ticker, this.exchangeName, priceUpdate);
      }
      
    } catch (error) {
      //silent fail
      console.warn(`${this.exchangeName} message parse error:`, error);
    }
  }
  
  private onClose(event: CloseEvent): void {
    console.log(`${this.exchangeName} disconnected:`, event.reason);
    this.updateConnectionStatus('disconnected');
    
    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }
  
  private onError(event: Event): void {
    console.error(`${this.exchangeName} WebSocket error:`, event);
    this.updateConnectionStatus('error', 'WebSocket error occurred');
  }
  
  private scheduleReconnect(): void {
    if (this.isConnecting) return;
    
    this.reconnectAttempts++;
    
    //random delays for reconnects
    const jitter = Math.random() * 1000;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts) + jitter, 30000);
    
    console.log(`${this.exchangeName} reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.updateConnectionStatus('connecting', `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.ticker) {
        this.connect(this.ticker);
      }
    }, delay);
  }
  
  private handleConnectionTimeout(): void {
    console.warn(`${this.exchangeName} connection timeout`);
    this.updateConnectionStatus('error', 'Connection timeout');
    this.scheduleReconnect();
  }
  
  private handleError(message: string, error?: unknown): void {
    console.error(`${this.exchangeName} error: ${message}`, error);
    this.updateConnectionStatus('error', message);
  }
  
  private updateConnectionStatus(status: ConnectionStatus['status'], errorMessage?: string): void {
    // This could be connected to a global state store for UI updates
    const connectionStatus: ConnectionStatus = {
      exchange: this.exchangeName,
      ticker: this.ticker,
      status,
      lastUpdate: Date.now(),
      errorMessage
    };
    
    this.onStatusUpdate?.(connectionStatus);
  }
  
	//manual reconnect
  public reconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
    this.reconnectAttempts = 0;
    if (this.ticker) {
      this.connect(this.ticker);
    }
  }
  

  public disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = undefined;
    }
    this.updateConnectionStatus('disconnected');
  }
  

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  
  protected sendMessage(message: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      console.warn(`Cannot send message - ${this.exchangeName} not connected`);
    }
  }
  
  //callback for status updates
  public onStatusUpdate?: (status: ConnectionStatus) => void;
}