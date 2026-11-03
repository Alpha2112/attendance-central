import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const res = await fetch(`${API_BASE_URL}/api/v1/punches/${id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to connect to API backend' }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    const targetUrl =
      action === 'reemit'
        ? `${API_BASE_URL}/api/v1/punches/${id}/reemit`
        : `${API_BASE_URL}/api/v1/punches/${id}`;

    const res = await fetch(targetUrl, {
      method: 'POST',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to connect to API backend' }, { status: 502 });
  }
}
