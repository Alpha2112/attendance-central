import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/integrations/stats`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch integration stats';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
