const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const roomTimers = {};
const roomNotes = {};
const roomUsers = {};
const roomPasswords = {}; // Track room passwords

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  // Handle file sharing
  socket.on('send_file', (data) => {
    socket.to(data.roomCode).emit('receive_file', data);
  });

  socket.on('join_room', (data) => {
    const { username, roomCode, password } = data;

    // Check if room has an existing password and validate it
    if (roomPasswords[roomCode] && roomPasswords[roomCode] !== password) {
      socket.emit('auth_error', 'Incorrect room password! Please try again.');
      return;
    }

    // If room has no password set yet, set it now
    if (!roomPasswords[roomCode]) {
      roomPasswords[roomCode] = password || '';
    }

    socket.join(roomCode);
    socket.username = username;
    socket.roomCode = roomCode;

    if (!roomUsers[roomCode]) {
      roomUsers[roomCode] = [];
    }
    if (!roomUsers[roomCode].some(u => u.id === socket.id)) {
      roomUsers[roomCode].push({ id: socket.id, username: username });
    }

    io.to(roomCode).emit('update_users', roomUsers[roomCode]);
    socket.emit('auth_success'); // Let frontend know login succeeded

    if (roomNotes[roomCode]) {
      socket.emit('load_note', roomNotes[roomCode]);
    } else {
      socket.emit('load_note', '');
    }

    if (roomTimers[roomCode]) {
      socket.emit('timer_update', roomTimers[roomCode].timeLeft);
    } else {
      socket.emit('timer_update', 25 * 60);
    }
  });

  socket.on('send_message', (data) => {
    socket.to(data.roomCode).emit('receive_message', data);
  });

  socket.on('update_note', (data) => {
    roomNotes[data.roomCode] = data.text;
    socket.to(data.roomCode).emit('receive_note', data.text);
  });

  // Pomodoro Timer Events
  socket.on('start_timer', (roomCode) => {
    if (!roomTimers[roomCode]) {
      roomTimers[roomCode] = { timeLeft: 25 * 60, isRunning: true };
    } else {
      roomTimers[roomCode].isRunning = true;
    }

    if (!roomTimers[roomCode].interval) {
      roomTimers[roomCode].interval = setInterval(() => {
        if (roomTimers[roomCode].isRunning && roomTimers[roomCode].timeLeft > 0) {
          roomTimers[roomCode].timeLeft--;
          io.to(roomCode).emit('timer_update', roomTimers[roomCode].timeLeft);
        } else if (roomTimers[roomCode].timeLeft <= 0) {
          clearInterval(roomTimers[roomCode].interval);
          roomTimers[roomCode].interval = null;
        }
      }, 1000);
    }
  });

  socket.on('pause_timer', (roomCode) => {
    if (roomTimers[roomCode]) {
      roomTimers[roomCode].isRunning = false;
    }
  });

  socket.on('reset_timer', (roomCode) => {
    if (roomTimers[roomCode]) {
      roomTimers[roomCode].isRunning = false;
      clearInterval(roomTimers[roomCode].interval);
      roomTimers[roomCode].interval = null;
      roomTimers[roomCode].timeLeft = 25 * 60;
      io.to(roomCode).emit('timer_update', roomTimers[roomCode].timeLeft);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const roomCode = socket.roomCode;
    if (roomCode && roomUsers[roomCode]) {
      roomUsers[roomCode] = roomUsers[roomCode].filter(u => u.id !== socket.id);
      io.to(roomCode).emit('update_users', roomUsers[roomCode]);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
