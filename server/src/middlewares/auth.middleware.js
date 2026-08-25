// ==========================================================
// DILIGÊNCIA 360 — Autenticação Firebase sem RBAC local
// ==========================================================

const { firebaseAuth } = require('../config/firebase-admin');
const { safeFetch } = require('../utils/safeFetch');

function extractBearerToken(req) {
  const authHeader = req.headers?.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
}

async function verifyFirebaseToken(token) {
  if (firebaseAuth) {
    try {
      return await firebaseAuth.verifyIdToken(token);
    } catch {
      // O fallback oficial abaixo mantém o login funcional quando o Admin SDK
      // ainda não recebeu a credencial de serviço no ambiente local.
    }
  }

  const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await safeFetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const identity = Array.isArray(payload.users) ? payload.users[0] : null;
    if (!identity?.localId) return null;
    return {
      uid: identity.localId,
      sub: identity.localId,
      email: identity.email || '',
      email_verified: identity.emailVerified === true,
      name: identity.displayName || '',
    };
  } catch {
    return null;
  }
}

function identityFromToken(decoded) {
  const uid = decoded?.uid || decoded?.sub;
  const email = String(decoded?.email || '').toLowerCase().trim();
  if (!uid || !email) return null;
  return {
    id: uid,
    firebaseUid: uid,
    name: decoded.name || email.split('@')[0] || 'Usuário',
    email,
    role: 'authenticated',
    active: true,
  };
}

async function authenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, erro: 'Autenticação necessária para acessar este recurso.' });
  }

  const decoded = await verifyFirebaseToken(token);
  const user = identityFromToken(decoded);
  if (!user) {
    return res.status(401).json({ ok: false, erro: 'Sessão expirada ou token de autenticação inválido.' });
  }

  req.user = user;
  return next();
}

async function optionalAuthenticate(req, _res, next) {
  const token = extractBearerToken(req);
  if (token) {
    const decoded = await verifyFirebaseToken(token);
    const user = identityFromToken(decoded);
    if (user) req.user = user;
  }
  return next();
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  verifyFirebaseToken,
};
