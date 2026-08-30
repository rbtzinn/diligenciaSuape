import { describe, it, expect } from 'vitest';
import { DiscoveryEngine } from './discoveryEngine';
import { CNJ } from '../../../lib/cnj';
import type { DiscoverySource, ProcessDiscovery } from '../types';

const TJPE = '00012346820208170001';
const TRT6 = '00099991220225060002';

const extraido = (n: string) => CNJ.extractFromText(n);

const fonte = (extra: Partial<DiscoverySource> = {}): DiscoverySource => ({
  type: 'adverse_media',
  name: 'Publicação sobre a empresa — jornal.exemplo',
  url: 'https://jornal.exemplo/materia',
  consultedAt: '2026-01-01T00:00:00.000Z',
  excerpt: 'trecho da matéria',
  ...extra,
} as DiscoverySource);

describe('mergeDiscoveredProcesses', () => {
  it('cria candidato novo com tribunal resolvido a partir do número', () => {
    const r = DiscoveryEngine.mergeDiscoveredProcesses([], extraido(TJPE), fonte());
    expect(r.newCount).toBe(1);
    expect(r.mergedCount).toBe(0);
    expect(r.updatedList[0].tribunal).toBe('TJPE');
    expect(r.updatedList[0].formattedProcessNumber).toBe('0001234-68.2020.8.17.0001');
    // Descoberta nasce como candidato: nada é validado automaticamente.
    expect(r.updatedList[0].status).toBe('candidate');
  });

  it('resolve tribunal desconhecido para a chave J.TR em vez de errar a sigla', () => {
    // 9.99 não está no mapa; melhor mostrar o código que inventar um nome.
    const desconhecido = '00012340420209990001';
    const r = DiscoveryEngine.mergeDiscoveredProcesses(
      [], [{ raw: desconhecido, normalized: desconhecido, formatted: CNJ.format(desconhecido), tribunalKey: '9.99' }],
      fonte(),
    );
    expect(r.updatedList[0].tribunal).toBe('J.9.TR.99');
  });

  it('o mesmo processo vindo de duas matérias diferentes acumula as fontes', () => {
    const primeira = DiscoveryEngine.mergeDiscoveredProcesses([], extraido(TJPE), fonte());
    const segunda = DiscoveryEngine.mergeDiscoveredProcesses(
      primeira.updatedList, extraido(TJPE),
      fonte({ name: 'Diário Oficial de Ipojuca/PE', excerpt: 'outro trecho' }),
    );

    expect(segunda.newCount).toBe(0);
    expect(segunda.mergedCount).toBe(1);
    expect(segunda.updatedList).toHaveLength(1);
    // Proveniência é o ativo aqui: as duas origens precisam sobreviver.
    expect(segunda.updatedList[0].sources).toHaveLength(2);
  });

  it('a mesma fonte repetida não duplica a proveniência', () => {
    const primeira = DiscoveryEngine.mergeDiscoveredProcesses([], extraido(TJPE), fonte());
    const repetida = DiscoveryEngine.mergeDiscoveredProcesses(primeira.updatedList, extraido(TJPE), fonte());
    expect(repetida.updatedList[0].sources).toHaveLength(1);
    expect(repetida.mergedCount).toBe(1);
  });

  it('autoValidate promove candidato existente, mas não rebaixa status avançado', () => {
    const inicial = DiscoveryEngine.mergeDiscoveredProcesses([], extraido(TJPE), fonte());
    const promovido = DiscoveryEngine.mergeDiscoveredProcesses(
      inicial.updatedList, extraido(TJPE), fonte({ name: 'outra' }), true,
    );
    expect(promovido.updatedList[0].status).toBe('validated');

    const enriquecido = DiscoveryEngine.updateStatus(promovido.updatedList, TJPE, 'enriched');
    const depois = DiscoveryEngine.mergeDiscoveredProcesses(
      enriquecido, extraido(TJPE), fonte({ name: 'mais uma' }), true,
    );
    expect(depois.updatedList[0].status).toBe('enriched');
  });

  it('processos distintos convivem na mesma lista', () => {
    const r = DiscoveryEngine.mergeDiscoveredProcesses([], extraido(`${TJPE} e ${TRT6}`), fonte());
    expect(r.newCount).toBe(2);
    expect(r.updatedList.map((p) => p.tribunal).sort()).toEqual(['TJPE', 'TRT6']);
  });

  it('lista de extraídos vazia não altera nada', () => {
    const inicial = DiscoveryEngine.mergeDiscoveredProcesses([], extraido(TJPE), fonte());
    const r = DiscoveryEngine.mergeDiscoveredProcesses(inicial.updatedList, [], fonte());
    expect(r.newCount).toBe(0);
    expect(r.updatedList).toHaveLength(1);
  });
});

describe('updateStatus', () => {
  const lista = () => DiscoveryEngine.mergeDiscoveredProcesses([], extraido(TJPE), fonte()).updatedList;

  it('aceita o número formatado, não só os dígitos', () => {
    const r = DiscoveryEngine.updateStatus(lista(), '0001234-68.2020.8.17.0001', 'validated');
    expect(r[0].status).toBe('validated');
  });

  it('anexa os dados do DataJud ao enriquecer', () => {
    const dataJud = { numero: '0001234-68.2020.8.17.0001', classe: { codigo: 1, nome: 'Execução Fiscal' } };
    const r = DiscoveryEngine.updateStatus(lista(), TJPE, 'enriched', dataJud as never);
    expect(r[0].dataJud).toBe(dataJud);
  });

  it('não apaga o enriquecimento anterior numa mudança de status posterior', () => {
    const comDados = DiscoveryEngine.updateStatus(lista(), TJPE, 'enriched', { numero: 'x' } as never);
    const depois = DiscoveryEngine.updateStatus(comDados, TJPE, 'discarded');
    expect(depois[0].dataJud).toBeDefined();
    expect(depois[0].status).toBe('discarded');
  });

  it('ignora número que não está na lista', () => {
    const r = DiscoveryEngine.updateStatus(lista(), TRT6, 'validated');
    expect(r[0].status).toBe('candidate');
  });
});

describe('removeProcess', () => {
  it('remove pelo número, aceitando formatado', () => {
    const lista = DiscoveryEngine.mergeDiscoveredProcesses([], extraido(`${TJPE} ${TRT6}`), fonte()).updatedList;
    const r = DiscoveryEngine.removeProcess(lista, '0001234-68.2020.8.17.0001');
    expect(r).toHaveLength(1);
    expect(r[0].processNumber).toBe(TRT6);
  });
});

describe('getStats', () => {
  it('conta cada situação separadamente', () => {
    const lista: ProcessDiscovery[] = [
      { status: 'candidate' }, { status: 'candidate' }, { status: 'validated' },
      { status: 'enriched' }, { status: 'discarded' },
    ] as ProcessDiscovery[];
    expect(DiscoveryEngine.getStats(lista)).toEqual({
      total: 5, candidates: 2, validated: 1, enriched: 1, discarded: 1,
    });
  });

  it('lista vazia zera tudo', () => {
    expect(DiscoveryEngine.getStats([])).toEqual({
      total: 0, candidates: 0, validated: 0, enriched: 0, discarded: 0,
    });
  });
});
