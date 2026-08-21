// ============================================
// DILIGÊNCIA 360 — Local Storage Manager
// ============================================

const STORAGE_KEYS = {
  DILIGENCES: 'diligencia360_diligences',
  SETTINGS: 'diligencia360_settings',
  LAST_VIEW: 'diligencia360_lastview',
};

const Storage = {
  /**
   * Salva uma diligência completa
   */
  saveDiligence(diligence) {
    const diligences = this.getAllDiligences();
    const existingIndex = diligences.findIndex(d => d.id === diligence.id);

    if (existingIndex >= 0) {
      diligences[existingIndex] = diligence;
    } else {
      diligences.unshift(diligence);
    }

    localStorage.setItem(STORAGE_KEYS.DILIGENCES, JSON.stringify(diligences));
    return diligence;
  },

  /**
   * Retorna todas as diligências
   */
  getAllDiligences() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DILIGENCES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  /**
   * Busca diligência por ID
   */
  getDiligenceById(id) {
    const diligences = this.getAllDiligences();
    return diligences.find(d => d.id === id) || null;
  },

  /**
   * Busca diligências por CNPJ
   */
  getDiligencesByCNPJ(cnpj) {
    const cleaned = cnpj.replace(/\D/g, '');
    const diligences = this.getAllDiligences();
    return diligences.filter(d => d.cnpj.replace(/\D/g, '') === cleaned);
  },

  /**
   * Remove uma diligência
   */
  deleteDiligence(id) {
    const diligences = this.getAllDiligences().filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEYS.DILIGENCES, JSON.stringify(diligences));
  },

  /**
   * Conta total de diligências
   */
  countDiligences() {
    return this.getAllDiligences().length;
  },

  /**
   * Salva configurações
   */
  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  /**
   * Retorna configurações
   */
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  },

  /**
   * Salva última view
   */
  setLastView(view) {
    localStorage.setItem(STORAGE_KEYS.LAST_VIEW, view);
  },

  /**
   * Retorna última view
   */
  getLastView() {
    return localStorage.getItem(STORAGE_KEYS.LAST_VIEW) || 'chat';
  },

  /**
   * Gera ID único para diligência
   */
  generateId() {
    return 'dil_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
};

export default Storage;
