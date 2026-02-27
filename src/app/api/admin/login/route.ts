import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Admin kredencijali
const ADMIN_CREDENTIALS = {
  email: 'ortodontic.info@gmail.com',
  password: 'Ordinacija021',
};

// POST - Login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email i lozinka su obavezni' }, { status: 400 });
    }

    // Provera kredencijala
    if (email.toLowerCase() === ADMIN_CREDENTIALS.email.toLowerCase() && password === ADMIN_CREDENTIALS.password) {
      const cookieStore = await cookies();

      // Session traje 365 dana - admin ostaje ulogovan
      cookieStore.set('admin_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365, // 365 dana
        path: '/',
      });

      // Dodatni cookie za backup (za slučaj da jedan istekne)
      cookieStore.set('admin_verified', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });

      return NextResponse.json({ success: true, message: 'Uspešno ste se prijavili' });
    }

    return NextResponse.json({ error: 'Pogrešan email ili lozinka' }, { status: 401 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Greška prilikom prijave' }, { status: 500 });
  }
}
