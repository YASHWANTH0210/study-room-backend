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
const roomUsers = {}; // Track users per room

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_room', (data) => {
    socket.join(data.roomCode);
    socket.username = data.username;
    socket.roomCode = data.roomCode;

    // Add user to room list
    if (!roomUsers[data.roomCode]) {
      roomUsers[data.roomCode] = [];
    }
    // Prevent duplicate entries
    if (!roomUsers[data.roomCode].some(u => u.id === socket.id)) {
      roomUsers[data.roomCode].push({ id: socket.id, username: data.username });
    }

    // Broadcast updated user list to room
    io.to(data.roomCode).emit('update_users', roomUsers[data.roomCode]);

    // Send existing notes
    if (roomNotes[data.roomCode]) {
      socket.emit('load_note', roomNotes[data.roomCode]);
    } else {
      socket.emit('load_note', '');
    }

    // Send timer status
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
