import { NextRequest, NextResponse } from 'next/server';

/**
 * Centralized API proxy. Forwards every /api/* dashboard call to the backend
 * (/api/v1/*), carrying the browser's Authorization bearer token so the API's
 * JwtAuthGuard can authenticate and authorize the request. One place to add
 * auth forwarding instead of 20+ per-route proxies.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function proxy(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const search = request.nextUrl.search || '';
  const target = `${API_BASE}/api/v1/${segments.map(encodeURIComponent).join('/')}${search}`;
  const method = request.method;

  const headers: Record<string, string> = {};
  // Prefer an explicit Authorization header; otherwise lift the token from the
  // same-origin auth cookie so existing pages need no changes to their fetch calls.
  const auth = request.headers.get('authorization');
  const cookieToken = request.cookies.get('auth_token')?.value;
  if (auth) headers['Authorization'] = auth;
  else if (cookieToken) headers['Authorization'] = `Bearer ${cookieToken}`;

  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const raw = await request.text();
    // Only forward a body + content-type when one actually exists. Sending an
    // empty body with content-type: application/json makes Fastify reject it
    // ("Body cannot be empty…"), which broke DELETE and other no-body requests.
    if (raw && raw.length > 0) {
      body = raw;
      headers['Content-Type'] = request.headers.get('content-type') || 'application/json';
    }
  }

  try {
    const res = await fetch(target, { method, headers, body, cache: 'no-store' });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upstream request failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function PUT(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
