import { NextResponse, type NextRequest } from 'next/server';

import { assetLibrary } from '../../../content/blog/assets';
import type { AssetSlug } from '../../../content/blog/types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let payload: { email?: string; assetSlug?: AssetSlug };

  try {
    payload = (await request.json()) as typeof payload;
  } catch (error) {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  const email = payload?.email?.trim() ?? '';
  const assetSlug = payload?.assetSlug;

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, message: 'Enter a valid email address.' }, { status: 400 });
  }

  if (!assetSlug || !(assetSlug in assetLibrary)) {
    return NextResponse.json({ ok: false, message: 'Unknown asset request.' }, { status: 400 });
  }

  const asset = assetLibrary[assetSlug];

  const webhookUrl = process.env.CRM_WEBHOOK_URL?.trim();

  if (webhookUrl) {
    const metadata = {
      email,
      assetSlug,
      assetTitle: asset.title,
      source: 'blog-gate',
      page: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent'),
      requestedAt: new Date().toISOString(),
    } as const;

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      });

      if (!response.ok) {
        console.error('CRM webhook failed', await response.text());
      }
    } catch (error) {
      console.error('CRM webhook error', error);
    }
  }

  return NextResponse.json({ ok: true, downloadPath: asset.downloadPath });
}
