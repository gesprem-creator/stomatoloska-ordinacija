import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Dohvati sve pacijente iz baze (kartoteka)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.toLowerCase() || '';

    // Dohvati sve pacijente iz Patient tabele
    // @ts-expect-error - Patient model možda nije dostupan u cache-u
    if (!db.patient) {
      // Fallback - koristi Appointment tabelu za generisanje liste
      const appointments = await db.appointment.findMany({
        orderBy: { createdAt: 'desc' },
      });

      // Grupiši po telefonu
      const patientsMap = new Map<string, {
        fullName: string;
        phone: string;
        totalAppointments: number;
        lastVisit: string | null;
        viberReminder: boolean;
      }>();

      appointments.forEach(apt => {
        const existing = patientsMap.get(apt.phone);
        if (existing) {
          existing.totalAppointments += 1;
          if (apt.date > new Date(existing.lastVisit || 0)) {
            existing.lastVisit = apt.date.toISOString();
          }
          
          // Logika: ako postojeće ime ima razmak (ime + prezime), ne menjaj ga
          const oldHasSpace = existing.fullName.includes(' ');
          const newHasSpace = apt.fullName.includes(' ');
          const oldLen = existing.fullName.length;
          const newLen = apt.fullName.length;
          
          // Ažuriraj ime samo ako je novo "bolje"
          if (!oldHasSpace && newHasSpace) {
            existing.fullName = apt.fullName;
          } else if (oldHasSpace && !newHasSpace) {
            // Ne menjaj - staro ima razmak, novo nema
          } else if (newLen > oldLen) {
            existing.fullName = apt.fullName;
          }
        } else {
          patientsMap.set(apt.phone, {
            fullName: apt.fullName,
            phone: apt.phone,
            totalAppointments: 1,
            lastVisit: apt.date.toISOString(),
            viberReminder: apt.viberReminder,
          });
        }
      });

      let patients = Array.from(patientsMap.values());
      if (search) {
        patients = patients.filter(p => 
          p.fullName.toLowerCase().includes(search) ||
          p.phone.includes(search)
        );
      }
      patients.sort((a, b) => a.fullName.localeCompare(b.fullName, 'sr'));

      return NextResponse.json(patients);
    }

    // @ts-expect-error - Patient model
    let patients = await db.patient.findMany({
      orderBy: { fullName: 'asc' },
    });

    // Filtriraj po pretrazi
    if (search) {
      patients = patients.filter((p: { fullName: string; phone: string }) => 
        p.fullName.toLowerCase().includes(search) ||
        p.phone.includes(search)
      );
    }

    // Formatiraj za odgovor
    const serialized = patients.map((p: { 
      fullName: string; 
      phone: string; 
      totalAppointments: number; 
      lastVisit: Date | null; 
      viberReminder: boolean;
    }) => ({
      fullName: p.fullName,
      phone: p.phone,
      totalAppointments: p.totalAppointments,
      lastVisit: p.lastVisit ? p.lastVisit.toISOString() : null,
      viberReminder: p.viberReminder,
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching patients:', error);
    return NextResponse.json({ error: 'Greška pri dohvatanju pacijenata' }, { status: 500 });
  }
}
