// ============================================
// Diligência 360 — App completo (4 consultas reais + dashboard)
// ============================================

// ---------- Utilidades ----------
const CNPJ = {
  clean: v => String(v).replace(/\D/g, ''),
  format: v => {
    const c = String(v).replace(/\D/g, '');
    if (c.length !== 14) return v;
    return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  },
  mask: v => {
    let c = v.replace(/\D/g, '').substring(0, 14);
    if (c.length > 12) c = c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
    else if (c.length > 8) c = c.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
    else if (c.length > 5) c = c.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
    else if (c.length > 2) c = c.replace(/^(\d{2})(\d{0,3})/, '$1.$2');
    return c;
  },
  validate: v => {
    const c = String(v).replace(/\D/g, '');
    if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    const calc = (b, w) => { let s = 0; for (let i = 0; i < w.length; i++) s += parseInt(b[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return parseInt(c[12]) === calc(c, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) && parseInt(c[13]) === calc(c, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  }
};

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d; }
}
function fmtTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleTimeString('pt-BR'); } catch { return d; }
}
function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; }
}

// ---------- Storage (localStorage — demo only) ----------
const STORAGE_KEY = 'diligencia360_items';
const Storage = {
  getAll: () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } },
  save: (item) => { const all = Storage.getAll(); const i = all.findIndex(x => x.id === item.id); if (i >= 0) all[i] = item; else all.unshift(item); localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); },
  getById: (id) => Storage.getAll().find(x => x.id === id),
  count: () => Storage.getAll().length,
  newId: () => 'dil_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
};

// ---------- API Client (tudo via backend) ----------
const API = {
  empresa: async (cnpj) => { try { const r = await fetch(`/api/empresa/${CNPJ.clean(cnpj)}`); return await r.json(); } catch (e) { return { ok: false, erro: e.message }; } },
  ceis: async (cnpj) => { try { const r = await fetch(`/api/cgu/ceis/${CNPJ.clean(cnpj)}`); return await r.json(); } catch (e) { return { ok: false, erro: e.message }; } },
  cnep: async (cnpj) => { try { const r = await fetch(`/api/cgu/cnep/${CNPJ.clean(cnpj)}`); return await r.json(); } catch (e) { return { ok: false, erro: e.message }; } },
  pep: async (nome) => { try { const r = await fetch(`/api/cgu/pep?nome=${encodeURIComponent(nome)}`); return await r.json(); } catch (e) { return { ok: false, erro: e.message }; } },
};

// ---------- Motor de Risco (preliminar) ----------
function calcularRisco(dados) {
  let score = 0;
  const detalhes = [];

  const sit = (dados.empresa?.descricao_situacao_cadastral || '').toUpperCase();
  if (sit && sit !== 'ATIVA') { score += 25; detalhes.push({ criterio: 'Situação não-ativa', pontos: 25, info: sit }); }
  if (dados.ceis?.encontrado) { score += 30; detalhes.push({ criterio: 'Registro no CEIS', pontos: 30, info: `${dados.ceis.quantidade} registro(s)` }); }
  if (dados.cnep?.encontrado) { score += 25; detalhes.push({ criterio: 'Registro no CNEP', pontos: 25, info: `${dados.cnep.quantidade} registro(s)` }); }
  const pepCount = (dados.pepResults || []).filter(p => p.encontrado).length;
  if (pepCount > 0) { const pts = pepCount * 15; score += pts; detalhes.push({ criterio: 'Sócio(s) PEP', pontos: pts, info: `${pepCount} sócio(s)` }); }

  score = Math.min(score, 100);
  let nivel, cor, emoji, decisao, decisaoDesc;
  if (score <= 20) { nivel = 'Baixo'; cor = 'low'; emoji = '🟢'; decisao = 'Seguir'; decisaoDesc = 'Nenhuma ocorrência significativa.'; }
  else if (score <= 45) { nivel = 'Médio'; cor = 'medium'; emoji = '🟡'; decisao = 'Seguir com Ressalvas'; decisaoDesc = 'Informações que merecem atenção.'; }
  else if (score <= 70) { nivel = 'Alto'; cor = 'high'; emoji = '🟠'; decisao = 'Aprofundar Diligência'; decisaoDesc = 'Ocorrências importantes a investigar.'; }
  else { nivel = 'Crítico'; cor = 'critical'; emoji = '🔴'; decisao = 'Encaminhar para Avaliação'; decisaoDesc = 'Elementos críticos encontrados.'; }

  return { score, nivel, cor, emoji, decisao, decisaoDesc, detalhes };
}

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);
const view = () => $('#view-container');
const badge = () => $('#history-count');

// ---------- Navegação ----------
function navigate(to, data) {
  document.querySelectorAll('.sidebar-item[data-view]').forEach(n => n.classList.remove('active'));
  const active = $(`[data-view="${to}"]`);
  if (active) active.classList.add('active');
  if (to === 'chat') renderChat();
  else if (to === 'history') renderHistory();
  else if (to === 'dashboard') renderDashboard(data);
  updateBadge();
}

function updateBadge() {
  const c = Storage.count();
  badge().textContent = c;
  badge().style.display = c > 0 ? 'flex' : 'none';
}

window.__nav = navigate;
window.__openDash = (id) => { const d = Storage.getById(id); if (d) navigate('dashboard', d); };

// ============================================
// VIEW: CHAT — Nova Diligência
// ============================================
function renderChat() {
  view().innerHTML = `
    <div class="chat-view">
      <div class="chat-header">
        <div class="chat-header-icon">🔍</div>
        <h1>Nova Diligência</h1>
        <p>Informe o CNPJ da empresa. Consultas reais serão feitas em fontes oficiais.</p>
      </div>
      <div class="chat-messages" id="msgs">
        <div class="chat-message ai animate-fade-in-up">
          <div class="chat-avatar">🔍</div>
          <div class="chat-bubble">
            <p>Informe o <strong>CNPJ</strong> da empresa para iniciar a diligência.</p>
            <p><span class="badge badge-automated">⚡ Análise automatizada por regras</span></p>
          </div>
        </div>
      </div>
      <div class="chat-input-area">
        <div class="chat-input-wrapper">
          <input type="text" class="chat-input input-mono" id="inp" placeholder="00.000.000/0000-00" maxlength="18" autocomplete="off">
          <button class="chat-send-btn" id="sendbtn">➜</button>
        </div>
      </div>
    </div>`;
  const inp = $('#inp');
  inp.addEventListener('input', e => { e.target.value = CNPJ.mask(e.target.value); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  $('#sendbtn').addEventListener('click', run);
  inp.focus();
}

function addMsg(who, html) {
  const d = $('#msgs');
  const m = document.createElement('div');
  m.className = `chat-message ${who} animate-fade-in-up`;
  m.innerHTML = who === 'user'
    ? `<div class="chat-avatar">👤</div><div class="chat-bubble"><p>${html}</p></div>`
    : `<div class="chat-avatar">🔍</div><div class="chat-bubble">${html}</div>`;
  d.appendChild(m);
  d.scrollTop = d.scrollHeight;
  return m;
}

// ---------- Executar Diligência ----------
let running = false;
async function run() {
  if (running) return;
  const raw = $('#inp').value;
  const cnpj = CNPJ.clean(raw);
  if (!CNPJ.validate(cnpj)) {
    addMsg('user', raw);
    addMsg('ai', '<p style="color:var(--error)">CNPJ inválido. Verifique e tente novamente.</p>');
    return;
  }
  running = true;
  $('#inp').disabled = true;
  $('#sendbtn').disabled = true;

  addMsg('user', CNPJ.format(cnpj));

  // Steps progress
  const steps = [
    { id: 'emp', label: 'Consultando cadastro empresarial' },
    { id: 'soc', label: 'Identificando sócios' },
    { id: 'ceis', label: 'Consultando CEIS (Inidôneas)' },
    { id: 'cnep', label: 'Consultando CNEP (Punidas)' },
    { id: 'pep', label: 'Consultando PEP dos sócios' },
    { id: 'risk', label: 'Calculando risco' },
  ];

  const progressMsg = addMsg('ai', `<div id="progress">${steps.map((s, i) =>
    `<div class="progress-step pending" id="st-${s.id}" style="animation-delay:${i * 0.06}s">
      <div class="progress-step-icon">⏳</div>
      <span class="progress-step-text">${s.label}</span>
      <span class="progress-step-detail" id="dt-${s.id}"></span>
    </div>`
  ).join('')}</div>`);

  const setStep = (id, status, detail) => {
    const el = $(`#st-${id}`);
    if (!el) return;
    el.className = `progress-step ${status}`;
    el.querySelector('.progress-step-icon').textContent = status === 'done' ? '✓' : status === 'error' ? '✗' : '⏳';
    if (detail) $(`#dt-${id}`).textContent = detail;
    $('#msgs').scrollTop = $('#msgs').scrollHeight;
  };

  const timeline = [];
  const tl = (txt, tipo = 'info') => timeline.push({ time: new Date().toISOString(), txt, tipo });

  tl('Diligência iniciada');

  // 1. Empresa
  setStep('emp', 'loading');
  const empRes = await API.empresa(cnpj);
  if (!empRes.ok) {
    setStep('emp', 'error', empRes.erro);
    addMsg('ai', `<p style="color:var(--error)">Erro: ${empRes.erro}</p>`);
    running = false; $('#inp').disabled = false; $('#sendbtn').disabled = false;
    return;
  }
  setStep('emp', 'done');
  tl('Cadastro consultado');
  const empresa = empRes.data;

  // 2. Sócios
  setStep('soc', 'loading');
  const socios = empresa.qsa || [];
  setStep('soc', 'done', `${socios.length} sócio(s)`);
  tl(`${socios.length} sócio(s) identificado(s)`);

  // 3. CEIS
  setStep('ceis', 'loading');
  const ceisRes = await API.ceis(cnpj);
  if (!ceisRes.ok && !ceisRes.semChave) {
    setStep('ceis', 'error', 'Indisponível');
    tl(`CEIS: indisponível — ${ceisRes.erro}`, 'error');
  } else {
    setStep('ceis', 'done', ceisRes.encontrado ? `${ceisRes.quantidade} reg.` : 'Nenhuma');
    tl(ceisRes.encontrado ? `CEIS: ${ceisRes.quantidade} registro(s)` : 'CEIS: nenhuma ocorrência', ceisRes.encontrado ? 'warning' : 'info');
  }

  // 4. CNEP
  setStep('cnep', 'loading');
  const cnepRes = await API.cnep(cnpj);
  if (!cnepRes.ok && !cnepRes.semChave) {
    setStep('cnep', 'error', 'Indisponível');
    tl(`CNEP: indisponível — ${cnepRes.erro}`, 'error');
  } else {
    setStep('cnep', 'done', cnepRes.encontrado ? `${cnepRes.quantidade} reg.` : 'Nenhuma');
    tl(cnepRes.encontrado ? `CNEP: ${cnepRes.quantidade} registro(s)` : 'CNEP: nenhuma ocorrência', cnepRes.encontrado ? 'warning' : 'info');
  }

  // 5. PEP — para cada sócio
  setStep('pep', 'loading');
  const pepResults = [];
  for (const s of socios) {
    if (s.nome_socio) {
      const p = await API.pep(s.nome_socio);
      pepResults.push({ nome: s.nome_socio, ...p });
      await new Promise(r => setTimeout(r, 400));
    }
  }
  const pepHits = pepResults.filter(p => p.encontrado).length;
  setStep('pep', 'done', pepHits > 0 ? `${pepHits} ocorrência(s)` : 'Nenhuma');
  tl(pepHits > 0 ? `PEP: ${pepHits} ocorrência(s)` : 'PEP: nenhuma ocorrência', pepHits > 0 ? 'warning' : 'info');

  // 6. Risco
  setStep('risk', 'loading');
  const risco = calcularRisco({ empresa, ceis: ceisRes, cnep: cnepRes, pepResults });
  setStep('risk', 'done', `${risco.score}/100`);
  tl(`Risco: ${risco.score}/100 — ${risco.nivel}`, risco.score > 45 ? 'warning' : 'info');
  tl('Diligência concluída');

  // Salvar
  const diligence = {
    id: Storage.newId(),
    cnpj: CNPJ.clean(cnpj),
    cnpjFmt: CNPJ.format(cnpj),
    razaoSocial: empresa.razao_social || '',
    nomeFantasia: empresa.nome_fantasia || '',
    dataAnalise: new Date().toISOString(),
    empresa, socios, ceis: ceisRes, cnep: cnepRes, pepResults, risco, timeline
  };
  Storage.save(diligence);

  // Card de resultado
  addMsg('ai', `
    <p>Diligência concluída.</p>
    <div class="chat-result-card">
      <div class="chat-result-header">
        <div>
          <div class="chat-result-company">${diligence.razaoSocial}</div>
          <div class="chat-result-cnpj">${diligence.cnpjFmt}</div>
        </div>
        <span class="badge badge-${risco.cor}">${risco.emoji} ${risco.nivel}</span>
      </div>
      <div class="chat-result-items" style="margin-top:var(--space-3)">
        <div class="chat-result-item">📊 Score: <strong>${risco.score}/100</strong> (preliminar)</div>
        <div class="chat-result-item">👥 Sócios: ${socios.length}</div>
        <div class="chat-result-item">${risco.emoji} ${risco.decisao}</div>
      </div>
      <button class="btn btn-primary btn-lg chat-view-dashboard-btn" onclick="window.__openDash('${diligence.id}')">📊 Ver Dashboard</button>
    </div>
    <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2)">Análise automatizada por regras. Não substitui avaliação humana.</p>
  `);

  running = false;
  updateBadge();
}

// ============================================
// VIEW: DASHBOARD
// ============================================
function renderDashboard(d) {
  if (!d) { view().innerHTML = '<div class="empty-state"><p>Nenhuma diligência selecionada.</p></div>'; return; }

  const e = d.empresa;
  const r = d.risco;
  const sit = (e.descricao_situacao_cadastral || 'N/I').toUpperCase();
  const sitClass = sit === 'ATIVA' ? 'badge-success' : 'badge-critical';

  const circ = 2 * Math.PI * 45;
  const offset = circ - (r.score / 100) * circ;
  const gColor = r.score <= 20 ? 'var(--risk-low)' : r.score <= 45 ? 'var(--risk-medium)' : r.score <= 70 ? 'var(--risk-high)' : 'var(--risk-critical)';

  view().innerHTML = `
  <div class="dashboard-view">
    <button class="dash-back" onclick="window.__nav('chat')">← Nova Diligência</button>

    <!-- Header -->
    <div class="dash-header animate-fade-in-down">
      <div class="dash-company-info">
        <div class="dash-company-name">${e.razao_social || 'N/I'}</div>
        ${e.nome_fantasia ? `<div style="color:var(--text-secondary);font-size:var(--text-sm)">${e.nome_fantasia}</div>` : ''}
        <div class="dash-company-meta">
          <div class="dash-meta-item"><span class="label">CNPJ:</span> <span class="value">${d.cnpjFmt}</span></div>
          <div class="dash-meta-item"><span class="badge ${sitClass}">${sit}</span></div>
          <div class="dash-meta-item"><span class="label">Análise:</span> <span class="value">${fmtDateTime(d.dataAnalise)}</span></div>
        </div>
      </div>
      <div class="dash-score-section">
        <div class="dash-score-label">Risco (Preliminar)</div>
        <div class="risk-gauge">
          <svg viewBox="0 0 100 100">
            <circle class="risk-gauge-bg" cx="50" cy="50" r="45"></circle>
            <circle class="risk-gauge-fill" cx="50" cy="50" r="45" stroke="${gColor}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"></circle>
          </svg>
          <div class="risk-gauge-value">
            <div class="risk-gauge-number" style="color:${gColor}">${r.score}</div>
            <div class="risk-gauge-max">/100</div>
          </div>
        </div>
        <span class="badge badge-${r.cor}">${r.emoji} ${r.nivel}</span>
      </div>
    </div>

    <!-- Decisão -->
    <div class="dash-decision animate-fade-in-up">
      <div class="dash-decision-left">
        <div class="dash-decision-icon" style="background:${r.score <= 20 ? 'var(--success-bg)' : r.score <= 45 ? 'var(--warning-bg)' : 'var(--error-bg)'};font-size:1.5rem">${r.score <= 20 ? '✅' : r.score <= 45 ? '⚠️' : r.score <= 70 ? '🔍' : '🚨'}</div>
        <div class="dash-decision-text">
          <h3>${r.decisao}</h3>
          <p>${r.decisaoDesc}</p>
        </div>
      </div>
    </div>

    <div class="dash-grid stagger-children">

      <!-- Cadastro -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title"><span class="dash-card-title-icon">🏢</span> Cadastro Empresarial</div>
          <span class="badge badge-info">BrasilAPI</span>
        </div>
        <div class="dash-data-list">
          ${dataRow('Razão Social', e.razao_social)}
          ${dataRow('Nome Fantasia', e.nome_fantasia || '—')}
          ${dataRow('CNPJ', d.cnpjFmt, true)}
          ${dataRow('Situação', sit)}
          ${dataRow('Abertura', fmtDate(e.data_inicio_atividade))}
          ${dataRow('Nat. Jurídica', e.natureza_juridica || 'N/I')}
          ${dataRow('CNAE', e.cnae_fiscal_descricao || e.cnae_fiscal || 'N/I')}
          ${dataRow('Porte', e.porte || e.descricao_porte || 'N/I')}
          ${dataRow('Endereço', [e.logradouro, e.numero, e.bairro, e.municipio, e.uf].filter(Boolean).join(', ') || 'N/I')}
          ${e.email ? dataRow('E-mail', e.email) : ''}
          ${e.ddd_telefone_1 ? dataRow('Telefone', e.ddd_telefone_1) : ''}
        </div>
      </div>

      <!-- Sócios -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title"><span class="dash-card-title-icon">👥</span> Quadro Societário</div>
          <span class="badge badge-info">${d.socios.length} sócio(s)</span>
        </div>
        ${d.socios.length > 0 ? `
          <table class="dash-table">
            <thead><tr><th>Nome</th><th>Qualificação</th><th>Entrada</th></tr></thead>
            <tbody>${d.socios.map(s => `
              <tr>
                <td style="color:var(--text-primary)">${s.nome_socio || 'N/I'}</td>
                <td>${s.qualificacao_socio || 'N/I'}</td>
                <td class="font-mono" style="font-size:var(--text-xs)">${fmtDate(s.data_entrada_sociedade)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<p style="color:var(--text-tertiary);font-size:var(--text-sm)">Nenhum sócio na base consultada.</p>'}
      </div>

      <!-- CEIS -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title"><span class="dash-card-title-icon">🚫</span> CEIS — Inidôneas/Suspensas</div>
          ${statusBadge(d.ceis)}
        </div>
        ${sancoesContent(d.ceis)}
      </div>

      <!-- CNEP -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title"><span class="dash-card-title-icon">⚖️</span> CNEP — Empresas Punidas</div>
          ${statusBadge(d.cnep)}
        </div>
        ${sancoesContent(d.cnep)}
      </div>

      <!-- PEP -->
      <div class="dash-card dash-full-width">
        <div class="dash-card-header">
          <div class="dash-card-title"><span class="dash-card-title-icon">🏛️</span> Pessoas Expostas Politicamente</div>
          ${pepBadge(d.pepResults)}
        </div>
        ${pepContent(d.pepResults)}
      </div>

      <!-- Risco -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title"><span class="dash-card-title-icon">📊</span> Detalhes do Risco</div>
          <span class="badge badge-automated">Preliminar</span>
        </div>
        ${r.detalhes.length > 0 ? `
          <table class="dash-table">
            <thead><tr><th>Critério</th><th>Pontos</th><th>Info</th></tr></thead>
            <tbody>${r.detalhes.map(dt => `
              <tr>
                <td style="color:var(--text-primary)">${dt.criterio}</td>
                <td style="color:var(--risk-high);font-weight:600">+${dt.pontos}</td>
                <td>${dt.info}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<p style="color:var(--success);font-size:var(--text-sm)">Nenhuma penalidade aplicada.</p>'}
        <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--space-3)">Critérios preliminares. Sujeitos a revisão pela área de Compliance.</p>
      </div>

      <!-- Timeline -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title"><span class="dash-card-title-icon">📜</span> Trilha de Auditoria</div>
        </div>
        <div class="dash-timeline">
          ${(d.timeline || []).map(t => `
            <div class="timeline-item">
              <div class="timeline-marker">
                <div class="timeline-dot ${t.tipo}"></div>
                <div class="timeline-line"></div>
              </div>
              <div class="timeline-content">
                <div class="timeline-time">${fmtTime(t.time)}</div>
                <div class="timeline-text">${t.txt}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>

    </div>
    <div style="text-align:center;padding:var(--space-8) 0;color:var(--text-muted);font-size:var(--text-xs)">Análise automatizada por regras. Não substitui avaliação humana do Compliance.</div>
  </div>`;
}

// Helpers de render
function dataRow(label, value, mono) {
  return `<div class="dash-data-item"><span class="dash-data-label">${label}</span><span class="dash-data-value${mono ? ' mono' : ''}">${value || 'N/I'}</span></div>`;
}

function statusBadge(res) {
  if (!res) return '<span class="badge badge-critical">Erro</span>';
  if (res.semChave) return '<span class="badge badge-medium">Sem chave CGU</span>';
  if (!res.ok) return '<span class="badge badge-critical">Indisponível</span>';
  return res.encontrado ? `<span class="badge badge-high">${res.quantidade} reg.</span>` : '<span class="badge badge-success">Nenhuma</span>';
}

function pepBadge(list) {
  if (!list || list.length === 0) return '<span class="badge badge-info">Sem sócios</span>';
  const hits = list.filter(p => p.encontrado).length;
  return hits > 0 ? `<span class="badge badge-high">${hits} ocorrência(s)</span>` : '<span class="badge badge-success">Nenhuma</span>';
}

function sancoesContent(res) {
  if (!res) return '<p style="color:var(--error);font-size:var(--text-sm)">Consulta não realizada.</p>';
  if (res.semChave) return '<p style="color:var(--warning);font-size:var(--text-sm)">⚠️ Chave CGU não configurada no servidor.</p>';
  if (!res.ok) return `<p style="color:var(--error);font-size:var(--text-sm)">❌ Indisponível: ${res.erro}</p>`;
  if (!res.encontrado) return '<p style="color:var(--success);font-size:var(--text-sm)">✓ Nenhuma ocorrência encontrada.</p>';
  return `<table class="dash-table">
    <thead><tr><th>Órgão</th><th>Sanção</th><th>Período</th></tr></thead>
    <tbody>${res.registros.map(r => `
      <tr>
        <td style="color:var(--text-primary)">${r.orgao || 'N/I'}</td>
        <td>${r.sancao || 'N/I'}</td>
        <td style="font-size:var(--text-xs)">${r.inicio ? fmtDate(r.inicio) : 'N/I'}${r.fim ? ' → ' + fmtDate(r.fim) : ''}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

function pepContent(list) {
  if (!list || list.length === 0) return '<p style="color:var(--text-tertiary);font-size:var(--text-sm)">Nenhum sócio para consultar.</p>';
  const hits = list.filter(p => p.encontrado);
  if (hits.length === 0) return `<p style="color:var(--success);font-size:var(--text-sm)">✓ Nenhum dos ${list.length} sócio(s) identificado como PEP.</p>`;
  return `<div class="dash-alerts">${hits.map(p => `
    <div class="dash-alert alert-warning">
      <div class="dash-alert-icon">🏛️</div>
      <div class="dash-alert-content">
        <div class="dash-alert-title">${p.nome}</div>
        <div class="dash-alert-text">${p.quantidade} registro(s) PEP na base CGU.</div>
        ${p.registros?.[0] ? `<div class="dash-alert-text" style="margin-top:2px">Função: ${p.registros[0].funcao || 'N/I'} — Órgão: ${p.registros[0].orgao || 'N/I'}</div>` : ''}
      </div>
    </div>`).join('')}
  </div>
  <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--space-2)">PEP não significa irregularidade. Informação para análise do Compliance.</p>`;
}

// ============================================
// VIEW: HISTÓRICO
// ============================================
function renderHistory() {
  const all = Storage.getAll();
  view().innerHTML = `
    <div class="history-view">
      <div class="history-header">
        <h1>📁 Histórico</h1>
        <span class="badge badge-info">${all.length} diligência(s)</span>
      </div>
      ${all.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">📁</div>
          <div class="empty-state-title">Nenhuma diligência realizada</div>
          <button class="btn btn-primary" style="margin-top:var(--space-4)" onclick="window.__nav('chat')">Nova Diligência</button>
        </div>
      ` : `
        <div class="history-list stagger-children">
          ${all.map(d => {
    const r = d.risco || {};
    const sc = r.score || 0;
    const sColor = sc <= 20 ? 'var(--risk-low)' : sc <= 45 ? 'var(--risk-medium)' : sc <= 70 ? 'var(--risk-high)' : 'var(--risk-critical)';
    const sBg = sc <= 20 ? 'var(--risk-low-bg)' : sc <= 45 ? 'var(--risk-medium-bg)' : sc <= 70 ? 'var(--risk-high-bg)' : 'var(--risk-critical-bg)';
    return `
              <div class="history-card" onclick="window.__openDash('${d.id}')">
                <div class="history-card-score" style="background:${sBg};color:${sColor}">${sc}</div>
                <div class="history-card-info">
                  <div class="history-card-company">${d.razaoSocial || 'N/I'}</div>
                  <div class="history-card-cnpj">${d.cnpjFmt || d.cnpj}</div>
                </div>
                <div class="history-card-right">
                  <span class="badge badge-${r.cor || 'medium'}">${r.emoji || '—'} ${r.nivel || 'N/I'}</span>
                  <span class="history-card-date">${fmtDateTime(d.dataAnalise)}</span>
                </div>
              </div>`;
  }).join('')}
        </div>
      `}
      <p style="text-align:center;padding:var(--space-6) 0;color:var(--text-muted);font-size:var(--text-xs)">Dados em localStorage (apenas demonstração).</p>
    </div>`;
}

// ---------- Init ----------
document.querySelectorAll('.sidebar-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});
updateBadge();
renderChat();
