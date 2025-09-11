/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { connectionManager } from '@/lib/connection-manager';
import { priceStore } from '@/lib/price-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    
    const monitoringInfo = connectionManager.getMonitoringInfo();
    const healthCheck = await connectionManager.healthCheck();
    
    let response: any = {
      ...monitoringInfo,
      health: healthCheck
    };
    
    if (ticker) {
      const upperTicker = ticker.toUpperCase();
      response = {
        ...response,
        ticker: upperTicker,
        connections: monitoringInfo.connections[upperTicker] || [],
        prices: Object.fromEntries(priceStore.getPrices(upperTicker)),
        opportunities: priceStore.getOpportunities(upperTicker)
      };
    }
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to get monitoring status' },
      { status: 500 }
    );
  }
}