import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { generateApiKey } from '@/lib/api-keys';

/** POST — generate (or regenerate) the user's API key. Returns the key once. */
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { key, hash, prefix } = generateApiKey();

  await db
    .update(users)
    .set({ apiKeyHash: hash, apiKeyPrefix: prefix })
    .where(eq(users.id, userId));

  return NextResponse.json({ key, prefix });
}

/** GET — check if user has an API key (returns prefix only, never the key). */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const rows = await db
    .select({ prefix: users.apiKeyPrefix })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const prefix = rows[0]?.prefix ?? null;
  return NextResponse.json({ hasKey: !!prefix, prefix });
}

/** DELETE — revoke the user's API key. */
export async function DELETE() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response('Unauthorized', { status: 401 });

  await db
    .update(users)
    .set({ apiKeyHash: null, apiKeyPrefix: null })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
