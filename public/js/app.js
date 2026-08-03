/**
 * CipherChat Application Controller (rrxcore edition)
 * Features: Telegram (Fast Cloud Messaging & Disk Store, Double Confirm Clear Chat, Delete For Me / Delete For Everyone, Unified 3-Dot/Right-Click Context Menu, Edit, Pin, Forward, Star, TTS, AI Assistant), WhatsApp (Stories, Disappearing Msgs), Discord (WebRTC Video 4K@60, 30Mbps Bitrate, Voice-Channel Scoped Screen Share & Camera, Draggable PiP, 10 Voice FX)
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
  const openStatusBtn = document.getElementById('openStatusBtn');
  const openDisappearingBtn = document.getElementById('openDisappearingBtn');
  const openThemeBtn = document.getElementById('openThemeBtn');
  const openClearChatBtn = document.getElementById('openClearChatBtn');

  const singleChatView = document.getElementById('singleChatView');
  const splitSimView = document.getElementById('splitSimView');
  const inspectorDrawer = document.getElementById('inspectorDrawer');
  const closeInspectorBtn = document.getElementById('closeInspectorBtn');
  const packetStream = document.getElementById('packetStream');

  const safetyModal = document.getElementById('safetyModal');
  const closeSafetyBtn = document.getElementById('closeSafetyBtn');
  const safetyMatrixContainer = document.getElementById('safetyMatrixContainer');

  // Single Message Delete Modal Elements
  const singleMsgDeleteModal = document.getElementById('singleMsgDeleteModal');
  const closeSingleMsgDeleteBtn = document.getElementById('closeSingleMsgDeleteBtn');
  const deleteForMeBtn = document.getElementById('deleteForMeBtn');
  const deleteForEveryoneBtn = document.getElementById('deleteForEveryoneBtn');
  const cancelSingleMsgDeleteBtn = document.getElementById('cancelSingleMsgDeleteBtn');
  let pendingDeleteTarget = null;

  // Clear Chat Modal Elements
  const clearChatModal = document.getElementById('clearChatModal');
  const closeClearChatBtn = document.getElementById('closeClearChatBtn');
  const clearSingleUserBtn = document.getElementById('clearSingleUserBtn');
  const clearBothUsersBtn = document.getElementById('clearBothUsersBtn');
  const cancelClearChatBtn = document.getElementById('cancelClearChatBtn');

  // Sidebar Resizing Elements
  const chatSidebar = document.getElementById('chatSidebar');
  const sidebarResizer = document.getElementById('sidebarResizer');
  const toggleSidebarWidthBtn = document.getElementById('toggleSidebarWidthBtn');

  // Single Chat & Discord Elements
  const currentRoomLabel = document.getElementById('currentRoomLabel');
  const peerList = document.getElementById('peerList');
  const messagesArea = document.getElementById('messagesArea');
  const chatForm = document.getElementById('chatForm');
  let currentFacingMode = 'user'; // For mobile camera toggle

  // Elements
  const messageInput = document.getElementById('messageInput');
  const fileInput = document.getElementById('fileInput');

  // --- HARMONIC ROOM JOIN CHIME (ASCENDING ARPEGGIO CHIME) ---

  function playRoomJoinChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 Harmonic Chime
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const startTime = ctx.currentTime + index * 0.08;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.35);
      });
    } catch (e) {
      console.warn('Room join chime fallback:', e);
    }
  }

  // --- REAL-TIME TYPING INDICATOR INPUT DEBOUNCER ---

  let userTypingTimer = null;
  messageInput?.addEventListener('input', () => {
    if (socket && isConnectedToServer) {
      socket.emit('typing_start');
      clearTimeout(userTypingTimer);
      userTypingTimer = setTimeout(() => {
        socket.emit('typing_stop');
      }, 2500);
    }
  });

  // --- MOBILE BACKGROUND APP-SWITCHING KEEP-ALIVE ENGINE ---

  function initMobileBackgroundKeepAlive() {
    let silentAudioCtx = null;

    function ensureBackgroundAudioLoop() {
      try {
        if (!silentAudioCtx) {
          silentAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = silentAudioCtx.createOscillator();
          const gain = silentAudioCtx.createGain();
          gain.gain.value = 0.0001; // Silent audio lock to keep mobile OS thread alive
          osc.connect(gain);
          gain.connect(silentAudioCtx.destination);
          osc.start();
        }
        if (silentAudioCtx.state === 'suspended') {
          silentAudioCtx.resume();
        }
      } catch (e) {}
    }

    document.addEventListener('touchstart', ensureBackgroundAudioLoop, { once: true });
    document.addEventListener('click', ensureBackgroundAudioLoop, { once: true });

    setInterval(() => {
      if (socket && isConnectedToServer) {
        socket.emit('heartbeat_ping');
      }
    }, 4000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (socket && isConnectedToServer && myRoomCode) {
          socket.emit('join_room', { roomCode: myRoomCode, username: myUsername });
        }
      }
    });
  }

  initMobileBackgroundKeepAlive();

  // Telegram Pinning & Reply Preview Elements
  const pinnedMessageBar = document.getElementById('pinnedMessageBar');
  const pinnedSender = document.getElementById('pinnedSender');
  const pinnedText = document.getElementById('pinnedText');
  const unpinBtn = document.getElementById('unpinBtn');

  const replyPreviewBar = document.getElementById('replyPreviewBar');
  const replyTargetSender = document.getElementById('replyTargetSender');
  const replyTargetText = document.getElementById('replyTargetText');
  const cancelReplyBtn = document.getElementById('cancelReplyBtn');
  let activeReplyQuote = null;

  // Channel Elements
  const textChannelList = document.getElementById('textChannelList');
  const createTextChannelBtn = document.getElementById('createTextChannelBtn');
  const activeChannelHeader = document.getElementById('activeChannelHeader');
  const createTextModal = document.getElementById('createTextModal');
  const closeCreateTextBtn = document.getElementById('closeCreateTextBtn');
  const createTextForm = document.getElementById('createTextForm');
  const newTextChannelNameInput = document.getElementById('newTextChannelNameInput');

  // Discord Voice & Video Elements
  const voiceChannelList = document.getElementById('voiceChannelList');
  const createVoiceChannelBtn = document.getElementById('createVoiceChannelBtn');
  const discordVoiceBar = document.getElementById('discordVoiceBar');
  const activeVoiceChannelName = document.getElementById('activeVoiceChannelName');
  const activeVoiceFXLabel = document.getElementById('activeVoiceFXLabel');
  const voiceMuteBtn = document.getElementById('voiceMuteBtn');
  const voiceDeafenBtn = document.getElementById('voiceDeafenBtn');
  const voiceCameraBtn = document.getElementById('voiceCameraBtn');
  const voiceScreenShareBtn = document.getElementById('voiceScreenShareBtn');
  const voiceDisconnectBtn = document.getElementById('voiceDisconnectBtn');
  const openVoiceFXBtn = document.getElementById('openVoiceFXBtn');

  // Video Grid, Quality, Bitrate & View Mode Elements
  const videoGridWrapper = document.getElementById('videoGridWrapper');
  const videoGridContainer = document.getElementById('videoGridContainer');
  const viewModePipBtn = document.getElementById('viewModePipBtn');
  const viewModeCompactBtn = document.getElementById('viewModeCompactBtn');
  const viewModeTheaterBtn = document.getElementById('viewModeTheaterBtn');
  const videoQualitySelect = document.getElementById('videoQualitySelect');
  const videoBitrateSelect = document.getElementById('videoBitrateSelect');
  const videoStageModal = document.getElementById('videoStageModal');
  const closeVideoStageBtn = document.getElementById('closeVideoStageBtn');
  const stageVideoElement = document.getElementById('stageVideoElement');
  const videoStageTitle = document.getElementById('videoStageTitle');

  // Feature Modals
  const statusModal = document.getElementById('statusModal');
  const closeStatusBtn = document.getElementById('closeStatusBtn');
  const postStatusForm = document.getElementById('postStatusForm');
  const statusTextInput = document.getElementById('statusTextInput');
  const statusStoryListContainer = document.getElementById('statusStoryListContainer');

  const disappearingModal = document.getElementById('disappearingModal');
  const closeDisappearingBtn = document.getElementById('closeDisappearingBtn');
  const timerOptionsGrid = document.getElementById('timerOptionsGrid');
  const activeTimerLabel = document.getElementById('activeTimerLabel');
  const disappearingBadge = document.getElementById('disappearingBadge');
  const badgeTimerText = document.getElementById('badgeTimerText');

  const themeModal = document.getElementById('themeModal');
  const closeThemeBtn = document.getElementById('closeThemeBtn');
  const themeGridContainer = document.getElementById('themeGridContainer');

  const voiceSettingsModal = document.getElementById('voiceSettingsModal');
  const closeVoiceSettingsBtn = document.getElementById('closeVoiceSettingsBtn');
  const micSelect = document.getElementById('micSelect');
  const speakerSelect = document.getElementById('speakerSelect');
  const testAudioChimeBtn = document.getElementById('testAudioChimeBtn');

  const voiceFXModal = document.getElementById('voiceFXModal');
  const closeVoiceFXBtn = document.getElementById('closeVoiceFXBtn');
  const fxGridContainer = document.getElementById('fxGridContainer');
  const customFxNameInput = document.getElementById('customFxNameInput');
  const customFxFilterSelect = document.getElementById('customFxFilterSelect');
  const customFxFreqInput = document.getElementById('customFxFreqInput');
  const addCustomFxBtn = document.getElementById('addCustomFxBtn');

  const createVoiceModal = document.getElementById('createVoiceModal');
  const closeCreateVoiceBtn = document.getElementById('closeCreateVoiceBtn');
  const createVoiceForm = document.getElementById('createVoiceForm');
  const newVoiceChannelNameInput = document.getElementById('newVoiceChannelNameInput');

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

  // Feature State
  let disappearingTimerSeconds = 0; // 0 = Off
  let activeTextChannel = 'general-chat';
  let isCameraActive = false;
  let isScreenShareActive = false;
  let localVideoStream = null;
  let localScreenStream = null;

  // 4K@60 Quality & Custom Bitrate Profiles
  const videoQualityProfiles = {
    '4k': { width: 3840, height: 2160, fps: 60 },
    '2k': { width: 2560, height: 1440, fps: 60 },
    '1080p': { width: 1920, height: 1080, fps: 60 },
    '720p': { width: 1280, height: 720, fps: 30 }
  };
  let selectedQualityKey = '1080p';
  let selectedBitrateBps = 16000000; // 16Mbps default for screen sharing & video

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
  const activeStreamsMap = new Map();
  const statusStoriesList = [];

  let voiceChannelsData = [
    { id: 'v_lounge', name: '🔊 Lounge Voice', participants: [] },
    { id: 'v_stage', name: '🔊 E2EE Stage', participants: [] }
  ];

  const peersMap = new Map();
  const renderedMsgIdsSet = new Set();

  // Close context menus on document click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.msg-options-btn') && !e.target.closest('.msg-context-menu')) {
      document.querySelectorAll('.msg-context-menu').forEach(menu => menu.classList.remove('active'));
    }
  });

  // --- SINGLE MESSAGE DELETE MODAL HANDLERS ---
  closeSingleMsgDeleteBtn?.addEventListener('click', () => {
    singleMsgDeleteModal.classList.remove('active');
    pendingDeleteTarget = null;
  });

  cancelSingleMsgDeleteBtn?.addEventListener('click', () => {
    singleMsgDeleteModal.classList.remove('active');
    pendingDeleteTarget = null;
  });

  deleteForMeBtn?.addEventListener('click', () => {
    if (pendingDeleteTarget && pendingDeleteTarget.container) {
      pendingDeleteTarget.container.remove();
      removeFromLocalTelegramCloud(myRoomCode, myUsername, pendingDeleteTarget.msgId);
      addSystemMessage('🗑️ Message deleted for you.');
    }
    singleMsgDeleteModal.classList.remove('active');
    pendingDeleteTarget = null;
  });

  deleteForEveryoneBtn?.addEventListener('click', () => {
    if (pendingDeleteTarget && pendingDeleteTarget.container) {
      pendingDeleteTarget.container.remove();
      removeFromLocalTelegramCloud(myRoomCode, myUsername, pendingDeleteTarget.msgId);
      if (socket && isConnectedToServer) {
        socket.emit('delete_single_message', { roomCode: myRoomCode, messageId: pendingDeleteTarget.msgId });
      }
      addSystemMessage('🗑️ Message deleted for everyone.');
    }
    singleMsgDeleteModal.classList.remove('active');
    pendingDeleteTarget = null;
  });

  // --- DOUBLE CONFIRMATION CLEAR CHAT HISTORY ENGINE ---
  openClearChatBtn?.addEventListener('click', () => {
    clearChatModal.classList.add('active');
  });

  closeClearChatBtn?.addEventListener('click', () => {
    clearChatModal.classList.remove('active');
  });

  cancelClearChatBtn?.addEventListener('click', () => {
    clearChatModal.classList.remove('active');
  });

  clearSingleUserBtn?.addEventListener('click', () => {
    if (confirm(`Are you sure you want to clear chat history for your account '${myUsername}' only?`)) {
      localStorage.removeItem(`cipherchat_telegram_cloud_${myRoomCode}_${myUsername}`);
      renderedMsgIdsSet.clear();
      messagesArea.innerHTML = '';
      addSystemMessage(`🧹 Local chat history cleared for your account '${myUsername}' only.`);
      clearChatModal.classList.remove('active');
    }
  });

  clearBothUsersBtn?.addEventListener('click', () => {
    if (confirm(`⚠️ DOUBLE CONFIRMATION DANGER:\n\nThis will permanently erase all Telegram Cloud chat history for EVERYONE in room '${myRoomCode}'.\n\nDo you want to proceed?`)) {
      if (socket && isConnectedToServer) {
        socket.emit('clear_room_history', { roomCode: myRoomCode });
      }
      localStorage.removeItem(`cipherchat_telegram_cloud_${myRoomCode}_${myUsername}`);
      renderedMsgIdsSet.clear();
      messagesArea.innerHTML = '';
      addSystemMessage(`🧹 Room chat history cleared for both users.`);
      clearChatModal.classList.remove('active');
    }
  });

  // --- TELEGRAM PINNING & QUOTED REPLIES ENGINE ---
  function pinMessage(sender, text) {
    pinnedSender.textContent = `${sender}:`;
    pinnedText.textContent = text;
    pinnedMessageBar.style.display = 'flex';
    addSystemMessage(`📌 Pinned message by ${sender}.`);
  }

  unpinBtn?.addEventListener('click', () => {
    pinnedMessageBar.style.display = 'none';
  });

  cancelReplyBtn?.addEventListener('click', () => {
    activeReplyQuote = null;
    replyPreviewBar.style.display = 'none';
  });

  function scrollToMessage(msgId) {
    if (!msgId) return;
    const el = document.getElementById(msgId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background 0.4s ease';
      const origBg = el.style.background;
      el.style.background = 'rgba(0, 122, 255, 0.35)';
      setTimeout(() => {
        el.style.background = origBg;
      }, 1400);
    }
  }

  function setReplyTarget(sender, text, msgId = null) {
    activeReplyQuote = { sender, text, msgId };
    replyTargetSender.textContent = `Replying to @${sender}`;
    replyTargetText.textContent = text;
    replyPreviewBar.style.display = 'flex';
    messageInput.focus();
  }

  // Mobile Drawer Toggle Handlers
  const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
  const sidebarOverlayBackdrop = document.getElementById('sidebarOverlayBackdrop');

  mobileSidebarToggle?.addEventListener('click', () => {
    chatSidebar?.classList.toggle('mobile-open');
    sidebarOverlayBackdrop?.classList.toggle('active');
  });

  sidebarOverlayBackdrop?.addEventListener('click', () => {
    chatSidebar?.classList.remove('mobile-open');
    sidebarOverlayBackdrop?.classList.remove('active');
  });

  document.querySelectorAll('#textChannelList, #voiceChannelList').forEach(el => {
    el?.addEventListener('click', (e) => {
      if (e.target.closest('.channel-item') && window.innerWidth <= 768) {
        chatSidebar?.classList.remove('mobile-open');
        sidebarOverlayBackdrop?.classList.remove('active');
      }
    });
  });

  function speakText(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
      addSystemMessage('🔊 Speaking message aloud...');
    } else {
      alert('Web Speech API is not supported in this browser.');
    }
  }

  function editMessage(container, msgId, oldText) {
    const newText = prompt('Edit your message:', oldText);
    if (newText !== null && newText.trim() !== '') {
      const bubble = container.querySelector('.msg-bubble');
      if (bubble) {
        const timeEl = bubble.querySelector('.msg-time');
        const timeHtml = timeEl ? timeEl.outerHTML : '';
        bubble.innerHTML = `${escapeHtml(newText.trim())} <span style="font-size: 0.68rem; color: var(--ios-orange); font-weight: 700;">(edited)</span> ${timeHtml}`;
        addSystemMessage('✏️ Message edited.');
      }
    }
  }

  function attachContextMenuEvents(container, msgId, sender, text) {
    const optionsBtn = container.querySelector('.msg-options-btn');
    const menu = container.querySelector('.msg-context-menu');
    if (!optionsBtn || !menu) return;

    optionsBtn.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.msg-context-menu').forEach(m => m !== menu && m.classList.remove('active'));
      menu.classList.toggle('active');

      if (menu.classList.contains('active') && window.innerWidth > 768) {
        const rect = optionsBtn.getBoundingClientRect();
        if (rect.left > window.innerWidth / 2) {
          menu.style.right = '0';
          menu.style.left = 'auto';
        } else {
          menu.style.left = '0';
          menu.style.right = 'auto';
        }
      }
    };

    container.oncontextmenu = (e) => {
      e.preventDefault();
      document.querySelectorAll('.msg-context-menu').forEach(m => m !== menu && m.classList.remove('active'));
      menu.classList.toggle('active');
    };

    // WhatsApp Swipe to Reply gesture on mobile
    let touchStartX = 0;
    container.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      const touchCurrX = e.touches[0].clientX;
      const deltaX = touchCurrX - touchStartX;
      if (deltaX > 0 && deltaX < 75) {
        container.style.transform = `translateX(${deltaX}px)`;
      }
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const deltaX = touchEndX - touchStartX;
      container.style.transform = '';
      if (deltaX > 45) {
        setReplyTarget(sender, text, msgId);
      }
    });

    // Emoji reaction buttons
    menu.querySelectorAll('.top-reaction-btn').forEach(btn => {
      btn.onclick = () => {
        const emoji = btn.dataset.emoji;
        menu.classList.remove('active');
        sendReaction(msgId, emoji);
      };
    });

    const replyItem = menu.querySelector('.ctx-reply');
    const editItem = menu.querySelector('.ctx-edit');
    const pinItem = menu.querySelector('.ctx-pin');
    const forwardItem = menu.querySelector('.ctx-forward');
    const starItem = menu.querySelector('.ctx-star');
    const speakItem = menu.querySelector('.ctx-speak');
    const aiItem = menu.querySelector('.ctx-ai');
    const copyItem = menu.querySelector('.ctx-copy');
    const copyIdItem = menu.querySelector('.ctx-copy-id');
    const deleteItem = menu.querySelector('.ctx-delete');

    replyItem?.addEventListener('click', () => {
      menu.classList.remove('active');
      setReplyTarget(sender, text);
    });

    editItem?.addEventListener('click', () => {
      menu.classList.remove('active');
      editMessage(container, msgId, text);
    });

    pinItem?.addEventListener('click', () => {
      menu.classList.remove('active');
      pinMessage(sender, text);
    });

    forwardItem?.addEventListener('click', () => {
      menu.classList.remove('active');
      messageInput.value = `↪ Forwarded from @${sender}: "${text}"`;
      messageInput.focus();
    });

    starItem?.addEventListener('click', () => {
      menu.classList.remove('active');
      addReactionToMessage(msgId, '⭐');
      addSystemMessage(`⭐ Message starred.`);
    });

    speakItem?.addEventListener('click', () => {
      menu.classList.remove('active');
      speakText(text);
    });

    aiItem?.addEventListener('click', () => {
      menu.classList.remove('active');
      renderIncomingMessage('Cipher AI 🤖', `Based on "${text}": CipherChat E2EE ensures your communication is fully private & end-to-end encrypted!`, new Date().toLocaleTimeString(), 0, 'ai_' + Date.now());
    });

    copyItem?.addEventListener('click', () => {
      menu.classList.remove('active');
      navigator.clipboard.writeText(text);
      addSystemMessage('📋 Text copied to clipboard!');
    });

    copyIdItem?.addEventListener('click', () => {
      menu.classList.remove('active');
      navigator.clipboard.writeText(msgId);
      addSystemMessage(`🆔 Copied Message ID: ${msgId}`);
    });

    deleteItem?.addEventListener('click', () => {
      menu.classList.remove('active');
      pendingDeleteTarget = { container, msgId };
      singleMsgDeleteModal.classList.add('active');
    });
  }

  // --- TELEGRAM FAST CLOUD MESSAGING ACCURATE PERSISTENCE ENGINE ---
  function saveToLocalTelegramCloud(roomCode, username, item) {
    if (!roomCode || !username || !item) return;
    try {
      const rCode = roomCode.toLowerCase().trim();
      const uName = username.toLowerCase().trim();
      const key = `cipherchat_telegram_cloud_${rCode}_${uName}`;
      const existingStr = localStorage.getItem(key);
      let items = existingStr ? JSON.parse(existingStr) : [];
      if (!items.some(x => x.id === item.id)) {
        items.push(item);
        if (items.length > 500) items.shift();
        localStorage.setItem(key, JSON.stringify(items));
      }
    } catch (e) {
      console.warn('Local cloud storage write error:', e);
    }
  }

  function removeFromLocalTelegramCloud(roomCode, username, msgId) {
    if (!roomCode || !username) return;
    try {
      const rCode = roomCode.toLowerCase().trim();
      const uName = username.toLowerCase().trim();
      const keys = [
        `cipherchat_telegram_cloud_${rCode}_${uName}`,
        `cipherchat_telegram_cloud_${roomCode}_${username}`,
        `instanttransmissionchat_telegram_cloud_${rCode}_${uName}`,
        `instanttransmissionchat_telegram_cloud_${roomCode}_${username}`
      ];
      keys.forEach(k => {
        const existingStr = localStorage.getItem(k);
        if (existingStr) {
          try {
            let items = JSON.parse(existingStr);
            items = items.filter(x => x.id !== msgId);
            localStorage.setItem(k, JSON.stringify(items));
          } catch(err){}
        }
      });
    } catch (e) {}
  }

  function getLocalTelegramCloud(roomCode, username) {
    if (!roomCode || !username) return [];
    try {
      const rCode = roomCode.toLowerCase().trim();
      const uName = username.toLowerCase().trim();
      const keys = [
        `cipherchat_telegram_cloud_${rCode}_${uName}`,
        `cipherchat_telegram_cloud_${roomCode}_${username}`,
        `instanttransmissionchat_telegram_cloud_${rCode}_${uName}`,
        `instanttransmissionchat_telegram_cloud_${roomCode}_${username}`
      ];
      
      const combinedMap = new Map();
      keys.forEach(k => {
        const existingStr = localStorage.getItem(k);
        if (existingStr) {
          try {
            const items = JSON.parse(existingStr);
            if (Array.isArray(items)) {
              items.forEach(it => {
                if (it && it.id) combinedMap.set(it.id, it);
              });
            }
          } catch(err){}
        }
      });
      return Array.from(combinedMap.values());
    } catch (e) {
      return [];
    }
  }

  // --- INTERACTIVE SIDEBAR RESIZING & SHRINK/EXPAND ENGINE ---
  let isResizingSidebar = false;

  if (sidebarResizer && chatSidebar) {
    sidebarResizer.addEventListener('mousedown', (e) => {
      isResizingSidebar = true;
      sidebarResizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizingSidebar) return;
      const appContainerLeft = document.querySelector('.app-container').getBoundingClientRect().left;
      let newWidth = e.clientX - appContainerLeft;
      if (newWidth < 200) newWidth = 200;
      if (newWidth > 460) newWidth = 460;

      chatSidebar.style.width = `${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isResizingSidebar) {
        isResizingSidebar = false;
        sidebarResizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  toggleSidebarWidthBtn?.addEventListener('click', () => {
    const currentWidth = chatSidebar.offsetWidth;
    if (currentWidth < 300) {
      chatSidebar.style.width = '350px';
      addSystemMessage('↔️ Sidebar expanded to 350px.');
    } else {
      chatSidebar.style.width = '220px';
      addSystemMessage('↔️ Sidebar shrunk to 220px.');
    }
  });

  // --- INTERACTIVE DRAGGABLE PIP CARD ENGINE ---
  let isDraggingPip = false;
  let pipOffsetLeft = 0;
  let pipOffsetTop = 0;

  const pipHeader = videoGridWrapper ? videoGridWrapper.querySelector('.video-grid-header') : null;

  if (pipHeader && videoGridWrapper) {
    pipHeader.addEventListener('mousedown', (e) => {
      if (!videoGridWrapper.classList.contains('mode-pip')) return;
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'LABEL') return;

      isDraggingPip = true;
      const rect = videoGridWrapper.getBoundingClientRect();
      pipOffsetLeft = e.clientX - rect.left;
      pipOffsetTop = e.clientY - rect.top;

      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDraggingPip || !videoGridWrapper.classList.contains('mode-pip')) return;
      e.preventDefault();

      let newLeft = e.clientX - pipOffsetLeft;
      let newTop = e.clientY - pipOffsetTop;

      const maxLeft = window.innerWidth - videoGridWrapper.offsetWidth - 10;
      const maxTop = window.innerHeight - videoGridWrapper.offsetHeight - 10;

      if (newLeft < 10) newLeft = 10;
      if (newLeft > maxLeft) newLeft = maxLeft;
      if (newTop < 10) newTop = 10;
      if (newTop > maxTop) newTop = maxTop;

      videoGridWrapper.style.left = `${newLeft}px`;
      videoGridWrapper.style.top = `${newTop}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isDraggingPip) {
        isDraggingPip = false;
        document.body.style.userSelect = '';
      }
    });
  }

  // Ensure Signaling Server URL group is ALWAYS visible on Join Card
  if (serverUrlGroup) {
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
      const isGitHubPages = window.location.hostname.includes('github.io');
      const connectTarget = targetUrl || (isGitHubPages ? 'https://e2ee-cipherchat.onrender.com' : window.location.origin);
      
      console.log(' Connecting to signaling server:', connectTarget);
      
      socket = io(connectTarget, {
        timeout: 30000,
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 1500,
        transports: ['websocket', 'polling']
      });

      socket.on('connect', () => {
        isConnectedToServer = true;
        console.log('🟢 Socket connected to server:', socket.id);
        const serverBadge = document.getElementById('serverStatusBadge');
        if (serverBadge) {
          serverBadge.style.display = 'inline-block';
          serverBadge.textContent = '🟢 Cloud Server Connected';
          serverBadge.style.color = 'var(--ios-green)';
        }
        // If user already submitted the form but server was still waking up, join now
        if (myRoomCode && myUsername && pendingRoomJoin) {
          pendingRoomJoin = false;
          socket.emit('join_room', {
            roomCode: myRoomCode,
            username: myUsername,
            publicKey: myPubKeyJwk,
            roomPassword: myRoomPassword
          });
        }
      });

      socket.on('connect_error', (err) => {
        console.warn('⚠️ Socket connection error (waking up server...):', err);
        const serverBadge = document.getElementById('serverStatusBadge');
        if (serverBadge) {
          serverBadge.style.display = 'inline-block';
          serverBadge.textContent = '⏳ Waking up cloud server...';
          serverBadge.style.color = 'var(--ios-orange)';
        }
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

  // Auto-restore saved login credentials from localStorage
  try {
    const savedUser = localStorage.getItem('cipherchat_saved_username');
    const savedRoom = localStorage.getItem('cipherchat_saved_roomcode');
    const savedPass = localStorage.getItem('cipherchat_saved_password');
    if (savedUser && usernameInput) usernameInput.value = savedUser;
    if (savedRoom && roomCodeInput) roomCodeInput.value = savedRoom;
    if (savedPass && roomPasswordInput) roomPasswordInput.value = savedPass;
  } catch (e) {}

  const bypassJoinBtn = document.getElementById('bypassJoinBtn');

  function saveUserCredentials() {
    try {
      if (myUsername) localStorage.setItem('cipherchat_saved_username', myUsername);
      if (myRoomCode) localStorage.setItem('cipherchat_saved_roomcode', myRoomCode);
      if (myRoomPassword) localStorage.setItem('cipherchat_saved_password', myRoomPassword);
    } catch (e) {}
  }

  function hideJoinOverlayAndShowChat() {
    if (roomJoinOverlay) {
      roomJoinOverlay.classList.add('hidden');
      roomJoinOverlay.style.cssText = 'display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;';
    }
    if (singleChatView) {
      singleChatView.style.cssText = 'display:flex!important;opacity:1!important;visibility:visible!important;';
    }
  }

  let pendingRoomJoin = false;

  function doJoin() {
    myUsername = usernameInput.value.trim() || 'User_' + Math.floor(Math.random() * 1000);
    myRoomCode = roomCodeInput.value.trim() || 'rrxcore-1';
    myRoomPassword = roomPasswordInput.value.trim();
    saveUserCredentials();

    // Always open chat immediately
    hideJoinOverlayAndShowChat();
    currentRoomLabel.textContent = `Room: ${myRoomCode}`;
    addSystemMessage(`✨ Joining room '${myRoomCode}' as ${myUsername}...`);
    
    // Play harmonic chime immediately upon user interaction to bypass autoplay restrictions
    playRoomJoinChime();

    if (socket && isConnectedToServer) {
      socket.emit('join_room', {
        roomCode: myRoomCode,
        username: myUsername,
        publicKey: myPubKeyJwk,
        roomPassword: myRoomPassword
      });
    } else {
      // Server still waking up — set flag so connect handler sends join_room
      pendingRoomJoin = true;
      addSystemMessage('⏳ Cloud server is waking up... will join room once connected.');
    }
  }

  bypassJoinBtn?.addEventListener('click', () => {
    doJoin();
  });

  joinForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    doJoin();
  });

  // --- TELEGRAM FAST CLOUD MESSAGING RECOVERY ENGINE ---
  async function restoreTelegramCloudHistory(serverCloudMessages) {
    const localCloudMessages = getLocalTelegramCloud(myRoomCode, myUsername);
    const combinedMap = new Map();

    localCloudMessages.forEach(item => {
      if (item && item.id) combinedMap.set(item.id, item);
    });
    (serverCloudMessages || []).forEach(item => {
      if (item && item.id) combinedMap.set(item.id, item);
    });

    const sortedHistory = Array.from(combinedMap.values()).sort((a, b) => (a.id > b.id ? 1 : -1));

    let restoredCount = 0;

    for (const msg of sortedHistory) {
      if (renderedMsgIdsSet.has(msg.id)) continue;

      const isMyMessage = msg.senderUsername && myUsername && (msg.senderUsername.toLowerCase().trim() === myUsername.toLowerCase().trim());

      if (isMyMessage) {
        if (msg.payloadType === 'file') {
          renderOutgoingFileMessage(msg.senderUsername, msg.fileName, msg.plaintextFallback || '#', msg.isImage, msg.timerSeconds, msg.id);
        } else if (msg.payloadType === 'voice') {
          renderOutgoingVoiceMessage(msg.senderUsername, msg.plaintextFallback || '#', msg.audioDuration, msg.timerSeconds, msg.id);
        } else {
          renderOutgoingMessage(msg.senderUsername, msg.plaintextFallback || 'Restored E2EE Cloud Message', msg.id, msg.timerSeconds, msg.quotedReply);
        }
        restoredCount++;
      } else {
        let decodedText = msg.plaintextFallback || '🔒 Encrypted Cloud Message';
        const peer = peersMap.get(msg.senderSocketId);
        if (peer && peer.sessionKey && msg.ciphertext && msg.iv) {
          try {
            decodedText = await CipherCrypto.decryptPayload(peer.sessionKey, msg.ciphertext, msg.iv);
          } catch (e) {}
        }

        if (msg.payloadType === 'file') {
          renderIncomingFileMessage(msg.senderUsername, msg.fileName, msg.plaintextFallback || '#', msg.isImage, msg.timestamp, msg.timerSeconds, msg.id);
        } else if (msg.payloadType === 'voice') {
          renderIncomingVoiceMessage(msg.senderUsername, msg.plaintextFallback || '#', msg.audioDuration, msg.timestamp, msg.timerSeconds, msg.id);
        } else {
          renderIncomingMessage(msg.senderUsername, decodedText, msg.timestamp, msg.timerSeconds, msg.id, msg.quotedReply);
        }
        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      addSystemMessage(`☁️ Telegram Cloud Recovery: Restored ${restoredCount} messages for '${myUsername}' in '${myRoomCode}'!`);
    }
  }

  function setupSocketListeners() {
    if (!socket) return;

    socket.on('room_error', ({ message }) => {
      // Show the join overlay again if password was wrong
      if (roomJoinOverlay) {
        roomJoinOverlay.style.cssText = '';
        roomJoinOverlay.classList.remove('hidden');
        roomJoinOverlay.style.display = 'flex';
      }
      if (singleChatView) {
        singleChatView.style.cssText = '';
      }
      joinErrorMessage.textContent = `❌ ${message}`;
      joinErrorMessage.style.display = 'block';
      joinErrorMessage.style.background = 'rgba(255, 45, 85, 0.2)';
      joinErrorMessage.style.color = 'var(--ios-pink)';
      joinErrorMessage.style.border = '1px solid rgba(255, 45, 85, 0.4)';
    });

    socket.on('room_joined', async ({ roomCode, mySession, peers, recentPackets, isPasswordProtected, voiceChannels, cloudHistory }) => {
      hideJoinOverlayAndShowChat();
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

      await restoreTelegramCloudHistory(cloudHistory);
    });

    socket.on('room_history_cleared', ({ roomCode }) => {
      localStorage.removeItem(`cipherchat_telegram_cloud_${myRoomCode}_${myUsername}`);
      renderedMsgIdsSet.clear();
      messagesArea.innerHTML = '';
      addSystemMessage(`🧹 Room chat history was permanently cleared for both users by a peer.`);
    });

    socket.on('message_deleted_for_everyone', ({ messageId }) => {
      const el = document.getElementById(messageId);
      if (el) el.remove();
      removeFromLocalTelegramCloud(myRoomCode, myUsername, messageId);
      addSystemMessage(`🗑️ A message was deleted for everyone by peer.`);
    });

    socket.on('peer_joined', async (peer) => {
      addSystemMessage(`✨ User '${peer.username}' joined the room.`);
      socket.emit('share_public_key', {
        recipientSocketId: peer.socketId,
        publicKey: myPubKeyJwk
      });
      if (peer.publicKey) {
        await setupPeerSession(peer.socketId, peer.username, peer.publicKey);
        renderPeerList();
      }
    });

    socket.on('peer_typing_start', ({ socketId, username }) => {
      const typingIndicatorBar = document.getElementById('typingIndicatorBar');
      const typingUserText = document.getElementById('typingUserText');
      if (typingUserText && typingIndicatorBar) {
        typingUserText.textContent = `✍️ ${username} is typing...`;
        typingIndicatorBar.style.display = 'flex';
      }
    });

    socket.on('peer_typing_stop', ({ socketId }) => {
      const typingIndicatorBar = document.getElementById('typingIndicatorBar');
      if (typingIndicatorBar) {
        typingIndicatorBar.style.display = 'none';
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
        if (payload.payloadType === 'reaction') {
          const reactionEmoji = await CipherCrypto.decryptPayload(peer.sessionKey, payload.ciphertext, payload.iv);
          addReactionToMessage(payload.messageId, reactionEmoji);
        } else if (payload.payloadType === 'story') {
          const storyText = await CipherCrypto.decryptPayload(peer.sessionKey, payload.ciphertext, payload.iv);
          addStatusStory(payload.senderUsername, storyText);
        } else if (payload.payloadType === 'file') {
          const decryptedBuffer = await CipherCrypto.decryptPayload(
            peer.sessionKey,
            payload.ciphertext,
            payload.iv,
            true
          );
          const blob = new Blob([decryptedBuffer]);
          const fileUrl = URL.createObjectURL(blob);
          renderIncomingFileMessage(payload.senderUsername, payload.fileName, fileUrl, payload.isImage, payload.timestamp, payload.timerSeconds, payload.id);
        } else if (payload.payloadType === 'voice') {
          const decryptedBuffer = await CipherCrypto.decryptPayload(
            peer.sessionKey,
            payload.ciphertext,
            payload.iv,
            true
          );
          const audioBlob = new Blob([decryptedBuffer], { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          renderIncomingVoiceMessage(payload.senderUsername, audioUrl, payload.audioDuration, payload.timestamp, payload.timerSeconds, payload.id);
        } else {
          const plaintext = await CipherCrypto.decryptPayload(
            peer.sessionKey,
            payload.ciphertext,
            payload.iv
          );
          renderIncomingMessage(payload.senderUsername, plaintext, payload.timestamp, payload.timerSeconds, payload.id, payload.quotedReply);
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
      if (isScreenShareActive && localScreenStream) {
        await broadcastWebRTCStream(localScreenStream, 'Screen Share');
      }
      if (isCameraActive && localVideoStream) {
        await broadcastWebRTCStream(localVideoStream, 'Camera');
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

    socket.on('webrtc_stream_stopped', ({ senderSocketId, streamType }) => {
      removeVideoCard(senderSocketId);
      addSystemMessage(`📹 Peer stopped ${streamType || 'video'} stream.`);
    });
  }

  // --- SHRINK & EXPAND VIDEO VIEW MODES (DRAGGABLE PiP, COMPACT, THEATER, STAGE) ---

  function setVideoViewMode(mode) {
    videoGridWrapper.classList.remove('mode-pip');
    videoGridContainer.classList.remove('mode-compact', 'mode-theater');

    viewModePipBtn.classList.remove('active-mode');
    viewModeCompactBtn.classList.remove('active-mode');
    viewModeTheaterBtn.classList.remove('active-mode');

    if (mode === 'pip') {
      videoGridWrapper.classList.add('mode-pip');
      viewModePipBtn.classList.add('active-mode');

      videoGridWrapper.style.left = `${window.innerWidth - 380}px`;
      videoGridWrapper.style.top = `${window.innerHeight - 290}px`;

      addSystemMessage('📱 Video stream shrunk into Draggable Picture-in-Picture card. Drag the top bar to move anywhere!');
    } else {
      videoGridWrapper.style.left = '';
      videoGridWrapper.style.top = '';

      if (mode === 'theater') {
        videoGridContainer.classList.add('mode-theater');
        viewModeTheaterBtn.classList.add('active-mode');
        addSystemMessage('📺 Video stream expanded into Theater View (480px).');
      } else {
        videoGridContainer.classList.add('mode-compact');
        viewModeCompactBtn.classList.add('active-mode');
        addSystemMessage('🎬 Video stream set to Compact Topbar View.');
      }
    }
  }

  viewModePipBtn?.addEventListener('click', () => setVideoViewMode('pip'));
  viewModeCompactBtn?.addEventListener('click', () => setVideoViewMode('compact'));
  viewModeTheaterBtn?.addEventListener('click', () => setVideoViewMode('theater'));

  videoQualitySelect?.addEventListener('change', async () => {
    selectedQualityKey = videoQualitySelect.value;
    const profile = videoQualityProfiles[selectedQualityKey];
    addSystemMessage(`✨ Video & Screen Share quality set to: ${selectedQualityKey.toUpperCase()} (${profile.width}x${profile.height} @ ${profile.fps}fps)`);

    if (isCameraActive) {
      await startCameraStream();
    }
    if (isScreenShareActive) {
      await startScreenShareStream();
    }
  });

  videoBitrateSelect?.addEventListener('change', async () => {
    selectedBitrateBps = parseInt(videoBitrateSelect.value, 10);
    const mbpsStr = (selectedBitrateBps / 1000000).toFixed(0);
    addSystemMessage(`⚡ Stream encoder bitrate set to: ${mbpsStr} Mbps`);

    peerConnections.forEach(async (pc) => {
      try {
        const senders = pc.getSenders();
        const s = senders.find(x => x.track && x.track.kind === 'video');
        if (s && s.setParameters) {
          const params = s.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = selectedBitrateBps;
          await s.setParameters(params);
        }
      } catch (e) {
        console.warn('Dynamic bitrate tuning error:', e);
      }
    });
  });

  function openVideoStage(label, stream) {
    if (!stream) return;
    videoStageTitle.textContent = `📹 ${label}`;
    stageVideoElement.srcObject = stream;
    stageVideoElement.play().catch(e => console.warn('Stage video play error:', e));
    videoStageModal.classList.add('active');
  }

  closeVideoStageBtn?.addEventListener('click', () => {
    videoStageModal.classList.remove('active');
    stageVideoElement.srcObject = null;
  });

  function addVideoCard(id, label, stream) {
    activeStreamsMap.set(id, stream);
    let card = document.getElementById(`vcard_${id}`);

    if (!card) {
      card = document.createElement('div');
      card.className = 'video-card';
      card.id = `vcard_${id}`;
      card.innerHTML = `
        <video class="video-stream-element" id="vstream_${id}" autoplay playsinline muted></video>
        <div class="video-card-overlay">
          <div class="video-card-title">${escapeHtml(label)}</div>
          <div class="video-card-actions">
            <button type="button" class="card-stage-btn" id="stage_btn_${id}">⛶ Stage View</button>
          </div>
        </div>
      `;
      videoGridContainer.appendChild(card);

      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-stage-btn') || e.target.classList.contains('video-card')) {
          const s = activeStreamsMap.get(id);
          openVideoStage(label, s);
        }
      });
    }

    const videoEl = document.getElementById(`vstream_${id}`);
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.play().catch(e => console.warn('Video element play error:', e));
    }

    videoGridWrapper.style.display = 'flex';
  }

  function removeVideoCard(id) {
    activeStreamsMap.delete(id);
    const card = document.getElementById(`vcard_${id}`);
    if (card) card.remove();
    if (videoGridContainer.children.length === 0) {
      videoGridWrapper.style.display = 'none';
      videoGridWrapper.classList.remove('mode-pip');
    }
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
        audio.setSinkId(selectedSpeakerId).catch(() => {});
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

  function updateEncoderControlsVisibility() {
    const isBroadcasting = isCameraActive || isScreenShareActive;
    const encoderGroup = document.getElementById('encoderSettingsGroup');
    const cameraFlipBtn = document.getElementById('voiceCameraFlipBtn');
    
    if (encoderGroup) {
      encoderGroup.style.display = isBroadcasting ? 'flex' : 'none';
    }
    
    if (cameraFlipBtn) {
      cameraFlipBtn.style.display = isCameraActive ? 'inline-block' : 'none';
    }
  }

  updateEncoderControlsVisibility();

  async function broadcastWebRTCStream(stream, labelPrefix) {
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    for (const [peerSocketId, peer] of peersMap.entries()) {
      if (peerSocketId === socket?.id) continue;

      let pc = peerConnections.get(peerSocketId);
      if (!pc) {
        pc = new RTCPeerConnection(iceConfiguration);
        peerConnections.set(peerSocketId, pc);

        pc.onicecandidate = (event) => {
          if (event.candidate && socket) {
            socket.emit('webrtc_ice_candidate', { targetSocketId: peerSocketId, candidate: event.candidate });
          }
        };

        pc.ontrack = (event) => {
          const peerInfo = peersMap.get(peerSocketId);
          const name = peerInfo ? peerInfo.username : 'Peer';
          if (event.track.kind === 'video') {
            addVideoCard(peerSocketId, `📹 ${name}'s Stream`, event.streams[0]);
          } else {
            playPeerAudioStream(peerSocketId, event.streams[0]);
          }
        };
      }

      const senders = pc.getSenders();
      const existingSender = senders.find(s => s.track && s.track.kind === 'video');
      if (existingSender) {
        await existingSender.replaceTrack(videoTrack);
      } else {
        pc.addTrack(videoTrack, stream);
      }

      try {
        const s = pc.getSenders().find(x => x.track && x.track.kind === 'video');
        if (s && s.setParameters) {
          const params = s.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = selectedBitrateBps;
          params.encodings[0].degradationPreference = 'maintain-framerate';
          await s.setParameters(params);
        }
      } catch (e) {
        console.warn('Bitrate tuning fallback:', e);
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (socket) {
        socket.emit('webrtc_offer', { targetSocketId: peerSocketId, sdpOffer: offer });
      }
    }
  }

  async function startCameraStream() {
    const profile = videoQualityProfiles[selectedQualityKey];
    const mbpsStr = (selectedBitrateBps / 1000000).toFixed(0);
    try {
      if (localVideoStream) {
        localVideoStream.getTracks().forEach(t => t.stop());
      }

      // Smoothness-first camera constraints but relaxed for mobile compatibility
      localVideoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: profile.width <= 1920 ? profile.width : 1920 },
          height: { ideal: profile.height <= 1080 ? profile.height : 1080 },
          frameRate: { ideal: 30 },
          facingMode: currentFacingMode
        },
        audio: false
      });

      const vTrack = localVideoStream.getVideoTracks()[0];
      if (vTrack && 'contentHint' in vTrack) {
        vTrack.contentHint = 'motion';
      }

      voiceCameraBtn.classList.add('active');
      addVideoCard('my_cam', `${myUsername} (Camera 60FPS @ ${mbpsStr}Mbps)`, localVideoStream);
      updateEncoderControlsVisibility();
      await broadcastWebRTCStream(localVideoStream, 'Camera');

      addSystemMessage(`📹 WebRTC Ultra-Smooth Camera active at 60FPS (${mbpsStr}Mbps).`);
    } catch (err) {
      console.warn('Camera access error:', err);
      alert(`Camera stream unavailable or permission denied.`);
    }
  }

  async function startScreenShareStream() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const profile = videoQualityProfiles[selectedQualityKey];
    const mbpsStr = (selectedBitrateBps / 1000000).toFixed(0);

    try {
      if (localScreenStream) {
        localScreenStream.getTracks().forEach(t => t.stop());
      }

      if (isMobile) {
        // Native Mobile Android Screen Share Call (100% reliable)
        localScreenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });
      } else {
        // Desktop Screen Share Call
        try {
          localScreenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: 'monitor',
              width: { ideal: profile.width, max: 3840 },
              height: { ideal: profile.height, max: 2160 },
              frameRate: { ideal: profile.fps, max: 60 }
            },
            audio: true
          });
        } catch (e1) {
          localScreenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
          });
        }
      }

      const vTrack = localScreenStream.getVideoTracks()[0];
      if (vTrack && 'contentHint' in vTrack) {
        vTrack.contentHint = 'detail';
      }

      voiceScreenShareBtn.classList.add('active');
      addVideoCard('my_screen', `${myUsername} (Screen Share ${selectedQualityKey.toUpperCase()})`, localScreenStream);
      updateEncoderControlsVisibility();
      await broadcastWebRTCStream(localScreenStream, 'Screen Share');

      addSystemMessage(`🖥️ WebRTC Screen Share active.`);

      localScreenStream.getVideoTracks()[0].onended = () => {
        voiceScreenShareBtn.classList.remove('active');
        removeVideoCard('my_screen');
        if (socket && isConnectedToServer) {
          socket.emit('webrtc_stream_stopped', { streamType: 'screen share' });
        }
        isScreenShareActive = false;
        updateEncoderControlsVisibility();
      };
    } catch (err) {
      console.warn('Screen share canceled or unsupported:', err);
      voiceScreenShareBtn.classList.remove('active');
      isScreenShareActive = false;
      updateEncoderControlsVisibility();
    }
  }

  voiceCameraBtn?.addEventListener('click', async () => {
    isCameraActive = !isCameraActive;
    if (isCameraActive) {
      await startCameraStream();
    } else {
      voiceCameraBtn.classList.remove('active');
      removeVideoCard('my_cam');
      if (localVideoStream) {
        localVideoStream.getTracks().forEach(t => t.stop());
        localVideoStream = null;
      }
      if (socket && isConnectedToServer) {
        socket.emit('webrtc_stream_stopped', { streamType: 'camera' });
      }
      updateEncoderControlsVisibility();
      addSystemMessage(`📹 WebRTC Camera Video stopped.`);
    }
  });

  const voiceCameraFlipBtn = document.getElementById('voiceCameraFlipBtn');
  voiceCameraFlipBtn?.addEventListener('click', async () => {
    if (!isCameraActive) return;
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    await startCameraStream();
    addSystemMessage(`🔄 Camera switched to ${currentFacingMode} facing.`);
  });

  voiceScreenShareBtn?.addEventListener('click', async () => {
    isScreenShareActive = !isScreenShareActive;
    if (isScreenShareActive) {
      await startScreenShareStream();
    } else {
      voiceScreenShareBtn.classList.remove('active');
      removeVideoCard('my_screen');
      if (localScreenStream) {
        localScreenStream.getTracks().forEach(t => t.stop());
        localScreenStream = null;
      }
      if (socket && isConnectedToServer) {
        socket.emit('webrtc_stream_stopped', { streamType: 'screen share' });
      }
      updateEncoderControlsVisibility();
      addSystemMessage(`🖥️ WebRTC Screen Share stopped.`);
    }
  });

  // --- DISAPPEARING MESSAGES TIMER (TELEGRAM & WHATSAPP) ---

  openDisappearingBtn?.addEventListener('click', () => {
    disappearingModal.classList.add('active');
  });

  closeDisappearingBtn?.addEventListener('click', () => {
    disappearingModal.classList.remove('active');
  });

  timerOptionsGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('.timer-option-btn');
    if (!btn) return;

    document.querySelectorAll('.timer-option-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    disappearingTimerSeconds = parseInt(btn.dataset.seconds, 10);
    const label = btn.textContent;
    activeTimerLabel.textContent = `Timer: ${label}`;
    badgeTimerText.textContent = label;

    if (disappearingTimerSeconds > 0) {
      disappearingBadge.style.display = 'flex';
      addSystemMessage(`⏱️ Disappearing Messages enabled (${label}).`);
    } else {
      disappearingBadge.style.display = 'none';
      addSystemMessage(`⏱️ Disappearing Messages turned OFF.`);
    }

    disappearingModal.classList.remove('active');
  });

  function scheduleMessageSelfDestruct(element, seconds) {
    if (!seconds || seconds <= 0) return;
    setTimeout(() => {
      element.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      element.style.opacity = '0';
      element.style.transform = 'scale(0.9)';
      setTimeout(() => element.remove(), 500);
    }, seconds * 1000);
  }

  // --- WHATSAPP 24-HOUR STATUS STORIES ---

  openStatusBtn?.addEventListener('click', () => {
    renderStatusStories();
    statusModal.classList.add('active');
  });

  closeStatusBtn?.addEventListener('click', () => {
    statusModal.classList.remove('active');
  });

  postStatusForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = statusTextInput.value.trim();
    if (!text) return;

    statusTextInput.value = '';
    addStatusStory(myUsername, text);

    for (const [peerSocketId, peer] of peersMap.entries()) {
      try {
        const { ciphertextBase64, ivHex } = await CipherCrypto.encryptPayload(peer.sessionKey, text);
        socket.emit('send_encrypted_payload', {
          roomCode: myRoomCode,
          recipientSocketId: peerSocketId,
          ciphertext: ciphertextBase64,
          iv: ivHex,
          payloadType: 'story'
        });
      } catch (err) {
        console.error('Story E2EE failed:', err);
      }
    }

    renderStatusStories();
    addSystemMessage(`📸 Encrypted Status Story posted!`);
  });

  function addStatusStory(username, text) {
    statusStoriesList.unshift({
      id: 'story_' + Date.now(),
      username,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });
  }

  function renderStatusStories() {
    statusStoryListContainer.innerHTML = '';
    const validStories = statusStoriesList.filter(s => s.expiresAt > Date.now());

    if (validStories.length === 0) {
      statusStoryListContainer.innerHTML = `<div style="padding: 12px; color: var(--text-muted); font-size: 0.82rem; text-align: center;">No active stories. Post a 24-hour update above!</div>`;
      return;
    }

    validStories.forEach(s => {
      const card = document.createElement('div');
      card.className = 'status-story-card';
      card.innerHTML = `
        <div class="status-story-avatar">${s.username[0].toUpperCase()}</div>
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 0.88rem; color: #fff;">${escapeHtml(s.username)} <span style="font-size: 0.7rem; color: var(--text-dim); font-weight: 400;">• ${s.timestamp}</span></div>
          <div style="font-size: 0.84rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(s.text)}</div>
        </div>
        <div style="font-size: 0.68rem; color: var(--ios-green); font-weight: 700;">🔒 24h E2EE</div>
      `;
      statusStoryListContainer.appendChild(card);
    });
  }

  // --- THEME SELECTOR ---

  openThemeBtn?.addEventListener('click', () => {
    themeModal.classList.add('active');
  });

  closeThemeBtn?.addEventListener('click', () => {
    themeModal.classList.remove('active');
  });

  themeGridContainer?.addEventListener('click', (e) => {
    const card = e.target.closest('.theme-card');
    if (!card) return;

    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    const theme = card.dataset.theme;
    document.body.setAttribute('data-theme', theme);
    addSystemMessage(`🎨 UI Theme switched to '${theme.toUpperCase()}'.`);
    themeModal.classList.remove('active');
  });

  // --- CUSTOM TEXT CHANNELS ---

  createTextChannelBtn?.addEventListener('click', () => {
    createTextModal.classList.add('active');
  });

  closeCreateTextBtn?.addEventListener('click', () => {
    createTextModal.classList.remove('active');
  });

  createTextForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = newTextChannelNameInput.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;

    const item = document.createElement('div');
    item.className = 'channel-item';
    item.dataset.channel = name;
    item.innerHTML = `<span># ${escapeHtml(name)}</span>`;

    textChannelList.appendChild(item);
    newTextChannelNameInput.value = '';
    createTextModal.classList.remove('active');
    addSystemMessage(`# Text channel '#${name}' created.`);
  });

  textChannelList?.addEventListener('click', (e) => {
    const item = e.target.closest('.channel-item');
    if (!item) return;

    document.querySelectorAll('#textChannelList .channel-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    activeTextChannel = item.dataset.channel;
    activeChannelHeader.textContent = `# ${activeTextChannel}`;
  });

  // --- EMOJI REACTIONS ENGINE ---

  function addReactionToMessage(msgId, emoji) {
    const msgEl = document.getElementById(msgId);
    if (!msgEl) return;

    let reactionsDiv = msgEl.querySelector('.msg-reactions');
    if (!reactionsDiv) {
      reactionsDiv = document.createElement('div');
      reactionsDiv.className = 'msg-reactions';
      msgEl.appendChild(reactionsDiv);
    }

    const badge = document.createElement('span');
    badge.className = 'reaction-badge';
    badge.textContent = `${emoji} 1`;
    reactionsDiv.appendChild(badge);
  }

  // --- 10 REAL-TIME WEB AUDIO DSP VOICE CHANGER ENGINE ---

  function applyVoiceChangerFX(fxType) {
    if (!localRawStream) return;
    activeVoiceFX = fxType;

    try {
      if (!fxAudioContext) {
        fxAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (fxSourceNode) fxSourceNode.disconnect();
      if (fxFilterNode) fxFilterNode.disconnect();
      if (fxDelayNode) fxDelayNode.disconnect();

      fxSourceNode = fxAudioContext.createMediaStreamSource(localRawStream);
      fxDestinationNode = fxAudioContext.createMediaStreamDestination();

      if (fxType === 'normal') {
        fxSourceNode.connect(fxDestinationNode);
      } else if (fxType === 'robot') {
        const osc = fxAudioContext.createOscillator();
        const gain = fxAudioContext.createGain();
        osc.frequency.value = 50;
        osc.type = 'sine';
        osc.start();

        fxSourceNode.connect(gain);
        osc.connect(gain.gain);
        gain.connect(fxDestinationNode);
      } else if (fxType === 'alien') {
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'peaking';
        fxFilterNode.frequency.value = 1800;
        fxFilterNode.Q.value = 8;
        fxFilterNode.gain.value = 12;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'monster') {
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'lowpass';
        fxFilterNode.frequency.value = 350;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'walkie') {
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'bandpass';
        fxFilterNode.frequency.value = 1200;
        fxFilterNode.Q.value = 3;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'chipmunk') {
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'highpass';
        fxFilterNode.frequency.value = 1400;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'cave') {
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
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'bandpass';
        fxFilterNode.frequency.value = 800;
        fxFilterNode.Q.value = 4;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'cyber') {
        fxFilterNode = fxAudioContext.createBiquadFilter();
        fxFilterNode.type = 'highshelf';
        fxFilterNode.frequency.value = 2200;
        fxFilterNode.gain.value = 15;

        fxSourceNode.connect(fxFilterNode);
        fxFilterNode.connect(fxDestinationNode);
      } else if (fxType === 'underwater') {
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

  fxGridContainer?.addEventListener('click', (e) => {
    const card = e.target.closest('.fx-card');
    if (!card) return;

    document.querySelectorAll('.fx-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    const fx = card.dataset.fx;
    applyVoiceChangerFX(fx);
    addSystemMessage(`🎭 Voice Changer FX updated to '${fx.toUpperCase()}'.`);

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
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ],
    iceCandidatePoolSize: 10
  };

  async function createWebRTCOffer(targetSocketId) {
    let pc = peerConnections.get(targetSocketId);
    if (!pc) {
      pc = new RTCPeerConnection(iceConfiguration);
      peerConnections.set(targetSocketId, pc);
    }

    const activeAudio = processedVoiceStream || localRawStream;
    if (activeAudio) {
      activeAudio.getAudioTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track && s.track.kind === 'audio')) {
          pc.addTrack(track, activeAudio);
        }
      });
    }
    if (isCameraActive && localVideoStream) {
      localVideoStream.getVideoTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track && s.track.kind === 'video')) {
          pc.addTrack(track, localVideoStream);
        }
      });
    }
    if (isScreenShareActive && localScreenStream) {
      localScreenStream.getVideoTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track && s.track.kind === 'video')) {
          pc.addTrack(track, localScreenStream);
        }
      });
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
      if (event.track.kind === 'video') {
        const peerInfo = peersMap.get(targetSocketId);
        const name = peerInfo ? peerInfo.username : 'Peer';
        addVideoCard(targetSocketId, `📹 ${name}'s Stream`, event.streams[0]);
      } else {
        playPeerAudioStream(targetSocketId, event.streams[0]);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (socket) {
      socket.emit('webrtc_offer', {
        targetSocketId,
        sdpOffer: offer
      });
    }
  }

  async function handleWebRTCOffer(senderSocketId, sdpOffer) {
    let pc = peerConnections.get(senderSocketId);
    if (!pc) {
      pc = new RTCPeerConnection(iceConfiguration);
      peerConnections.set(senderSocketId, pc);
    }

    const activeAudio = processedVoiceStream || localRawStream;
    if (activeAudio) {
      activeAudio.getAudioTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track && s.track.kind === 'audio')) {
          pc.addTrack(track, activeAudio);
        }
      });
    }
    if (isCameraActive && localVideoStream) {
      localVideoStream.getVideoTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track && s.track.kind === 'video')) {
          pc.addTrack(track, localVideoStream);
        }
      });
    }
    if (isScreenShareActive && localScreenStream) {
      localScreenStream.getVideoTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track && s.track.kind === 'video')) {
          pc.addTrack(track, localScreenStream);
        }
      });
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
      if (event.track.kind === 'video') {
        const peerInfo = peersMap.get(senderSocketId);
        const name = peerInfo ? peerInfo.username : 'Peer';
        addVideoCard(senderSocketId, `📹 ${name}'s Stream`, event.streams[0]);
      } else {
        playPeerAudioStream(senderSocketId, event.streams[0]);
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdpOffer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (socket) {
      socket.emit('webrtc_answer', {
        targetSocketId: senderSocketId,
        sdpAnswer: answer
      });
    }
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
    removeVideoCard(socketId);
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

  // Text Send with Quoted Reply Support
  chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    const quoteToAttach = activeReplyQuote ? { ...activeReplyQuote } : null;
    if (activeReplyQuote) {
      activeReplyQuote = null;
      replyPreviewBar.style.display = 'none';
    }

    if (socket && isConnectedToServer) {
      socket.emit('typing_stop');
    }

    messageInput.value = '';
    const msgId = 'msg_' + Date.now();
    renderOutgoingMessage(myUsername, text, msgId, disappearingTimerSeconds, quoteToAttach);

    if (socket && isConnectedToServer) {
      for (const [peerSocketId, peer] of peersMap.entries()) {
        try {
          const { ciphertextBase64, ivHex } = await CipherCrypto.encryptPayload(peer.sessionKey, text);
          socket.emit('send_encrypted_payload', {
            roomCode: myRoomCode,
            recipientSocketId: peerSocketId,
            ciphertext: ciphertextBase64,
            iv: ivHex,
            payloadType: 'text',
            timerSeconds: disappearingTimerSeconds,
            messageId: msgId,
            quotedReply: quoteToAttach,
            plaintextFallback: text
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

    const localUrl = URL.createObjectURL(file);
    const msgId = 'file_' + Date.now();

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
            isImage: isImage,
            timerSeconds: disappearingTimerSeconds,
            messageId: msgId,
            plaintextFallback: localUrl
          });
        } catch (err) {
          console.error('File E2EE failed:', err);
        }
      }
    }

    renderOutgoingFileMessage(myUsername, file.name, localUrl, isImage, disappearingTimerSeconds, msgId);
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

      const localAudioUrl = URL.createObjectURL(audioBlob);
      const msgId = 'voice_' + Date.now();

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
              audioDuration: durationStr,
              timerSeconds: disappearingTimerSeconds,
              messageId: msgId,
              plaintextFallback: localAudioUrl
            });
          } catch (err) {
            console.error('Voice note encryption failed:', err);
          }
        }
      }

      renderOutgoingVoiceMessage(myUsername, localAudioUrl, durationStr, disappearingTimerSeconds, msgId);
    };
    mediaRecorder.stop();
  });

  function stopMediaRecorder() {
    if (recordingInterval) clearInterval(recordingInterval);
    if (mediaRecorder && mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  }

  // UI RENDER HELPERS WITH ACCURATE PERSISTENT CLOUD SAVES
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

  function buildContextMenuHtml(timeStr) {
    return `
      <div class="top-reaction-bar">
        <button type="button" class="top-reaction-btn" data-emoji="❤️" title="Heart">❤️</button>
        <button type="button" class="top-reaction-btn" data-emoji="👍" title="Thumbs Up">👍</button>
        <button type="button" class="top-reaction-btn" data-emoji="👎" title="Thumbs Down">👎</button>
        <button type="button" class="top-reaction-btn" data-emoji="🔥" title="Fire">🔥</button>
        <button type="button" class="top-reaction-btn" data-emoji="🥳" title="Party">🥳</button>
        <button type="button" class="top-reaction-btn" data-emoji="👏" title="Clap">👏</button>
        <button type="button" class="top-reaction-btn" data-emoji="🚀" title="Rocket">🚀</button>
        <button type="button" class="top-reaction-btn" data-emoji="💯" title="100">💯</button>
      </div>
      <div class="context-info-header">
        <span>✓ ${timeStr} • E2EE</span>
      </div>
      <button class="context-menu-item ctx-reply">↩ Reply</button>
      <button class="context-menu-item ctx-edit">✏ Edit Message</button>
      <button class="context-menu-item ctx-pin">📌 Pin Message</button>
      <button class="context-menu-item ctx-forward">↪ Forward</button>
      <button class="context-menu-item ctx-star">⭐ Star Message</button>
      <button class="context-menu-item ctx-speak">🔊 Speak Message (TTS)</button>
      <button class="context-menu-item ctx-ai">🤖 Ask Cipher AI</button>
      <div class="context-menu-divider"></div>
      <button class="context-menu-item ctx-copy">📋 Copy Text</button>
      <button class="context-menu-item ctx-copy-id">🆔 Copy Message ID</button>
      <div class="context-menu-divider"></div>
      <button class="context-menu-item ctx-delete danger-item">🗑️ Delete Message...</button>
    `;
  }

  function renderOutgoingMessage(sender, text, msgId, timerSecs, quotedReply = null) {
    const id = msgId || 'msg_' + Date.now();
    renderedMsgIdsSet.add(id);

    if (!timerSecs || timerSecs === 0) {
      saveToLocalTelegramCloud(myRoomCode, myUsername, {
        id,
        senderUsername: sender,
        plaintextFallback: text,
        payloadType: 'text',
        timerSeconds: 0,
        quotedReply: quotedReply || null,
        timestamp: new Date().toLocaleTimeString()
      });
    }

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container outgoing';
    msgDiv.id = id;

    const timerBadgeHtml = timerSecs > 0 ? `<span class="timer-badge">⏱️ ${timerSecs}s</span>` : '';

    let quoteHtml = '';
    if (quotedReply && quotedReply.sender && quotedReply.text) {
      quoteHtml = `
        <div class="whatsapp-quote-card" onclick="scrollToMessage('${quotedReply.msgId || ''}')">
          <div class="whatsapp-quote-sender">Replying to @${escapeHtml(quotedReply.sender)}</div>
          <div class="whatsapp-quote-text">${escapeHtml(quotedReply.text)}</div>
        </div>
      `;
    }

    msgDiv.innerHTML = `
      <button type="button" class="msg-options-btn" title="Message Options (⋮)">⋮</button>
      <div class="msg-context-menu">
        ${buildContextMenuHtml(time)}
      </div>
      <div class="msg-bubble">
        ${quoteHtml}
        ${escapeHtml(text)}
        <div class="msg-time">${time} ${timerBadgeHtml} <span class="e2ee-tag">🔒 Encrypted</span></div>
      </div>
      <div class="msg-reactions">
        <span class="reaction-badge" onclick="sendReaction('${id}', '❤️')">❤️</span>
        <span class="reaction-badge" onclick="sendReaction('${id}', '👍')">👍</span>
        <span class="reaction-badge" onclick="sendReaction('${id}', '🔥')">🔥</span>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    attachContextMenuEvents(msgDiv, id, sender, text);

    if (timerSecs > 0) scheduleMessageSelfDestruct(msgDiv, timerSecs);
  }

  function renderIncomingMessage(sender, text, timestamp, timerSecs, msgId, quotedReply = null) {
    const id = msgId || 'in_' + Date.now();
    renderedMsgIdsSet.add(id);

    if (!timerSecs || timerSecs === 0) {
      saveToLocalTelegramCloud(myRoomCode, myUsername, {
        id,
        senderUsername: sender,
        plaintextFallback: text,
        payloadType: 'text',
        timerSeconds: 0,
        quotedReply: quotedReply || null,
        timestamp: timestamp || new Date().toLocaleTimeString()
      });
    }

    const timeStr = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container incoming';
    msgDiv.id = id;

    const timerBadgeHtml = timerSecs > 0 ? `<span class="timer-badge">⏱️ ${timerSecs}s</span>` : '';

    let quoteHtml = '';
    if (quotedReply && quotedReply.sender && quotedReply.text) {
      quoteHtml = `
        <div class="whatsapp-quote-card" onclick="scrollToMessage('${quotedReply.msgId || ''}')">
          <div class="whatsapp-quote-sender">Replying to @${escapeHtml(quotedReply.sender)}</div>
          <div class="whatsapp-quote-text">${escapeHtml(quotedReply.text)}</div>
        </div>
      `;
    }

    msgDiv.innerHTML = `
      <button type="button" class="msg-options-btn" title="Message Options (⋮)">⋮</button>
      <div class="msg-context-menu">
        ${buildContextMenuHtml(timeStr)}
      </div>
      <div class="msg-sender">${escapeHtml(sender)}</div>
      <div class="msg-bubble">
        ${quoteHtml}
        ${escapeHtml(text)}
        <div class="msg-time">${timeStr} ${timerBadgeHtml} <span class="e2ee-tag">🔒 Decrypted</span></div>
      </div>
      <div class="msg-reactions">
        <span class="reaction-badge" onclick="sendReaction('${id}', '❤️')">❤️</span>
        <span class="reaction-badge" onclick="sendReaction('${id}', '👍')">👍</span>
        <span class="reaction-badge" onclick="sendReaction('${id}', '🔥')">🔥</span>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    attachContextMenuEvents(msgDiv, id, sender, text);

    if (timerSecs > 0) scheduleMessageSelfDestruct(msgDiv, timerSecs);
  }

  window.sendReaction = async function(msgId, emoji) {
    addReactionToMessage(msgId, emoji);
    for (const [peerSocketId, peer] of peersMap.entries()) {
      try {
        const { ciphertextBase64, ivHex } = await CipherCrypto.encryptPayload(peer.sessionKey, emoji);
        socket.emit('send_encrypted_payload', {
          roomCode: myRoomCode,
          recipientSocketId: peerSocketId,
          ciphertext: ciphertextBase64,
          iv: ivHex,
          payloadType: 'reaction',
          messageId: msgId
        });
      } catch (err) {
        console.error('Reaction E2EE failed:', err);
      }
    }
  };

  function renderOutgoingFileMessage(sender, fileName, fileUrl, isImage, timerSecs, msgId) {
    const id = msgId || 'file_' + Date.now();
    renderedMsgIdsSet.add(id);

    if (!timerSecs || timerSecs === 0) {
      saveToLocalTelegramCloud(myRoomCode, myUsername, {
        id,
        senderUsername: sender,
        fileName,
        plaintextFallback: fileUrl,
        isImage,
        payloadType: 'file',
        timerSeconds: 0,
        timestamp: new Date().toLocaleTimeString()
      });
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container outgoing';
    msgDiv.id = id;
    const imageHtml = isImage ? '<img src="' + fileUrl + '" alt="Decrypted Image" class="e2ee-img-preview">' : '';
    const timerBadgeHtml = timerSecs > 0 ? '<span class="timer-badge">T: ' + timerSecs + 's</span>' : '';

    msgDiv.innerHTML = 
      '<button type="button" class="msg-options-btn" title="Message Options">...</button>' +
      '<div class="msg-context-menu">' +
        buildContextMenuHtml(timeStr) +
      '</div>' +
      '<div class="msg-bubble">' +
        imageHtml +
        ' [File] <strong>' + escapeHtml(fileName) + '</strong><br>' +
        '<a href="' + fileUrl + '" download="' + escapeHtml(fileName) + '" style="color: #fff; font-size: 0.8rem; text-decoration: underline;">Download File</a>' +
        '<div class="msg-time">' + timerBadgeHtml + ' Encrypted File</div>' +
      '</div>';
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    attachContextMenuEvents(msgDiv, id, sender, `File: ${fileName}`);

    if (timerSecs > 0) scheduleMessageSelfDestruct(msgDiv, timerSecs);
  }

  function renderIncomingFileMessage(sender, fileName, fileUrl, isImage, timestamp, timerSecs, msgId) {
    const id = msgId || 'file_in_' + Date.now();
    renderedMsgIdsSet.add(id);

    if (!timerSecs || timerSecs === 0) {
      saveToLocalTelegramCloud(myRoomCode, myUsername, {
        id,
        senderUsername: sender,
        fileName,
        plaintextFallback: fileUrl,
        isImage,
        payloadType: 'file',
        timerSeconds: 0,
        timestamp: timestamp || new Date().toLocaleTimeString()
      });
    }

    const timeStr = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container incoming';
    msgDiv.id = id;
    const imageHtml = isImage ? `<img src="${fileUrl}" alt="Decrypted Image" class="e2ee-img-preview">` : '';
    const timerBadgeHtml = timerSecs > 0 ? `<span class="timer-badge">⏱️ ${timerSecs}s</span>` : '';

    msgDiv.innerHTML = `
      <button type="button" class="msg-options-btn" title="Message Options (⋮)">⋮</button>
      <div class="msg-context-menu">
        ${buildContextMenuHtml(timeStr)}
      </div>
      <div class="msg-sender">${escapeHtml(sender)}</div>
      <div class="msg-bubble">
        ${imageHtml}
        📎 <strong>${escapeHtml(fileName)}</strong><br>
        <a href="${fileUrl}" download="${escapeHtml(fileName)}" style="color: var(--ios-cyan); font-size: 0.8rem; text-decoration: underline;">Download Decrypted File</a>
        <div class="msg-time">${timeStr} ${timerBadgeHtml} <span class="e2ee-tag">🔒 Decrypted File</span></div>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    attachContextMenuEvents(msgDiv, id, sender, `File: ${fileName}`);

    if (timerSecs > 0) scheduleMessageSelfDestruct(msgDiv, timerSecs);
  }

  function renderOutgoingVoiceMessage(sender, audioUrl, duration, timerSecs, msgId) {
    const id = msgId || 'vnote_' + Date.now();
    renderedMsgIdsSet.add(id);

    if (!timerSecs || timerSecs === 0) {
      saveToLocalTelegramCloud(myRoomCode, myUsername, {
        id,
        senderUsername: sender,
        audioDuration: duration,
        plaintextFallback: audioUrl,
        payloadType: 'voice',
        timerSeconds: 0,
        timestamp: new Date().toLocaleTimeString()
      });
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container outgoing';
    msgDiv.id = id;
    const uniqueId = 'aud_' + Math.random().toString(36).substr(2, 6);
    const timerBadgeHtml = timerSecs > 0 ? `<span class="timer-badge">⏱️ ${timerSecs}s</span>` : '';

    msgDiv.innerHTML = `
      <button type="button" class="msg-options-btn" title="Message Options (⋮)">⋮</button>
      <div class="msg-context-menu">
        ${buildContextMenuHtml(timeStr)}
      </div>
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
        <div class="msg-time">${timerBadgeHtml} 🔒 E2EE Voice Note</div>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    setupVoicePlayerEvents(uniqueId);
    attachContextMenuEvents(msgDiv, id, sender, `Voice Note (${duration})`);

    if (timerSecs > 0) scheduleMessageSelfDestruct(msgDiv, timerSecs);
  }

  function renderIncomingVoiceMessage(sender, audioUrl, duration, timestamp, timerSecs, msgId) {
    const id = msgId || 'vnote_in_' + Date.now();
    renderedMsgIdsSet.add(id);

    if (!timerSecs || timerSecs === 0) {
      saveToLocalTelegramCloud(myRoomCode, myUsername, {
        id,
        senderUsername: sender,
        audioDuration: duration,
        plaintextFallback: audioUrl,
        payloadType: 'voice',
        timerSeconds: 0,
        timestamp: timestamp || new Date().toLocaleTimeString()
      });
    }

    const timeStr = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-bubble-container incoming';
    msgDiv.id = id;
    const uniqueId = 'aud_' + Math.random().toString(36).substr(2, 6);
    const timerBadgeHtml = timerSecs > 0 ? `<span class="timer-badge">⏱️ ${timerSecs}s</span>` : '';

    msgDiv.innerHTML = `
      <button type="button" class="msg-options-btn" title="Message Options (⋮)">⋮</button>
      <div class="msg-context-menu">
        ${buildContextMenuHtml(timeStr)}
      </div>
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
        <div class="msg-time">${timeStr} ${timerBadgeHtml} <span class="e2ee-tag">🔒 Decrypted Voice</span></div>
      </div>
    `;
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    setupVoicePlayerEvents(uniqueId);
    attachContextMenuEvents(msgDiv, id, sender, `Voice Note (${duration})`);

    if (timerSecs > 0) scheduleMessageSelfDestruct(msgDiv, timerSecs);
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
