/**
 * CipherChat Core Cryptographic Module
 * Powered by W3C Web Crypto API (SubtleCrypto)
 * Zero-Knowledge Client-Side Key Management & AES-256-GCM Encryption
 */

class CipherCrypto {
  /**
   * Generate an Elliptic Curve Diffie-Hellman (ECDH) P-256 Key Pair
   * Returns: { publicKey: CryptoKey, privateKey: CryptoKey }
   */
  static async generateIdentityKeyPair() {
    return await window.crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true, // extractable
      ['deriveKey', 'deriveBits']
    );
  }

  /**
   * Export a Public CryptoKey into JSON Web Key (JWK) format for network relay
   */
  static async exportPublicKey(key) {
    return await window.crypto.subtle.exportKey('jwk', key);
  }

  /**
   * Import a JWK Public Key from a peer socket
   */
  static async importPublicKey(jwk) {
    return await window.crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      []
    );
  }

  /**
   * Derive a 256-bit AES-GCM Shared Session Key using ECDH agreement + HKDF-SHA256
   */
  static async deriveSharedSessionKey(myPrivateKey, peerPublicKeyJwk, saltString = 'CipherChat_HKDF_Salt') {
    const peerPublicKey = await this.importPublicKey(peerPublicKeyJwk);

    // 1. Perform ECDH to get raw shared secret bits (256 bits / 32 bytes)
    const rawSharedBits = await window.crypto.subtle.deriveBits(
      {
        name: 'ECDH',
        public: peerPublicKey
      },
      myPrivateKey,
      256
    );

    // 2. Import raw bits into HKDF master key
    const hkdfMasterKey = await window.crypto.subtle.importKey(
      'raw',
      rawSharedBits,
      'HKDF',
      false,
      ['deriveKey']
    );

    const encoder = new TextEncoder();
    const salt = encoder.encode(saltString);
    const info = encoder.encode('CipherChat_Session_AES256_GCM');

    // 3. Derive 256-bit AES-GCM key from HKDF
    const aesKey = await window.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt,
        info: info
      },
      hkdfMasterKey,
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable in memory for high security
      ['encrypt', 'decrypt']
    );

    return aesKey;
  }

  /**
   * Encrypt plaintext string or ArrayBuffer using AES-256-GCM with a random 96-bit IV
   * Returns: { ciphertextBase64, ivHex }
   */
  static async encryptPayload(sessionKey, inputData) {
    // Generate a fresh 12-byte (96-bit) IV for every single message
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    let dataBuffer;
    if (typeof inputData === 'string') {
      dataBuffer = new TextEncoder().encode(inputData);
    } else if (inputData instanceof ArrayBuffer) {
      dataBuffer = inputData;
    } else {
      throw new Error('Unsupported payload format');
    }

    const encryptedArrayBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      sessionKey,
      dataBuffer
    );

    const ciphertextBase64 = this.arrayBufferToBase64(encryptedArrayBuffer);
    const ivHex = this.uint8ArrayToHex(iv);

    return { ciphertextBase64, ivHex };
  }

  /**
   * Decrypt Base64 Ciphertext using AES-256-GCM and Hex IV
   * Returns: Text string or ArrayBuffer
   */
  static async decryptPayload(sessionKey, ciphertextBase64, ivHex, isBinary = false) {
    const ciphertextBuffer = this.base64ToArrayBuffer(ciphertextBase64);
    const iv = this.hexToUint8Array(ivHex);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      sessionKey,
      ciphertextBuffer
    );

    if (isBinary) {
      return decryptedBuffer;
    }
    return new TextDecoder().decode(decryptedBuffer);
  }

  /**
   * Compute a 60-digit deterministic Safety Fingerprint (Safety Number)
   * used to verify peer identity and detect MITM attacks
   */
  static async computeSafetyNumber(myPubKeyJwk, peerPubKeyJwk) {
    // Lexicographically sort both keys so both parties produce the exact same fingerprint
    const keyA = JSON.stringify(myPubKeyJwk, Object.keys(myPubKeyJwk).sort());
    const keyB = JSON.stringify(peerPubKeyJwk, Object.keys(peerPubKeyJwk).sort());

    const combinedKeys = keyA < keyB ? keyA + keyB : keyB + keyA;
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedKeys);

    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashHex = this.uint8ArrayToHex(new Uint8Array(hashBuffer)).toUpperCase();

    // Format into 12 blocks of 5 hex digits (total 60 characters)
    const blocks = [];
    for (let i = 0; i < hashHex.length && blocks.length < 12; i += 5) {
      blocks.push(hashHex.substring(i, i + 5));
    }
    return {
      fullHash: hashHex,
      formattedFingerprint: blocks.join(' - '),
      blocks: blocks
    };
  }

  // --- Utility Buffer Converters ---

  static arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  static base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  static uint8ArrayToHex(arr) {
    return Array.from(arr)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  static hexToUint8Array(hex) {
    const matches = hex.match(/.{1,2}/g);
    if (!matches) return new Uint8Array(0);
    return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
  }
}

// Export module to window
window.CipherCrypto = CipherCrypto;
