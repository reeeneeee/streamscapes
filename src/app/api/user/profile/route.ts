import { auth } from '@/lib/auth';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

/** GET /api/user/profile — returns current user profile */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, username: schema.users.username, image: schema.users.image })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}

/** PATCH /api/user/profile — update username */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { username } = await req.json();
  if (typeof username !== 'string' || username.length < 2 || username.length > 30) {
    return NextResponse.json({ error: 'Username must be 2-30 characters' }, { status: 400 });
  }

  // Only lowercase alphanumeric + underscores + hyphens
  if (!/^[a-z0-9_-]+$/.test(username)) {
    return NextResponse.json({ error: 'Username: lowercase letters, numbers, hyphens, underscores only' }, { status: 400 });
  }

  try {
    await db
      .update(schema.users)
      .set({ username })
      .where(eq(schema.users.id, session.user.id));
    return NextResponse.json({ username });
  } catch {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }
}
