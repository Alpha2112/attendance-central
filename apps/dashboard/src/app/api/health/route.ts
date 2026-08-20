import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/health/ready`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'API connection failed';
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptimeSeconds: 0,
        error: errorMsg,
      },
      { status: 503 },
    );
  }
}
