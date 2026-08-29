const PROVIDER_LABELS: Record<string, string> = {
  'brave-news': 'Brave News',
  'brave-web': 'Brave Web',
  'gdelt-doc': 'GDELT DOC 2.0',
  'google-news-rss': 'Google News RSS',
  teste: 'Fonte de teste',
};

export function formatMediaProviders(sources?: string[], fallback?: string) {
  const labels = Array.from(new Set(
    (sources || []).filter(Boolean).map((source) => PROVIDER_LABELS[source] || source)
  ));
  return labels.join(' + ') || fallback || 'Fontes públicas';
}

export function formatMediaPlan(version?: string) {
  if (!version) return 'Plano legado';
  const match = /v(\d+)$/i.exec(version);
  return match ? 'Busca ampliada v' + match[1] : version;
}
