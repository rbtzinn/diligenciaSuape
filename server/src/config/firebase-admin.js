// ==========================================================
// DILIGÊNCIA 360 — Configuração do Firebase Admin SDK
// ==========================================================

const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'diligencia-8e779';

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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

module.exports = {
  admin,
  firebaseAuth: admin.auth(),
};
