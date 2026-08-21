// ==========================================================
// DILIGÊNCIA 360 — Hook useDiligence
// Orquestrador do fluxo completo de consultas, mídias e processos
// ==========================================================

import { useState, useCallback } from 'react';
import { CNPJ } from '../../../lib/cnpj';
import { CNJ } from '../../../lib/cnj';
import { DiligenceService } from '../services/diligence.service';
import { calculateRisk } from '../utils/risk';
import { generateAutomatedAnalysis } from '../utils/analyzer';
import { DiscoveryEngine } from '../utils/discoveryEngine';
import { HistoryStorage } from '../../history/services/history.storage';
import {
  DiligenceItem,
  DiligenceStepConfig,
  AuditEvent,
  PepPartnerResult,
  ProcessDiscovery,
} from '../types';

const INITIAL_STEPS: DiligenceStepConfig[] = [
  { id: 'emp', label: 'Consultando cadastro empresarial (Receita Federal)', status: 'pending' },
  { id: 'soc', label: 'Identificando quadro societário e administradores (QSA)', status: 'pending' },
  { id: 'network', label: 'Expandindo empresas relacionadas até o segundo nível', status: 'pending' },
  { id: 'ceis', label: 'Consultando CEIS (Empresas Inidôneas e Suspensas)', status: 'pending' },
  { id: 'cnep', label: 'Consultando CNEP (Cadastro Nacional de Empresas Punidas)', status: 'pending' },
  { id: 'pep', label: 'Verificando Pessoas Expostas Politicamente (PEP dos sócios)', status: 'pending' },
  { id: 'media', label: 'Buscando ocorrências públicas e notícias na web', status: 'pending' },
  { id: 'gazettes', label: 'Pesquisando menções em Diários Oficiais municipais', status: 'pending' },
  { id: 'offshore', label: 'Reconciliando nomes na base Offshore Leaks (ICIJ)', status: 'pending' },
  { id: 'risk', label: 'Calculando indicador preliminar de atenção', status: 'pending' },
];

export function useDiligence(onSuccess?: (diligence: DiligenceItem) => void) {
  const [cnpjInput, setCnpjInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<DiligenceStepConfig[]>(INITIAL_STEPS);
  const [currentDiligence, setCurrentDiligence] = useState<DiligenceItem | null>(null);

  const updateStep = useCallback((id: string, status: DiligenceStepConfig['status'], detail?: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, detail } : s))
    );
  }, []);

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const runDiligence = useCallback(
    async (targetCnpj: string) => {
      const clean = CNPJ.clean(targetCnpj);
      if (!CNPJ.validate(clean)) {
        setError('CNPJ inválido. Verifique os números digitados.');
        return;
      }

      setError(null);
      setIsLoading(true);
      setSteps(INITIAL_STEPS);

      const timeline: AuditEvent[] = [];
      const log = (txt: string, tipo: AuditEvent['tipo'] = 'info') => {
        timeline.push({ time: new Date().toISOString(), txt, tipo });
      };

      log('Diligência iniciada.');

      try {
        // 1. Cadastro
        updateStep('emp', 'loading');
        const empRes = await DiligenceService.getCompany(clean);

        if (!empRes.ok || !empRes.data) {
          updateStep('emp', 'error', empRes.erro || 'Não encontrado');
          log(`Falha na consulta cadastral: ${empRes.erro || 'Erro'}`, 'error');
          setError(empRes.erro || 'Não foi possível consultar os dados da empresa.');
          setIsLoading(false);
          return;
        }

        updateStep('emp', 'done');
        log(`Cadastro consultado na fonte ${empRes.fonte || 'BrasilAPI'}.`);
        const empresa = empRes.data;

        // 2. Sócios
        updateStep('soc', 'loading');
        const socios = empresa.qsa || [];
        updateStep('soc', 'done', `${socios.length} integrante(s)`);
        log(`${socios.length} sócio(s) e administrador(es) identificado(s).`);

        // 2B. Expansão societária controlada, somente quando há CNPJ no QSA
        updateStep('network', 'loading');
        const corporateNetwork = await DiligenceService.expandCorporateNetwork(empresa);
        if (corporateNetwork.ok) {
          updateStep('network', 'done', corporateNetwork.companies.length > 0 ? `${corporateNetwork.companies.length} empresa(s) relacionada(s)` : 'Não aplicável ao QSA disponível');
          log(corporateNetwork.companies.length > 0
            ? `Rede societária: ${corporateNetwork.companies.length} empresa(s) e ${corporateNetwork.relationships.length} vínculo(s) adicionais.`
            : 'Rede societária: o QSA disponível não contém empresa com CNPJ expansível.');
        } else {
          updateStep('network', 'error', 'Expansão indisponível');
          log(`Rede societária: ${corporateNetwork.erro || 'fonte indisponível'}.`, 'warning');
        }

        // 3. CEIS
        updateStep('ceis', 'loading');
        const ceisRes = await DiligenceService.getCEIS(clean);
        if (ceisRes.semChave || !ceisRes.ok) {
          const detail = ceisRes.semChave ? 'Integração não configurada' : 'Fonte indisponível';
          updateStep('ceis', 'error', detail);
          log(`CEIS: ${detail}.`, 'warning');
        } else {
          updateStep('ceis', 'done', ceisRes.encontrado ? `${ceisRes.quantidade} registro(s)` : 'Sem ocorrências');
          log(
            ceisRes.encontrado ? `CEIS: ${ceisRes.quantidade} registro(s) encontrado(s).` : 'CEIS: Nenhuma ocorrência nas fontes consultadas.',
            ceisRes.encontrado ? 'warning' : 'info'
          );
        }

        // 4. CNEP
        updateStep('cnep', 'loading');
        const cnepRes = await DiligenceService.getCNEP(clean);
        if (cnepRes.semChave || !cnepRes.ok) {
          const detail = cnepRes.semChave ? 'Integração não configurada' : 'Fonte indisponível';
          updateStep('cnep', 'error', detail);
          log(`CNEP: ${detail}.`, 'warning');
        } else {
          updateStep('cnep', 'done', cnepRes.encontrado ? `${cnepRes.quantidade} registro(s)` : 'Sem ocorrências');
          log(
            cnepRes.encontrado ? `CNEP: ${cnepRes.quantidade} registro(s) encontrado(s).` : 'CNEP: Nenhuma ocorrência nas fontes consultadas.',
            cnepRes.encontrado ? 'warning' : 'info'
          );
        }

        // 5. PEP
        updateStep('pep', 'loading');
        const pepResults: PepPartnerResult[] = [];
        for (const socio of socios) {
          if (socio.nome_socio) {
            const pRes = await DiligenceService.getPEP(socio.nome_socio);
            pepResults.push(pRes);
            await delay(300); // Throttling
          }
        }
        const pepHits = pepResults.filter((p) => p.encontrado).length;
        const pepUnavailable = pepResults.length > 0 && pepResults.every((p) => p.semChave || !p.ok);
        const pepPartial = pepResults.some((p) => p.semChave || !p.ok);
        if (pepUnavailable) {
          updateStep('pep', 'error', 'Integração indisponível');
          log('PEP: integração não configurada ou fonte indisponível.', 'warning');
        } else if (pepPartial) {
          updateStep('pep', 'error', 'Consulta parcial');
          log('PEP: consulta realizada parcialmente; alguns integrantes não foram verificados.', 'warning');
        } else {
          updateStep('pep', 'done', pepHits > 0 ? `${pepHits} possível(is) homônimo(s)` : 'Sem registros');
          log(
            pepHits > 0 ? `PEP: ${pepHits} homônimo(s) identificado(s).` : 'PEP: nenhum registro nominal nas fontes consultadas.',
            pepHits > 0 ? 'warning' : 'info'
          );
        }

        // 6. Mídia Adversa e Notícias Web (Fase 4B)
        updateStep('media', 'loading');
        const mediaRes = await DiligenceService.searchAdverseMedia({
          cnpj: clean,
          razaoSocial: empresa.razao_social || '',
          nomeFantasia: empresa.nome_fantasia || '',
        });

        let discoveredProcesses: ProcessDiscovery[] = [];

        if (mediaRes.ok && mediaRes.results.length > 0) {
          updateStep('media', 'done', `${mediaRes.totalFound} resultado(s) analisado(s)`);
          log(`Mídia Adversa: ${mediaRes.totalFound} resultado(s) encontrado(s) na web.`);

          // Extração automática de números de processos CNJ encontrados em matérias
          for (const item of mediaRes.results) {
            const fullTxt = `${item.title} ${item.snippet}`;
            const extracted = CNJ.extractFromText(fullTxt);
            item.processNumbers = extracted;

            if (extracted.length > 0) {
              const mergeOutcome = DiscoveryEngine.mergeDiscoveredProcesses(
                discoveredProcesses,
                extracted,
                {
                  type: 'adverse_media',
                  name: `Notícia: ${item.domain}`,
                  url: item.url,
                  consultedAt: item.searchedAt,
                  excerpt: item.snippet.substring(0, 250),
                }
              );
              discoveredProcesses = mergeOutcome.updatedList;
            }
          }
        } else {
          const unavailable = mediaRes.semChave || !mediaRes.ok;
          const detail = mediaRes.semChave
            ? 'Integração não configurada'
            : !mediaRes.ok
              ? 'Fonte indisponível'
              : 'Nenhuma ocorrência';
          updateStep('media', unavailable ? 'error' : 'done', detail);
          log(
            `Mídia Adversa: ${mediaRes.aviso || (unavailable ? detail : 'Nenhuma ocorrência identificada nas fontes consultadas.')}`,
            unavailable ? 'warning' : 'info'
          );
        }

        // 6B. Diários Oficiais municipais — fonte pública e gratuita
        updateStep('gazettes', 'loading');
        const officialGazettes = await DiligenceService.searchOfficialGazettes({
          cnpj: clean,
          razaoSocial: empresa.razao_social || '',
          nomeFantasia: empresa.nome_fantasia || '',
        });
        if (officialGazettes.ok) {
          updateStep('gazettes', 'done', `${officialGazettes.totalFound} edição(ões); ${officialGazettes.returned} amostra(s)`);
          log(`Diários Oficiais: ${officialGazettes.totalFound} edição(ões) localizada(s); ${officialGazettes.returned} evidência(s) estruturada(s).`);
          for (const gazette of officialGazettes.results) {
            const extracted = CNJ.extractFromText(gazette.excerpts.join(' '));
            if (extracted.length > 0) {
              const mergeOutcome = DiscoveryEngine.mergeDiscoveredProcesses(
                discoveredProcesses,
                extracted,
                {
                  type: 'official_gazette',
                  name: `Diário Oficial de ${gazette.territoryName}/${gazette.stateCode || '—'}`,
                  url: gazette.url || undefined,
                  consultedAt: officialGazettes.consultadoEm,
                  excerpt: gazette.excerpts[0]?.substring(0, 250),
                }
              );
              discoveredProcesses = mergeOutcome.updatedList;
            }
          }
        } else {
          updateStep('gazettes', 'error', 'Fonte indisponível');
          log(`Diários Oficiais: ${officialGazettes.erro || 'fonte indisponível'}.`, 'warning');
        }

        // 6C. Offshore Leaks — reconciliação nominal, nunca confirmação automática
        updateStep('offshore', 'loading');
        const offshore = await DiligenceService.searchOffshore({
          company: { cnpj: clean, razaoSocial: empresa.razao_social || '', nomeFantasia: empresa.nome_fantasia || '' },
          shareholders: socios,
        });
        if (offshore.ok) {
          updateStep('offshore', 'done', offshore.candidates.length > 0 ? `${offshore.candidates.length} hipótese(s) para revisão` : 'Sem correspondência forte');
          log(offshore.candidates.length > 0
            ? `Offshore Leaks: ${offshore.candidates.length} correspondência(s) nominal(is) exigem revisão humana.`
            : 'Offshore Leaks: nenhuma correspondência nominal forte localizada.');
        } else {
          updateStep('offshore', 'error', 'Fonte indisponível');
          log(`Offshore Leaks: ${offshore.erro || 'fonte indisponível'}.`, 'warning');
        }

        // 7. Risco e Análise
        updateStep('risk', 'loading');
        const risco = calculateRisk({ empresa, ceis: ceisRes, cnep: cnepRes, pepResults });
        const analise = generateAutomatedAnalysis({ empresa, ceis: ceisRes, cnep: cnepRes, pepResults, adverseMedia: mediaRes, risco });
        updateStep('risk', 'done', `${risco.score}/100 — ${risco.nivel}`);
        log(`Indicador de atenção calculado: ${risco.score}/100 — ${risco.nivel}.`);
        log('Diligência concluída com sucesso.');

        const newDiligence: DiligenceItem = {
          id: HistoryStorage.generateId(),
          cnpj: clean,
          cnpjFmt: CNPJ.format(clean),
          razaoSocial: empresa.razao_social || 'Razão Social Não Informada',
          nomeFantasia: empresa.nome_fantasia || '',
          dataAnalise: new Date().toISOString(),
          companySource: empRes.fonte,
          companyConsultedAt: empRes.consultadoEm,
          empresa,
          socios,
          ceis: ceisRes,
          cnep: cnepRes,
          pepResults,
          processosDescobertos: discoveredProcesses,
          processDiscoveryExecuted: officialGazettes.ok || mediaRes.ok,
          processDiscoverySources: [mediaRes.ok ? 'MEDIA_SEARCH' : null, officialGazettes.ok ? 'QUERIDO_DIARIO' : null].filter((item): item is string => Boolean(item)),
          adverseMedia: mediaRes,
          officialGazettes,
          corporateNetwork,
          offshore,
          risco,
          analise,
          timeline,
        };

        const savedDiligence = await HistoryStorage.save(newDiligence);
        setCurrentDiligence(savedDiligence);

        if (onSuccess) {
          onSuccess(savedDiligence);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Falha inesperada durante a diligência.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess, updateStep]
  );

  const resetDiligence = useCallback(() => {
    setCnpjInput('');
    setError(null);
    setSteps(INITIAL_STEPS);
    setCurrentDiligence(null);
  }, []);

  return {
    cnpjInput,
    setCnpjInput,
    isLoading,
    error,
    steps,
    currentDiligence,
    setCurrentDiligence,
    runDiligence,
    resetDiligence,
  };
}
