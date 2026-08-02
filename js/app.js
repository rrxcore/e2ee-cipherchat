/**
 * CipherChat Application Controller (rrxcore edition)
 * Features: Discord Voice Rooms, WebRTC P2P Voice, 10 Real-Time Voice Changer FX, Hardware Device Selectors
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const roomJoinOverlay = document.getElementById('roomJoinOverlay');
  const joinForm = document.getElementById('joinForm');
  const usernameInput = document.getElementById('usernameInput');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const roomPasswordInput = document.getElementById('roomPasswordInput');
  const serverUrlGroup = document.getElementById('serverUrlGroup');
  const serverUrlInput = document.getElementById('serverUrlInput');
  const generateRoomBtn = document.getElementById('generateRoomBtn');
  const joinErrorMessage = document.getElementById('joinErrorMessage');

  const modeTabBtn = document.getElementById('modeTabBtn');
  const modeSimBtn = document.getElementById('modeSimBtn');
  const openInspectorBtn = document.getElementById('openInspectorBtn');
  const openSafetyBtn = document.getElementById('openSafetyBtn');
  const openVoiceSettingsBtn = document.getElementById('openVoiceSettingsBtn');

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
  const activeVoiceFXLabel = document.getElementById('activeVoiceFXLabel');
  const voiceMuteBtn = document.getElementById('voiceMuteBtn');
  const voiceDeafenBtn = document.getElementById('voiceDeafenBtn');
  const voiceDisconnectBtn = document.getElementById('voiceDisconnectBtn');
  const openVoiceFXBtn = document.getElementById('openVoiceFXBtn');

  // Voice Settings Modal Elements
  const voiceSettingsModal = document.getElementById('voiceSettingsModal');
  const closeVoiceSettingsBtn = document.getElementById('closeVoiceSettingsBtn');
  const micSelect = document.getElementById('micSelect');
  const speakerSelect = document.getElementById('speakerSelect');
  const testAudioChimeBtn = document.getElementById('testAudioChimeBtn');

  // Voice Changer FX Modal Elements
  const voiceFXModal = document.getElementById('voiceFXModal');
  const closeVoiceFXBtn = document.getElementById('closeVoiceFXBtn');
  const fxGridContainer = document.getElementById('fxGridContainer');
  const customFxNameInput = document.getElementById('customFxNameInput');
  const customFxFilterSelect = document.getElementById('customFxFilterSelect');
  const customFxFreqInput = document.getElementById('customFxFreqInput');
  const addCustomFxBtn = document.getElementById('addCustomFxBtn');

  // Create Voice Room Modal Elements
  const createVoiceModal = document.getElementById('createVoiceModal');
  const closeCreateVoiceBtn = document.getElementById('closeCreateVoiceBtn');
  const createVoiceForm = document.getElementById('createVoiceForm');
  const newVoiceChannelNameInput = document.getElementById('newVoiceChannelNameInput');

  // Voice Note Recording Elements
  const micBtn = document.getElementById('micBtn');
  const voiceRecordingPill = document.getElementById('voiceRecordingPill');
  const recordingTimer = document.getElementById('recordingTimer');
  const cancelVoiceBtn = document.getElementById('cancelVoiceBtn');
  const sendVoiceBtn = document.getElementById('sendVoiceBtn');

  // State Variables
  let socket = null;
  let isConnectedToServer = false;
  let myUsername = '';
  let myRoomCode = '';
  let myRoomPassword = '';
  let myKeyPair = null;
  let myPubKeyJwk = null;

  // Voice Note Recording State
  let mediaRecorder = null;
  let audioChunks = [];
  let recordingInterval = null;
  let recordingSeconds = 0;

  // DISCORD WEBRTC LIVE VOICE MESH & DSP VOICE CHANGER STATE
  let localRawStream = null;
  let processedVoiceStream = null;
  let currentVoiceChannelId = null;
  let isVoiceMuted = false;
  let isVoiceDeafened = false;
  let selectedMicId = '';
  let selectedSpeakerId = '';
  let activeVoiceFX = 'normal';

  // Web Audio DSP Engine
  let fxAudioContext = null;
  let fxSourceNode = null;
  let fxFilterNode = null;
  let fxDelayNode = null;
  let fxGainNode = null;
  let fxDestinationNode = null;

  let audioAnalyser = null;
  let speechCheckInterval = null;

  const peerConnections = new Map();
  const peerAudioElements = new Map();

  let voiceChannelsData = [
    { id: 'v_lounge', name: '🔊 Lounge Voice', participants: [] },
    { id: 'v_stage', name: '🔊 E2EE Stage', participants: [] }
  ];

  const peersMap = new Map();

  const isGitHubPages = window.location.hostname.includes('github.io');
  if (isGitHubPages && serverUrlGroup) {
    serverUrlGroup.style.display = 'block';
  }

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

  // Initialize Socket.io Connection
  function initSocket(targetUrl) {
    if (socket) {
      socket.disconnect();
    }

    try {
      const connectTarget = targetUrl || (isGitHubPages ? 'http://localhost:3000' : window.location.origin);
      socket = io(connectTarget, {
        timeout: 4000,
        reconnection: true,
        reconnectionAttempts: 3
      });

      socket.on('connect', () => {
        isConnectedToServer = true;
        console.log('🟢 Socket connected to server:', socket.id);
      });

      socket.on('connect_error', () => {
        isConnectedToServer = false;
        console.warn('⚠️ Socket server unreachable. Standalone mode active.');
      });

      setupSocketListeners();
    } catch (err) {
      isConnectedToServer = false;
      console.warn('Socket fallback:', err);
    }
  }

  initSocket();

  generateRoomBtn?.addEventListener('click', () => {
    const code = 'rrxcore-' + Math.random().toString(36).substring(2, 8);
    roomCodeInput.value = code;
  });

  joinForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    myUsername = usernameInput.value.trim() || 'User_' + Math.floor(Math.random() * 1000);
    myRoomCode = roomCodeInput.value.trim() || 'rrxcore-1';
    myRoomPassword = roomPasswordInput.value.trim();

    const customUrl = serverUrlInput?.value.trim();
    if (customUrl) {
      initSocket(customUrl);
    }

    joinErrorMessage.style.display = 'none';

    if (socket && isConnectedToServer) {
      socket.emit('join_room', {
        roomCode: myRoomCode,
        username: myUsername,
        publicKey: myPubKeyJwk,
        roomPassword: myRoomPassword
      });
    } else {
      roomJoinOverlay.style.display = 'none';
      currentRoomLabel.textContent = `Room: ${myRoomCode}`;
      addSystemMessage(`ℹ️ Joined room '${myRoomCode}' in Standalone Mode.`);
      renderVoiceChannels();
    }
  });

  function setupSocketListeners() {
    if (!socket) return;

    socket.on('room_error', ({ message }) => {
      joinErrorMessage.textContent = `⚠️ ${message}`;
      joinErrorMessage.style.display = 'block';
    });

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

      if (voiceChannels) {
        voiceChannelsData = voiceChannels;
        renderVoiceChannels();
      }
    });

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

    socket.on('receive_peer_key', async ({ senderSocketId, senderUsername, publicKey }) => {
      await setupPeerSession(senderSocketId, senderUsername, publicKey);
      renderPeerList();
    });

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

    socket.on('peer_left', ({ socketId, username }) => {
      peersMap.delete(socketId);
      closePeerConnection(socketId);
      renderPeerList();
      addSystemMessage(`User ${username} left the room.`);
    });

    socket.on('inspector_packet', (packet) => {
      renderInspectorPacket(packet);
    });

    // --- DISCORD WEBRTC LIVE VOICE SIGNALING LISTENERS ---

    socket.on('voice_channel_created', (channel) => {
      voiceChannelsData.push(channel);
      renderVoiceChannels();
      addSystemMessage(`🔊 Voice channel '${channel.name}' was created.`);
    });

    socket.on('voice_channel_joined', async ({ channelId, existingParticipants }) => {
      for (const p of existingParticipants) {
        if (p.socketId !== socket.id) {
          await createWebRTCOffer(p.socketId);
        }
      }
    });

    socket.on('voice_participants_updated', ({ channelId, participants }) => {
      const vc = voiceChannelsData.find(c => c.id === channelId);
      if (vc) {
        vc.participants = participants;
        renderVoiceChannels();
      }
    });

    socket.on('voice_peer_left', ({ socketId, channelId }) => {
      closePeerConnection(socketId);
    });

    socket.on('voice_peer_speaking', ({ socketId, channelId, isSpeaking }) => {
      const avatarEl = document.getElementById(`v_avatar_${socketId}`);
      if (avatarEl) {
        if (isSpeaking) avatarEl.classList.add('speaking');
        else avatarEl.classList.remove('speaking');
      }
    });

    socket.on('webrtc_offer', async ({ senderSocketId, sdpOffer }) => {
      await handleWebRTCOffer(senderSocketId, sdpOffer);
    });

    socket.on('webrtc_answer', async ({ senderSocketId, sdpAnswer }) => {
      await handleWebRTCAnswer(senderSocketId, sdpAnswer);
    });

    socket.on('webrtc_ice_candidate', async ({ senderSocketId, candidate }) => {
      await handleWebRTCCandidate(senderSocketId, candidate);
    });
  }

  // --- DISCORD SOUND EFFECTS SYNTHESIS ENGINE ---
  function playDiscordJoinSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      osc2.frequency.setValueAtTime(554.37, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(1108.73, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.35);
      osc2.stop(ctx.currentTime + 0.35);
    } catch (e) {
      console.warn('Join sound error:', e);
    }
  }

  function playDiscordLeaveSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(261.63, ctx.currentTime + 0.2);
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(329.63, ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.3);
      osc2.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn('Leave sound error:', e);
    }
  }

  testAudioChimeBtn?.addEventListener('click', () => {
    playDiscordJoinSound();
    setTimeout(playDiscordLeaveSound, 400);
  });

  // --- HARDWARE AUDIO DEVICE ENUMERATION & SELECTION ---
  async function populateAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      micSelect.innerHTML = '<option value="">Default Microphone</option>';
      speakerSelect.innerHTML = '<option value="">Default Speaker / Headphones</option>';

      devices.forEach(device => {
        if (device.kind === 'audioinput') {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = device.label || `Microphone ${micSelect.length}`;
          if (selectedMicId === device.deviceId) option.selected = true;
          micSelect.appendChild(option);
        } else if (device.kind === 'audiooutput') {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = device.label || `Speaker ${speakerSelect.length}`;
          if (selectedSpeakerId === device.deviceId) option.selected = true;
          speakerSelect.appendChild(option);
        }
      });
    } catch (err) {
      console.warn('Enumerate devices error:', err);
    }
  }

  micSelect?.addEventListener('change', async () => {
    selectedMicId = micSelect.value;
    if (currentVoiceChannelId) {
      addSystemMessage(`🎤 Switching microphone input device...`);
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
      });
      localRawStream = newStream;
      applyVoiceChangerFX(activeVoiceFX);

      // Replace audio track across all active WebRTC peer connections
      const newTrack = processedVoiceStream.getAudioTracks()[0];
      peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender && newTrack) {
          sender.replaceTrack(newTrack);
        }
      });
    }
  });

  speakerSelect?.addEventListener('change', () => {
    selectedSpeakerId = speakerSelect.value;
    peerAudioElements.forEach((audio) => {
      if (typeof audio.setSinkId === 'function' && selectedSpeakerId) {
        audio.setSinkId(selectedSpeakerId).catch(e => console.warn('setSinkId error:', e));
      }
    });
    addSystemMessage(`🔊 Audio output device switched.`);
  });

  openVoiceSettingsBtn?.addEventListener('click', () => {
    populateAudioDevices();
    voiceSettingsModal.classList.add('active');
  });

  closeVoiceSettingsBtn?.addEventListener('click', () => {
    voiceSettingsModal.classList.remove('active');
  });

  // --- 10 REAL-TIME WEB AUDIO DSP VOICE CHANGER ENGINE ---
  function applyVoiceChangerFX(fxType) {
    if (!localRawStream) return;
    activeVoiceFX = fxType;

    try {
      if (!fxAudioContext) {
        fxAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Close previous node setup
      if (fxSourceNode) fxSourceNode.disconnect();
      if (fxFilterNode) fxFilterNode.disconnect();
      if (fxDelayNode) fxDelayNode.disconnect();

      fxSourceNode = fxAudioContext.createMediaStreamSource(localRawStream);
      fxDestinationNode = fxAudioContext.createMediaStreamDestination();

      if (fxType === 'normal') {
        fxSourceNode.connect(fxDestinationNode);
      } else if (fxType === 'robot') {
        // Ring Modulator (50Hz sine LFO)
        const osc = fxAudioContext.createOscillator();
        const gain = fxAudioContext.createGain();
        osc.frequency.value = 50;
        osc.type = 'sine';
        osc.start();

        fxSourceNode.connect(gain);
        osc.connect(gain.gain);
        gain.connect(fxDestinationNode);
      } else if (fxType === 'alien') {
        // Formant Filter + Flanger
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'peaking';
        fxFilterNode.frequency.value = 1800;
        fxFilterNode.Q.value = 8;
        fxFilterNode.gain.value = 12;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'monster') {
        // Deep Lowpass + Bass Boost
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'lowpass';
        fxFilterNode.frequency.value = 350;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'walkie') {
        // Bandpass 300Hz - 3000Hz
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'bandpass';
        fxFilterNode.frequency.value = 1200;
        fxFilterNode.Q.value = 3;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'chipmunk') {
        // Highpass Treble Boost
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'highpass';
        fxFilterNode.frequency.value = 1400;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'cave') {
        // Delay Reverb Loop
        fxDelayNode = fxAudioContext.createDelay();
        fxDelayNode.delayTime.value = 0.25;

        fxGainNode = fxAudioContext.createGain();
        fxGainNode.gain.value = 0.4;

        fxSourceNode.connect(fxDestinationNode);
        fxSourceNode.connect(fxDelayNode);
        fxDelayNode.connect(fxGainNode);
        fxGainNode.connect(fxDelayNode);
        fxGainNode.connect(fxDestinationNode);
      } else if (fxType === 'telephone') {
        // Telephone 400Hz - 1200Hz
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'bandpass';
        fxFilterNode.frequency.value = 800;
        fxFilterNode.Q.value = 4;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'cyber') {
        // Harmonic Overdrive + Highshelf
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'highshelf';
        fxFilterNode.frequency.value = 2200;
        fxFilterNode.gain.value = 15;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'underwater') {
        // Heavy Lowpass Muffle (220Hz cutoff)
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'lowpass';
        fxFilterNode.frequency.value = 220;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      }

      processedVoiceStream = fxDestinationNode.stream;
      activeVoiceFXLabel.textContent = `FX: ${fxType.toUpperCase()}`;
    } catch (err) {
      console.warn('Apply voice FX error:', err);
      processedVoiceStream = localRawStream;
    }
  }

  // Voice FX Cards Click Handler
  fxGridContainer?.addEventListener('click', (e) => {
    const card = e.target.closest('.fx-card');
    if (!card) return;

    document.querySelectorAll('.fx-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    const fx = card.dataset.fx;
    applyVoiceChangerFX(fx);
    addSystemMessage(`🎭 Voice Changer FX updated to '${fx.toUpperCase()}'.`);

    // Replace WebRTC audio track with new DSP FX stream
    if (processedVoiceStream) {
      const newTrack = processedVoiceStream.getAudioTracks()[0];
      peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender && newTrack) {
          sender.replaceTrack(newTrack);
        }
      });
    }
  });

  // Add Custom Voice Effect Handler
  addCustomFxBtn?.addEventListener('click', () => {
    const name = customFxNameInput.value.trim();
    const filterType = customFxFilterSelect.value;
    const freq = customFxFreqInput.value || 1000;

    if (!name) {
      alert('Please enter a name for your custom voice effect.');
      return;
    }

    const card = document.createElement('button');
    card.className = 'fx-card';
    card.dataset.fx = name.toLowerCase();
    card.innerHTML = `
      <span style="font-size: 1.4rem;">🎛️</span>
      <span class="fx-title">${escapeHtml(name)}</span>
      <span class="fx-desc">${filterType.toUpperCase()} ${freq}Hz</span>
    `;

    fxGridContainer.appendChild(card);
    customFxNameInput.value = '';
    addSystemMessage(`➕ Custom Voice Effect '${name}' created.`);
  });

  openVoiceFXBtn?.addEventListener('click', () => {
    voiceFXModal.classList.add('active');
  });

  closeVoiceFXBtn?.addEventListener('click', () => {
    voiceFXModal.classList.remove('active');
  });

  // --- CREATE NEW VOICE ROOM MODAL ---
  createVoiceChannelBtn?.addEventListener('click', () => {
    createVoiceModal.classList.add('active');
  });

  closeCreateVoiceBtn?.addEventListener('click', () => {
    createVoiceModal.classList.remove('active');
  });

  createVoiceForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = newVoiceChannelNameInput.value.trim();
    if (!name) return;

    if (socket && isConnectedToServer) {
      socket.emit('create_voice_channel', { channelName: name });
    } else {
      const id = 'v_' + Date.now();
      voiceChannelsData.push({ id, name: `🔊 ${name}`, participants: [] });
      renderVoiceChannels();
      addSystemMessage(`🔊 Voice channel '${name}' was created.`);
    }

    newVoiceChannelNameInput.value = '';
    createVoiceModal.classList.remove('active');
  });

  // --- DISCORD WEBRTC LIVE VOICE ENGINE ---

  async function joinVoiceChannel(channelId, channelName) {
    if (currentVoiceChannelId === channelId) return;

    try {
      localRawStream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
      });
      currentVoiceChannelId = channelId;

      applyVoiceChangerFX(activeVoiceFX);
      setupSpeakingDetector(localRawStream);

      if (socket && isConnectedToServer) {
        socket.emit('join_voice_channel', { channelId });
      }

      playDiscordJoinSound();

      discordVoiceBar.style.display = 'flex';
      activeVoiceChannelName.textContent = channelName;
      addSystemMessage(`🟢 Connected to Voice Channel: ${channelName}`);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Microphone access is required to join Voice Channels.');
    }
  }

  function disconnectVoiceChannel() {
    if (!currentVoiceChannelId) return;

    playDiscordLeaveSound();

    if (speechCheckInterval) clearInterval(speechCheckInterval);
    if (localRawStream) {
      localRawStream.getTracks().forEach(t => t.stop());
      localRawStream = null;
    }

    peerConnections.forEach((pc, id) => closePeerConnection(id));

    if (socket && isConnectedToServer) {
      socket.emit('leave_voice_channel');
    }

    currentVoiceChannelId = null;
    discordVoiceBar.style.display = 'none';
    addSystemMessage(`🔴 Disconnected from Voice Channel.`);
    renderVoiceChannels();
  }

  const iceConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  async function createWebRTCOffer(targetSocketId) {
    const pc = new RTCPeerConnection(iceConfiguration);
    peerConnections.set(targetSocketId, pc);

    const activeStream = processedVoiceStream || localRawStream;
    if (activeStream) {
      activeStream.getTracks().forEach(track => pc.addTrack(track, activeStream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc_ice_candidate', {
          targetSocketId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      playPeerAudioStream(targetSocketId, event.streams[0]);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('webrtc_offer', {
      targetSocketId,
      sdpOffer: offer
    });
  }

  async function handleWebRTCOffer(senderSocketId, sdpOffer) {
    const pc = new RTCPeerConnection(iceConfiguration);
    peerConnections.set(senderSocketId, pc);

    const activeStream = processedVoiceStream || localRawStream;
    if (activeStream) {
      activeStream.getTracks().forEach(track => pc.addTrack(track, activeStream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc_ice_candidate', {
          targetSocketId: senderSocketId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      playPeerAudioStream(senderSocketId, event.streams[0]);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdpOffer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('webrtc_answer', {
      targetSocketId: senderSocketId,
      sdpAnswer: answer
    });
  }

  async function handleWebRTCAnswer(senderSocketId, sdpAnswer) {
    const pc = peerConnections.get(senderSocketId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdpAnswer));
    }
  }

  async function handleWebRTCCandidate(senderSocketId, candidate) {
    const pc = peerConnections.get(senderSocketId);
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    }
  }

  function playPeerAudioStream(socketId, mediaStream) {
    let audio = peerAudioElements.get(socketId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      if (typeof audio.setSinkId === 'function' && selectedSpeakerId) {
        audio.setSinkId(selectedSpeakerId).catch(() => {});
      }
      peerAudioElements.set(socketId, audio);
    }
    audio.srcObject = mediaStream;
    audio.muted = isVoiceDeafened;
    audio.play().catch(err => console.warn('Audio play error:', err));
  }

  function closePeerConnection(socketId) {
    const pc = peerConnections.get(socketId);
    if (pc) {
      pc.close();
      peerConnections.delete(socketId);
    }
    const audio = peerAudioElements.get(socketId);
    if (audio) {
      audio.srcObject = null;
      peerAudioElements.delete(socketId);
    }
  }

  function setupSpeakingDetector(stream) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      audioAnalyser = audioCtx.createAnalyser();
      audioAnalyser.fftSize = 512;
      source.connect(audioAnalyser);

      const buffer = new Uint8Array(audioAnalyser.frequencyBinCount);
      let wasSpeaking = false;

      speechCheckInterval = setInterval(() => {
        if (!currentVoiceChannelId || isVoiceMuted) return;
        audioAnalyser.getByteFrequencyData(buffer);
        
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const average = sum / buffer.length;
        const isSpeaking = average > 25;

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          const myAvatar = document.getElementById(`v_avatar_${socket?.id}`);
          if (myAvatar) {
            if (isSpeaking) myAvatar.classList.add('speaking');
            else myAvatar.classList.remove('speaking');
          }
          if (socket && isConnectedToServer) {
            socket.emit('voice_speaking_state', { isSpeaking });
          }
        }
      }, 150);
    } catch (err) {
      console.warn('Speaking detector init error:', err);
    }
  }

  voiceMuteBtn?.addEventListener('click', () => {
    isVoiceMuted = !isVoiceMuted;
    if (localRawStream) {
      localRawStream.getAudioTracks().forEach(track => track.enabled = !isVoiceMuted);
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
    peerAudioElements.forEach(audio => audio.muted = isVoiceDeafened);
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

    if (socket && isConnectedToServer) {
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

    if (socket && isConnectedToServer) {
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

      if (socket && isConnectedToServer) {
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

  // UI RENDER HELPERS
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
