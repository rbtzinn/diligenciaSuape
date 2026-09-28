const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeGovernanceCoverage } = require('../src/services/cvm-governance.service');

const years = [2022, 2023, 2024, 2025, 2026];
const coverageOf = (...statuses) => statuses.map((status, index) => ({ year: years[index], status }));

test('companhia ausente dos cinco FRE lidos é cobertura completa, não fonte indisponível', () => {
  const summary = summarizeGovernanceCoverage(coverageOf('no_record', 'no_record', 'no_record', 'no_record', 'no_record'));
  assert.equal(summary.coverageStatus, 'complete_public');
  assert.equal(summary.readYears, 5);
  assert.equal(summary.consultedYears, 0);
});

test('exercício sem registro não rebaixa a cobertura quando os demais têm registro', () => {
  const summary = summarizeGovernanceCoverage(coverageOf('consulted', 'consulted', 'consulted', 'consulted', 'no_record'));
  assert.equal(summary.coverageStatus, 'complete_public');
  assert.equal(summary.consultedYears, 4);
});

test('arquivo anual que não pôde ser lido deixa a cobertura parcial', () => {
  const summary = summarizeGovernanceCoverage(coverageOf('consulted', 'no_record', 'unavailable', 'consulted', 'consulted'));
  assert.equal(summary.coverageStatus, 'partial');
  assert.equal(summary.unavailableYears, 1);
});

test('nenhum arquivo lido é fonte indisponível', () => {
  const summary = summarizeGovernanceCoverage(coverageOf('unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable'));
  assert.equal(summary.coverageStatus, 'unavailable');
  assert.equal(summary.readYears, 0);
});
