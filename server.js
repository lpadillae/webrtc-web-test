const express = require('express');
const helmet = require('helmet');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins for signaling during testing
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Allow Tailwind CSS CDN, Socket.io UI
        "script-src": ["'self'", "https://cdn.tailwindcss.com", "https://cdn.socket.io", "'unsafe-inline'"],
        // Allow WebRTC data channels, WebSockets
        "connect-src": ["'self'", "https:", "ws:", "wss:", "stun:", "turn:"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      },
    },
  })
);

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// ICE Config Endpoint
app.get('/ice-config', (req, res) => {
  try {
    let iceServers = [];
    if (process.env.ICE_SERVERS_JSON) {
      iceServers = JSON.parse(process.env.ICE_SERVERS_JSON);
    }
    res.json({ iceServers });
  } catch (err) {
    console.error('Error parsing ICE_SERVERS_JSON:', err.message);
    res.status(500).json({ error: 'Internal Server Configuration Error' });
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`Socket ${socket.id} joined room ${room}`);
    // Notify others in the room
    socket.to(room).emit('user-joined', { socketId: socket.id });
  });

  socket.on('offer', (data) => {
    // Forward offer to a specific target or room
    socket.to(data.room).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on('answer', (data) => {
    // Forward answer
    socket.to(data.room).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    // Forward candidate
    socket.to(data.room).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`WebRTC Diagnostic Server running on http://localhost:${PORT}`);
});
