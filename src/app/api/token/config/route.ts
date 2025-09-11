import { tokenDiscovery } from '@/lib/token-discovery';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { ticker, thresholdPercent = 1 } = await request.json();
    
    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json(
        { error: 'Ticker symbol is required' },
        { status: 400 }
      );
    }

    const config = await tokenDiscovery.getRecommendedConfig(
      ticker.toUpperCase(), 
      thresholdPercent
    );
    
    return NextResponse.json(config);
    
  } catch (error) {
    console.error('Config generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate configuration' },
      { status: 500 }
    );
  }
}