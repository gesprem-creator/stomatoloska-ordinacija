import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Tipovi termina i njihova trajanja - v5 (force refresh)
const APPOINTMENT_DURATIONS = {
  popravka: 30,      // 30 minuta
  lecenje: 60,       // 1 sat
  ortodont: 15,      // 15 minuta (samo petak 18-21h)
  proteza: 45,       // 45 minuta (samo petak 18-21h)
} as const;

type AppointmentType = keyof typeof APPOINTMENT_DURATIONS;

interface TimeSlot {
  time: string;
  available: boolean;
  duration: number;
}

// Radno vreme
const WORK_HOURS = {
  weekday: { start: 14, end: 20 },     // Pon-Čet: 14:00 - 20:00
  friday: {
    regular: { start: 14, end: 18 },   // Petak regularno: 14:00 - 18:00
    orthodont: { start: 18, end: 21 }, // Petak ortodont/proteza: 18:00 - 21:00
  },
};

// Tipovi koji su samo za petak 18-21h
const FRIDAY_EVENING_TYPES: AppointmentType[] = ['ortodont', 'proteza'];

// Proveri da li je vikend
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Nedelja, 6 = Subota
}

// Proveri da li je petak
function isFriday(date: Date): boolean {
  return date.getDay() === 5;
}

// Generiši vremenske slotove (uveko na 30 min za regularne, 15 min za ortodont/protezu)
function generateTimeSlots(startHour: number, endHour: number, intervalMinutes: number): string[] {
  const slots: string[] = [];
  let currentMinutes = startHour * 60;
  const endMinutes = endHour * 60;

  while (currentMinutes < endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const minutes = currentMinutes % 60;
    slots.push(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    currentMinutes += intervalMinutes;
  }

  return slots;
}

// Konvertuj vreme u minute od ponoći
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Proveri da li se vremenski intervali preklapaju
function doIntervalsOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
  return start1 < end2 && start2 < end1;
}

// GET - Dohvati dostupne termine za datum
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const appointmentType = searchParams.get('type') as AppointmentType || 'popravka';

    if (!dateStr) {
      return NextResponse.json({ error: 'Datum je obavezan' }, { status: 400 });
    }

    const selectedDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Provera da li je datum u prošlosti
    if (selectedDate < today) {
      return NextResponse.json({ slots: [], message: 'Datum je u prošlosti' });
    }

    // Provera da li je datum više od 2 nedelje unapred
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 14);
    maxDate.setHours(23, 59, 59, 999);
    if (selectedDate > maxDate) {
      return NextResponse.json({ slots: [], message: 'Datum je više od 2 nedelje unapred' });
    }

    // Provera da li je vikend
    if (isWeekend(selectedDate)) {
      return NextResponse.json({ slots: [], message: 'Subota i nedelja su neradni dani' });
    }

    // Provera za ortodont/protezu - mora biti petak
    const isFridayEveningType = FRIDAY_EVENING_TYPES.includes(appointmentType);
    if (isFridayEveningType && !isFriday(selectedDate)) {
      return NextResponse.json({ 
        slots: [], 
        message: 'Ortodont i Lepljenje/Skidanje proteze su dostupni samo petkom od 18:00 do 21:00' 
      });
    }

    // Dohvati postojeće aktivne termine za taj dan
    const existingAppointments = await db.appointment.findMany({
      where: {
        date: selectedDate,
        cancelled: false,
      },
    });

    // Kreiraj listu zauzetih intervala
    const bookedIntervals: Array<{ start: number; end: number }> = existingAppointments.map(apt => {
      const startMinutes = timeToMinutes(apt.time);
      const endMinutes = startMinutes + apt.duration;
      return { start: startMinutes, end: endMinutes };
    });

    // Funkcija za proveru da li je slot dostupan
    const isSlotAvailable = (slotStart: number, slotEnd: number): boolean => {
      for (const interval of bookedIntervals) {
        if (doIntervalsOverlap(slotStart, slotEnd, interval.start, interval.end)) {
          return false;
        }
      }
      return true;
    };

    let availableSlots: TimeSlot[] = [];
    const friday = isFriday(selectedDate);
    const duration = APPOINTMENT_DURATIONS[appointmentType];

    if (friday && isFridayEveningType) {
      // Ortodont ili Proteza: 18:00 - 21:00, slotovi od 15 min
      const slots = generateTimeSlots(
        WORK_HOURS.friday.orthodont.start,
        WORK_HOURS.friday.orthodont.end,
        15
      );

      slots.forEach(time => {
        const slotStart = timeToMinutes(time);
        const slotEnd = slotStart + duration;
        const available = isSlotAvailable(slotStart, slotEnd) && slotEnd <= 21 * 60;

        availableSlots.push({ time, available, duration });
      });
    } else if (friday) {
      // Regularni termini na petak: 14:00 - 18:00, slotovi na 30 min
      const slots = generateTimeSlots(
        WORK_HOURS.friday.regular.start,
        WORK_HOURS.friday.regular.end,
        30
      );

      slots.forEach(time => {
        const slotStart = timeToMinutes(time);
        const slotEnd = slotStart + duration;
        const available = isSlotAvailable(slotStart, slotEnd) && slotEnd <= 18 * 60;

        availableSlots.push({ time, available, duration });
      });
    } else {
      // Pon-Čet: 14:00 - 20:00, slotovi na 30 min za sve tipove
      // Lečenje (1 sat) može početi u 19:30 i završiti u 20:30
      const slots = generateTimeSlots(
        WORK_HOURS.weekday.start,
        WORK_HOURS.weekday.end,
        30
      );

      // Poslednji slot 19:30 je dozvoljen za sve tipove
      // (lečenje završava u 20:30, popravka u 20:00)
      const maxStartMinutes = 19 * 60 + 30; // 19:30

      slots.forEach(time => {
        const slotStart = timeToMinutes(time);
        const slotEnd = slotStart + duration;
        // Dozvoli samo slotove koji počinju do 19:30
        const withinHours = slotStart <= maxStartMinutes;
        const available = isSlotAvailable(slotStart, slotEnd) && withinHours;

        availableSlots.push({ time, available, duration });
      });
    }

    return NextResponse.json({ slots: availableSlots });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    return NextResponse.json({ error: 'Greška pri dohvatanju dostupnih termina' }, { status: 500 });
  }
}
