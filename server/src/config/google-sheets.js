// ==========================================================
// DILIGÊNCIA 360 — Cliente autenticado da API Google Sheets
// ==========================================================

const crypto = require('crypto');
const { normalizePrivateKey } = require('./firebase-admin');

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/** 1 -> A, 26 -> Z, 27 -> AA: notação de coluna da planilha. */
function columnLetter(index) {
  let resto = Math.max(1, Math.floor(index));
  let letras = '';
  while (resto > 0) {
    const atual = (resto - 1) % 26;
    letras = String.fromCharCode(65 + atual) + letras;
    resto = Math.floor((resto - 1) / 26);
  }
  return letras;
}

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
    this.abasGarantidas = new Set();
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

  async request(path, { method = 'GET', query, body, rangesList } = {}) {
    const token = await this.getAccessToken();
    const url = new URL(`${API_BASE}/${this.spreadsheetId}${path}`);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });
    // `ranges` é o único parâmetro que a API espera repetido, e
    // `searchParams.set` sobrescreveria as ocorrências anteriores.
    (rangesList || []).forEach((range) => url.searchParams.append('ranges', range));

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

  /**
   * Escreve vários intervalos numa chamada só.
   *
   * Preencher o formulário de SUAPE toca trinta células espalhadas por
   * duas abas. Uma requisição por célula estouraria a cota da API e
   * deixaria a planilha meio escrita se falhasse no meio; aqui ou tudo
   * é aceito, ou nada é.
   *
   * @param {Array<{range: string, values: any[][]}>} dados
   */
  async batchUpdateValues(dados) {
    if (!Array.isArray(dados) || dados.length === 0) return null;
    return await this.request('/values:batchUpdate', {
      method: 'POST',
      body: {
        valueInputOption: 'USER_ENTERED',
        data: dados.map((item) => ({
          range: item.range,
          majorDimension: 'ROWS',
          values: item.values,
        })),
      },
    });
  }

  /** Lê vários intervalos numa chamada só, já com as fórmulas resolvidas. */
  async batchGetValues(ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) return {};
    const payload = await this.request('/values:batchGet', {
      query: {
        ranges: undefined,
        majorDimension: 'ROWS',
        valueRenderOption: 'UNFORMATTED_VALUE',
      },
      rangesList: ranges,
    });
    const resultado = {};
    (payload.valueRanges || []).forEach((faixa, indice) => {
      resultado[ranges[indice]] = faixa?.values?.[0]?.[0] ?? null;
    });
    return resultado;
  }

  async clearValues(range) {
    return await this.request(`/values/${encodeURIComponent(range)}:clear`, { method: 'POST', body: {} });
  }

  /**
   * Garante que a aba existe, criando-a com o cabeçalho quando faltar.
   *
   * Sem isto, toda aba nova vira uma instrução manual: "abra a planilha,
   * crie a aba com este nome exato e digite estas colunas na ordem". É
   * trabalho que a própria API faz, e um nome digitado errado quebra a
   * gravação de um jeito difícil de diagnosticar.
   *
   * @param {string} title nome da aba
   * @param {string[]} headers cabeçalho da primeira linha
   * @returns {Promise<boolean>} verdadeiro se a aba foi criada agora
   */
  /** Nomes das abas existentes na planilha. */
  async listSheetTitles() {
    return (await this.listSheets()).map((aba) => aba.title);
  }

  /** Abas com o identificador que o endereço `#gid=` usa. */
  async listSheets() {
    const metadados = await this.request('', {
      query: { fields: 'sheets.properties(title,sheetId)' },
    });
    return (metadados.sheets || [])
      .map((aba) => ({ title: aba?.properties?.title, sheetId: aba?.properties?.sheetId }))
      .filter((aba) => aba.title);
  }

  /**
   * Endereço da planilha, já aberto na aba indicada.
   *
   * Dizer "preenchido" sem dar o caminho obriga o analista a procurar a
   * planilha em outro lugar para conferir o que acabou de ser escrito.
   */
  sheetUrl(sheetId) {
    if (!this.spreadsheetId) return '';
    const base = `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit`;
    return sheetId === undefined || sheetId === null ? base : `${base}#gid=${sheetId}`;
  }

  async ensureSheet(title, headers = []) {
    if (this.abasGarantidas.has(title)) return false;

    const existentes = await this.listSheetTitles();

    if (existentes.includes(title)) {
      this.abasGarantidas.add(title);
      return false;
    }

    await this.request(':batchUpdate', {
      method: 'POST',
      body: { requests: [{ addSheet: { properties: { title } } }] },
    });

    if (headers.length > 0) {
      const ultimaColuna = columnLetter(headers.length);
      await this.updateValues(`${title}!A1:${ultimaColuna}1`, [headers]);
    }

    this.abasGarantidas.add(title);
    return true;
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
  columnLetter,
  GoogleSheetsClient,
  getGoogleSheetsClient,
  setGoogleSheetsClientForTests,
  checkGoogleSheetsHealth,
};
