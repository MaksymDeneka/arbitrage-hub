import { NextRequest, NextResponse } from 'next/server';
import { connectionManager } from '@/lib/connection-manager';

export async function POST(request: NextRequest) {
  try {
    const { ticker, thresholdPercent = 1, useAutoConfig = true, customConfig } = await request.json();
    
    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json(
        { error: 'Ticker symbol is required' },
        { status: 400 }
      );
    }

    if (useAutoConfig) {
      //use automatic configuration
      await connectionManager.startMonitoringAuto(ticker.toUpperCase(), thresholdPercent);
    } else if (customConfig) {
      //use provided configuration
      await connectionManager.startMonitoring(customConfig);
    } else {
      return NextResponse.json(
        { error: 'Either useAutoConfig must be true or customConfig must be provided' },
        { status: 400 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Monitoring started for ${ticker.toUpperCase()}` 
    });
    
  } catch (error) {
    console.error('Monitoring start error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start monitoring' },
      { status: 500 }
    );
  }
}