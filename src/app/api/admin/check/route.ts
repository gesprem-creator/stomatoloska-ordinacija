import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// GET - Provera da li je admin ulogovan
export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('admin_session');
    const verified = cookieStore.get('admin_verified');

    // Prihvata bilo koji od dva cookija
    if (
      (session && session.value === 'authenticated') ||
      (verified && verified.value === 'true')
    ) {
      // Ako je samo verified cookie, obnovi i session
      if (!session && verified) {
        cookieStore.set('admin_session', 'authenticated', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365,
          path: '/',
        });
      }

      return NextResponse.json({ authenticated: true });
    }

    return NextResponse.json({ authenticated: false });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
