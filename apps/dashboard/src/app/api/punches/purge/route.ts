import { NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

export async function POST() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/punches/purge`, {
      method: 'POST',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to connect to API backend' }, { status: 502 });
  }
}
