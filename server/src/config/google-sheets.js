// ==========================================================
// DILIGÊNCIA 360 — Cliente autenticado da API Google Sheets
// ==========================================================

const crypto = require('crypto');
const { normalizePrivateKey } = require('./firebase-admin');

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

class GoogleSheetsClient {
  constructor(options = {}) {
    this.spreadsheetId = options.spreadsheetId || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '';
    this.clientEmail = options.clientEmail
      || process.env.GOOGLE_SHEETS_CLIENT_EMAIL
      || process.env.FIREBASE_CLIENT_EMAIL
      || '';
    this.privateKey = normalizePrivateKey(
      options.privateKey
      || process.env.GOOGLE_SHEETS_PRIVATE_KEY
      || process.env.FIREBASE_PRIVATE_KEY
      || ''
    );
    this.fetch = options.fetch || globalThis.fetch;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  isConfigured() {
    return Boolean(this.spreadsheetId && this.clientEmail && this.privateKey);
  }

  assertConfigured() {
    if (!this.spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID não configurada.');
    }
    if (!this.clientEmail || !this.privateKey) {
      throw new Error(
        'Credencial de serviço do Google ausente. Configure GOOGLE_SHEETS_CLIENT_EMAIL/GOOGLE_SHEETS_PRIVATE_KEY ou reutilize FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.'
      );
    }
    if (typeof this.fetch !== 'function') {
      throw new Error('Runtime sem suporte a fetch para acessar o Google Sheets.');
    }
  }

  async getAccessToken() {
    this.assertConfigured();
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = encodeBase64Url(JSON.stringify({
      iss: this.clientEmail,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }));
    const unsignedToken = `${header}.${claim}`;
    const signature = crypto
      .sign('RSA-SHA256', Buffer.from(unsignedToken), this.privateKey)
      .toString('base64url');

    const response = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsignedToken}.${signature}`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
      throw new Error(body.error_description || body.error || 'Falha ao autenticar a conta de serviço no Google.');
    }

    this.accessToken = body.access_token;
    this.accessTokenExpiresAt = Date.now() + Math.max(60, Number(body.expires_in || 3600) - 90) * 1000;
    return this.accessToken;
  }

  async request(path, { method = 'GET', query, body } = {}) {
    const token = await this.getAccessToken();
    const url = new URL(`${API_BASE}/${this.spreadsheetId}${path}`);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });

    const response = await this.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    const payload = raw ? JSON.parse(raw) : {};
    if (!response.ok) {
      const message = payload?.error?.message || `Google Sheets respondeu HTTP ${response.status}.`;
      throw new Error(message);
    }
    return payload;
  }

  async getValues(range) {
    const payload = await this.request(`/values/${encodeURIComponent(range)}`, {
      query: { majorDimension: 'ROWS', valueRenderOption: 'UNFORMATTED_VALUE' },
    });
    return Array.isArray(payload.values) ? payload.values : [];
  }

  async appendValues(range, values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    return await this.request(`/values/${encodeURIComponent(range)}:append`, {
      method: 'POST',
      query: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
      body: { majorDimension: 'ROWS', values },
    });
  }

  async updateValues(range, values) {
    return await this.request(`/values/${encodeURIComponent(range)}`, {
      method: 'PUT',
      query: { valueInputOption: 'RAW' },
      body: { majorDimension: 'ROWS', values },
    });
  }

  async healthCheck() {
    const values = await this.getValues('Configuracao!A1:C2');
    const valid = values?.[0]?.[0] === 'chave' && values?.[1]?.[0] === 'schema_version';
    if (!valid) throw new Error('A planilha configurada não possui o esquema do Diligência 360.');
    return true;
  }
}

let singleton = null;

function getGoogleSheetsClient() {
  if (!singleton) singleton = new GoogleSheetsClient();
  return singleton;
}

function setGoogleSheetsClientForTests(client) {
  singleton = client;
}

async function checkGoogleSheetsHealth() {
  const client = getGoogleSheetsClient();
  if (!client.isConfigured()) {
    return {
      connected: false,
      provider: 'Google Sheets',
      message: 'Planilha ou credencial de serviço não configurada.',
    };
  }

  try {
    await client.healthCheck();
    return { connected: true, provider: 'Google Sheets' };
  } catch (error) {
    return { connected: false, provider: 'Google Sheets', message: error.message };
  }
}

module.exports = {
  GoogleSheetsClient,
  getGoogleSheetsClient,
  setGoogleSheetsClientForTests,
  checkGoogleSheetsHealth,
};
