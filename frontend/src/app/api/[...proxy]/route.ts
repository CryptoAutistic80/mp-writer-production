import { NextRequest, NextResponse } from 'next/server';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function getBackendOrigin() {
  const explicit = process.env.NEXT_BACKEND_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_BACKEND_ORIGIN must be configured for production runtime');
  }
  return 'http://localhost:4000';
}

async function proxy(request: NextRequest, context: { params: { proxy?: string[] } }) {
  const backendOrigin = getBackendOrigin();
  const path = (context.params.proxy ?? []).join('/');
  const target = new URL(`/api/${path}`, backendOrigin);
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  const backendHost = new URL(backendOrigin).host;
  headers.set('host', backendHost);
  headers.set('x-forwarded-host', request.headers.get('host') ?? backendHost);
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));

  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = (request as any).ip as string | undefined;
  if (clientIp) {
    headers.set('x-forwarded-for', forwardedFor ? `${forwardedFor}, ${clientIp}` : clientIp);
  }

  HOP_BY_HOP_HEADERS.forEach((header) => headers.delete(header));

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
    const buffer = await request.arrayBuffer();
    init.body = buffer;
  }

  const response = await fetch(target, init);

  const proxyHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    if (key.toLowerCase() === 'set-cookie') return;
    proxyHeaders.set(key, value);
  });

  const rawSetCookies =
    (response.headers as unknown as { raw?: () => Record<string, string[]> }).raw?.()?.[
      'set-cookie'
    ] ?? [];

  const proxyResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxyHeaders,
  });

  rawSetCookies.forEach((cookie) => {
    proxyResponse.headers.append('set-cookie', cookie);
  });

  return proxyResponse;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
