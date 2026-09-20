// ==========================================================
// DILIGÊNCIA 360 — Motivo da falha de uma fonte
//
// A tela dizia "Fonte indisponível" para causas diferentes, e cada uma
// pede uma ação diferente: tempo esgotado se resolve reduzindo a
// varredura ou subindo o limite da plataforma; fonte fora do ar se
// resolve repetindo mais tarde; erro declarado pela fonte precisa ser
// lido. Cobrir as três com a mesma palavra escondia o encaminhamento.
// ==========================================================

/** Rótulo curto e fiel para a etapa da diligência. */
export function describeSourceFailure(erro?: string | null): string {
  const texto = String(erro || '').trim();

  if (!texto) return 'Fonte indisponível';
  if (/tempo limite|tempo esgotado|timeout/i.test(texto)) return 'Tempo esgotado';
  if (/falar com o servidor|falha de rede|network|failed to fetch/i.test(texto)) {
    return 'Servidor não respondeu';
  }
  if (/pausada|cancel/i.test(texto)) return 'Consulta interrompida';

  // Mensagem própria da fonte: é a informação mais precisa que existe,
  // então vai para a tela como veio, apenas encurtada para caber.
  return texto.length > 60 ? `${texto.slice(0, 60)}…` : texto;
}
