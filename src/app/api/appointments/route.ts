import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Dohvati sve termine (samo aktivni)
export async function GET() {
  try {
    const appointments = await db.appointment.findMany({
      where: {
        cancelled: false,
      },
      orderBy: [
        { date: 'asc' },
        { time: 'asc' },
      ],
    });

    // Serijalizuj datum kao string
    const serialized = appointments.map(apt => ({
      ...apt,
      date: apt.date.toISOString(),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json({ error: 'Greška pri dohvatanju termina' }, { status: 500 });
  }
}

// POST - Kreiraj novi termin
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fullName, phone, date, time, duration, appointmentType, numberOfPeople, viberReminder } = body;

    // Validacija
    if (!fullName || !phone || !date || !time || !duration || !appointmentType) {
      return NextResponse.json({ error: 'Sva polja su obavezna' }, { status: 400 });
    }

    // Konvertuj vreme u minute
    const timeToMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const newStart = timeToMinutes(time);
    const newEnd = newStart + parseInt(duration);

    // Dohvati sve aktivne termine za taj dan da proverimo preklapanja
    const existingAppointments = await db.appointment.findMany({
      where: {
        date: new Date(date),
        cancelled: false,
      },
    });

    // Proveri da li se termin preklapa sa postojećim
    for (const apt of existingAppointments) {
      const aptStart = timeToMinutes(apt.time);
      const aptEnd = aptStart + apt.duration;

      // Ako se intervali preklapaju
      if (newStart < aptEnd && aptStart < newEnd) {
        return NextResponse.json({ error: 'Termin se preklapa sa postojećim terminom' }, { status: 400 });
      }
    }

    // Kreiraj termin
    const appointment = await db.appointment.create({
      data: {
        fullName,
        phone,
        date: new Date(date),
        time,
        duration: parseInt(duration),
        appointmentType,
        numberOfPeople: parseInt(numberOfPeople) || 1,
        viberReminder: viberReminder || false,
      },
    });

    // Ažuriraj ili kreiraj pacijenta u bazi (kartoteka) - pokušaj
    // Napomena: Ovo će raditi nakon restarta servera
    try {
      // @ts-expect-error - Patient model možda nije dostupan u cache-u
      if (db.patient) {
        // Pronađi postojećeg pacijenta da proveriš ime
        // @ts-expect-error - Patient model
        const existingPatient = await db.patient.findUnique({
          where: { phone },
        });

        // Logika: ako postojeće ime ima razmak (ime + prezime), ne menjaj ga
        // Novo ime koristi samo ako je "bolje" (duže ili ima razmak kad staro nema)
        const shouldUpdateName = existingPatient 
          ? (() => {
              const oldHasSpace = existingPatient.fullName.includes(' ');
              const newHasSpace = fullName.includes(' ');
              const oldLen = existingPatient.fullName.length;
              const newLen = fullName.length;
              
              // Ako staro ime nema razmak, a novo ima - ažuriraj
              if (!oldHasSpace && newHasSpace) return true;
              // Ako novo ime nema razmak, a staro ima - ne ažuriraj
              if (oldHasSpace && !newHasSpace) return false;
              // Ako oba imaju razmak ili oba nemaju - uzmi duže
              return newLen > oldLen;
            })()
          : true; // Nema postojećeg, kreiraj sa novim imenom

        // @ts-expect-error - Patient model
        await db.patient.upsert({
          where: { phone },
          create: {
            fullName,
            phone,
            totalAppointments: 1,
            lastVisit: new Date(date),
            viberReminder: viberReminder || false,
          },
          update: {
            fullName: shouldUpdateName ? fullName : existingPatient?.fullName,
            totalAppointments: { increment: 1 },
            lastVisit: new Date(date),
            viberReminder: viberReminder || false,
          },
        });
      }
    } catch {
      // Ignoriši grešku - Patient model možda nije dostupan
    }

    // Serijalizuj za odgovor
    const serialized = {
      ...appointment,
      date: appointment.date.toISOString(),
    };

    return NextResponse.json(serialized, { status: 201 });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return NextResponse.json({ error: 'Greška pri kreiranju termina' }, { status: 500 });
  }
}
