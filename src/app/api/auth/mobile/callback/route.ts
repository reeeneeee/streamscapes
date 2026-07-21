import { auth, signIn } from '@/lib/auth';
import { SignJWT } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function GET(req: NextRequest) {
  const session = await auth();
  const provider = req.nextUrl.searchParams.get('provider') || 'google';

  if (!session?.user?.id) {
    // Not authenticated — use signIn() to properly initiate the OAuth flow
    // (handles CSRF tokens, PKCE, cookies automatically)
    const base = process.env.AUTH_URL || 'https://streamscapes.fm';
    const callbackUrl = `${base}/api/auth/mobile/callback?provider=${provider}`;
    await signIn(provider, { redirectTo: callbackUrl });
    // signIn() calls redirect() internally, so this line is never reached
  }

  // Mint a mobile JWT (30-day expiry)
  const token = await new SignJWT({
    sub: session!.user!.id!,
    name: session!.user!.name ?? undefined,
    email: session!.user!.email ?? undefined,
    image: session!.user!.image ?? undefined,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET);

  return NextResponse.redirect(`streamscapes://auth/callback?token=${token}`);
}
