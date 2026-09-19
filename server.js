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

// Room data store
const rooms = {};

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // Room Joining & Password Authentication
  socket.on('join_room', ({ username, roomCode, password }) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        password: password || '',
        notes: '',
        timer: 1500,
        timerRunning: false,
        timerInterval: null,
        users: []
      };
    }

    const room = rooms[roomCode];

    // Check password if room has one set
    if (room.password && room.password !== password) {
      socket.emit('auth_error', 'Incorrect room password!');
      return;
    }

    socket.emit('auth_success');
    socket.join(roomCode);

    // Track user
    room.users.push({ id: socket.id, username });
    io.to(roomCode).emit('update_users', room.users);

    // Send current notes and timer state to newly joined user
    socket.emit('load_note', room.notes);
    socket.emit('timer_update', room.timer);

    console.log(`User ${username} joined room: ${roomCode}`);
  });

  // Chat messaging
  socket.on('send_message', (data) => {
    socket.to(data.roomCode).emit('receive_message', data);
  });

  // File sharing (Images/Files)
  socket.on('send_file', (data) => {
    socket.to(data.roomCode).emit('receive_file', data);
  });

  // Shared Notes
  socket.on('update_note', ({ roomCode, text }) => {
    if (rooms[roomCode]) {
      rooms[roomCode].notes = text;
    }
    socket.to(roomCode).emit('receive_note', text);
  });

  // Whiteboard Events
  socket.on('drawing', (data) => {
    socket.to(data.roomCode).emit('receive_drawing', data);
  });

  socket.on('clear_board', (roomCode) => {
    socket.to(roomCode).emit('clear_board');
  });

  // Pomodoro Timer Controls
  socket.on('start_timer', (roomCode) => {
    const room = rooms[roomCode];
    if (room && !room.timerRunning) {
      room.timerRunning = true;
      room.timerInterval = setInterval(() => {
        if (room.timer > 0) {
          room.timer--;
          io.to(roomCode).emit('timer_update', room.timer);
        } else {
          clearInterval(room.timerInterval);
          room.timerRunning = false;
        }
      }, 1000);
    }
  });

  socket.on('pause_timer', (roomCode) => {
    const room = rooms[roomCode];
    if (room) {
      clearInterval(room.timerInterval);
      room.timerRunning = false;
    }
  });

  socket.on('reset_timer', (roomCode) => {
    const room = rooms[roomCode];
    if (room) {
      clearInterval(room.timerInterval);
      room.timerRunning = false;
      room.timer = 1500;
      io.to(roomCode).emit('timer_update', room.timer);
    }
  });

  // Voice Chat Signaling (Discord-style WebRTC)
  socket.on('join_voice', (roomCode) => {
    socket.to(roomCode).emit('user_joined_voice', socket.id);
  });

  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', {
      signal: data.signal,
      from: socket.id
    });
  });

  socket.on('leave_voice', (roomCode) => {
    socket.to(roomCode).emit('user_left_voice', socket.id);
  });

  // Screen Sharing Signaling Events
  socket.on('join_screen', (roomCode) => {
    socket.to(roomCode).emit('user_joined_screen', socket.id);
  });

  socket.on('screen_signal', (data) => {
    io.to(data.to).emit('screen_signal', {
      signal: data.signal,
      from: socket.id
    });
  });

  socket.on('leave_screen', (roomCode) => {
    socket.to(roomCode).emit('user_left_screen', socket.id);
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`User Disconnected: ${socket.id}`);
    
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      const index = room.users.findIndex(u => u.id === socket.id);
      if (index !== -1) {
        room.users.splice(index, 1);
        io.to(roomCode).emit('update_users', room.users);
        io.to(roomCode).emit('user_left_voice', socket.id);
        io.to(roomCode).emit('user_left_screen', socket.id);

        // Cleanup room if empty
        if (room.users.length === 0) {
          clearInterval(room.timerInterval);
          delete rooms[roomCode];
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
