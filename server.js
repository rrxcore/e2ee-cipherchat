const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8, // 100MB buffer limit
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Room store: roomCode -> Map(socketId -> { username, publicKey })
const rooms = new Map();
const roomPasswords = new Map();

// Discord Voice Channels store: roomCode -> Map(channelId -> Map(socketId -> { username, isMuted, isSpeaking }))
const voiceChannels = new Map();

// Default Voice Channels created for every room
function ensureDefaultVoiceChannels(roomCode) {
  if (!voiceChannels.has(roomCode)) {
    voiceChannels.set(roomCode, new Map([
      ['v_lounge', { id: 'v_lounge', name: '🔊 Lounge Voice', participants: new Map() }],
      ['v_stage', { id: 'v_stage', name: '🔊 E2EE Stage', participants: new Map() }]
    ]));
  }
}

const packetLogs = new Map();

function addPacketLog(roomCode, packet) {
  if (!packetLogs.has(roomCode)) {
    packetLogs.set(roomCode, []);
  }
  const logs = packetLogs.get(roomCode);
  logs.push(packet);
  if (logs.length > 50) logs.shift();
}

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Join Room
  socket.on('join_room', ({ roomCode, username, publicKey, roomPassword }) => {
    if (roomPasswords.has(roomCode)) {
      const storedPass = roomPasswords.get(roomCode);
      if (storedPass && storedPass !== roomPassword) {
        return socket.emit('room_error', { message: 'Incorrect room password. Access denied.' });
      }
    } else {
      if (roomPassword) {
        roomPasswords.set(roomCode, roomPassword);
      }
    }

    socket.join(roomCode);
    ensureDefaultVoiceChannels(roomCode);

    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, new Map());
    }

    const room = rooms.get(roomCode);
    const userSession = {
      socketId: socket.id,
      username: username || `User_${socket.id.substring(0, 4)}`,
      publicKey: publicKey || null
    };

    room.set(socket.id, userSession);
    socket.roomCode = roomCode;

    console.log(`[Room Join] User '${userSession.username}' (${socket.id}) joined room '${roomCode}'`);

    const existingUsers = Array.from(room.values()).filter(u => u.socketId !== socket.id);
    const roomVoiceChannels = Array.from(voiceChannels.get(roomCode).values()).map(vc => ({
      id: vc.id,
      name: vc.name,
      participants: Array.from(vc.participants.values())
    }));

    socket.emit('room_joined', {
      roomCode,
      mySession: userSession,
      peers: existingUsers,
      recentPackets: packetLogs.get(roomCode) || [],
      isPasswordProtected: roomPasswords.has(roomCode),
      voiceChannels: roomVoiceChannels
    });

    socket.to(roomCode).emit('peer_joined', userSession);
  });

  // Share Public Keys
  socket.on('share_public_key', ({ recipientSocketId, publicKey }) => {
    const roomCode = socket.roomCode;
    const room = rooms.get(roomCode);
    const sender = room?.get(socket.id);

    if (recipientSocketId && sender) {
      io.to(recipientSocketId).emit('receive_peer_key', {
        senderSocketId: socket.id,
        senderUsername: sender.username,
        publicKey
      });
    }
  });

  // --- DISCORD VOICE ROOM EVENTS ---

  // Create custom Discord Voice Channel
  socket.on('create_voice_channel', ({ channelName }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !voiceChannels.has(roomCode)) return;

    const channels = voiceChannels.get(roomCode);
    const channelId = 'v_' + Date.now();
    const newChannel = { id: channelId, name: `🔊 ${channelName}`, participants: new Map() };
    channels.set(channelId, newChannel);

    io.to(roomCode).emit('voice_channel_created', {
      id: newChannel.id,
      name: newChannel.name,
      participants: []
    });
  });

  // Join Discord Voice Channel
  socket.on('join_voice_channel', ({ channelId }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !voiceChannels.has(roomCode)) return;

    const channels = voiceChannels.get(roomCode);
    const channel = channels.get(channelId);
    if (!channel) return;

    // Leave any current voice channel
    leaveCurrentVoiceChannel(socket);

    const room = rooms.get(roomCode);
    const user = room?.get(socket.id);
    if (!user) return;

    const participant = {
      socketId: socket.id,
      username: user.username,
      isMuted: false,
      isSpeaking: false
    };

    channel.participants.set(socket.id, participant);
    socket.currentVoiceChannelId = channelId;

    console.log(`[Voice Join] ${user.username} joined voice channel '${channel.name}'`);

    io.to(roomCode).emit('voice_participants_updated', {
      channelId,
      participants: Array.from(channel.participants.values())
    });
  });

  // Leave Discord Voice Channel
  socket.on('leave_voice_channel', () => {
    leaveCurrentVoiceChannel(socket);
  });

  function leaveCurrentVoiceChannel(socket) {
    const roomCode = socket.roomCode;
    const channelId = socket.currentVoiceChannelId;
    if (!roomCode || !channelId || !voiceChannels.has(roomCode)) return;

    const channels = voiceChannels.get(roomCode);
    const channel = channels.get(channelId);
    if (channel) {
      channel.participants.delete(socket.id);
      socket.currentVoiceChannelId = null;

      io.to(roomCode).emit('voice_participants_updated', {
        channelId,
        participants: Array.from(channel.participants.values())
      });
    }
  }

  // Voice Speaking State (Halo indicator)
  socket.on('voice_speaking_state', ({ isSpeaking }) => {
    const roomCode = socket.roomCode;
    const channelId = socket.currentVoiceChannelId;
    if (!roomCode || !channelId || !voiceChannels.has(roomCode)) return;

    const channel = voiceChannels.get(roomCode).get(channelId);
    if (channel && channel.participants.has(socket.id)) {
      const p = channel.participants.get(socket.id);
      p.isSpeaking = isSpeaking;

      socket.to(roomCode).emit('voice_peer_speaking', {
        socketId: socket.id,
        channelId,
        isSpeaking
      });
    }
  });

  // Relay E2EE Live Voice Stream Chunk
  socket.on('voice_stream_chunk', ({ ciphertext, iv }) => {
    const roomCode = socket.roomCode;
    const channelId = socket.currentVoiceChannelId;
    if (!roomCode || !channelId) return;

    socket.to(roomCode).emit('receive_voice_stream_chunk', {
      senderSocketId: socket.id,
      channelId,
      ciphertext,
      iv
    });
  });

  // Relay Encrypted Payloads (Text, File, Photo, Voice Note)
  socket.on('send_encrypted_payload', ({ roomCode, recipientSocketId, ciphertext, iv, salt, payloadType, fileName, fileSize, audioDuration, isImage }) => {
    const room = rooms.get(roomCode);
    const sender = room?.get(socket.id);

    if (!sender) return;

    const payload = {
      senderSocketId: socket.id,
      senderUsername: sender.username,
      ciphertext,
      iv,
      salt,
      payloadType: payloadType || 'text',
      fileName: fileName || null,
      fileSize: fileSize || null,
      audioDuration: audioDuration || null,
      isImage: isImage || false,
      timestamp: new Date().toLocaleTimeString()
    };

    if (recipientSocketId) {
      socket.to(recipientSocketId).emit('receive_encrypted_payload', payload);
    } else {
      socket.to(roomCode).emit('receive_encrypted_payload', payload);
    }

    const inspectPacket = {
      id: `pkt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: payloadType === 'voice' ? 'ENCRYPTED_VOICE' : payloadType === 'file' ? (isImage ? 'ENCRYPTED_IMAGE' : 'ENCRYPTED_FILE') : 'ENCRYPTED_MESSAGE',
      sender: sender.username,
      senderId: socket.id,
      timestamp: payload.timestamp,
      payloadSize: ciphertext.length,
      rawContent: {
        serverStatus: 'BLIND_RELAY_NO_PLAINTEXT',
        ciphertextSnippet: `${ciphertext.substring(0, 32)}...[${ciphertext.length} bytes]`,
        ivHex: iv,
        payloadType: payload.payloadType,
        canServerDecrypt: false
      }
    };

    addPacketLog(roomCode, inspectPacket);
    io.to(roomCode).emit('inspector_packet', inspectPacket);
  });

  // Disconnect
  socket.on('disconnect', () => {
    leaveCurrentVoiceChannel(socket);

    const roomCode = socket.roomCode;
    if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      const user = room.get(socket.id);
      room.delete(socket.id);

      if (room.size === 0) {
        rooms.delete(roomCode);
        roomPasswords.delete(roomCode);
        voiceChannels.delete(roomCode);
        packetLogs.delete(roomCode);
      } else {
        socket.to(roomCode).emit('peer_left', { socketId: socket.id, username: user?.username });
      }
    }
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🔒 CIPHERCHAT E2EE SERVER RUNNING ON PORT ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
  console.log(`====================================================`);
});
