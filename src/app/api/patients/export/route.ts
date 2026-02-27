import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';

    // Get all unique patients from appointments
    const appointments = await db.appointment.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Group by phone number and get unique patients
    const patientMap = new Map<string, {
      fullName: string;
      phone: string;
      totalAppointments: number;
      lastVisit: string | null;
    }>();

    appointments.forEach(apt => {
      const phone = apt.phone;
      if (!patientMap.has(phone)) {
        patientMap.set(phone, {
          fullName: apt.fullName,
          phone: apt.phone,
          totalAppointments: 1,
          lastVisit: apt.date,
        });
      } else {
        const existing = patientMap.get(phone)!;
        existing.totalAppointments += 1;
        if (!existing.lastVisit || apt.date > existing.lastVisit) {
          existing.lastVisit = apt.date;
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
      }
    });

    // Filter by search if provided
    let patients = Array.from(patientMap.values());
    if (search) {
      const searchLower = search.toLowerCase();
      patients = patients.filter(p => 
        p.fullName.toLowerCase().includes(searchLower) ||
        p.phone.includes(search)
      );
    }

    // Sort by name
    patients.sort((a, b) => a.fullName.localeCompare(b.fullName, 'sr'));

    // Create Excel workbook
    const wb = XLSX.utils.book_new();
    
    // Prepare data for Excel
    const excelData = patients.map((patient, index) => ({
      'Rb.': index + 1,
      'Ime i prezime': patient.fullName,
      'Broj telefona': patient.phone,
      'Broj termina': patient.totalAppointments,
      'Poslednja poseta': patient.lastVisit ? new Date(patient.lastVisit).toLocaleDateString('sr-RS') : '/',
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
      { wch: 5 },   // Rb.
      { wch: 30 },  // Ime i prezime
      { wch: 20 },  // Broj telefona
      { wch: 15 },  // Broj termina
      { wch: 18 },  // Poslednja poseta
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Kartoteka');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Create filename with current date
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const filename = `kartoteka_${dateStr}.xlsx`;

    // Return file as response
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting patients:', error);
    return NextResponse.json({ error: 'Greška pri izvozu podataka' }, { status: 500 });
  }
}
