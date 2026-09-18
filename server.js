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

// Store room timers and notes in memory
const roomTimers = {};
const roomNotes = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_room', (data) => {
    socket.join(data.roomCode);
    console.log(`User ${data.username} joined room: ${data.roomCode}`);

    // Send existing note for this room if any
    if (roomNotes[data.roomCode]) {
      socket.emit('load_note', roomNotes[data.roomCode]);
    } else {
      socket.emit('load_note', '');
    }

    // Send current timer status for this room
    if (roomTimers[data.roomCode]) {
      socket.emit('timer_update', roomTimers[data.roomCode].timeLeft);
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

  // --- Pomodoro Timer Events ---
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
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
