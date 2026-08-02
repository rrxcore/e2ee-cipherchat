# 🔒 CipherChat | rrxcore edition

> **Zero-Knowledge End-to-End Encrypted (E2EE) Chat & Discord-Style Live Voice Rooms Platform**

![License MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Security-E2EE](https://img.shields.io/badge/Security-AES--256--GCM-brightgreen.svg)
![Crypto-WebCrypto](https://img.shields.io/badge/Standard-W3C%20WebCrypto-purple.svg)
![Theme-iOS%2018](https://img.shields.io/badge/Design-iOS%2018%20Frosted%20Glass-black.svg)

CipherChat **rrxcore edition** is a state-of-the-art, high-privacy messaging and live voice channel web application. Built natively on the **W3C Web Crypto API (`SubtleCrypto`)**, all private keys and plaintext messages remain exclusively inside your browser memory. The backend server acts strictly as a **blind relay**, holding zero private keys and zero capability to decrypt your communication.

---

## 🌐 Live Demos & Links

- 🚀 **Live GitHub Pages App**: [https://rrxcore.github.io/e2ee-cipherchat/](https://rrxcore.github.io/e2ee-cipherchat/)
- 🐙 **GitHub Repository**: [https://github.com/rrxcore/e2ee-cipherchat](https://github.com/rrxcore/e2ee-cipherchat)

---

## ✨ Key Features

### 1. 🔒 Zero-Knowledge E2EE Architecture
- **Identity Key Pairs**: Ephemeral/persistent **ECDH P-256** keypairs generated client-side inside browser memory.
- **Key Agreement**: Diffie-Hellman Key Exchange + **HKDF-SHA256** to derive 256-bit symmetric session keys.
- **Payload Cipher**: **AES-256-GCM** with a unique 96-bit random Initialization Vector (IV) generated per message/file.

### 2. 🔊 Discord-Style Live E2EE Voice Channels
- **Voice Channels in Sidebar**: Connect to `🔊 Lounge Voice`, `🔊 E2EE Stage`, or create custom voice rooms on-the-fly (**`➕`**).
- **One-Tap Connection**: Low-latency audio slicing (250ms interval) encrypted before network broadcast.
- **Active Speaker Halos**: Real-time green glowing rings (`.speaking-halo`) animate around user avatars when speaking.
- **Voice Controls**: Integrated `🎤 Mute`, `🎧 Deafen`, and `❌ Disconnect` controls inside a floating bottom sidebar.

### 3. 🔑 Room Password Protection
- Create or join rooms protected by a custom **Room Password**.
- Access verification occurs on connection attempt — invalid passwords trigger instant access denial.

### 4. 📡 Real-Time Blind Relay Packet Inspector
- Includes an interactive drawer demonstrating raw wire packets.
- Proves to users that the server only relays raw Base64 ciphertexts (`a7f9b8c2...`), IVs, and public keys.

### 5. 🖼️ Inline Photo & Attachment E2EE Previews
- Send images (`.jpg`, `.png`, `.webp`) or documents up to **25MB**.
- Images are decrypted client-side into Blob URLs and rendered as inline thumbnail previews directly in the chat stream.

### 6. 🛡️ 60-Digit SHA-256 Safety Fingerprint Matrix
- Deterministic 60-digit safety matrix calculated from both users' public keys to detect and prevent Man-In-The-Middle (MITM) attacks.

### 7. 🎨 iOS 18 Control Center Frosted Glass Theme
- Modern glassmorphism layout featuring liquid glass containers, floating **Dynamic Island** security indicators, and iMessage-style gradient bubbles.

---

## 🛠️ Cryptographic Architecture Pipeline

```
[ Sender Device ]                                      [ Server ]                                     [ Receiver Device ]
       │                                                   │                                                  │
 1. Generate ECDH P-256 Keypair                        │                                            1. Generate ECDH P-256 Keypair
 2. Derive HKDF SHA-256 Session Key                     │                                            2. Derive HKDF SHA-256 Session Key
       │                                                   │                                                  │
 3. Encrypt via AES-256-GCM ── Encrypted Payload (Base64) ─► 4. Blind Relay ── Encrypted Payload (Base64) ──► 5. Decrypt via AES-256-GCM
   (Plaintext never leaves device)                      │   (Cannot read content)                             │ (Restores original message/file)
```

---

## 🚀 Quick Start & Local Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rrxcore/e2ee-cipherchat.git
   cd e2ee-cipherchat
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

4. **Open in your browser**:
   Navigate to `http://localhost:3000`

---

## 📂 Project Directory Layout

```
e2ee-cipherchat/
├── server.js               # Node.js Express & Socket.io blind relay server
├── package.json            # Dependencies (express, socket.io)
├── .gitignore              # Git ignore rules
├── public/
│   ├── index.html          # Semantic layout with iOS 18 glass theme & Discord sidebar
│   ├── css/
│   │   └── style.css       # Design system, frosted glass tokens & micro-animations
│   └── js/
│       ├── crypto.js       # W3C Web Crypto API (ECDH, HKDF, AES-GCM, Fingerprints)
│       └── app.js          # Socket transport, peer manager, voice stream & UI logic
└── README.md               # Project documentation
```

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.

*Crafted for privacy enthusiasts by **rrxcore**.*
