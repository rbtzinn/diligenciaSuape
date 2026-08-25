// ==========================================================
// DILIGÊNCIA 360 — Configuração do Firebase Admin SDK
// ==========================================================

const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'diligencia-8e779';
let firebaseAuth = null;

function normalizePrivateKey(value) {
  let privateKey = String(value || '').trim();

  // Aceita tanto o valor PEM multilinha quanto o campo `private_key` copiado
  // de um JSON/.env, sem manter aspas externas no segredo.
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    try {
      privateKey = JSON.parse(privateKey);
    } catch {
      privateKey = privateKey.slice(1, -1);
    }
  } else if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
    privateKey = privateKey.slice(1, -1);
  }

  return privateKey.replace(/\\n/g, '\n').trim();
}

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
      if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----') ||
          !privateKey.endsWith('-----END PRIVATE KEY-----')) {
        throw new Error('FIREBASE_PRIVATE_KEY não contém uma chave PEM PKCS#8 válida.');
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
      });
    } else {
      admin.initializeApp({
        projectId,
      });
    }
    console.log(`[FirebaseAdmin] Inicializado para o projeto: ${projectId}`);
  } catch (err) {
    console.warn(`[FirebaseAdmin] Aviso na inicialização: ${err.message}`);
  }
}

if (admin.apps.length) {
  firebaseAuth = admin.auth();
}

module.exports = {
  admin,
  firebaseAuth,
  normalizePrivateKey,
};
