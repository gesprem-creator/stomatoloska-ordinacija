import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Dohvati termine po broju telefona (samo aktivni)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ error: 'Broj telefona je obavezan' }, { status: 400 });
    }

    // Formatiraj telefon za pretragu
    let formattedPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    // Pokušaj da pronađeš sa različitim formatima
    const phoneVariants = [formattedPhone];
    
    // Ako počinje sa 0, dodaj varijantu sa +381
    if (formattedPhone.startsWith('0')) {
      phoneVariants.push('+381' + formattedPhone.slice(1));
    }
    // Ako počinje sa +381, dodaj varijantu sa 0
    if (formattedPhone.startsWith('+381')) {
      phoneVariants.push('0' + formattedPhone.slice(4));
    }
    // Ako nema prefix, dodaj obe varijante
    if (!formattedPhone.startsWith('0') && !formattedPhone.startsWith('+')) {
      phoneVariants.push('0' + formattedPhone);
      phoneVariants.push('+381' + formattedPhone);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Dohvati sve buduće termine za te telefone (samo aktivni, ne otkazani)
    const appointments = await db.appointment.findMany({
      where: {
        phone: { in: phoneVariants },
        date: { gte: today },
        cancelled: false,
      },
      orderBy: [
        { date: 'asc' },
        { time: 'asc' },
      ],
    });

    // Serijalizuj za odgovor
    const serialized = appointments.map(apt => ({
      ...apt,
      date: apt.date.toISOString(),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching appointments by phone:', error);
    return NextResponse.json({ error: 'Greška pri dohvatanju termina' }, { status: 500 });
  }
}

// DELETE - Otkaži termin (ne briše, samo označi kao otkazan)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const phone = searchParams.get('phone');

    if (!id || !phone) {
      return NextResponse.json({ error: 'ID i broj telefona su obavezni' }, { status: 400 });
    }

    // Formatiraj telefon za pretragu
    let formattedPhone = phone.replace(/[\s\-\(\)]/g, '');
    const phoneVariants = [formattedPhone];
    
    if (formattedPhone.startsWith('0')) {
      phoneVariants.push('+381' + formattedPhone.slice(1));
    }
    if (formattedPhone.startsWith('+381')) {
      phoneVariants.push('0' + formattedPhone.slice(4));
    }
    if (!formattedPhone.startsWith('0') && !formattedPhone.startsWith('+')) {
      phoneVariants.push('0' + formattedPhone);
      phoneVariants.push('+381' + formattedPhone);
    }

    // Pronađi termin i proveri da li telefon odgovara
    const appointment = await db.appointment.findFirst({
      where: {
        id,
        phone: { in: phoneVariants },
      },
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Termin nije pronađen ili broj telefona ne odgovara' }, { status: 404 });
    }

    // Označi termin kao otkazan (ne briši ga)
    await db.appointment.update({
      where: { id },
      data: { cancelled: true },
    });

    return NextResponse.json({ success: true, message: 'Termin je uspešno otkazan' });
  } catch (error) {
    console.error('Error canceling appointment:', error);
    return NextResponse.json({ error: 'Greška pri otkazivanju termina' }, { status: 500 });
  }
}
