const { normalizeName, normalizeIdentifier } = require('../domain/normalization');

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function nameSimilarity(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const distanceSimilarity = 1 - (levenshtein(a, b) / Math.max(a.length, b.length));
  const tokensA = new Set(a.split(' '));
  const tokensB = new Set(b.split(' '));
  const intersection = [...tokensA].filter((token) => tokensB.has(token)).length;
  const union = new Set([...tokensA, ...tokensB]).size || 1;
  const tokenSimilarity = intersection / union;

  return Math.max(0, Math.min(1, (distanceSimilarity * 0.55) + (tokenSimilarity * 0.45)));
}

function classify(score) {
  if (score >= 90) return 'VERY_STRONG_MATCH';
  if (score >= 70) return 'PROBABLE_MATCH';
  if (score >= 40) return 'POSSIBLE_MATCH';
  return 'LOW_CONFIDENCE';
}

function comparePerson(source, candidate) {
  const similarity = nameSimilarity(source.name, candidate.name);
  const exactName = similarity === 1;
  const signals = [{
    code: 'NAME_SIMILARITY',
    label: exactName ? 'Nome completo coincidente' : 'Similaridade nominal',
    matched: similarity >= 0.6,
    weight: exactName ? 68 : Math.round(similarity * 65),
    detail: `${Math.round(similarity * 100)}% de similaridade`,
  }];

  let score = exactName ? 68 : Math.round(similarity * 65);
  let hasStrongIdentifier = false;
  const sourceCpf = normalizeIdentifier(source.maskedCpf);
  const candidateCpf = normalizeIdentifier(candidate.maskedCpf);
  if (sourceCpf && candidateCpf && sourceCpf.length >= 8 && candidateCpf.length >= 8) {
    const cpfMatches = sourceCpf === candidateCpf;
    if (cpfMatches) {
      score += 30;
      hasStrongIdentifier = true;
    }
    signals.push({
      code: 'MASKED_CPF',
      label: cpfMatches ? 'CPF mascarado coincidente' : 'CPF mascarado divergente',
      matched: cpfMatches,
      weight: cpfMatches ? 30 : 0,
      detail: cpfMatches
        ? 'Identificador mascarado compatível nas duas fontes'
        : 'Os identificadores mascarados disponíveis não coincidem',
    });
  } else {
    signals.push({
      code: 'MASKED_CPF',
      label: 'CPF não comparável',
      matched: false,
      weight: 0,
      detail: 'O CPF mascarado não estava disponível nas duas fontes',
    });
  }

  const sourceOrg = normalizeName(source.organization);
  const candidateOrg = normalizeName(candidate.organization);
  if (sourceOrg && candidateOrg && sourceOrg === candidateOrg) {
    score += 10;
    signals.push({
      code: 'ORGANIZATION',
      label: 'Organização coincidente',
      matched: true,
      weight: 10,
      detail: source.organization,
    });
  }

  // Nome, por mais semelhante que seja, nunca confirma sozinho uma identidade.
  if (!hasStrongIdentifier) score = Math.min(score, 69);
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    status: classify(score),
    signals,
    // Mesmo uma combinação nominal + CPF mascarado não substitui a validação
    // documental da identidade da pessoa.
    requiresHumanReview: score >= 40,
  };
}

module.exports = { nameSimilarity, comparePerson, classify };
