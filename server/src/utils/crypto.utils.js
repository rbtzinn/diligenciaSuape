// ==========================================================
// DILIGÊNCIA 360 — Utilitário Criptográfico de Senhas e Tokens
// Implementação nativa Node.js com Scrypt e HMAC-SHA256
// ==========================================================

const crypto = require('crypto');

const SECRET_KEY = process.env.SESSION_SECRET || 'diligencia360_secure_hmac_secret_suape_2026';
const KEY_LEN = 64;

function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Senha inválida para hash.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plainPassword, salt, KEY_LEN);
  return `${salt}:${derivedKey.toString('hex')}`;
}

function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash || !storedHash.includes(':')) {
    return false;
  }
  try {
    const [salt, key] = storedHash.split(':');
    const derivedKey = crypto.scryptSync(plainPassword, salt, KEY_LEN);
    const keyBuffer = Buffer.from(key, 'hex');
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  } catch {
    return false;
  }
}

function generateToken(user, expiresInMs = 8 * 60 * 60 * 1000) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    exp: Date.now() + expiresInMs,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  try {
    const [payloadB64, signature] = token.split('.');
    const expectedSig = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(payloadB64)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) {
      return null; // Expirado
    }
    return payload;
  } catch {
    return null;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
};
