// ==========================================================
// DILIGÊNCIA 360 — Middlewares de Autenticação Firebase & RBAC
// ==========================================================

const { firebaseAuth } = require('../config/firebase-admin');
const { UserRepository } = require('../repositories/user.repository');
const { AuthService } = require('../services/auth.service');
const { safeFetch } = require('../utils/safeFetch');

function extractBearerToken(req) {
  const authHeader = req.headers ? req.headers.authorization : null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

async function verifyFirebaseToken(token) {
  try {
    return await firebaseAuth.verifyIdToken(token);
  } catch (err) {
    // Em desenvolvimento sem credencial Admin, valida o ID token no próprio
    // Firebase Identity Toolkit. Nunca confia em payload JWT apenas decodificado.
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
      if (!identity?.localId || !identity?.email) return null;

      return {
        uid: identity.localId,
        sub: identity.localId,
        email: identity.email,
        email_verified: identity.emailVerified === true,
      };
    } catch {
      return null;
    }
  }
}

async function resolveLocalUser(decoded) {
  const uid = decoded.uid || decoded.sub;
  const email = (decoded.email || '').toLowerCase().trim();
  if (!uid || !email) return null;

  let user = await UserRepository.findByFirebaseUid(uid);
  if (!user) {
    user = await UserRepository.findByEmail(email);
    if (user) {
      user = await UserRepository.update(user.id, {
        firebaseUid: uid,
        lastLoginAt: new Date(),
      });
    } else {
      // Apenas o administrador inicial configurado pode ser provisionado
      // automaticamente. Os demais usuários precisam existir previamente no
      // cadastro interno, ainda que possuam uma conta válida no Firebase.
      user = await AuthService.ensureInitialAdmin(email);
      if (user) {
        user = await UserRepository.update(user.id, {
          firebaseUid: uid,
          lastLoginAt: new Date(),
        });
      }
    }
  } else {
    user = await UserRepository.update(user.id, { lastLoginAt: new Date() }) || user;
  }

  return user;
}

async function authenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, erro: 'Autenticação necessária para acessar este recurso.' });
  }

  const decoded = await verifyFirebaseToken(token);
  if (!decoded || (!decoded.uid && !decoded.sub)) {
    return res.status(401).json({ ok: false, erro: 'Sessão expirada ou token de autenticação inválido.' });
  }

  const uid = decoded.uid || decoded.sub;
  const email = (decoded.email || '').toLowerCase().trim();
  let user;
  try {
    user = await resolveLocalUser(decoded);
  } catch (error) {
    console.error('[Auth] Falha ao sincronizar identidade local:', error.message);
    return res.status(503).json({
      ok: false,
      erro: 'Não foi possível sincronizar sua identidade com o banco local.',
    });
  }
  if (!user) {
    return res.status(403).json({ ok: false, erro: 'Identidade autenticada sem e-mail disponível.' });
  }

  req.user = {
    id: user.id,
    firebaseUid: uid,
    name: user.name || email.split('@')[0],
    email: user.email || email,
    role: user.role || 'admin',
    active: user.active !== false,
  };

  next();
}

async function optionalAuthenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (token) {
    const decoded = await verifyFirebaseToken(token);
    if (decoded) {
      const uid = decoded.uid || decoded.sub;
      const email = decoded.email || '';
      try {
        const user = await resolveLocalUser(decoded);
        if (user) {
          req.user = {
            id: user.id,
            firebaseUid: uid,
            name: user.name || email.split('@')[0],
            email: user.email || email,
            role: user.role || 'admin',
            active: user.active !== false,
          };
        }
      } catch (error) {
        console.warn('[Auth] Autenticação opcional sem sincronização local:', error.message);
      }
    }
  }
  next();
}

function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, erro: 'Autenticação obrigatória.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        erro: `Acesso negado. Ação restrita aos perfis: ${allowedRoles.join(', ')}.`,
      });
    }

    next();
  };
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  authorize,
};
