const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Auto-detect local LAN IP address for Mobile-to-PC connections
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Persistent Telegram Cloud Database File Setup
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbFilePath = path.join(dataDir, 'cloud_db.json');

// Room stores
const rooms = new Map(); // Active socket sessions per room
const roomPasswords = new Map(); // Room passwords (Persisted)
const roomHistories = new Map(); // Telegram Cloud Messages array (Persisted)

// Load Cloud DB on startup
function loadCloudDb() {
  try {
    if (fs.existsSync(dbFilePath)) {
      const raw = fs.readFileSync(dbFilePath, 'utf8');
      const data = JSON.parse(raw);

      if (data.passwords) {
        Object.entries(data.passwords).forEach(([room, pass]) => {
          roomPasswords.set(room, pass);
        });
      }

      if (data.histories) {
        Object.entries(data.histories).forEach(([room, msgs]) => {
          roomHistories.set(room, msgs);
        });
      }
      console.log(`☁️ Persistent Telegram Cloud DB loaded: ${roomHistories.size} active rooms in cloud store.`);
    }
  } catch (err) {
    console.warn('⚠️ Cloud DB load fallback:', err);
  }
}

// Save Cloud DB to disk
function saveCloudDb() {
  try {
    const passwordsObj = Object.fromEntries(roomPasswords.entries());
    const historiesObj = Object.fromEntries(roomHistories.entries());
    const payload = JSON.stringify({ passwords: passwordsObj, histories: historiesObj }, null, 2);
    fs.writeFileSync(dbFilePath, payload, 'utf8');
  } catch (err) {
    console.warn('⚠️ Cloud DB save error:', err);
  }
}

loadCloudDb();

// Discord Voice Channels store: roomCode -> Map(channelId -> Map(socketId -> { username, isMuted, isSpeaking }))
const voiceChannels = new Map();

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

function addCloudMessage(roomCode, payload) {
  if (!roomHistories.has(roomCode)) {
    roomHistories.set(roomCode, []);
  }
  const history = roomHistories.get(roomCode);
  history.push(payload);
  if (history.length > 300) history.shift();
  saveCloudDb();
}

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Join Room with Strict Password Verification & Telegram Fast Cloud Messaging Recovery
  socket.on('join_room', ({ roomCode, username, publicKey, roomPassword }) => {
    const cleanRoom = (roomCode || 'rrxcore-1').trim();
    const cleanUser = (username || `User_${socket.id.substring(0, 4)}`).trim();
    const pass = (roomPassword || '').trim();

    if (roomPasswords.has(cleanRoom)) {
      const storedPass = roomPasswords.get(cleanRoom);
      if (storedPass && storedPass !== pass) {
        console.log(`[Room Access Denied] User '${cleanUser}' entered incorrect password for '${cleanRoom}'`);
        return socket.emit('room_error', {
          message: `Incorrect room password for '${cleanRoom}'. Both users must use the EXACT same password to join.`
        });
      }
    } else {
      if (pass) {
        roomPasswords.set(cleanRoom, pass);
        saveCloudDb();
        console.log(`[Room Created with Password] Room '${cleanRoom}' protected with password '${pass}'`);
      }
    }

    socket.join(cleanRoom);
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
      voiceChannels: roomVoiceChannels,
      cloudHistory: roomHistories.get(roomCode) || []
    });

    socket.to(roomCode).emit('peer_joined', userSession);
  });

  // Clear Room Cloud History for Both Users
  socket.on('clear_room_history', ({ roomCode }) => {
    if (roomCode) {
      roomHistories.set(roomCode, []);
      saveCloudDb();
      io.to(roomCode).emit('room_history_cleared', { roomCode });
      console.log(`[Cloud DB] History for room '${roomCode}' cleared by user.`);
    }
  });

  // Delete single message for everyone
  socket.on('delete_single_message', ({ roomCode, messageId }) => {
    if (roomCode && messageId) {
      if (roomHistories.has(roomCode)) {
        const msgs = roomHistories.get(roomCode).filter(m => m.id !== messageId);
        roomHistories.set(roomCode, msgs);
        saveCloudDb();
      }
      io.to(roomCode).emit('message_deleted_for_everyone', { messageId });
      console.log(`[Cloud DB] Single message '${messageId}' deleted for everyone in room '${roomCode}'.`);
    }
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

  // --- DISCORD WEBRTC VOICE ROOM SIGNALING ---

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

  socket.on('join_voice_channel', ({ channelId }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !voiceChannels.has(roomCode)) return;

    const channels = voiceChannels.get(roomCode);
    const channel = channels.get(channelId);
    if (!channel) return;

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

    const existingParticipants = Array.from(channel.participants.values());
    socket.emit('voice_channel_joined', {
      channelId,
      existingParticipants
    });

    channel.participants.set(socket.id, participant);
    socket.currentVoiceChannelId = channelId;

    console.log(`[Voice Join] ${user.username} joined voice channel '${channel.name}'`);

    io.to(roomCode).emit('voice_participants_updated', {
      channelId,
      participants: Array.from(channel.participants.values())
    });
  });

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
      socket.to(roomCode).emit('voice_peer_left', { socketId: socket.id, channelId });
    }
  }

  // Relay WebRTC Offer
  socket.on('webrtc_offer', ({ targetSocketId, sdpOffer }) => {
    io.to(targetSocketId).emit('webrtc_offer', {
      senderSocketId: socket.id,
      sdpOffer
    });
  });

  // Relay WebRTC Answer
  socket.on('webrtc_answer', ({ targetSocketId, sdpAnswer }) => {
    io.to(targetSocketId).emit('webrtc_answer', {
      senderSocketId: socket.id,
      sdpAnswer
    });
  });

  // Relay WebRTC ICE Candidate
  socket.on('webrtc_ice_candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('webrtc_ice_candidate', {
      senderSocketId: socket.id,
      candidate
    });
  });

  // Relay WebRTC Stream Stopped (Camera / Screen Share OFF)
  socket.on('webrtc_stream_stopped', ({ streamType }) => {
    const roomCode = socket.roomCode;
    if (roomCode) {
      socket.to(roomCode).emit('webrtc_stream_stopped', {
        senderSocketId: socket.id,
        streamType: streamType || 'video'
      });
    }
  });

  // Voice Speaking State
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

  // Encrypted Payload Relay & Telegram Fast Cloud Messaging Persistence
  socket.on('send_encrypted_payload', ({ roomCode, recipientSocketId, ciphertext, iv, salt, payloadType, fileName, fileSize, audioDuration, isImage, timerSeconds, messageId, plaintextFallback }) => {
    const room = rooms.get(roomCode);
    const sender = room?.get(socket.id);

    if (!sender) return;

    const payload = {
      id: messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
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
      timerSeconds: timerSeconds || 0,
      plaintextFallback: plaintextFallback || null,
      timestamp: new Date().toLocaleTimeString()
    };

    if (recipientSocketId) {
      socket.to(recipientSocketId).emit('receive_encrypted_payload', payload);
    } else {
      socket.to(roomCode).emit('receive_encrypted_payload', payload);
    }

    // Persist to Telegram Fast Cloud Store if not disappearing
    if (!timerSeconds || timerSeconds === 0) {
      addCloudMessage(roomCode, payload);
    }

    const inspectPacket = {
      id: `pkt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: payloadType === 'voice' ? 'ENCRYPTED_VOICE' : payloadType === 'file' ? (isImage ? 'ENCRYPTED_IMAGE' : 'ENCRYPTED_FILE') : 'ENCRYPTED_MESSAGE',
      sender: sender.username,
      senderId: socket.id,
      timestamp: payload.timestamp,
      payloadSize: ciphertext.length,
      rawContent: {
        serverStatus: 'TELEGRAM_CLOUD_SAVED_E2EE',
        ciphertextSnippet: `${ciphertext.substring(0, 32)}...[${ciphertext.length} bytes]`,
        ivHex: iv,
        payloadType: payload.payloadType,
        canServerDecrypt: false
      }
    };

    addPacketLog(roomCode, inspectPacket);
    io.to(roomCode).emit('inspector_packet', inspectPacket);
  });

  // Typing Indicator Relay
  socket.on('typing_start', () => {
    const roomCode = socket.roomCode;
    const room = rooms.get(roomCode);
    const user = room?.get(socket.id);
    if (roomCode && user) {
      socket.to(roomCode).emit('peer_typing_start', {
        socketId: socket.id,
        username: user.username
      });
    }
  });

  socket.on('typing_stop', () => {
    const roomCode = socket.roomCode;
    if (roomCode) {
      socket.to(roomCode).emit('peer_typing_stop', {
        socketId: socket.id
      });
    }
  });

  // Mobile Disconnect Grace Period Store (10s buffer)
  const pendingDisconnects = new Map();

  // Disconnect with 10s grace period for mobile app switching
  socket.on('disconnect', () => {
    leaveCurrentVoiceChannel(socket);

    const roomCode = socket.roomCode;
    if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      const user = room.get(socket.id);

      const timeoutId = setTimeout(() => {
        pendingDisconnects.delete(socket.id);
        room.delete(socket.id);

        if (room.size === 0) {
          rooms.delete(roomCode);
        } else {
          socket.to(roomCode).emit('peer_left', { socketId: socket.id, username: user?.username });
        }
        console.log(`[Socket Disconnected Finalized] User '${user?.username}' left room '${roomCode}'`);
      }, 10000);

      pendingDisconnects.set(socket.id, timeoutId);
    }
    console.log(`[Socket Disconnected (10s Grace Period Active)] ID: ${socket.id}`);
  });
});

const localIp = getLocalIpAddress();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🔒 CIPHERCHAT E2EE SERVER RUNNING ON PORT ${PORT}`);
  console.log(`🌐 PC Local Access:   http://localhost:${PORT}`);
  console.log(`📱 Mobile / Wi-Fi URL: http://${localIp}:${PORT}`);
  console.log(`====================================================`);
});
