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

function isValidPrivateKey(privateKey) {
  return privateKey.startsWith('-----BEGIN PRIVATE KEY-----') &&
    privateKey.endsWith('-----END PRIVATE KEY-----');
}

function resolveFirebaseServiceAccount(env = process.env) {
  // A conta de serviço usada para a planilha pertence ao mesmo projeto Google
  // e também pode validar ID tokens. Isso mantém o login funcionando caso uma
  // chave Firebase legada tenha sido cadastrada de forma incorreta na Vercel.
  const candidates = [
    {
      source: 'FIREBASE',
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
    },
    {
      source: 'GOOGLE_SHEETS',
      clientEmail: env.GOOGLE_SHEETS_CLIENT_EMAIL,
      privateKey: env.GOOGLE_SHEETS_PRIVATE_KEY,
    },
  ];

  for (const candidate of candidates) {
    const clientEmail = String(candidate.clientEmail || '').trim();
    const privateKey = normalizePrivateKey(candidate.privateKey);
    if (clientEmail && isValidPrivateKey(privateKey)) {
      return { ...candidate, clientEmail, privateKey };
    }
  }

  return null;
}

if (!admin.apps.length) {
  try {
    const serviceAccount = resolveFirebaseServiceAccount();
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey,
        }),
      });
      console.log(`[FirebaseAdmin] Inicializado com a credencial ${serviceAccount.source}.`);
    } else {
      console.warn('[FirebaseAdmin] Nenhuma chave PEM válida foi encontrada; usando credenciais padrão.');
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
  isValidPrivateKey,
  resolveFirebaseServiceAccount,
};
