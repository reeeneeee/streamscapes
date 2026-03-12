import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { sourceConfigs } from '@/db/schema';
import type { SourceCredentials } from '@/db/schema';
import { encrypt, decrypt } from '@/lib/crypto';

function isDatadogCreds(obj: unknown): obj is Extract<SourceCredentials, { provider: 'datadog' }> {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    o.provider === 'datadog' &&
    typeof o.apiKey === 'string' &&
    typeof o.appKey === 'string' &&
    typeof o.site === 'string' &&
    typeof o.query === 'string'
  );
}

function isGithubCreds(obj: unknown): obj is Extract<SourceCredentials, { provider: 'github' }> {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return o.provider === 'github' && typeof o.webhookSecret === 'string';
}

function validateCredentials(creds: unknown): SourceCredentials | null {
  if (isDatadogCreds(creds)) return creds;
  if (isGithubCreds(creds)) return creds;
  return null;
}

// GET /api/user/configs — list authenticated user's source configs
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const configs = await db
    .select()
    .from(sourceConfigs)
    .where(eq(sourceConfigs.userId, session.user.id));

  const decrypted = configs.map((c) => ({
    id: c.id,
    type: c.type,
    name: c.name,
    credentials: c.encryptedCredentials ? JSON.parse(decrypt(c.encryptedCredentials)) : null,
    updatedAt: c.updatedAt,
  }));

  return NextResponse.json(decrypted);
}

// POST /api/user/configs — create or update a source config
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json();
  const { type, name, credentials } = body;

  if (typeof type !== 'string' || typeof name !== 'string') {
    return new Response('Missing type or name', { status: 400 });
  }

  const validated = validateCredentials(credentials);
  if (!validated) {
    return new Response('Invalid credentials shape', { status: 400 });
  }

  const encrypted = encrypt(JSON.stringify(validated));

  // Upsert: if a config with this type already exists for the user, update it
  const existing = await db
    .select()
    .from(sourceConfigs)
    .where(eq(sourceConfigs.userId, session.user.id));
  const match = existing.find((c) => c.type === type);

  if (match) {
    await db
      .update(sourceConfigs)
      .set({ name, encryptedCredentials: encrypted, updatedAt: new Date() })
      .where(eq(sourceConfigs.id, match.id));
    return NextResponse.json({ id: match.id, updated: true });
  }

  const [inserted] = await db
    .insert(sourceConfigs)
    .values({
      userId: session.user.id,
      type,
      name,
      encryptedCredentials: encrypted,
    })
    .returning({ id: sourceConfigs.id });

  return NextResponse.json({ id: inserted.id, created: true });
}

// DELETE /api/user/configs?id=<id> — remove a source config
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  // Verify ownership before deleting
  const configs = await db
    .select()
    .from(sourceConfigs)
    .where(eq(sourceConfigs.id, id));

  if (!configs.length || configs[0].userId !== session.user.id) {
    return new Response('Not found', { status: 404 });
  }

  await db.delete(sourceConfigs).where(eq(sourceConfigs.id, id));
  return NextResponse.json({ ok: true });
}
