// ============================================
// DILIGÊNCIA 360 — API Client
// Todas as chamadas passam pelo backend.
// Nenhum token ou chave fica no navegador.
// ============================================

const API_BASE = '/api';

const ApiClient = {
  async consultarEmpresa(cnpj) {
    const cleaned = cnpj.replace(/[^a-zA-Z0-9]/g, '');
    try {
      const res = await fetch(`${API_BASE}/empresa/${cleaned}`);
      return await res.json();
    } catch (err) {
      return { sucesso: false, erro: err.message, fonte: 'BrasilAPI', tipo: 'cadastro', status: 'erro' };
    }
  },

  async consultarCEIS(cnpj) {
    const cleaned = cnpj.replace(/[^a-zA-Z0-9]/g, '');
    try {
      const res = await fetch(`${API_BASE}/cgu/ceis/${cleaned}`);
      return await res.json();
    } catch (err) {
      return { sucesso: false, erro: err.message, encontrado: false, registros: [], fonte: 'CGU', tipo: 'ceis', status: 'erro' };
    }
  },

  async consultarCNEP(cnpj) {
    const cleaned = cnpj.replace(/[^a-zA-Z0-9]/g, '');
    try {
      const res = await fetch(`${API_BASE}/cgu/cnep/${cleaned}`);
      return await res.json();
    } catch (err) {
      return { sucesso: false, erro: err.message, encontrado: false, registros: [], fonte: 'CGU', tipo: 'cnep', status: 'erro' };
    }
  },

  async consultarCEPIM(cnpj) {
    const cleaned = cnpj.replace(/[^a-zA-Z0-9]/g, '');
    try {
      const res = await fetch(`${API_BASE}/cgu/cepim/${cleaned}`);
      return await res.json();
    } catch (err) {
      return { sucesso: false, erro: err.message, encontrado: false, registros: [], fonte: 'CGU', tipo: 'cepim', status: 'erro' };
    }
  },

  async consultarLeniencia(cnpj) {
    const cleaned = cnpj.replace(/[^a-zA-Z0-9]/g, '');
    try {
      const res = await fetch(`${API_BASE}/cgu/leniencia/${cleaned}`);
      return await res.json();
    } catch (err) {
      return { sucesso: false, erro: err.message, encontrado: false, registros: [], fonte: 'CGU', tipo: 'leniencia', status: 'erro' };
    }
  },

  async consultarPEP(nome) {
    try {
      const res = await fetch(`${API_BASE}/cgu/pep?nome=${encodeURIComponent(nome)}`);
      return await res.json();
    } catch (err) {
      return { sucesso: false, erro: err.message, nome, encontrado: false, registros: [], fonte: 'CGU', tipo: 'pep', status: 'erro' };
    }
  },

  async status() {
    try {
      const res = await fetch(`${API_BASE}/status`);
      return await res.json();
    } catch (err) {
      return { status: 'offline', erro: err.message };
    }
  }
};

export default ApiClient;
