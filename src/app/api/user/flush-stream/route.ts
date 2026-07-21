import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { streamKey } from '@/lib/ingest-bus';
import { auth } from '@/lib/auth';

export async function DELETE() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!redis) {
    return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
  }

  const key = streamKey(userId);
  await redis.del(key);

  return NextResponse.json({ ok: true, key });
}
