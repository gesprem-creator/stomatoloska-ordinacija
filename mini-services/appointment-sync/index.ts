import { Server } from 'socket.io';

const PORT = 3030;

const io = new Server(PORT, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

console.log(`🔌 WebSocket server running on port ${PORT}`);

io.on('connection', (socket) => {
  console.log(`👤 Client connected: ${socket.id}`);

  // Klijent se pridružuje sobi za termine
  socket.on('join-appointments', () => {
    socket.join('appointments-room');
    console.log(`📋 Client ${socket.id} joined appointments room`);
  });

  // Kada se kreira novi termin
  socket.on('appointment-created', (data) => {
    console.log(`➕ New appointment: ${JSON.stringify(data)}`);
    // Obavesti sve druge klijente
    socket.to('appointments-room').emit('new-appointment', data);
  });

  // Kada se otkaže termin
  socket.on('appointment-cancelled', (data) => {
    console.log(`➖ Appointment cancelled: ${JSON.stringify(data)}`);
    socket.to('appointments-room').emit('cancelled-appointment', data);
  });

  socket.on('disconnect', () => {
    console.log(`👋 Client disconnected: ${socket.id}`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  io.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
