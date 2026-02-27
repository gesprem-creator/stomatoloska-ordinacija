'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { format, addDays, isBefore, isAfter, startOfDay, parseISO } from 'date-fns';
import { sr } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  User,
  Phone,
  Users,
  CalendarDays,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  CalendarClock,
  List,
  RefreshCw,
  Wifi,
  Lock,
  LogOut,
  Shield,
  PlusCircle,
  MessageCircle,
  Bell,
  MapPin,
  XCircle,
  Trash2,
  Search,
  Database,
  Download,
} from 'lucide-react';

// Zub ikonica (SVG)
const ToothIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 2C9.5 2 7.5 3 6.5 5C5.5 7 5 9 4.5 11.5C4 14 4 16 4.5 18C5 20 6 22 7.5 22C9 22 9.5 20 10 18C10.5 16 11 14 12 14C13 14 13.5 16 14 18C14.5 20 15 22 16.5 22C18 22 19 20 19.5 18C20 16 20 14 19.5 11.5C19 9 18.5 7 17.5 5C16.5 3 14.5 2 12 2Z" />
  </svg>
);
import { useToast } from '@/hooks/use-toast';

// Custom hook za debounced value
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

type AppointmentType = 'popravka' | 'lecenje' | 'ortodont' | 'proteza';

interface TimeSlot {
  time: string;
  available: boolean;
  duration: number;
}

interface Appointment {
  id: string;
  fullName: string;
  phone: string;
  date: string;
  time: string;
  duration: number;
  appointmentType: string;
  numberOfPeople: number;
}

const APPOINTMENT_TYPE_INFO = {
  popravka: { label: 'Popravka', duration: 30, description: '30 minuta' },
  lecenje: { label: 'Lečenje', duration: 60, description: '1 sat' },
  ortodont: { label: 'Ortodont - Kontrola', duration: 15, description: '15 minuta (samo petak 18-21h)' },
  proteza: { label: 'Lepljenje/Skidanje proteze', duration: 45, description: '45 minuta (samo petak 18-21h)' },
};

// Generiši sve vremenske slotove za dan (za admin prikaz)
function generateAllTimeSlots(isFriday: boolean): string[] {
  const slots: string[] = [];
  const regularEnd = isFriday ? 18 : 20;
  for (let h = 14; h < regularEnd; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`);
    slots.push(`${h.toString().padStart(2, '0')}:30`);
  }
  if (isFriday) {
    for (let h = 18; h < 21; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
      slots.push(`${h.toString().padStart(2, '0')}:15`);
      slots.push(`${h.toString().padStart(2, '0')}:30`);
      slots.push(`${h.toString().padStart(2, '0')}:45`);
    }
  }
  return slots;
}

function getSlotBookingInfo(
  slotTime: string,
  appointments: Appointment[]
): { booked: boolean; appointment?: Appointment } {
  const slotStart = timeToMinutes(slotTime);
  for (const apt of appointments) {
    const aptStart = timeToMinutes(apt.time);
    const aptEnd = aptStart + apt.duration;
    if (slotStart >= aptStart && slotStart < aptEnd) {
      return { booked: true, appointment: apt };
    }
  }
  return { booked: false };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Formatira broj telefona sa +381 prefixom za Srbiju
function formatPhoneForSerbia(phone: string): string {
  // Ukloni sve razmake, crtice i zagrade
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  
  // Ako počinje sa +381, već je u dobrom formatu
  if (cleaned.startsWith('+381')) {
    return cleaned;
  }
  
  // Ako počinje sa 00381, zameni sa +381
  if (cleaned.startsWith('00381')) {
    return '+381' + cleaned.slice(5);
  }
  
  // Ako počinje sa 0 (npr. 064), zameni sa +381
  if (cleaned.startsWith('0')) {
    return '+381' + cleaned.slice(1);
  }
  
  // Ako nema prefix, dodaj +381
  if (cleaned.length >= 8 && !cleaned.startsWith('+')) {
    return '+381' + cleaned;
  }
  
  return cleaned;
}

export default function Home() {
  const [currentView, setCurrentView] = useState<'booking' | 'admin'>('booking');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('popravka');
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState('1');
  const [viberReminder, setViberReminder] = useState(false);

  // Cancel appointment
  const [cancelPhone, setCancelPhone] = useState('');
  const [cancelAppointments, setCancelAppointments] = useState<Appointment[]>([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelSearchDone, setCancelSearchDone] = useState(false);

  // Admin view
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [adminSelectedDate, setAdminSelectedDate] = useState<Date>(new Date());
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [adminTab, setAdminTab] = useState<'pregled' | 'zakazivanje' | 'kartoteka' | 'otkazivanje'>('pregled');

  // Kartoteka (patient registry)
  const [patients, setPatients] = useState<Array<{
    fullName: string;
    phone: string;
    totalAppointments: number;
    lastVisit: string | null;
    viberReminder: boolean;
  }>>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientsLoading, setPatientsLoading] = useState(false);

  // Admin booking form (duplicated state for admin view)
  const [adminBookingDate, setAdminBookingDate] = useState<Date | undefined>(undefined);
  const [adminBookingType, setAdminBookingType] = useState<AppointmentType>('popravka');
  const [adminBookingTime, setAdminBookingTime] = useState<string | null>(null);
  const [adminBookingSlots, setAdminBookingSlots] = useState<TimeSlot[]>([]);
  const [adminBookingLoading, setAdminBookingLoading] = useState(false);
  const [adminBookingName, setAdminBookingName] = useState('');
  const [adminBookingPhone, setAdminBookingPhone] = useState('');
  const [adminBookingPeople, setAdminBookingPeople] = useState('1');
  const [adminBookingViber, setAdminBookingViber] = useState(false);

  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const { toast } = useToast();

  const today = new Date();
  const maxDate = addDays(today, 14);

  const isFriday = selectedDate?.getDay() === 5;
  const isAdminFriday = adminSelectedDate.getDay() === 5;
  const isAdminBookingFriday = adminBookingDate?.getDay() === 5;

  // Proveri admin sesiju na mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/check');
        const data = await response.json();
        setIsAdmin(data.authenticated);
      } catch {
        setIsAdmin(false);
      }
    };
    checkAuth();
  }, []);

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    try {
      const response = await fetch('/api/appointments');
      const data = await response.json();
      setAppointments(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  }, []);

  // Polling for admin
  useEffect(() => {
    if (currentView === 'admin' && isAdmin) {
      fetchAppointments();
      const interval = setInterval(fetchAppointments, 5000);
      return () => clearInterval(interval);
    }
  }, [currentView, isAdmin, fetchAppointments]);

  // Fetch available slots - public booking
  const fetchAvailableSlots = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await fetch(`/api/appointments/available?date=${dateStr}&type=${appointmentType}`);
      const data = await response.json();
      if (data.slots) setTimeSlots(data.slots);
      else setTimeSlots([]);
    } catch {
      setTimeSlots([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, appointmentType]);

  useEffect(() => {
    if (selectedDate) {
      const day = selectedDate.getDay();
      if (day !== 0 && day !== 6) fetchAvailableSlots();
    }
  }, [selectedDate, appointmentType, fetchAvailableSlots]);

  // Fetch available slots - admin booking
  const fetchAdminBookingSlots = useCallback(async () => {
    if (!adminBookingDate) return;
    setAdminBookingLoading(true);
    try {
      const dateStr = format(adminBookingDate, 'yyyy-MM-dd');
      const response = await fetch(`/api/appointments/available?date=${dateStr}&type=${adminBookingType}`);
      const data = await response.json();
      if (data.slots) setAdminBookingSlots(data.slots);
      else setAdminBookingSlots([]);
    } catch {
      setAdminBookingSlots([]);
    } finally {
      setAdminBookingLoading(false);
    }
  }, [adminBookingDate, adminBookingType]);

  useEffect(() => {
    if (adminBookingDate) {
      const day = adminBookingDate.getDay();
      if (day !== 0 && day !== 6) fetchAdminBookingSlots();
    }
  }, [adminBookingDate, adminBookingType, fetchAdminBookingSlots]);

  useEffect(() => { setSelectedTime(null); }, [appointmentType]);
  useEffect(() => { setAdminBookingTime(null); }, [adminBookingType]);

  useEffect(() => {
    if (appointmentType === 'ortodont' && selectedDate && !isFriday) {
      setAppointmentType('popravka');
    }
  }, [selectedDate, isFriday, appointmentType]);

  useEffect(() => {
    if (adminBookingType === 'ortodont' && adminBookingDate && !isAdminBookingFriday) {
      setAdminBookingType('popravka');
    }
  }, [adminBookingDate, isAdminBookingFriday, adminBookingType]);

  // Login handler
  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) {
      toast({ title: 'Greška', description: 'Unesite email i lozinku', variant: 'destructive' });
      return;
    }
    setLoginLoading(true);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        setIsAdmin(true);
        setShowLoginDialog(false);
        setLoginEmail('');
        setLoginPassword('');
        toast({ title: 'Uspešno!', description: 'Prijavljeni ste kao administrator' });
        setCurrentView('admin');
      } else {
        toast({ title: 'Greška', description: data.error || 'Pogrešni kredencijali', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Greška', description: 'Greška prilikom prijave', variant: 'destructive' });
    } finally {
      setLoginLoading(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      setIsAdmin(false);
      setCurrentView('booking');
      toast({ title: 'Odjava', description: 'Uspešno ste se odjavili' });
    } catch {
      console.error('Logout error');
    }
  };

  // Submit handler - shared
  const handleSubmit = async (isAdminBooking = false) => {
    const name = isAdminBooking ? adminBookingName : fullName;
    const phoneNum = isAdminBooking ? adminBookingPhone : phone;
    const people = isAdminBooking ? adminBookingPeople : numberOfPeople;
    const date = isAdminBooking ? adminBookingDate : selectedDate;
    const time = isAdminBooking ? adminBookingTime : selectedTime;
    const type = isAdminBooking ? adminBookingType : appointmentType;
    const wantsViber = isAdminBooking ? adminBookingViber : viberReminder;

    if (!date || !time || !name || !phoneNum) {
      toast({ title: 'Greška', description: 'Molimo popunite sva obavezna polja', variant: 'destructive' });
      return;
    }

    // Formatiraj broj telefona sa +381
    const formattedPhone = formatPhoneForSerbia(phoneNum);

    setSubmitting(true);

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name,
          phone: formattedPhone,
          date: format(date, 'yyyy-MM-dd'),
          time,
          duration: APPOINTMENT_TYPE_INFO[type].duration,
          appointmentType: type,
          numberOfPeople: people,
          viberReminder: wantsViber,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        toast({ 
          title: 'Uspešno!', 
          description: wantsViber 
            ? 'Termin je uspešno zakazan. Dobićete Viber podsetnik 3 sata pre termina.'
            : 'Termin je uspešno zakazan.'
        });
        if (isAdminBooking) {
          setAdminBookingDate(undefined);
          setAdminBookingTime(null);
          setAdminBookingName('');
          setAdminBookingPhone('');
          setAdminBookingPeople('1');
          setAdminBookingViber(false);
          setAdminBookingSlots([]);
          fetchAppointments();
        } else {
          setSelectedDate(undefined);
          setSelectedTime(null);
          setFullName('');
          setPhone('');
          setNumberOfPeople('1');
          setViberReminder(false);
          setTimeSlots([]);
        }
      } else {
        toast({ title: 'Greška', description: data.error || 'Greška prilikom zakazivanja', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Greška', description: 'Greška prilikom zakazivanja', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const getTypeLabel = (type: string) => APPOINTMENT_TYPE_INFO[type as AppointmentType]?.label || type;

  // Pretraga termina za otkazivanje
  const handleSearchAppointments = async () => {
    if (!cancelPhone.trim()) {
      toast({ title: 'Greška', description: 'Unesite broj telefona', variant: 'destructive' });
      return;
    }

    setCancelLoading(true);
    setCancelSearchDone(false);
    
    try {
      const response = await fetch(`/api/appointments/cancel?phone=${encodeURIComponent(cancelPhone)}`);
      const data = await response.json();
      
      if (response.ok) {
        setCancelAppointments(data);
        setCancelSearchDone(true);
        if (data.length === 0) {
          toast({ title: 'Info', description: 'Nema pronađenih termina za ovaj broj telefona' });
        }
      } else {
        toast({ title: 'Greška', description: data.error || 'Greška pri pretrazi', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Greška', description: 'Greška pri pretrazi termina', variant: 'destructive' });
    } finally {
      setCancelLoading(false);
    }
  };

  // Otkazivanje termina
  const handleCancelAppointment = async (appointmentId: string) => {
    if (!confirm('Da li ste sigurni da želite da otkažete ovaj termin?')) {
      return;
    }

    setCancelLoading(true);
    
    try {
      const response = await fetch(`/api/appointments/cancel?id=${appointmentId}&phone=${encodeURIComponent(cancelPhone)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      
      if (response.ok) {
        toast({ title: 'Uspešno', description: 'Termin je uspešno otkazan' });
        // Ukloni otkazani termin iz liste
        setCancelAppointments(prev => prev.filter(apt => apt.id !== appointmentId));
      } else {
        toast({ title: 'Greška', description: data.error || 'Greška pri otkazivanju', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Greška', description: 'Greška pri otkazivanju termina', variant: 'destructive' });
    } finally {
      setCancelLoading(false);
    }
  };

  const isDateDisabled = (date: Date) => {
    const day = date.getDay();
    const isPast = isBefore(startOfDay(date), startOfDay(today));
    const isTooFar = isAfter(date, maxDate);
    return isPast || isTooFar || day === 0 || day === 6;
  };

  // Dohvati pacijente za kartoteku
  const fetchPatients = useCallback(async (search: string = '') => {
    setPatientsLoading(true);
    try {
      const url = search 
        ? `/api/patients?search=${encodeURIComponent(search)}`
        : '/api/patients';
      const response = await fetch(url);
      const data = await response.json();
      if (response.ok) {
        setPatients(data);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  // Učitaj pacijente kad se prebaci na kartoteka tab
  useEffect(() => {
    if (currentView === 'admin' && isAdmin && adminTab === 'kartoteka') {
      fetchPatients(patientSearch);
    }
  }, [currentView, isAdmin, adminTab, patientSearch, fetchPatients]);

  const appointmentsForDay = appointments.filter(apt => {
    const aptDate = format(parseISO(apt.date), 'yyyy-MM-dd');
    const selectedDateStr = format(adminSelectedDate, 'yyyy-MM-dd');
    return aptDate === selectedDateStr;
  });

  const allAdminSlots = generateAllTimeSlots(isAdminFriday);

  // Helper funkcija za renderovanje booking forme (nije komponenta, da bi se izbegao re-mount)
  const renderBookingForm = (isAdminBooking: boolean) => {
    const date = isAdminBooking ? adminBookingDate : selectedDate;
    const setDate = isAdminBooking ? setAdminBookingDate : setSelectedDate;
    const type = isAdminBooking ? adminBookingType : appointmentType;
    const setType = isAdminBooking ? setAdminBookingType : setAppointmentType;
    const time = isAdminBooking ? adminBookingTime : selectedTime;
    const setTime = isAdminBooking ? setAdminBookingTime : setSelectedTime;
    const slots = isAdminBooking ? adminBookingSlots : timeSlots;
    const isLoading = isAdminBooking ? adminBookingLoading : loading;
    const name = isAdminBooking ? adminBookingName : fullName;
    const setName = isAdminBooking ? setAdminBookingName : setFullName;
    const phoneNum = isAdminBooking ? adminBookingPhone : phone;
    const setPhoneNum = isAdminBooking ? setAdminBookingPhone : setPhone;
    const people = isAdminBooking ? adminBookingPeople : numberOfPeople;
    const setPeople = isAdminBooking ? setAdminBookingPeople : setNumberOfPeople;
    const wantsViber = isAdminBooking ? adminBookingViber : viberReminder;
    const setWantsViber = isAdminBooking ? setAdminBookingViber : setViberReminder;
    const isFri = date?.getDay() === 5;

    return (
      <div className="grid lg:grid-cols-3 gap-6 booking-form-container">
        <div className="lg:col-span-1 space-y-4">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5" />
                Izaberite datum
              </CardTitle>
              <CardDescription className="text-teal-100">
                Radnim danima (Pon-Pet), najviše 2 nedelje unapred
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => { setDate(d); setTime(null); }}
                disabled={isDateDisabled}
                locale={sr}
                className="rounded-md border mx-auto"
              />
              <div className="mt-4 text-xs text-muted-foreground space-y-1">
                <p>• Ponedeljak - Četvrtak: 14:00 - 20:00</p>
                <p>• Petak: 14:00 - 18:00 (redovno)</p>
                <p>• Petak: 18:00 - 21:00 (ortodont)</p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5" />
                Tip usluge
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <RadioGroup value={type} onValueChange={(v) => setType(v as AppointmentType)} className="space-y-3">
                {Object.entries(APPOINTMENT_TYPE_INFO).map(([key, info]) => {
                  const isFridayOnly = key === 'ortodont' || key === 'proteza';
                  const disabled = isFridayOnly && date && !isFri;
                  return (
                    <div
                      key={key}
                      className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                        disabled ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50 cursor-pointer'
                      } ${type === key ? 'border-teal-500 bg-teal-50' : ''}`}
                    >
                      <RadioGroupItem value={key} id={`${isAdminBooking ? 'admin-' : ''}${key}`} disabled={disabled} />
                      <Label htmlFor={`${isAdminBooking ? 'admin-' : ''}${key}`} className={`flex-1 ${disabled ? '' : 'cursor-pointer'}`}>
                        <div className="font-medium">{info.label}</div>
                        <div className="text-xs text-muted-foreground">{info.description}</div>
                        {isFridayOnly && <div className="text-xs text-amber-600 mt-1">Samo petak 18-21h</div>}
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Dostupni termini
              </CardTitle>
              <CardDescription className="text-teal-100">
                {date ? `Dana ${format(date, 'EEEE, d. MMMM yyyy', { locale: sr })}` : 'Prvo izaberite datum'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {!date ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Izaberite datum u kalendaru</p>
                </div>
              ) : (date.getDay() === 0 || date.getDay() === 6) ? (
                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Subota i nedelja su neradni dani.</AlertDescription></Alert>
              ) : isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                </div>
              ) : slots.length === 0 ? (
                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Nema dostupnih termina.</AlertDescription></Alert>
              ) : (
                <ScrollArea className="h-64 pr-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {slots.map((slot) => (
                      <Button
                        key={slot.time}
                        variant={time === slot.time ? 'default' : 'outline'}
                        disabled={!slot.available}
                        onClick={() => setTime(slot.time)}
                        className={`h-14 flex flex-col ${
                          time === slot.time ? 'bg-teal-600 hover:bg-teal-700'
                            : slot.available ? 'hover:bg-teal-50 hover:border-teal-300'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed line-through'
                        }`}
                      >
                        <span className="font-semibold">{slot.time}</span>
                        {!slot.available && <span className="text-[10px]">Zauzeto</span>}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {date && time && (
            <Card className="shadow-lg border-0 ">
              <CardHeader className="bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5" />
                  Podaci pacijenta
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`${isAdminBooking ? 'admin-' : ''}fullName`} className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Ime i prezime <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id={`${isAdminBooking ? 'admin-' : ''}fullName`}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="npr. Petar Petrović"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${isAdminBooking ? 'admin-' : ''}phone`} className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      Telefon <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id={`${isAdminBooking ? 'admin-' : ''}phone`}
                      value={phoneNum}
                      onChange={(e) => setPhoneNum(e.target.value)}
                      placeholder="npr. 064 123 4567"
                      type="tel"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${isAdminBooking ? 'admin-' : ''}numberOfPeople`} className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Broj osoba
                    </Label>
                    <Input
                      id={`${isAdminBooking ? 'admin-' : ''}numberOfPeople`}
                      value={people}
                      onChange={(e) => setPeople(e.target.value)}
                      type="number"
                      min="1"
                      max="5"
                    />
                  </div>
                </div>

                {/* Viber podsetnik */}
                <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wantsViber}
                      onChange={(e) => setWantsViber(e.target.checked)}
                      className="mt-1 h-5 w-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium text-purple-900">
                        <MessageCircle className="h-4 w-4" />
                        Viber podsetnik
                      </div>
                      <p className="text-sm text-purple-700 mt-1">
                        Dobijte podsetnik na Viber 3 sata pre termina
                      </p>
                    </div>
                  </label>
                </div>

                <Separator className="my-4" />

                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <h4 className="font-semibold text-slate-900">Rezime rezervacije:</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-slate-600">Datum:</div>
                    <div className="font-medium">{format(date, 'EEEE, d. MMMM yyyy', { locale: sr })}</div>
                    <div className="text-slate-600">Vreme:</div>
                    <div className="font-medium">{time}h</div>
                    <div className="text-slate-600">Tip usluge:</div>
                    <div className="font-medium">{APPOINTMENT_TYPE_INFO[type].label}</div>
                    <div className="text-slate-600">Trajanje:</div>
                    <div className="font-medium">{APPOINTMENT_TYPE_INFO[type].description}</div>
                  </div>
                </div>

                <Button
                  onClick={() => handleSubmit(isAdminBooking)}
                  disabled={submitting || !name || !phoneNum}
                  className="w-full mt-4 bg-teal-600 hover:bg-teal-700 h-12"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Zakazivanje...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Potvrdi rezervaciju
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-600 rounded-xl shadow-lg">
                <ToothIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Ortodontic</h1>
                <p className="text-xs sm:text-sm text-slate-500">Stomatološka ordinacija • Veternik</p>
              </div>
            </div>
            
            {/* Telefon kontakt i lokacija */}
            <div className="flex items-center gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
                <a 
                  href="tel:+38121821467" 
                  className="flex items-center gap-2 text-teal-700 hover:text-teal-900 transition-colors font-medium"
                >
                  <Phone className="h-4 w-4" />
                  <span className="text-sm sm:text-base">021/821-467</span>
                </a>
                <a 
                  href="tel:+381642503304" 
                  className="flex items-center gap-2 text-teal-700 hover:text-teal-900 transition-colors font-medium"
                >
                  <Phone className="h-4 w-4" />
                  <span className="text-sm sm:text-base">064/250-33-04</span>
                </a>
                <a 
                  href="https://www.google.com/maps/dir/?api=1&destination=Ive+Andrica+1+Veternik"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-teal-700 hover:text-teal-900 transition-colors font-medium"
                >
                  <MapPin className="h-4 w-4" />
                  <span className="text-sm sm:text-base hidden sm:inline">Lokacija</span>
                </a>
              </div>
            </div>
            
            <div className="flex gap-2 items-center">
              {isAdmin && (
                <Button
                  variant={currentView === 'admin' ? 'default' : 'outline'}
                  onClick={() => setCurrentView('admin')}
                  className={`gap-2 ${currentView === 'admin' ? 'bg-teal-600 hover:bg-teal-700' : ''}`}
                >
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Button>
              )}

              {isAdmin ? (
                <Button variant="ghost" onClick={handleLogout} className="gap-2 text-slate-600 hover:text-slate-900">
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Odjavi se</span>
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setShowLoginDialog(true)} className="gap-2 text-slate-600 hover:text-slate-900">
                  <Lock className="h-4 w-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {currentView === 'booking' ? (
          <div className="space-y-6">
            {renderBookingForm(false)}
            
            {/* Otkazivanje termina */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <XCircle className="h-5 w-5" />
                  Otkaži termin
                </CardTitle>
                <CardDescription className="text-red-100">
                  Unesite broj telefona da pronađete i otkažete vaš termin
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Unesite broj telefona (npr. 064 123 4567)"
                      value={cancelPhone}
                      onChange={(e) => setCancelPhone(e.target.value)}
                      type="tel"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchAppointments()}
                    />
                  </div>
                  <Button 
                    onClick={handleSearchAppointments} 
                    disabled={cancelLoading}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    {cancelLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Pronađi termine
                      </>
                    )}
                  </Button>
                </div>

                {/* Rezultati pretrage */}
                {cancelSearchDone && (
                  <div className="mt-4">
                    {cancelAppointments.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground mb-3">
                          Pronađeni termini ({cancelAppointments.length}):
                        </p>
                        {cancelAppointments.map((apt) => (
                          <div 
                            key={apt.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-lg border gap-3"
                          >
                            <div className="space-y-1">
                              <div className="font-medium">{apt.fullName}</div>
                              <div className="text-sm text-muted-foreground">
                                {format(parseISO(apt.date), 'EEEE, d. MMMM yyyy', { locale: sr })} u {apt.time}h
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{getTypeLabel(apt.appointmentType)}</Badge>
                                <span className="text-xs text-muted-foreground">({apt.duration} min)</span>
                                {apt.viberReminder && (
                                  <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                    <MessageCircle className="h-3 w-3 mr-1" />
                                    Viber
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCancelAppointment(apt.id)}
                              disabled={cancelLoading}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Otkaži
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Nema pronađenih termina za ovaj broj telefona.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Admin View */
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-t-lg pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Admin panel
                  </CardTitle>
                  <CardDescription className="text-teal-100">
                    Upravljanje terminima i zakazivanje
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs text-green-300">
                  <Wifi className="h-3 w-3" />
                  Live update
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs value={adminTab} onValueChange={(v) => setAdminTab(v as 'pregled' | 'zakazivanje' | 'kartoteka' | 'otkazivanje')} className="w-full">
                <div className="border-b px-2 sm:px-4 pt-4">
                  <TabsList className="grid w-full grid-cols-4 max-w-2xl mx-auto">
                    <TabsTrigger value="pregled" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <List className="h-4 w-4" />
                      <span className="hidden sm:inline">Pregled termina</span>
                      <span className="sm:hidden">Pregled</span>
                    </TabsTrigger>
                    <TabsTrigger value="zakazivanje" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <PlusCircle className="h-4 w-4" />
                      <span className="hidden sm:inline">Zakazi termin</span>
                      <span className="sm:hidden">Zakaži</span>
                    </TabsTrigger>
                    <TabsTrigger value="otkazivanje" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <XCircle className="h-4 w-4" />
                      <span className="hidden sm:inline">Otkaži termin</span>
                      <span className="sm:hidden">Otkaži</span>
                    </TabsTrigger>
                    <TabsTrigger value="kartoteka" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <Database className="h-4 w-4" />
                      <span className="hidden sm:inline">Kartoteka</span>
                      <span className="sm:hidden">Baza</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="pregled" className="p-0 mt-0">
                  <div className="grid lg:grid-cols-4 gap-6 p-4">
                    {/* Kalendar */}
                    <div className="lg:col-span-1">
                      <Card className="border shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <CalendarDays className="h-4 w-4" />
                            Dan za pregled
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-2">
                          <Calendar
                            mode="single"
                            selected={adminSelectedDate}
                            onSelect={(d) => d && setAdminSelectedDate(d)}
                            locale={sr}
                            className="rounded-md border mx-auto"
                          />
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Termina: {appointmentsForDay.length}</span>
                              <span className="text-xs text-muted-foreground">{format(lastUpdate, 'HH:mm:ss')}</span>
                            </div>
                            <Button variant="outline" size="sm" onClick={fetchAppointments} className="w-full gap-1">
                              <RefreshCw className="h-3 w-3" />
                              Osveži
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Tabela */}
                    <div className="lg:col-span-3">
                      <div className="border rounded-lg overflow-hidden">
                        <ScrollArea className="h-[calc(100vh-380px)]">
                          <div className="min-w-full">
                            <div className="grid grid-cols-1 gap-1 p-2">
                              {/* Header - desktop */}
                              <div className="hidden sm:grid grid-cols-12 gap-2 p-3 bg-slate-100 rounded-lg font-semibold text-sm">
                                <div className="col-span-2">Vreme</div>
                                <div className="col-span-4">Pacijent</div>
                                <div className="col-span-3">Telefon</div>
                                <div className="col-span-2">Trajanje</div>
                                <div className="col-span-1 text-center">Osoba</div>
                              </div>

                              {allAdminSlots.map((slot) => {
                                const info = getSlotBookingInfo(slot, appointmentsForDay);
                                const apt = info.appointment;
                                const isStart = apt ? apt.time === slot : false;
                                
                                // Izračunaj kraj termina
                                const getEndTime = (startTime: string, duration: number) => {
                                  const [h, m] = startTime.split(':').map(Number);
                                  const endMinutes = h * 60 + m + duration;
                                  const endH = Math.floor(endMinutes / 60);
                                  const endM = endMinutes % 60;
                                  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                                };

                                return (
                                  <div
                                    key={slot}
                                    className={`rounded-lg text-sm transition-colors ${
                                      info.booked ? 'bg-teal-50 border border-teal-200' : 'bg-slate-50 text-slate-400'
                                    } ${isStart ? 'border-l-4 border-l-teal-500' : ''}`}
                                  >
                                    {/* Mobilni prikaz */}
                                    <div className="sm:hidden p-3">
                                      {info.booked && apt ? (
                                        isStart ? (
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-teal-700">{apt.time}</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="font-mono text-slate-600">{getEndTime(apt.time, apt.duration)}</span>
                                              </div>
                                              <div className="bg-teal-200 text-teal-800 text-xs px-2 py-1 rounded font-medium">
                                                {apt.duration} min
                                              </div>
                                            </div>
                                            <div className="font-semibold text-slate-900 text-base">{apt.fullName}</div>
                                            <a href={`tel:${apt.phone}`} className="flex items-center gap-1 text-teal-700 hover:text-teal-900">
                                              <Phone className="h-4 w-4" />
                                              <span className="font-medium">{apt.phone}</span>
                                            </a>
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-center py-1">
                                            <div className="w-full h-2 bg-gradient-to-r from-teal-200 via-teal-300 to-teal-200 rounded"></div>
                                          </div>
                                        )
                                      ) : (
                                        <div className="flex items-center justify-between">
                                          <span className="font-mono font-medium">{slot}</span>
                                          <span className="text-slate-400">Slobodno</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Desktop prikaz */}
                                    <div className="hidden sm:grid grid-cols-12 gap-2 p-3">
                                      <div className="col-span-2 font-mono font-medium">{slot}</div>
                                      {info.booked && apt ? (
                                        <>
                                          <div className="col-span-4 font-medium text-slate-900 truncate">{isStart ? apt.fullName : '↘'}</div>
                                          <div className="col-span-3 text-slate-700 truncate">{isStart ? apt.phone : '→'}</div>
                                          <div className="col-span-2">{isStart ? `${apt.time} - ${getEndTime(apt.time, apt.duration)}` : '→'}</div>
                                          <div className="col-span-1 text-center">{isStart ? apt.numberOfPeople : '-'}</div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="col-span-4">-</div>
                                          <div className="col-span-3">-</div>
                                          <div className="col-span-2">Slobodno</div>
                                          <div className="col-span-1 text-center">-</div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </ScrollArea>

                        <div className="border-t p-3 bg-slate-50">
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-teal-50 border border-teal-200 rounded"></div>
                              <span>Zauzeto</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-slate-50 rounded"></div>
                              <span>Slobodno</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="kartoteka" className="p-4 mt-0">
                  <div className="space-y-4">
                    {/* Pretraga */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          placeholder="Pretraga po imenu ili telefonu..."
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => fetchPatients(patientSearch)} disabled={patientsLoading}>
                          {patientsLoading ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Osveži
                            </>
                          )}
                        </Button>
                        <Button 
                          onClick={() => window.open(`/api/patients/export?search=${encodeURIComponent(patientSearch)}`, '_blank')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Excel
                        </Button>
                      </div>
                    </div>

                    {/* Lista pacijenata */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-slate-100 p-3 font-semibold flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        <span>Kartoteka pacijenata ({patients.length})</span>
                      </div>
                      <ScrollArea className="h-[calc(100vh-450px)]">
                        {patientsLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                          </div>
                        ) : patients.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            Nema pronađenih pacijenata
                          </div>
                        ) : (
                          <div className="divide-y">
                            {patients.map((patient, index) => (
                              <div key={index} className="p-4 hover:bg-slate-50 transition-colors">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="space-y-1">
                                    <div className="font-semibold text-slate-900">{patient.fullName}</div>
                                    <a 
                                      href={`tel:${patient.phone}`} 
                                      className="flex items-center gap-2 text-teal-700 hover:text-teal-900"
                                    >
                                      <Phone className="h-4 w-4" />
                                      <span className="font-medium">{patient.phone}</span>
                                    </a>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                    <Badge variant="outline">
                                      {patient.totalAppointments} {patient.totalAppointments === 1 ? 'termin' : patient.totalAppointments < 5 ? 'termina' : 'termina'}
                                    </Badge>
                                    {patient.viberReminder && (
                                      <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                        <MessageCircle className="h-3 w-3 mr-1" />
                                        Viber
                                      </Badge>
                                    )}
                                    <span className="text-xs">
                                      Poslednja poseta: {patient.lastVisit ? format(parseISO(patient.lastVisit), 'd.M.yyyy', { locale: sr }) : 'Nepoznato'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="zakazivanje" className="p-4 mt-0">
                  {renderBookingForm(true)}
                </TabsContent>

                <TabsContent value="otkazivanje" className="p-4 mt-0">
                  <div className="space-y-4">
                    {/* Pretraga */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <Input
                          placeholder="Unesite broj telefona za pretragu termina..."
                          value={cancelPhone}
                          onChange={(e) => setCancelPhone(e.target.value)}
                          type="tel"
                          onKeyDown={(e) => e.key === 'Enter' && handleSearchAppointments()}
                        />
                      </div>
                      <Button 
                        onClick={handleSearchAppointments} 
                        disabled={cancelLoading}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {cancelLoading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <>
                            <Search className="h-4 w-4 mr-2" />
                            Pronađi termine
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Rezultati pretrage */}
                    {cancelSearchDone && (
                      <div className="mt-4">
                        {cancelAppointments.length > 0 ? (
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground mb-3">
                              Pronađeni termini ({cancelAppointments.length}):
                            </p>
                            {cancelAppointments.map((apt) => (
                              <div 
                                key={apt.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-lg border gap-3"
                              >
                                <div className="space-y-1">
                                  <div className="font-medium">{apt.fullName}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {format(parseISO(apt.date), 'EEEE, d. MMMM yyyy', { locale: sr })} u {apt.time}h
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">{getTypeLabel(apt.appointmentType)}</Badge>
                                    <span className="text-xs text-muted-foreground">({apt.duration} min)</span>
                                    <span className="text-xs text-muted-foreground">• {apt.numberOfPeople} osoba</span>
                                    {apt.viberReminder && (
                                      <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                        <MessageCircle className="h-3 w-3 mr-1" />
                                        Viber
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleCancelAppointment(apt.id)}
                                  disabled={cancelLoading}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Otkaži
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              Nema pronađenih termina za ovaj broj telefona.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Login Dialog */}
      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Admin prijava
            </DialogTitle>
            <DialogDescription>
              Unesite administratorske kredencijale za pristup.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="loginEmail">Email adresa</Label>
              <Input
                id="loginEmail"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="Unesite email"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loginPassword">Lozinka</Label>
              <Input
                id="loginPassword"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Unesite lozinku"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowLoginDialog(false)} className="flex-1">Otkaži</Button>
              <Button onClick={handleLogin} disabled={loginLoading} className="flex-1 bg-teal-600 hover:bg-teal-700">
                {loginLoading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : 'Prijavi se'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t bg-slate-900 text-white mt-auto">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-400">
            <p>© 2025 Stomatološka ordinacija. Sva prava zadržana.</p>
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Radno vreme: Pon-Pet 14:00-20:00
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
