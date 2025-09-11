import { tokenDiscovery } from '@/lib/token-discovery';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { ticker } = await request.json();
    
    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json(
        { error: 'Ticker symbol is required' },
        { status: 400 }
      );
    }

    const discovery = await tokenDiscovery.discoverToken(ticker.toUpperCase());
    
    return NextResponse.json(discovery);
    
  } catch (error) {
    console.error('Token discovery error:', error);
    return NextResponse.json(
      { error: 'Failed to discover token listings' },
      { status: 500 }
    );
  }
}