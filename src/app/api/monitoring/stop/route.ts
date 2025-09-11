import { NextRequest, NextResponse } from 'next/server';
import { connectionManager } from '@/lib/connection-manager';

export async function POST(request: NextRequest) {
  try {
    const { ticker } = await request.json();
    
    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json(
        { error: 'Ticker symbol is required' },
        { status: 400 }
      );
    }

    await connectionManager.stopMonitoring(ticker.toUpperCase());
    
    return NextResponse.json({ 
      success: true, 
      message: `Monitoring stopped for ${ticker.toUpperCase()}` 
    });
    
  } catch (error) {
    console.error('Monitoring stop error:', error);
    return NextResponse.json(
      { error: 'Failed to stop monitoring' },
      { status: 500 }
    );
  }
}