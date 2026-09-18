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

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_room', (data) => {
    socket.join(data.roomCode);
    console.log(`User ${data.username} joined room: ${data.roomCode}`);
  });

  socket.on('send_message', (data) => {
    io.to(data.roomCode).emit('receive_message', data);
  });

  socket.on('update_note', (data) => {
  // Broadcast the text string to everyone else in the room
  socket.to(data.roomCode).emit('receive_note', data.text);
});

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
