import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const { deviceId } = await params;
    const res = await fetch(`${API_BASE}/api/v1/punches/sync/${encodeURIComponent(deviceId)}`, {
      method: 'POST',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to sync events from terminal';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
