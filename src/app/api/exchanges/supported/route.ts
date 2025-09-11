import { NextResponse } from 'next/server';
import { ExchangeFactory } from '@/lib/exchanges';

export async function GET() {
  try {
    const supportedExchanges = ExchangeFactory.getSupportedExchanges();
    
    return NextResponse.json({
      exchanges: supportedExchanges,
      total: supportedExchanges.length
    });
    
  } catch (error) {
    console.error('Supported exchanges error:', error);
    return NextResponse.json(
      { error: 'Failed to get supported exchanges' },
      { status: 500 }
    );
  }
}