import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Syncs every registered pull-based (Hikvision) terminal — the device is resolved
// server-side from the registry, so nothing is hard-coded on the client.
export async function POST() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/punches/sync`, { method: 'POST' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to sync events from terminal';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
