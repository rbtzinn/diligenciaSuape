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

  // 1. Localiza por firebase_uid
  let user = await UserRepository.findByFirebaseUid(uid);

  // 2. Se não encontrou por UID, vincula automaticamente por e-mail institucional
  if (!user && email) {
    user = await UserRepository.findByEmail(email);
    if (!user) {
      user = await AuthService.ensureInitialAdmin(email);
    }

    if (user) {
      if (user.firebaseUid && user.firebaseUid !== uid) {
        return res.status(403).json({
          ok: false,
          erro: 'A identidade do Firebase não corresponde ao usuário autorizado no Diligência 360.',
        });
      }

      await UserRepository.linkFirebaseUid(user.id, uid);
      user.firebaseUid = uid;
    }
  }

  // 3. Usuário autenticado no Firebase mas sem cadastro no Diligência 360
  if (!user) {
    return res.status(403).json({
      ok: false,
      erro: 'Seu usuário não possui autorização para acessar o Diligência 360. Solicite cadastro ao Administrador.',
    });
  }

  // 4. Usuário desativado no PostgreSQL
  if (!user.active) {
    return res.status(403).json({
      ok: false,
      erro: 'Seu usuário está desativado no Diligência 360. Contate o administrador do sistema.',
    });
  }

  req.user = {
    id: user.id,
    firebaseUid: user.firebaseUid,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  next();
}

async function optionalAuthenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (token) {
    const decoded = await verifyFirebaseToken(token);
    if (decoded) {
      const uid = decoded.uid || decoded.sub;
      let user = await UserRepository.findByFirebaseUid(uid);
      if (!user && decoded.email) {
        user = await UserRepository.findByEmail(decoded.email);
      }
      if (user && user.active) {
        req.user = {
          id: user.id,
          firebaseUid: user.firebaseUid,
          name: user.name,
          email: user.email,
          role: user.role,
        };
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
