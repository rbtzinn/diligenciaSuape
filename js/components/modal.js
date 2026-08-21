// ==========================================================
// DILIGÊNCIA 360 — Drawer & Modal Component
// Permite visualização completa de dados com busca integrada
// sem poluir ou alongar a página principal.
// ==========================================================

const DrawerModal = {
  container: null,

  init() {
    if (this.container) return;
    const el = document.createElement('div');
    el.id = 'app-drawer-root';
    el.innerHTML = `
      <div class="drawer-backdrop" id="drawer-backdrop"></div>
      <div class="drawer-panel" id="drawer-panel">
        <div class="drawer-header">
          <div>
            <h3 class="drawer-title" id="drawer-title">Detalhes</h3>
            <p class="drawer-subtitle" id="drawer-subtitle"></p>
          </div>
          <button class="btn btn-ghost btn-sm" id="drawer-close-btn" title="Fechar">
            ${window.icon('close')}
          </button>
        </div>
        <div class="drawer-body" id="drawer-body"></div>
        <div class="drawer-footer">
          <button class="btn btn-secondary btn-sm" id="drawer-close-footer-btn">Fechar</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    this.container = el;

    document.getElementById('drawer-backdrop').addEventListener('click', () => this.close());
    document.getElementById('drawer-close-btn').addEventListener('click', () => this.close());
    document.getElementById('drawer-close-footer-btn').addEventListener('click', () => this.close());
    
    // ESC key listener
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  },

  open({ title, subtitle, renderContent }) {
    this.init();
    document.getElementById('drawer-title').textContent = title || 'Detalhes';
    document.getElementById('drawer-subtitle').textContent = subtitle || '';
    
    const bodyEl = document.getElementById('drawer-body');
    bodyEl.innerHTML = '';
    
    if (typeof renderContent === 'function') {
      renderContent(bodyEl);
    } else if (typeof renderContent === 'string') {
      bodyEl.innerHTML = renderContent;
    }

    document.getElementById('drawer-backdrop').classList.add('active');
    document.getElementById('drawer-panel').classList.add('active');
  },

  close() {
    if (!this.container) return;
    document.getElementById('drawer-backdrop').classList.remove('active');
    document.getElementById('drawer-panel').classList.remove('active');
  },

  /**
   * Modal especializado: Quadro Societário Completo
   */
  openSocios(socios = [], pepList = []) {
    this.open({
      title: 'Quadro Societário Completo (QSA)',
      subtitle: `${socios.length} sócio(s) e administrador(es) cadastrado(s)`,
      renderContent: (container) => {
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:1rem;">
            <div style="position:relative;">
              <input type="text" class="input-control" id="drawer-search-socios" placeholder="Buscar sócio por nome..." autocomplete="off">
            </div>
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Nome do Sócio</th>
                    <th>Qualificação</th>
                    <th>Entrada</th>
                    <th>Status PEP</th>
                  </tr>
                </thead>
                <tbody id="drawer-socios-tbody"></tbody>
              </table>
            </div>
          </div>
        `;

        const tbody = container.querySelector('#drawer-socios-tbody');
        const searchInput = container.querySelector('#drawer-search-socios');

        const renderRows = (query = '') => {
          const q = query.toLowerCase().trim();
          const filtered = socios.filter(s => (s.nome_socio || '').toLowerCase().includes(q));

          if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-tertiary);">Nenhum sócio encontrado para "${query}".</td></tr>`;
            return;
          }

          tbody.innerHTML = filtered.map(s => {
            const isPep = pepList.some(p => p.encontrado && p.nome?.toLowerCase() === s.nome_socio?.toLowerCase());
            return `
              <tr>
                <td style="font-weight:var(--font-medium); color:var(--text-primary);">
                  ${s.nome_socio || 'Não informado'}
                </td>
                <td>${s.qualificacao_socio || 'Não informado'}</td>
                <td class="font-mono" style="font-size:var(--text-xs);">${Formatters.date(s.data_entrada_sociedade)}</td>
                <td>
                  ${isPep 
                    ? `<span class="badge badge-medium">${window.icon('landmark')} Possível PEP</span>`
                    : `<span class="badge badge-neutral">Sem registro</span>`
                  }
                </td>
              </tr>
            `;
          }).join('');
        };

        renderRows();
        searchInput.addEventListener('input', (e) => renderRows(e.target.value));
        setTimeout(() => searchInput.focus(), 100);
      }
    });
  },

  /**
   * Modal especializado: Todas as Sanções (CEIS ou CNEP)
   */
  openSancoes(title, registros = [], tipo = 'CEIS') {
    this.open({
      title: `${tipo} — ${title}`,
      subtitle: `${registros.length} ocorrência(s) encontrada(s) na base oficial da CGU`,
      renderContent: (container) => {
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:1rem;">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Órgão Sancionador</th>
                    <th>Tipo de Sanção</th>
                    <th>Vigência</th>
                    <th>Fundamentação</th>
                  </tr>
                </thead>
                <tbody>
                  ${registros.map(r => `
                    <tr>
                      <td style="font-weight:var(--font-medium); color:var(--text-primary); max-width:220px;">
                        ${r.orgao || 'Não informado'}
                      </td>
                      <td>
                        <span class="badge badge-high" style="font-weight:var(--font-medium);">
                          ${r.sancao || 'Sanção registrada'}
                        </span>
                      </td>
                      <td style="font-size:var(--text-xs); white-space:nowrap;">
                        ${Formatters.date(r.inicio)} ${r.fim ? '→ ' + Formatters.date(r.fim) : '(Indeterminado)'}
                      </td>
                      <td style="font-size:var(--text-xs); color:var(--text-tertiary); max-width:200px;">
                        ${r.fundamentacao ? Formatters.truncate(r.fundamentacao, 100) : '—'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
    });
  }
};

window.DrawerModal = DrawerModal;
