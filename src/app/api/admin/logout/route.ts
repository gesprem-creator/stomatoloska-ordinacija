import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// POST - Logout
export async function POST() {
  try {
    const cookieStore = await cookies();

    // Obriši oba cookija
    cookieStore.delete('admin_session');
    cookieStore.delete('admin_verified');

    return NextResponse.json({ success: true, message: 'Uspešno ste se odjavili' });
  } catch {
    return NextResponse.json({ error: 'Greška prilikom odjave' }, { status: 500 });
  }
}
