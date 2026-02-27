import Database from 'better-sqlite3';
import { createServer } from 'http';

// Konfiguracija
const PORT = 3004;
const VIBER_AUTH_TOKEN = process.env.VIBER_AUTH_TOKEN || '';
const VIBER_BOT_NAME = process.env.VIBER_BOT_NAME || 'Ortodontic Bot';
const DB_PATH = process.env.DATABASE_PATH || '/home/z/my-project/db/custom.db';

// Poruka za podsetnik
const REMINDER_MESSAGE = `Poštovani,

Danas imate zakazan termin u stomatološkoj ordinaciji Ortodontic u Veterniku, Ivo Andrića br 1.

📞 Kontakt telefon:
- 021/821-467
- 064/250-33-04

Vidimo se! 🦷`;

// Inicijalizuj bazu
const db = new Database(DB_PATH);

// Kreiraj tabelu ako ne postoji
db.exec(`
  CREATE TABLE IF NOT EXISTS ViberSubscriber (
    id TEXT PRIMARY KEY,
    viberId TEXT UNIQUE,
    phone TEXT,
    name TEXT,
    subscribedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    isActive INTEGER DEFAULT 1
  );
`);

// Viber API funkcije
async function sendViberMessage(viberId: string, text: string): Promise<boolean> {
  if (!VIBER_AUTH_TOKEN) {
    console.log('[Viber] No auth token configured, skipping message send');
    return false;
  }

  try {
    const response = await fetch('https://chatapi.viber.com/pa/send_message', {
      method: 'POST',
      headers: {
        'X-Viber-Auth-Token': VIBER_AUTH_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receiver: viberId,
        type: 'text',
        text: text,
        sender: {
          name: VIBER_BOT_NAME,
        },
      }),
    });

    const data = await response.json();
    if (data.status === 0) {
      console.log(`[Viber] Message sent successfully to ${viberId}`);
      return true;
    } else {
      console.error('[Viber] Failed to send message:', data);
      return false;
    }
  } catch (error) {
    console.error('[Viber] Error sending message:', error);
    return false;
  }
}

// Sačuvaj pretplatnika
function saveSubscriber(viberId: string, name?: string): void {
  const stmt = db.prepare(`
    INSERT INTO ViberSubscriber (id, viberId, name, isActive)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(viberId) DO UPDATE SET isActive = 1, name = ?
  `);
  stmt.run(crypto.randomUUID(), viberId, name || null, name || null);
  console.log(`[Viber] Subscriber saved: ${viberId}`);
}

// Ukloni pretplatnika
function removeSubscriber(viberId: string): void {
  const stmt = db.prepare(`UPDATE ViberSubscriber SET isActive = 0 WHERE viberId = ?`);
  stmt.run(viberId);
  console.log(`[Viber] Subscriber removed: ${viberId}`);
}

// Poveži telefon sa Viber ID-jem
function linkPhone(viberId: string, phone: string): void {
  // Formatiraj telefon
  let formattedPhone = phone.replace(/[\s\-\(\)]/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '+381' + formattedPhone.slice(1);
  } else if (!formattedPhone.startsWith('+')) {
    formattedPhone = '+381' + formattedPhone;
  }

  const stmt = db.prepare(`UPDATE ViberSubscriber SET phone = ? WHERE viberId = ?`);
  stmt.run(formattedPhone, viberId);
  console.log(`[Viber] Phone linked: ${viberId} -> ${formattedPhone}`);
}

// Dohvati pretplatnika po telefonu
function getSubscriberByPhone(phone: string): { viberId: string } | undefined {
  let formattedPhone = phone.replace(/[\s\-\(\)]/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '+381' + formattedPhone.slice(1);
  }
  
  const stmt = db.prepare(`SELECT viberId FROM ViberSubscriber WHERE phone = ? AND isActive = 1`);
  return stmt.get(formattedPhone) as { viberId: string } | undefined;
}

// Proveri termine i pošalji podsetnike
async function checkAppointmentsAndSendReminders(): Promise<void> {
  console.log('[Scheduler] Checking for appointments needing reminders...');
  
  const now = new Date();
  // Vreme 3 sata unapred
  const reminderTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  
  // Formatiraj datum i vreme
  const today = now.toISOString().split('T')[0];
  const reminderHour = reminderTime.getHours();
  const reminderMinute = reminderTime.getMinutes();
  
  // Dohvati termine koji treba podsetnik za 3 sata
  // i koji još nisu poslati podsetnik
  const stmt = db.prepare(`
    SELECT id, fullName, phone, date, time, viberReminder, reminderSent
    FROM Appointment 
    WHERE viberReminder = 1 
    AND reminderSent = 0
    AND date = ?
  `);
  
  const appointments = stmt.all(today) as Array<{
    id: string;
    fullName: string;
    phone: string;
    date: string;
    time: string;
    viberReminder: number;
    reminderSent: number;
  }>;
  
  for (const apt of appointments) {
    const [aptHour, aptMinute] = apt.time.split(':').map(Number);
    const aptTime = new Date(now);
    aptTime.setHours(aptHour, aptMinute, 0, 0);
    
    // Proveri da li je termin za 3 sata (±5 minuta tolerancija)
    const timeDiff = aptTime.getTime() - now.getTime();
    const threeHoursInMs = 3 * 60 * 60 * 1000;
    const tolerance = 5 * 60 * 1000; // 5 minuta
    
    if (timeDiff > 0 && Math.abs(timeDiff - threeHoursInMs) <= tolerance) {
      console.log(`[Scheduler] Sending reminder to ${apt.fullName} (${apt.phone})`);
      
      // Pronađi Viber pretplatnika po telefonu
      const subscriber = getSubscriberByPhone(apt.phone);
      
      if (subscriber) {
        const sent = await sendViberMessage(subscriber.viberId, REMINDER_MESSAGE);
        if (sent) {
          // Označi da je podsetnik poslat
          const updateStmt = db.prepare(`UPDATE Appointment SET reminderSent = 1 WHERE id = ?`);
          updateStmt.run(apt.id);
          console.log(`[Scheduler] Reminder sent and marked for appointment ${apt.id}`);
        }
      } else {
        console.log(`[Scheduler] No Viber subscriber found for phone ${apt.phone}`);
        // Ipak označi kao da je pokušano
        const updateStmt = db.prepare(`UPDATE Appointment SET reminderSent = 1 WHERE id = ?`);
        updateStmt.run(apt.id);
      }
    }
  }
}

// HTTP Server za Viber webhook
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'viber-service' }));
    return;
  }
  
  // Viber webhook
  if (req.method === 'POST' && url.pathname === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log('[Webhook] Received event:', data.event);
        
        switch (data.event) {
          case 'webhook':
            // Viber verification
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              event: 'webhook',
              timestamp: Date.now(),
              message: 'Webhook verified',
            }));
            break;
            
          case 'subscribed':
            // Korisnik se pretplatio na bot
            if (data.user?.id) {
              saveSubscriber(data.user.id, data.user.name);
              // Pošalji dobrodošlicu
              await sendViberMessage(
                data.user.id,
                `Zdravo! 🦷\n\nDobrodošli u stomatološku ordinaciju Ortodontic!\n\nDa biste primali podsetnike za termine, pošaljite svoj broj telefona u formatu: 0641234567\n\nAdresa: Veternik, Ivo Andrića br 1\nTelefon: 021/821-467 ili 064/250-33-04`
              );
            }
            res.writeHead(200);
            res.end('OK');
            break;
            
          case 'unsubscribed':
            // Korisnik se odjavio
            if (data.user_id) {
              removeSubscriber(data.user_id);
            }
            res.writeHead(200);
            res.end('OK');
            break;
            
          case 'message':
            // Korisnik je poslao poruku (npr. broj telefona)
            if (data.sender?.id && data.message?.text) {
              const text = data.message.text.trim();
              // Proveri da li je broj telefona
              const phoneMatch = text.match(/^0?[1-9][0-9]{7,8}$/);
              if (phoneMatch) {
                linkPhone(data.sender.id, text);
                await sendViberMessage(
                  data.sender.id,
                  `Hvala! Vaš broj telefona je registrovan. ✅\n\nSada ćete dobijati Viber podsetnike 3 sata pre zakazanih termina.\n\nTelefon: ${text}\n\nAko želite da promenite broj, pošaljite novi broj.`
                );
              } else {
                await sendViberMessage(
                  data.sender.id,
                  `Molimo vas pošaljite vaš broj telefona u formatu: 0641234567\n\nTako ćemo vas povezati sa vašim terminima i slati podsetnike.`
                );
              }
            }
            res.writeHead(200);
            res.end('OK');
            break;
            
          case 'conversation_started':
            // Korisnik je otvorio razgovor
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              type: 'text',
              text: `Zdravo! 🦷\n\nDobrodošli u stomatološku ordinaciju Ortodontic!\n\nPošaljite svoj broj telefona da biste primali podsetnike za termine.\n\nAdresa: Veternik, Ivo Andrića br 1\nTelefon: 021/821-467 ili 064/250-33-04`,
            }));
            break;
            
          default:
            res.writeHead(200);
            res.end('OK');
        }
      } catch (error) {
        console.error('[Webhook] Error:', error);
        res.writeHead(400);
        res.end('Bad Request');
      }
    });
    return;
  }
  
  // API: Status pretplatnika
  if (req.method === 'GET' && url.pathname === '/api/subscribers') {
    const stmt = db.prepare(`SELECT viberId, phone, name, subscribedAt FROM ViberSubscriber WHERE isActive = 1`);
    const subscribers = stmt.all();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(subscribers));
    return;
  }
  
  // API: Ručno slanje podsetnika
  if (req.method === 'POST' && url.pathname === '/api/send-reminder') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { phone } = JSON.parse(body);
        const subscriber = getSubscriberByPhone(phone);
        
        if (subscriber) {
          const sent = await sendViberMessage(subscriber.viberId, REMINDER_MESSAGE);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: sent, message: sent ? 'Podsetnik poslat!' : 'Greška pri slanju' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Pretplatnik nije pronađen' }));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Greška' }));
      }
    });
    return;
  }
  
  // 404
  res.writeHead(404);
  res.end('Not Found');
});

// Pokreni server
server.listen(PORT, () => {
  console.log(`[Viber Service] Running on port ${PORT}`);
  console.log(`[Viber Service] Webhook URL: http://localhost:${PORT}/webhook`);
  
  // Pokreni scheduler (svaki minut)
  setInterval(checkAppointmentsAndSendReminders, 60000);
  
  // Prva provera odmah
  checkAppointmentsAndSendReminders();
});
