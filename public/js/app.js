/**
 * CipherChat Application Controller (rrxcore edition)
 * Features: Discord Voice Rooms, Password Protection, E2EE Voice Notes, Web Crypto API
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const roomJoinOverlay = document.getElementById('roomJoinOverlay');
  const joinForm = document.getElementById('joinForm');
  const usernameInput = document.getElementById('usernameInput');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const roomPasswordInput = document.getElementById('roomPasswordInput');
  const generateRoomBtn = document.getElementById('generateRoomBtn');
  const joinErrorMessage = document.getElementById('joinErrorMessage');

  const modeTabBtn = document.getElementById('modeTabBtn');
  const modeSimBtn = document.getElementById('modeSimBtn');
  const openInspectorBtn = document.getElementById('openInspectorBtn');
  const openSafetyBtn = document.getElementById('openSafetyBtn');

  const singleChatView = document.getElementById('singleChatView');
  const splitSimView = document.getElementById('splitSimView');
  const inspectorDrawer = document.getElementById('inspectorDrawer');
  const closeInspectorBtn = document.getElementById('closeInspectorBtn');
  const packetStream = document.getElementById('packetStream');

  const safetyModal = document.getElementById('safetyModal');
  const closeSafetyBtn = document.getElementById('closeSafetyBtn');
  const safetyMatrixContainer = document.getElementById('safetyMatrixContainer');

  // Single Chat & Discord Elements
  const currentRoomLabel = document.getElementById('currentRoomLabel');
  const peerList = document.getElementById('peerList');
  const messagesArea = document.getElementById('messagesArea');
  const chatForm = document.getElementById('chatForm');
  const messageInput = document.getElementById('messageInput');
  const fileInput = document.getElementById('fileInput');

  // Discord Voice Room Elements
  const voiceChannelList = document.getElementById('voiceChannelList');
  const createVoiceChannelBtn = document.getElementById('createVoiceChannelBtn');
  const discordVoiceBar = document.getElementById('discordVoiceBar');
  const activeVoiceChannelName = document.getElementById('activeVoiceChannelName');
  const voiceMuteBtn = document.getElementById('voiceMuteBtn');
  const voiceDeafenBtn = document.getElementById('voiceDeafenBtn');
  const voiceDisconnectBtn = document.getElementById('voiceDisconnectBtn');

  // Voice Note Recording Elements
  const micBtn = document.getElementById('micBtn');
  const voiceRecordingPill = document.getElementById('voiceRecordingPill');
  const recordingTimer = document.getElementById('recordingTimer');
  const cancelVoiceBtn = document.getElementById('cancelVoiceBtn');
  const sendVoiceBtn = document.getElementById('sendVoiceBtn');

  // State Variables
  let socket = null;
  let myUsername = '';
  let myRoomCode = '';
  let myRoomPassword = '';
  let myKeyPair = null;
  let myPubKeyJwk = null;

  // Voice Note State
  let mediaRecorder = null;
  let audioChunks = [];
  let recordingInterval = null;
  let recordingSeconds = 0;

  // Discord Live Voice Room State
  let liveVoiceStream = null;
  let liveVoiceRecorder = null;
  let currentVoiceChannelId = null;
  let isVoiceMuted = false;
  let isVoiceDeafened = false;
  let voiceChannelsData = [];

  // Peer State: Map(socketId -> { username, publicKeyJwk, sessionKey, safetyNumber })
  const peersMap = new Map();

  // Initialize Socket.io Connection
  socket = io();

  // 1. Generate local ECDH Identity KeyPair on boot
  try {
    myKeyPair = await CipherCrypto.generateIdentityKeyPair();
    myPubKeyJwk = await CipherCrypto.exportPublicKey(myKeyPair.publicKey);
    console.log('🔒 Local ECDH KeyPair generated successfully:', myPubKeyJwk);
  } catch (err) {
    console.error('Failed to generate crypto keypair:', err);
    alert('Web Crypto API initialization failed. Please use a modern secure browser environment.');
    return;
  }

  // Generate random Room Code helper
  generateRoomBtn?.addEventListener('click', () => {
    const code = 'rrxcore-' + Math.random().toString(36).substring(2, 8);
    roomCodeInput.value = code;
  });

  // Handle Room Join Form Submit
  joinForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    myUsername = usernameInput.value.trim() || 'User_' + Math.floor(Math.random() * 1000);
    myRoomCode = roomCodeInput.value.trim() || 'rrxcore-1';
    myRoomPassword = roomPasswordInput.value.trim();

    joinErrorMessage.style.display = 'none';

    // Join Socket Room
    socket.emit('join_room', {
      roomCode: myRoomCode,
      username: myUsername,
      publicKey: myPubKeyJwk,
      roomPassword: myRoomPassword
    });
  });

  // Socket Listener: Room Error
  socket.on('room_error', ({ message }) => {
    joinErrorMessage.textContent = `⚠️ ${message}`;
    joinErrorMessage.style.display = 'block';
  });

  // Socket Listener: Joined Room
  socket.on('room_joined', async ({ roomCode, mySession, peers, recentPackets, isPasswordProtected, voiceChannels }) => {
    roomJoinOverlay.style.display = 'none';
    currentRoomLabel.textContent = `Room: ${myRoomCode}`;

    const protectionStatus = isPasswordProtected ? '🔒 Password Protected' : '🌐 Public';
    addSystemMessage(`✨ Joined server '${roomCode}' as ${myUsername}. (${protectionStatus})`);

    if (recentPackets && recentPackets.length > 0) {
      recentPackets.forEach(renderInspectorPacket);
    }

    for (const peer of peers) {
      if (peer.publicKey) {
        await setupPeerSession(peer.socketId, peer.username, peer.publicKey);
      }
    }
    renderPeerList();

    // Render Discord Voice Channels
    if (voiceChannels) {
      voiceChannelsData = voiceChannels;
      renderVoiceChannels();
    }
  });

  // Socket Listener: Peer Joined
  socket.on('peer_joined', async (peer) => {
    addSystemMessage(`👋 User '${peer.username}' joined the room.`);
    socket.emit('share_public_key', {
      recipientSocketId: peer.socketId,
      publicKey: myPubKeyJwk
    });
    if (peer.publicKey) {
      await setupPeerSession(peer.socketId, peer.username, peer.publicKey);
      renderPeerList();
    }
  });

  // Socket Listener: Receive Direct Peer Public Key
  socket.on('receive_peer_key', async ({ senderSocketId, senderUsername, publicKey }) => {
    await setupPeerSession(senderSocketId, senderUsername, publicKey);
    renderPeerList();
  });

  // Socket Listener: Receive Encrypted Payload (Text, File, Voice Note)
  socket.on('receive_encrypted_payload', async (payload) => {
    const peer = peersMap.get(payload.senderSocketId);
    if (!peer || !peer.sessionKey) return;

    try {
      if (payload.payloadType === 'file') {
        const decryptedBuffer = await CipherCrypto.decryptPayload(
          peer.sessionKey,
          payload.ciphertext,
          payload.iv,
          true
        );
        const blob = new Blob([decryptedBuffer]);
        const fileUrl = URL.createObjectURL(blob);
        renderIncomingFileMessage(payload.senderUsername, payload.fileName, fileUrl, payload.isImage, payload.timestamp);
      } else if (payload.payloadType === 'voice') {
        const decryptedBuffer = await CipherCrypto.decryptPayload(
          peer.sessionKey,
          payload.ciphertext,
          payload.iv,
          true
        );
        const audioBlob = new Blob([decryptedBuffer], { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        renderIncomingVoiceMessage(payload.senderUsername, audioUrl, payload.audioDuration, payload.timestamp);
      } else {
        const plaintext = await CipherCrypto.decryptPayload(
          peer.sessionKey,
          payload.ciphertext,
          payload.iv
        );
        renderIncomingMessage(payload.senderUsername, plaintext, payload.timestamp);
      }
    } catch (err) {
      console.error('Decryption failed:', err);
    }
  });

  // Socket Listener: Peer Left
  socket.on('peer_left', ({ socketId, username }) => {
    peersMap.delete(socketId);
    renderPeerList();
    addSystemMessage(`User ${username} left the room.`);
  });

  // Socket Listener: Inspector Packet
  socket.on('inspector_packet', (packet) => {
    renderInspectorPacket(packet);
  });

  // --- DISCORD VOICE ROOM SOCKET LISTENERS ---

  socket.on('voice_channel_created', (channel) => {
    voiceChannelsData.push(channel);
    renderVoiceChannels();
    addSystemMessage(`🔊 Voice channel '${channel.name}' was created.`);
  });

  socket.on('voice_participants_updated', ({ channelId, participants }) => {
    const vc = voiceChannelsData.find(c => c.id === channelId);
    if (vc) {
      vc.participants = participants;
      renderVoiceChannels();
    }
  });

  socket.on('voice_peer_speaking', ({ socketId, channelId, isSpeaking }) => {
    const avatarEl = document.getElementById(`v_avatar_${socketId}`);
    if (avatarEl) {
      if (isSpeaking) avatarEl.classList.add('speaking');
      else avatarEl.classList.remove('speaking');
    }
  });

  // Live E2EE Voice Stream Chunk Listener
  socket.on('receive_voice_stream_chunk', async ({ senderSocketId, channelId, ciphertext, iv }) => {
    if (isVoiceDeafened || channelId !== currentVoiceChannelId) return;
    const peer = peersMap.get(senderSocketId);
    if (!peer || !peer.sessionKey) return;

    try {
      const audioBuffer = await CipherCrypto.decryptPayload(peer.sessionKey, ciphertext, iv, true);
      playLiveVoiceChunk(audioBuffer);
    } catch (err) {
      console.error('Live voice chunk decryption failed:', err);
    }
  });

  // --- DISCORD VOICE ROOM METHODS ---

  createVoiceChannelBtn?.addEventListener('click', () => {
    const name = prompt('Enter new Voice Channel name:');
    if (name && name.trim()) {
      socket.emit('create_voice_channel', { channelName: name.trim() });
    }
  });

  async function joinVoiceChannel(channelId, channelName) {
    if (currentVoiceChannelId === channelId) return;

    try {
      liveVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      currentVoiceChannelId = channelId;

      socket.emit('join_voice_channel', { channelId });

      // Update UI Bar
      discordVoiceBar.style.display = 'flex';
      activeVoiceChannelName.textContent = channelName;

      // Start streaming encrypted audio chunks every 300ms
      startLiveVoiceStreaming();
      addSystemMessage(`🟢 Connected to Voice Room: ${channelName}`);
    } catch (err) {
      console.error('Failed to access microphone for voice channel:', err);
      alert('Microphone access is required to join Voice Channels.');
    }
  }

  function disconnectVoiceChannel() {
    if (!currentVoiceChannelId) return;

    stopLiveVoiceStreaming();
    socket.emit('leave_voice_channel');

    currentVoiceChannelId = null;
    discordVoiceBar.style.display = 'none';
    addSystemMessage(`🔴 Disconnected from Voice Channel.`);
    renderVoiceChannels();
  }

  function startLiveVoiceStreaming() {
    if (!liveVoiceStream) return;
    liveVoiceRecorder = new MediaRecorder(liveVoiceStream, { mimeType: 'audio/webm' });

    liveVoiceRecorder.ondataavailable = async (e) => {
      if (e.data.size > 0 && !isVoiceMuted && currentVoiceChannelId) {
        const arrayBuffer = await e.data.arrayBuffer();

        // Broadcast voice speaking state
        socket.emit('voice_speaking_state', { isSpeaking: true });
        setTimeout(() => socket.emit('voice_speaking_state', { isSpeaking: false }), 250);

        for (const [peerSocketId, peer] of peersMap.entries()) {
          try {
            const { ciphertextBase64, ivHex } = await CipherCrypto.encryptPayload(peer.sessionKey, arrayBuffer);
            socket.emit('voice_stream_chunk', {
              ciphertext: ciphertextBase64,
              iv: ivHex
            });
          } catch (err) {
            console.error('Voice chunk encryption failed:', err);
          }
        }
      }
    };

    liveVoiceRecorder.start(250); // Slice audio every 250ms for low latency
  }

  function stopLiveVoiceStreaming() {
    if (liveVoiceRecorder && liveVoiceRecorder.state !== 'inactive') {
      liveVoiceRecorder.stop();
    }
    if (liveVoiceStream) {
      liveVoiceStream.getTracks().forEach(t => t.stop());
      liveVoiceStream = null;
    }
  }

  function playLiveVoiceChunk(arrayBuffer) {
    const blob = new Blob([arrayBuffer], { type: 'audio/webm' });
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play().catch(() => {});
  }

  // Voice Bar Button Handlers
  voiceMuteBtn?.addEventListener('click', () => {
    isVoiceMuted = !isVoiceMuted;
    if (liveVoiceStream) {
      liveVoiceStream.getAudioTracks().forEach(track => track.enabled = !isVoiceMuted);
    }
    if (isVoiceMuted) {
      voiceMuteBtn.classList.add('muted');
      voiceMuteBtn.textContent = '🔇';
    } else {
      voiceMuteBtn.classList.remove('muted');
      voiceMuteBtn.textContent = '🎤';
    }
  });

  voiceDeafenBtn?.addEventListener('click', () => {
    isVoiceDeafened = !isVoiceDeafened;
    if (isVoiceDeafened) {
      voiceDeafenBtn.classList.add('muted');
      voiceDeafenBtn.textContent = '🔇';
    } else {
      voiceDeafenBtn.classList.remove('muted');
      voiceDeafenBtn.textContent = '🎧';
    }
  });

  voiceDisconnectBtn?.addEventListener('click', () => {
    disconnectVoiceChannel();
  });

  function renderVoiceChannels() {
    voiceChannelList.innerHTML = '';
    voiceChannelsData.forEach(vc => {
      const isConnected = currentVoiceChannelId === vc.id;
      const vcItem = document.createElement('div');
      vcItem.className = `voice-channel-item ${isConnected ? 'connected' : ''}`;
      
      let participantsHtml = '';
      if (vc.participants && vc.participants.length > 0) {
        participantsHtml = `<div class="voice-participant-list">`;
        vc.participants.forEach(p => {
          participantsHtml += `
            <div class="voice-participant">
              <div class="voice-avatar ${p.isSpeaking ? 'speaking' : ''}" id="v_avatar_${p.socketId}">${p.username[0].toUpperCase()}</div>
              <span>${p.username}</span>
            </div>
          `;
        });
        participantsHtml += `</div>`;
      }

      vcItem.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span>${vc.name}</span>
          ${isConnected ? '<span style="font-size: 0.68rem; color: var(--ios-green);">Connected</span>' : ''}
        </div>
        ${participantsHtml}
      `;

      vcItem.onclick = () => joinVoiceChannel(vc.id, vc.name);
      voiceChannelList.appendChild(vcItem);
    });
  }

  // --- CRYPTO HELPERS ---
  async function setupPeerSession(socketId, username, publicKeyJwk) {
    try {
      const sessionKey = await CipherCrypto.deriveSharedSessionKey(
        myKeyPair.privateKey,
        publicKeyJwk
      );
      const safetyNumber = await CipherCrypto.computeSafetyNumber(
        myPubKeyJwk,
        publicKeyJwk
      );

      peersMap.set(socketId, {
        socketId,
        username,
        publicKeyJwk,
        sessionKey,
        safetyNumber
      });
    } catch (err) {
      console.error(`Failed setup for ${username}:`, err);
    }
  }

  // Text Send
  chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    messageInput.value = '';
    renderOutgoingMessage(myUsername, text);

    for (const [peerSocketId, peer] of peersMap.entries()) {
      try {
        const { ciphertextBase64, ivHex } = await CipherCrypto.encryptPayload(peer.sessionKey, text);
        socket.emit('send_encrypted_payload', {
          roomCode: myRoomCode,
          recipientSocketId: peerSocketId,
          ciphertext: ciphertextBase64,
          iv: ivHex,
          payloadType: 'text'
        });
      } catch (err) {
        console.error('Text encryption error:', err);
      }
    }
  });

  // File Send
  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert('File size limit is 25MB.');
      return;
    }

    const isImage = file.type.startsWith('image/');
    addSystemMessage(`Encrypting ${isImage ? 'image' : 'file'} '${file.name}' (${(file.size / 1024).toFixed(1)} KB)...`);
    const arrayBuffer = await file.arrayBuffer();

    for (const [peerSocketId, peer] of peersMap.entries()) {
      try {
        const { ciphertextBase64, ivHex } = await CipherCrypto.encryptPayload(peer.sessionKey, arrayBuffer);
        socket.emit('send_encrypted_payload', {
          roomCode: myRoomCode,
          recipientSocketId: peerSocketId,
          ciphertext: ciphertextBase64,
          iv: ivHex,
          payloadType: 'file',
          fileName: file.name,
          fileSize: file.size,
          isImage: isImage
        });
      } catch (err) {
        console.error('File E2EE failed:', err);
      }
    }

    const localUrl = URL.createObjectURL(file);
    renderOutgoingFileMessage(myUsername, file.name, localUrl, isImage);
    fileInput.value = '';
  });

  // Voice Note Recording
  micBtn?.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.start();

      recordingSeconds = 0;
      voiceRecordingPill.style.display = 'flex';
      chatForm.style.display = 'none';

      recordingInterval = setInterval(() => {
        recordingSeconds++;
        const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
        const secs = String(recordingSeconds % 60).padStart(2, '0');
        recordingTimer.textContent = `Recording ${mins}:${secs}`;
      }, 1000);
    } catch (err) {
      alert('Microphone permission required for voice notes.');
    }
  });

  cancelVoiceBtn?.addEventListener('click', () => {
    stopMediaRecorder();
    voiceRecordingPill.style.display = 'none';
    chatForm.style.display = 'flex';
  });

  sendVoiceBtn?.addEventListener('click', async () => {
    if (!mediaRecorder) return;
    mediaRecorder.onstop = async () => {
      stopMediaRecorder();
      voiceRecordingPill.style.display = 'none';
      chatForm.style.display = 'flex';

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const durationStr = `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, '0')}`;

      for (const [peerSocketId, peer] of peersMap.entries()) {
        try {
          const { ciphertextBase64, ivHex } = await CipherCrypto.encryptPayload(peer.sessionKey, arrayBuffer);
          socket.emit('send_encrypted_payload', {
            roomCode: myRoomCode,
            recipientSocketId: peerSocketId,
            ciphertext: ciphertextBase64,
            iv: ivHex,
            payloadType: 'voice',
            audioDuration: durationStr
          });
        } catch (err) {
          console.error('Voice note encryption failed:', err);
        }
      }

      const localAudioUrl = URL.createObjectURL(audioBlob);
      renderOutgoingVoiceMessage(myUsername, localAudioUrl, durationStr);
    };
    mediaRecorder.stop();
  });

  function stopMediaRecorder() {
    if (recordingInterval) clearInterval(recordingInterval);
    if (mediaRecorder && mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  }

  // --- UI RENDER HELPERS ---
  function renderPeerList() {
    peerList.innerHTML = '';
    if (peersMap.size === 0) {
      peerList.innerHTML = `<div style="padding: 8px; font-size: 0.78rem; color: var(--text-muted); text-align: center;">Waiting for peers...</div>`;
      return;
    }

    peersMap.forEach((peer) => {
      const item = document.createElement('div');
      item.className = 'peer-item active-peer';
      item.innerHTML = `
        <div class="peer-info">
          <div class="peer-avatar">${peer.username[0].toUpperCase()}</div>
          <div>
            <div class="peer-name">${peer.username}</div>
            <div style="font-size: 0.7rem; color: var(--ios-green); font-weight: 600;">E2EE Active</div>
          </div>
        </div>
        <div class="status-dot"></div>
      `;
      peerList.appendChild(item);
    });
  }

  function addSystemMessage(text) {
    const sysDiv = document.createElement('div');
    sysDiv.className = 'system-message';
    sysDiv.textContent = text;
    messagesArea.appendChild(sysDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function renderOutgoingMessage(sender, text) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container outgoing';
    msgDiv.innerHTML = `
      <div class="msg-bubble">
        ${escapeHtml(text)}
        <div class="msg-time">${time} <span class="e2ee-tag">🔒 Encrypted</span></div>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function renderIncomingMessage(sender, text, timestamp) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container incoming';
    msgDiv.innerHTML = `
      <div class="msg-sender">${escapeHtml(sender)}</div>
      <div class="msg-bubble">
        ${escapeHtml(text)}
        <div class="msg-time">${timestamp || ''} <span class="e2ee-tag">🔒 Decrypted</span></div>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function renderOutgoingFileMessage(sender, fileName, fileUrl, isImage) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container outgoing';
    const imageHtml = isImage ? `<img src="${fileUrl}" alt="Decrypted Image" class="e2ee-img-preview">` : '';

    msgDiv.innerHTML = `
      <div class="msg-bubble">
        ${imageHtml}
        📎 <strong>${escapeHtml(fileName)}</strong><br>
        <a href="${fileUrl}" download="${escapeHtml(fileName)}" style="color: #fff; font-size: 0.8rem; text-decoration: underline;">Download File</a>
        <div class="msg-time">🔒 Encrypted File</div>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function renderIncomingFileMessage(sender, fileName, fileUrl, isImage, timestamp) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container incoming';
    const imageHtml = isImage ? `<img src="${fileUrl}" alt="Decrypted Image" class="e2ee-img-preview">` : '';

    msgDiv.innerHTML = `
      <div class="msg-sender">${escapeHtml(sender)}</div>
      <div class="msg-bubble">
        ${imageHtml}
        📎 <strong>${escapeHtml(fileName)}</strong><br>
        <a href="${fileUrl}" download="${escapeHtml(fileName)}" style="color: var(--ios-cyan); font-size: 0.8rem; text-decoration: underline;">Download Decrypted File</a>
        <div class="msg-time">${timestamp || ''} <span class="e2ee-tag">🔒 Decrypted File</span></div>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function renderOutgoingVoiceMessage(sender, audioUrl, duration) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container outgoing';
    const uniqueId = 'aud_' + Math.random().toString(36).substr(2, 6);

    msgDiv.innerHTML = `
      <div class="msg-bubble">
        <div class="voice-player">
          <button type="button" class="voice-play-btn" id="play_${uniqueId}">▶</button>
          <div class="audio-wave-anim" id="wave_${uniqueId}">
            <div class="audio-bar"></div>
            <div class="audio-bar"></div>
            <div class="audio-bar"></div>
            <div class="audio-bar"></div>
            <div class="audio-bar"></div>
          </div>
          <span style="font-size: 0.75rem; color: #fff;">${duration || '0:05'}</span>
        </div>
        <audio id="el_${uniqueId}" src="${audioUrl}"></audio>
        <div class="msg-time">🔒 E2EE Voice Note</div>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    setupVoicePlayerEvents(uniqueId);
  }

  function renderIncomingVoiceMessage(sender, audioUrl, duration, timestamp) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container incoming';
    const uniqueId = 'aud_' + Math.random().toString(36).substr(2, 6);

    msgDiv.innerHTML = `
      <div class="msg-sender">${escapeHtml(sender)}</div>
      <div class="msg-bubble">
        <div class="voice-player">
          <button type="button" class="voice-play-btn" id="play_${uniqueId}">▶</button>
          <div class="audio-wave-anim" id="wave_${uniqueId}">
            <div class="audio-bar"></div>
            <div class="audio-bar"></div>
            <div class="audio-bar"></div>
            <div class="audio-bar"></div>
            <div class="audio-bar"></div>
          </div>
          <span style="font-size: 0.75rem; color: #fff;">${duration || '0:05'}</span>
        </div>
        <audio id="el_${uniqueId}" src="${audioUrl}"></audio>
        <div class="msg-time">${timestamp || ''} <span class="e2ee-tag">🔒 Decrypted Voice</span></div>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    setupVoicePlayerEvents(uniqueId);
  }

  function setupVoicePlayerEvents(id) {
    setTimeout(() => {
      const btn = document.getElementById(`play_${id}`);
      const audioEl = document.getElementById(`el_${id}`);
      const wave = document.getElementById(`wave_${id}`);

      if (btn && audioEl) {
        btn.onclick = () => {
          if (audioEl.paused) {
            audioEl.play();
            btn.textContent = '⏸';
            wave.classList.add('playing');
          } else {
            audioEl.pause();
            btn.textContent = '▶';
            wave.classList.remove('playing');
          }
        };
        audioEl.onended = () => {
          btn.textContent = '▶';
          wave.classList.remove('playing');
        };
      }
    }, 100);
  }

  function renderInspectorPacket(packet) {
    const card = document.createElement('div');
    card.className = 'packet-card';
    card.innerHTML = `
      <div class="packet-meta">
        <span class="packet-type ${packet.type}">${packet.type}</span>
        <span>From: ${escapeHtml(packet.sender)}</span>
        <span>Time: ${packet.timestamp}</span>
        <span>Size: ${packet.payloadSize} bytes</span>
      </div>
      <div class="packet-content">
        <pre style="margin: 0;">${JSON.stringify(packet.rawContent, null, 2)}</pre>
      </div>
    `;
    packetStream.appendChild(card);
    packetStream.scrollTop = packetStream.scrollHeight;
  }

  // --- SAFETY MODAL ---
  openSafetyBtn?.addEventListener('click', () => {
    if (peersMap.size === 0) {
      alert('Safety Number verification requires at least one active peer in the room.');
      return;
    }

    const firstPeer = Array.from(peersMap.values())[0];
    if (!firstPeer.safetyNumber) return;

    safetyMatrixContainer.innerHTML = '';
    firstPeer.safetyNumber.blocks.forEach(block => {
      const bDiv = document.createElement('div');
      bDiv.className = 'matrix-block';
      bDiv.textContent = block;
      safetyMatrixContainer.appendChild(bDiv);
    });

    safetyModal.classList.add('active');
  });

  closeSafetyBtn?.addEventListener('click', () => {
    safetyModal.classList.remove('active');
  });

  // --- INSPECTOR DRAWER ---
  openInspectorBtn?.addEventListener('click', () => {
    inspectorDrawer.classList.add('open');
  });

  closeInspectorBtn?.addEventListener('click', () => {
    inspectorDrawer.classList.remove('open');
  });

  // --- MODE SWITCHER ---
  modeTabBtn?.addEventListener('click', () => {
    modeTabBtn.classList.add('active');
    modeSimBtn.classList.remove('active');
    singleChatView.style.display = 'flex';
    splitSimView.style.display = 'none';
  });

  modeSimBtn?.addEventListener('click', () => {
    modeSimBtn.classList.add('active');
    modeTabBtn.classList.remove('active');
    singleChatView.style.display = 'none';
    splitSimView.style.display = 'flex';
    initSplitSimulator();
  });

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- SPLIT SIMULATOR ---
  async function initSplitSimulator() {
    const simAliceMessages = document.getElementById('simAliceMessages');
    const simBobMessages = document.getElementById('simBobMessages');
    const simAliceForm = document.getElementById('simAliceForm');
    const simBobForm = document.getElementById('simBobForm');
    const simAliceInput = document.getElementById('simAliceInput');
    const simBobInput = document.getElementById('simBobInput');

    if (!simAliceForm) return;

    const aliceKeys = await CipherCrypto.generateIdentityKeyPair();
    const bobKeys = await CipherCrypto.generateIdentityKeyPair();

    const alicePubKey = await CipherCrypto.exportPublicKey(aliceKeys.publicKey);
    const bobPubKey = await CipherCrypto.exportPublicKey(bobKeys.publicKey);

    const aliceSessionKey = await CipherCrypto.deriveSharedSessionKey(aliceKeys.privateKey, bobPubKey);
    const bobSessionKey = await CipherCrypto.deriveSharedSessionKey(bobKeys.privateKey, alicePubKey);

    simAliceForm.onsubmit = async (e) => {
      e.preventDefault();
      const txt = simAliceInput.value.trim();
      if (!txt) return;
      simAliceInput.value = '';

      appendSimMessage(simAliceMessages, 'Alice', txt, 'outgoing');
      const { ciphertextBase64, ivHex } = await CipherCrypto.encryptPayload(aliceSessionKey, txt);

      renderInspectorPacket({
        id: 'sim_' + Date.now(),
        type: 'ENCRYPTED_MESSAGE',
        sender: 'Alice (Simulated)',
        timestamp: new Date().toLocaleTimeString(),
        payloadSize: ciphertextBase64.length,
        rawContent: {
          event: 'Alice -> Bob Encrypted Relay',
          ciphertext: ciphertextBase64.substring(0, 24) + '...',
          iv: ivHex
        }
      });

      const decryptedTxt = await CipherCrypto.decryptPayload(bobSessionKey, ciphertextBase64, ivHex);
      appendSimMessage(simBobMessages, 'Alice', decryptedTxt, 'incoming');
    };

    simBobForm.onsubmit = async (e) => {
      e.preventDefault();
      const txt = simBobInput.value.trim();
      if (!txt) return;
      simBobInput.value = '';

      appendSimMessage(simBobMessages, 'Bob', txt, 'outgoing');
      const { ciphertextBase64, ivHex } = await CipherCrypto.encryptPayload(bobSessionKey, txt);

      renderInspectorPacket({
        id: 'sim_' + Date.now(),
        type: 'ENCRYPTED_MESSAGE',
        sender: 'Bob (Simulated)',
        timestamp: new Date().toLocaleTimeString(),
        payloadSize: ciphertextBase64.length,
        rawContent: {
          event: 'Bob -> Alice Encrypted Relay',
          ciphertext: ciphertextBase64.substring(0, 24) + '...',
          iv: ivHex
        }
      });

      const decryptedTxt = await CipherCrypto.decryptPayload(aliceSessionKey, ciphertextBase64, ivHex);
      appendSimMessage(simAliceMessages, 'Bob', decryptedTxt, 'incoming');
    };
  }

  function appendSimMessage(container, sender, text, dir) {
    const div = document.createElement('div');
    div.className = `msg-bubble-container ${dir}`;
    div.innerHTML = `
      <div class="msg-bubble">
        ${escapeHtml(text)}
        <div class="msg-time">🔒 E2EE ${dir}</div>
      </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }
});
