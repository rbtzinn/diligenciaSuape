// ==========================================================
// DILIGÊNCIA 360 — Repositório de histórico no Google Sheets
// ==========================================================

const crypto = require('crypto');
const zlib = require('zlib');
const { getGoogleSheetsClient } = require('../config/google-sheets');

const CHUNK_SIZE = 45_000;
const INDEX_HEADERS = [
  'id',
  'cnpj',
  'razao_social',
  'nome_fantasia',
  'status',
  'nivel_risco',
  'score_risco',
  'decisao',
  'criado_em',
  'atualizado_em',
  'criado_por_uid',
  'criado_por_email',
  'criado_por_nome',
  'total_chunks',
  'payload_sha256',
  'payload_encoding',
  'versao',
  'concluido_em',
  'excluido_em',
  'payload_row_inicio',
  'payload_row_fim',
];

let writeQueue = Promise.resolve();

function withWriteLock(operation) {
  const running = writeQueue.then(operation, operation);
  writeQueue = running.catch(() => undefined);
  return running;
}

function iso(value, fallback = '') {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function cleanCnpj(value) {
  return String(value || '').replace(/\D/g, '');
}

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function isTruthyCell(value) {
  return value === true || String(value).toLowerCase() === 'true' || String(value) === '1';
}

function serializePayload(snapshot) {
  const json = JSON.stringify(snapshot);
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  const encoded = zlib.gzipSync(Buffer.from(json, 'utf8')).toString('base64');
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += CHUNK_SIZE) {
    chunks.push(encoded.slice(offset, offset + CHUNK_SIZE));
  }
  return { hash, chunks };
}

function parseAppendedRows(payload) {
  const updatedRange = payload?.updates?.updatedRange || payload?.tableRange || '';
  const match = String(updatedRange).match(/![A-Z]+(\d+):[A-Z]+(\d+)$/i);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

function mapIndexRow(row, rowNumber) {
  return {
    rowNumber,
    id: String(row[0] || ''),
    cnpj: String(row[1] || ''),
    razaoSocial: String(row[2] || ''),
    nomeFantasia: String(row[3] || ''),
    status: String(row[4] || 'in_progress'),
    level: String(row[5] || 'Atenção Baixa'),
    score: numeric(row[6]),
    decision: String(row[7] || ''),
    createdAt: String(row[8] || ''),
    updatedAt: String(row[9] || ''),
    createdByUid: String(row[10] || ''),
    createdByEmail: String(row[11] || ''),
    createdByName: String(row[12] || ''),
    totalChunks: numeric(row[13]),
    payloadHash: String(row[14] || ''),
    payloadEncoding: String(row[15] || ''),
    version: numeric(row[16], 1),
    completedAt: String(row[17] || ''),
    deletedAt: String(row[18] || ''),
    payloadStartRow: numeric(row[19]),
    payloadEndRow: numeric(row[20]),
  };
}

function indexValues(snapshot, existing, storage) {
  const now = new Date().toISOString();
  const createdBy = snapshot.createdBy || {};
  const status = snapshot.status || 'in_progress';
  const createdAt = existing?.createdAt || iso(snapshot.dataAnalise || snapshot.createdAt, now);
  const completedAt = iso(snapshot.completedAt, status === 'completed' ? now : existing?.completedAt || '');

  return [
    snapshot.id,
    cleanCnpj(snapshot.cnpj || snapshot.cnpjFmt || snapshot.empresa?.cnpj),
    snapshot.razaoSocial || snapshot.empresa?.razao_social || '',
    snapshot.nomeFantasia || snapshot.empresa?.nome_fantasia || '',
    status,
    snapshot.risco?.nivel || 'Atenção Baixa',
    numeric(snapshot.risco?.score),
    snapshot.risco?.decisao || '',
    createdAt,
    now,
    createdBy.firebaseUid || createdBy.id || snapshot.createdById || existing?.createdByUid || '',
    createdBy.email || snapshot.createdByEmail || existing?.createdByEmail || '',
    createdBy.name || existing?.createdByName || '',
    storage.totalChunks,
    storage.hash,
    'gzip-base64',
    storage.version,
    completedAt,
    existing?.deletedAt || '',
    storage.startRow,
    storage.endRow,
  ];
}

function auditRow(data) {
  const user = data.user || {};
  const createdAt = iso(data.createdAt, new Date().toISOString());
  return {
    id: data.id || crypto.randomUUID(),
    diligenceId: data.diligenceId,
    action: data.action || 'update',
    entityType: data.entityType || 'diligence',
    entityId: data.entityId || data.diligenceId,
    previousStatus: data.previousStatus || '',
    newStatus: data.newStatus || '',
    justification: data.justification || '',
    userId: user.firebaseUid || user.id || data.userId || '',
    userEmail: user.email || data.userEmail || '',
    userName: user.name || data.reviewedBy || data.userName || 'Sistema / Diligência 360',
    createdAt,
    metadata: data.metadata || {},
  };
}

function auditValues(entry) {
  return [[
    entry.id,
    entry.diligenceId,
    entry.action,
    entry.entityType,
    entry.entityId,
    entry.previousStatus,
    entry.newStatus,
    entry.justification,
    entry.userId,
    entry.userEmail,
    entry.userName,
    entry.createdAt,
    JSON.stringify(entry.metadata || {}),
  ]];
}

async function readIndexRows(client) {
  const values = await client.getValues('Diligencias!A:U');
  if (!values.length || INDEX_HEADERS.some((header, index) => values[0]?.[index] !== header)) {
    throw new Error('A aba Diligencias não corresponde ao esquema versão 2 esperado.');
  }
  return values.slice(1).map((row, index) => mapIndexRow(row, index + 2));
}

async function appendAuditSafely(client, data) {
  if (!data) return null;
  const entry = auditRow(data);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await client.appendValues('Auditoria!A:M', auditValues(entry));
      return entry;
    } catch (error) {
      lastError = error;
    }
  }
  console.error('[GoogleSheets] Snapshot salvo, mas a aba Auditoria não pôde ser atualizada:', lastError?.message);
  return { ...entry, persisted: false, error: lastError?.message };
}

async function saveUnlocked(snapshotInput, audit) {
  const client = getGoogleSheetsClient();
  const rows = await readIndexRows(client);
  const id = snapshotInput.id || crypto.randomUUID();
  const existing = rows.find((entry) => entry.id === id);
  const version = (existing?.version || 0) + 1;
  const snapshot = {
    ...snapshotInput,
    id,
    dataAnalise: snapshotInput.dataAnalise || existing?.createdAt || new Date().toISOString(),
    status: snapshotInput.status || existing?.status || 'in_progress',
  };
  const serialized = serializePayload(snapshot);
  const createdAt = new Date().toISOString();
  const payloadRows = serialized.chunks.map((chunk, index) => [
    id,
    version,
    index + 1,
    serialized.chunks.length,
    chunk,
    serialized.hash,
    createdAt,
    true,
  ]);

  const appended = await client.appendValues('Payloads!A:H', payloadRows);
  let payloadRange = parseAppendedRows(appended);
  if (!payloadRange) {
    const payloadIds = await client.getValues('Payloads!A:A');
    payloadRange = {
      start: Math.max(2, payloadIds.length - payloadRows.length + 1),
      end: Math.max(2, payloadIds.length),
    };
  }

  const values = indexValues(snapshot, existing, {
    version,
    hash: serialized.hash,
    totalChunks: serialized.chunks.length,
    startRow: payloadRange.start,
    endRow: payloadRange.end,
  });

  if (existing) {
    await client.updateValues(`Diligencias!A${existing.rowNumber}:U${existing.rowNumber}`, [values]);
  } else {
    await client.appendValues('Diligencias!A:U', [values]);
  }

  const auditEntry = await appendAuditSafely(client, audit ? { ...audit, diligenceId: id } : null);
  return {
    ...snapshot,
    persisted: true,
    createdAt: values[8],
    updatedAt: values[9],
    version,
    payloadHash: serialized.hash,
    audit: auditEntry || undefined,
  };
}

async function findByIdUnlocked(id, { includeDeleted = false } = {}) {
  const client = getGoogleSheetsClient();
  const rows = await readIndexRows(client);
  const index = rows.find((entry) => entry.id === id);
  if (!index || (index.deletedAt && !includeDeleted)) return null;

  let payloadRows;
  if (index.payloadStartRow > 0 && index.payloadEndRow >= index.payloadStartRow) {
    payloadRows = await client.getValues(`Payloads!A${index.payloadStartRow}:H${index.payloadEndRow}`);
  } else {
    payloadRows = (await client.getValues('Payloads!A:H')).slice(1);
  }

  const currentChunks = payloadRows
    .filter((row) => (
      String(row[0] || '') === id
      && numeric(row[1]) === index.version
      && isTruthyCell(row[7])
    ))
    .sort((left, right) => numeric(left[2]) - numeric(right[2]));

  if (currentChunks.length !== index.totalChunks) {
    throw new Error(`Payload incompleto para a diligência ${id}: esperado ${index.totalChunks}, recebido ${currentChunks.length}.`);
  }

  const encoded = currentChunks.map((row) => String(row[4] || '')).join('');
  const json = zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  if (hash !== index.payloadHash) {
    throw new Error(`Falha de integridade no histórico da diligência ${id}.`);
  }

  return JSON.parse(json);
}

const DiligenceRepository = {
  INDEX_HEADERS,

  async saveComplete(data, options = {}) {
    return await withWriteLock(() => saveUnlocked(data, options.audit));
  },

  async findById(id, options) {
    return await findByIdUnlocked(id, options);
  },

  async listAll(limit = 100, filters = {}) {
    const rows = await readIndexRows(getGoogleSheetsClient());
    return rows
      .filter((entry) => !entry.deletedAt)
      .filter((entry) => !filters.status || entry.status === filters.status)
      .filter((entry) => !filters.level || entry.level === filters.level)
      .filter((entry) => !filters.cnpj || cleanCnpj(entry.cnpj) === cleanCnpj(filters.cnpj))
      .filter((entry) => !filters.responsibleId || entry.createdByUid === filters.responsibleId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, Math.max(1, Math.min(numeric(limit, 100), 500)))
      .map((entry) => ({
        id: entry.id,
        cnpj: entry.cnpj,
        razaoSocial: entry.razaoSocial,
        nomeFantasia: entry.nomeFantasia,
        dataAnalise: entry.createdAt,
        preliminaryScore: entry.score,
        preliminaryLevel: entry.level,
        recommendation: entry.decision,
        status: entry.status,
        createdBy: entry.createdByUid ? {
          id: entry.createdByUid,
          firebaseUid: entry.createdByUid,
          email: entry.createdByEmail,
          name: entry.createdByName,
        } : undefined,
        completedAt: entry.completedAt || undefined,
        updatedAt: entry.updatedAt,
      }));
  },

  async mutate(id, mutator, audit) {
    return await withWriteLock(async () => {
      const current = await findByIdUnlocked(id);
      if (!current) throw new Error('Diligência não encontrada.');
      const next = structuredClone(current);
      await mutator(next);

      if (audit) {
        const entry = auditRow({ ...audit, diligenceId: id });
        next.timeline = Array.isArray(next.timeline) ? next.timeline : [];
        next.timeline.push({
          time: entry.createdAt,
          txt: entry.justification || `${entry.action} registrado por ${entry.userName}.`,
          tipo: entry.entityType === 'workflow' ? 'workflow' : 'review',
          userId: entry.userId || undefined,
        });
        const saved = await saveUnlocked(next, entry);
        return { snapshot: saved, audit: saved.audit };
      }

      return { snapshot: await saveUnlocked(next) };
    });
  },

  async updateDiligence(id, data, audit) {
    const result = await this.mutate(id, (snapshot) => {
      Object.assign(snapshot, data);
    }, audit);
    return result.snapshot;
  },

  async appendAudit(data) {
    try {
      const client = getGoogleSheetsClient();
      if (!client.isConfigured()) return null;
      return await appendAuditSafely(client, data);
    } catch (e) {
      console.warn('[DiligenceRepository] appendAudit não pôde ser gravado:', e.message);
      return null;
    }
  },

  async delete(id, user) {
    return await withWriteLock(async () => {
      const client = getGoogleSheetsClient();
      const rows = await readIndexRows(client);
      const existing = rows.find((entry) => entry.id === id);
      if (!existing || existing.deletedAt) return false;

      const values = await client.getValues(`Diligencias!A${existing.rowNumber}:U${existing.rowNumber}`);
      const row = values[0] || [];
      while (row.length < INDEX_HEADERS.length) row.push('');
      row[9] = new Date().toISOString();
      row[18] = row[9];
      await client.updateValues(`Diligencias!A${existing.rowNumber}:U${existing.rowNumber}`, [row]);
      await appendAuditSafely(client, {
        diligenceId: id,
        user,
        action: 'soft_delete',
        entityType: 'diligence',
        entityId: id,
        previousStatus: existing.status,
        newStatus: 'deleted',
        justification: 'Dossiê removido da visualização. Payload e auditoria foram preservados.',
      });
      return true;
    });
  },
};

module.exports = { DiligenceRepository };
