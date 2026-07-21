import { db } from '@/db';
import * as schema from '@/db/schema';
import { SignJWT } from 'jose';
import { eq, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

/**
 * Exchanges a native Apple Sign-In identity token for a mobile JWT.
 * Called from the iOS app after ASAuthorizationAppleIDProvider completes.
 */
export async function POST(req: NextRequest) {
  const { identityToken, fullName } = await req.json();

  if (!identityToken) {
    return NextResponse.json({ error: 'identityToken required' }, { status: 400 });
  }

  // Decode Apple identity token (JWT) to get user info
  const parts = identityToken.split('.');
  if (parts.length !== 3) {
    return NextResponse.json({ error: 'Invalid identity token' }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    const padded = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64url').toString('utf-8');
    payload = JSON.parse(decoded);
  } catch {
    return NextResponse.json({ error: 'Failed to decode token' }, { status: 400 });
  }

  const appleSub = payload.sub as string;
  const email = payload.email as string | undefined;
  if (!appleSub) {
    return NextResponse.json({ error: 'No subject in token' }, { status: 400 });
  }

  // Look up existing account linked to this Apple ID
  const existingAccount = await db
    .select({ userId: schema.accounts.userId })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.provider, 'apple'),
        eq(schema.accounts.providerAccountId, appleSub),
      ),
    )
    .limit(1);

  let userId: string;
  let userName: string | null = null;
  let userEmail: string | null = null;

  if (existingAccount.length > 0) {
    // Existing user — fetch their profile
    userId = existingAccount[0].userId;
    const userRows = await db
      .select({ name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (userRows.length > 0) {
      userName = userRows[0].name;
      userEmail = userRows[0].email;
    }
  } else {
    // New user — create user + account
    // Apple only sends name on FIRST authorization, so capture it
    const name = fullName
      ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ') || null
      : null;

    userId = crypto.randomUUID();
    userName = name;
    userEmail = email ?? null;

    await db.insert(schema.users).values({
      id: userId,
      name,
      email: email ?? null,
      emailVerified: email ? new Date() : null,
    });

    await db.insert(schema.accounts).values({
      userId,
      type: 'oauth',
      provider: 'apple',
      providerAccountId: appleSub,
      id_token: identityToken,
    });
  }

  // Mint mobile JWT (30-day expiry)
  const token = await new SignJWT({
    sub: userId,
    name: userName ?? undefined,
    email: userEmail ?? undefined,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET);

  return NextResponse.json({ token });
}
