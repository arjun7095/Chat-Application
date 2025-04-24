require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Message = require('./models/Message');
const Room = require('./models/Room');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://chat-application-cli.onrender.com',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(cors({
  origin: 'https://chat-application-cli.onrender.com',
  credentials: true
}));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    const token = jwt.sign({ userId: user._id, username }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ token, username });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id, username }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, username, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/rooms/:userId', async (req, res) => {
  try {
    const rooms = await Room.find({ creatorId: req.params.userId });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { name, userId } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Room name is required' });
    }
    const existingRoom = await Room.findOne({ name });
    if (existingRoom) {
      return res.status(400).json({ error: 'Room name already exists' });
    }
    const room = new Room({ name, creatorId: userId });
    await room.save();
    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/messages/:room', async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.room })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const message = new Message({ ...req.body, username: req.user.username });
    await message.save();
    io.to(message.room).emit('message', message);
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save message' });
  }
});

app.delete('/api/rooms/:room', async (req, res) => {
  try {
    const { room } = req.params;
    const { userId } = req.query;
    const roomDoc = await Room.findOne({ name: room });
    if (!roomDoc) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (roomDoc.creatorId.toString() !== userId) {
      return res.status(403).json({ error: 'Only the room creator can delete the room' });
    }
    await Message.deleteMany({ room });
    await Room.deleteOne({ name: room });
    io.to(room).emit('roomDeleted', { room, message: `Room ${room} has been deleted` });
    io.in(room).socketsLeave(room);
    res.json({ message: `Room ${room} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Track active call participants per room
const activeCallParticipants = {};

io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  const token = socket.handshake.auth.token;
  if (!token) {
    socket.disconnect();
    return;
  }
  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = user;
  } catch (err) {
    socket.disconnect();
    return;
  }

  socket.on('createRoom', async ({ roomName }) => {
    try {
      let roomDoc = await Room.findOne({ name: roomName });
      if (roomDoc) {
        socket.emit('error', { message: 'Room already exists' });
        return;
      }
      roomDoc = new Room({ name: roomName, creatorId: user.userId });
      await roomDoc.save();
      socket.join(roomName);
      socket.room = roomName;
      socket.emit('roomCreated', { room: roomName });
      io.to(roomName).emit('message', {
        username: 'System',
        message: `${user.username} created the room`,
        room: roomName,
        timestamp: new Date()
      });
      io.to(roomName).emit('roomInfo', { room: roomName, creatorId: user.userId });
    } catch (err) {
      socket.emit('error', { message: 'Failed to create room' });
    }
  });

  socket.on('joinRoom', async ({ roomName, userId }) => {
    try {
      const roomDoc = await Room.findOne({ name: roomName });
      if (!roomDoc) {
        socket.emit('error', { message: 'Room does not exist' });
        return;
      }
      socket.join(roomName);
      socket.room = roomName;
      socket.userId = userId;
      io.to(roomName).emit('message', {
        username: 'System',
        message: `${user.username} has joined the room`,
        room: roomName,
        timestamp: new Date()
      });
      io.to(roomName).emit('roomInfo', { room: roomName, creatorId: roomDoc.creatorId });
      // Notify new user of ongoing call
      if (activeCallParticipants[roomName]?.length > 0) {
        socket.emit('ongoingCall');
      }
    } catch (err) {
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('sendMessage', async ({ room, message }) => {
    try {
      const newMessage = new Message({ room, username: user.username, message });
      await newMessage.save();
      io.to(room).emit('message', newMessage);
    } catch (err) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('callRequest', ({ room, from }) => {
    console.log('callRequest event received for room:', room, 'from:', from);
    if (!activeCallParticipants[room]) {
      activeCallParticipants[room] = [];
    }
    if (!activeCallParticipants[room].includes(from)) {
      activeCallParticipants[room].push(from);
    }
    socket.to(room).emit('callRequest', { from });
  });

  socket.on('callAccepted', ({ room, to }) => {
    console.log('callAccepted event received for room:', room, 'to:', to);
    if (!activeCallParticipants[room]) {
      activeCallParticipants[room] = [];
    }
    if (!activeCallParticipants[room].includes(socket.userId)) {
      activeCallParticipants[room].push(socket.userId);
    }
    socket.to(room).emit('callAccepted', { from: socket.userId, to });
  });

  socket.on('callRejected', ({ room, to }) => {
    console.log('callRejected event received for room:', room, 'to:', to);
    socket.to(room).emit('callRejected', { from: socket.userId, to });
  });

  socket.on('callUser', ({ signal, room, to }) => {
    console.log('callUser event received from:', socket.userId, 'to:', to);
    socket.to(room).emit('callUser', { signal, from: socket.userId, to });
  });

  socket.on('answerCall', ({ signal, room, to }) => {
    console.log('answerCall event received from:', socket.userId, 'to:', to);
    socket.to(room).emit('callAnswered', { signal, from: socket.userId, to });
  });

  socket.on('iceCandidate', ({ candidate, room, to }) => {
    console.log('iceCandidate event received from:', socket.userId, 'to:', to);
    socket.to(room).emit('iceCandidate', { candidate, from: socket.userId, to });
  });

  socket.on('joinCall', ({ room, userId }) => {
    console.log('joinCall event received from:', userId);
    if (!activeCallParticipants[room]) {
      activeCallParticipants[room] = [];
    }
    if (!activeCallParticipants[room].includes(userId)) {
      activeCallParticipants[room].push(userId);
    }
    // Notify existing call participants to create a peer for the new user
    socket.to(room).emit('callRequest', { from: userId });
  });

  socket.on('disconnect', () => {
    if (socket.user && socket.room) {
      io.to(socket.room).emit('message', {
        username: 'System',
        message: `${socket.user.username} has left the room`,
        room: socket.room,
        timestamp: new Date()
      });
      io.to(socket.room).emit('userLeft', { userId: socket.userId });
      if (activeCallParticipants[socket.room]) {
        activeCallParticipants[socket.room] = activeCallParticipants[socket.room].filter(
          (id) => id !== socket.userId
        );
        if (activeCallParticipants[socket.room].length === 0) {
          delete activeCallParticipants[socket.room];
        }
      }
    }
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));