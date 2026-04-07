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
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Allow Tailwind CSS CDN, Socket.io UI
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        // Allow WebRTC data channels, WebSockets
        connectSrc: ["'self'", "ws:", "wss:", "stun:", "turn:"], 
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
  
  // Real-time ping testing or signaling could be implemented here
  socket.on('ping_test', (data, callback) => {
    callback({ timestamp: Date.now() });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`WebRTC Diagnostic Server running on http://localhost:${PORT}`);
});
