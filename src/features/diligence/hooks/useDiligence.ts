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
  { id: 'governance', label: 'Levantando diretores e acionistas dos últimos 5 exercícios', status: 'pending' },
  { id: 'network', label: 'Expandindo empresas por CNPJ, nomes e CPF mascarado', status: 'pending' },
  { id: 'fund', label: 'Mapeando gestor, administrador e prestadores regulados (CVM)', status: 'pending' },
  { id: 'ceis', label: 'Consultando CEIS (Empresas Inidôneas e Suspensas)', status: 'pending' },
  { id: 'cnep', label: 'Consultando CNEP (Cadastro Nacional de Empresas Punidas)', status: 'pending' },
  { id: 'personSanctions', label: 'Rastreando sócios pessoa física em CEIS e CNEP', status: 'pending' },
  { id: 'pep', label: 'Verificando Pessoas Expostas Politicamente (PEP dos sócios)', status: 'pending' },
  { id: 'media', label: 'Buscando ocorrências públicas e notícias na web', status: 'pending' },
  { id: 'gazettes', label: 'Pesquisando menções em Diários Oficiais municipais', status: 'pending' },
  { id: 'pncp', label: 'Consultando contratos públicos no PNCP', status: 'pending' },
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

        // 2A–2C. Fontes independentes: histórico, QSA expandido e rede regulatória de fundos
        updateStep('governance', 'loading');
        updateStep('network', 'loading');
        updateStep('fund', 'loading');
        const [governanceHistory, corporateNetwork, fundNetwork] = await Promise.all([
          DiligenceService.getGovernanceHistory({
            cnpj: clean,
            legalNature: empresa.natureza_juridica,
          }),
          DiligenceService.expandCorporateNetwork(empresa),
          DiligenceService.getFundNetwork(clean),
        ]);

        if (!governanceHistory.applicable) {
          updateStep('governance', 'done', 'CVM não aplicável; requer Junta Comercial');
          log('Histórico societário: a companhia não está no escopo do FRE/CVM; a linha do tempo conclusiva depende da Junta Comercial.');
        } else if (governanceHistory.ok) {
          const consulted = governanceHistory.consultedYears || 0;
          updateStep('governance', governanceHistory.coverageStatus === 'complete_public' ? 'done' : 'error', `${consulted}/5 exercício(s)`);
          log(`Histórico CVM: ${consulted} exercício(s) consultado(s), ${governanceHistory.directors || 0} integrante(s) da administração e ${governanceHistory.shareholders || 0} acionista(s) identificados.`, governanceHistory.coverageStatus === 'complete_public' ? 'info' : 'warning');
        } else {
          updateStep('governance', 'error', 'Histórico oficial indisponível');
          log(`Histórico CVM: ${governanceHistory.erro || governanceHistory.aviso || 'fonte indisponível'}.`, 'warning');
        }

        if (corporateNetwork.ok) {
          const personLinks = corporateNetwork.personExpansion?.memberships.filter((item) => !item.isRootCompany).length || 0;
          updateStep('network', 'done', corporateNetwork.companies.length > 0
            ? `${corporateNetwork.companies.length} empresa(s) · ${personLinks} via pessoa`
            : 'Nenhum vínculo adicional no QSA público');
          log(corporateNetwork.companies.length > 0 || personLinks > 0
            ? `Rede societária: ${corporateNetwork.companies.length} empresa(s), ${corporateNetwork.relationships.length} vínculo(s) entre CNPJs e ${personLinks} por nome/CPF mascarado.`
            : 'Rede societária: o QSA disponível não contém empresa com CNPJ expansível.');
        } else {
          updateStep('network', 'error', 'Expansão indisponível');
          log(`Rede societária: ${corporateNetwork.erro || 'fonte indisponível'}.`, 'warning');
        }

        if (!fundNetwork.applicable) {
          updateStep('fund', 'done', 'Não se aplica a este CNPJ');
          log('Rede regulatória de fundos: CNPJ não consta como fundo ou classe no cadastro atual da CVM.');
        } else if (fundNetwork.ok) {
          updateStep('fund', fundNetwork.consultaParcial ? 'error' : 'done', `${fundNetwork.directParties || 0} vínculo(s) direto(s)`);
          log(`Rede regulatória de fundos: ${fundNetwork.directParties || 0} prestador(es) ou responsável(is) direto(s), ${fundNetwork.expandedCompanies || 0} QSA(s) relacionado(s) expandido(s).`, fundNetwork.consultaParcial ? 'warning' : 'info');
        } else {
          updateStep('fund', 'error', 'Cadastro CVM indisponível');
          log(`Rede regulatória de fundos: ${fundNetwork.erro || 'fonte indisponível'}.`, 'warning');
        }

        // 3–4. Sanções da empresa e dos sócios pessoa física.
        // As três consultas são independentes entre si.
        updateStep('ceis', 'loading');
        updateStep('cnep', 'loading');
        updateStep('personSanctions', 'loading');
        const [ceisRes, cnepRes, personSanctions] = await Promise.all([
          DiligenceService.getCEIS(clean),
          DiligenceService.getCNEP(clean),
          DiligenceService.screenPersonSanctions(socios),
        ]);

        for (const [id, label, res] of [
          ['ceis', 'CEIS', ceisRes],
          ['cnep', 'CNEP', cnepRes],
        ] as const) {
          if (res.semChave || !res.ok) {
            const detail = res.semChave ? 'Integração não configurada' : 'Fonte indisponível';
            updateStep(id, 'error', detail);
            log(`${label}: ${detail}.`, 'warning');
          } else {
            updateStep(id, 'done', res.encontrado ? `${res.quantidade} registro(s)` : 'Sem ocorrências');
            log(
              res.encontrado
                ? `${label}: ${res.quantidade} registro(s) encontrado(s).`
                : `${label}: Nenhuma ocorrência nas fontes consultadas.`,
              res.encontrado ? 'warning' : 'info'
            );
          }
        }

        if (personSanctions.coverageStatus === 'NOT_APPLICABLE') {
          updateStep('personSanctions', 'done', 'Nenhum sócio pessoa física');
          log('Sanções de sócios: o quadro societário não tem pessoa física para rastrear.');
        } else if (personSanctions.coverageStatus === 'UNAVAILABLE') {
          updateStep('personSanctions', 'error', 'Fonte indisponível');
          log(`Sanções de sócios: ${personSanctions.aviso || personSanctions.erro || 'fonte indisponível'}.`, 'warning');
        } else {
          const partial = personSanctions.coverageStatus === 'PARTIAL';
          updateStep('personSanctions', partial ? 'error' : 'done',
            personSanctions.totalCandidates > 0
              ? `${personSanctions.totalCandidates} candidato(s) para revisão`
              : `${personSanctions.peopleSearched} sócio(s) sem correspondência`);
          log(
            personSanctions.totalCandidates > 0
              ? `Sanções de sócios: ${personSanctions.totalCandidates} correspondência(s) nominal(is) em ${personSanctions.peopleSearched} sócio(s) pesquisado(s); nenhuma confirma identidade.`
              : `Sanções de sócios: ${personSanctions.peopleSearched} sócio(s) pesquisado(s) sem correspondência nos cadastros.`,
            personSanctions.totalCandidates > 0 ? 'warning' : 'info'
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
          shareholders: socios,
        });

        let discoveredProcesses: ProcessDiscovery[] = [];

        if (mediaRes.ok && mediaRes.results.length > 0) {
          const companyCount = mediaRes.companyResultsCount ?? mediaRes.results.filter((item) => item.subjectType !== 'person').length;
          const personCount = mediaRes.personResultsCount ?? mediaRes.results.filter((item) => item.subjectType === 'person').length;
          updateStep('media', 'done', `${companyCount} empresa · ${personCount} pessoas`);
          log(`Ocorrências públicas: ${companyCount} resultado(s) sobre a empresa e ${personCount} associado(s) aos nomes de ${mediaRes.peopleSearched || 0} integrante(s) pesquisado(s).`);

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
                  name: item.subjectType === 'person'
                    ? `Publicação associada ao nome ${item.subjectName || 'de integrante'} — ${item.domain}`
                    : `Publicação sobre a empresa — ${item.domain}`,
                  url: item.url,
                  consultedAt: item.searchedAt,
                  excerpt: item.snippet.substring(0, 250),
                  subjectType: item.subjectType || 'company',
                  subjectName: item.subjectName,
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
            `Ocorrências públicas: ${mediaRes.aviso || (unavailable ? detail : `Nenhum conteúdo candidato localizado para a empresa e para ${mediaRes.peopleSearched || 0} integrante(s) pesquisado(s).`)}`,
            unavailable ? 'warning' : 'info'
          );
        }

        // 6B. Diários Oficiais municipais — fonte pública e gratuita
        updateStep('gazettes', 'loading');
        const [officialGazettes, tcePe] = await Promise.all([
          DiligenceService.searchOfficialGazettes({
            cnpj: clean,
            razaoSocial: empresa.razao_social || '',
            nomeFantasia: empresa.nome_fantasia || '',
            shareholders: socios,
          }),
          DiligenceService.searchTcePe({
            cnpj: clean,
            razaoSocial: empresa.razao_social || '',
            nomeFantasia: empresa.nome_fantasia || '',
          }),
        ]);
        if (officialGazettes.ok) {
          updateStep('gazettes', 'done', `${officialGazettes.totalFound} edição(ões); ${officialGazettes.returned} amostra(s)`);
          log(`Diários Oficiais: ${officialGazettes.totalFound} edição(ões) localizada(s); ${officialGazettes.returned} evidência(s) estruturada(s), incluindo ${officialGazettes.peopleSearched || 0} pessoa(s) física(s) pesquisada(s) pelo nome.`);
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
        if (tcePe.ok) {
          const highRelevance = tcePe.resumo?.altaRelevancia || 0;
          log(`TCE-PE: ${tcePe.processos.length} processo(s) oficial(is) localizado(s) pelo nome empresarial; ${highRelevance} exige(m) revisão prioritária.`);
          for (const process of tcePe.processos.filter((item) => item.relevance === 'high')) {
            log(`TCE-PE ${process.processNumber}: ${process.modality || 'processo'} em ${process.organization || 'órgão não informado'}, resultado do processo “${process.outcome || 'não informado'}”. A atribuição à empresa exige leitura da decisão.`, 'warning');
          }
        } else {
          log(`TCE-PE: ${tcePe.erro || 'fonte indisponível'}.`, 'warning');
        }


        // 6C. Contratos públicos — PNCP e Portal da Transparência em paralelo.
        // Ambas as fontes confirmam o fornecedor pelo CNPJ antes de materializar
        // contratos e órgãos públicos no dossiê e no grafo.
        updateStep('pncp', 'loading');
        const [pncp, federalExposure] = await Promise.all([
          DiligenceService.getPncpContracts({
            cnpj: clean,
            razaoSocial: empresa.razao_social || '',
            nomeFantasia: empresa.nome_fantasia || '',
          }),
          DiligenceService.getFederalExposure(clean),
        ]);
        const federais = federalExposure.resumo?.contratosConfirmados || 0;
        if (pncp.ok) {
          const confirmados = pncp.resumo?.confirmados || 0;
          const divergentes = pncp.resumo?.divergentes || 0;
          if (confirmados > 0) {
            const valor = pncp.resumo?.valorTotalConfirmado || 0;
            log('PNCP: ' + confirmados + ' contrato(s) publico(s) confirmado(s) pelo CNPJ do fornecedor, em ' +
              (pncp.resumo?.orgaosDistintos || 0) + ' orgao(s), somando ' +
              valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '.');
          } else {
            log('PNCP: nenhum contrato confirmado para o CNPJ investigado.');
          }
          if (divergentes > 0) {
            log('PNCP: ' + divergentes + ' documento(s) citam o nome, mas foram assinados por outro CNPJ; tratados como homonimo.', 'warning');
          }
          if (pncp.consultaParcial) {
            log('PNCP: parte das consultas falhou; a cobertura desta execucao esta incompleta.', 'warning');
          }
        } else {
          log('PNCP: ' + (pncp.erro || 'fonte indisponivel') + '.', 'warning');
        }
        if (federalExposure.ok) {
          const recursos = federalExposure.resumo?.recursosRecebidos || 0;
          log('Portal da Transparência: ' + federais + ' contrato(s) federal(is) e ' +
            recursos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) +
            ' em pagamentos no período consultado, todos vinculados ao CNPJ.');
          if (federalExposure.consultaParcial) {
            log('Portal da Transparência: parte do histórico federal não respondeu; a cobertura foi marcada como parcial.', 'warning');
          }
        } else {
          log('Portal da Transparência — contratos e pagamentos: ' +
            (federalExposure.erro || 'fonte indisponível') + '.', 'warning');
        }
        const publicSourcesOk = pncp.ok || federalExposure.ok;
        const publicCoveragePartial = !pncp.ok || !federalExposure.ok
          || Boolean(pncp.consultaParcial) || Boolean(federalExposure.consultaParcial);
        const totalPublicContracts = (pncp.resumo?.confirmados || 0) + federais;
        updateStep(
          'pncp',
          publicSourcesOk ? (publicCoveragePartial ? 'error' : 'done') : 'error',
          publicSourcesOk
            ? totalPublicContracts > 0
              ? totalPublicContracts + ' contrato(s) confirmado(s)'
              : 'Sem contrato confirmado'
            : 'Fontes indisponíveis',
        );
        // 6D. Offshore Leaks — reconciliação nominal, nunca confirmação automática
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
        const risco = calculateRisk({
          empresa,
          ceis: ceisRes,
          cnep: cnepRes,
          personSanctions,
          pepResults,
          adverseMedia: mediaRes,
          corporateNetwork,
          fundNetwork,
          offshore,
          officialGazettes,
          tcePe,
          discoveries: discoveredProcesses,
          governanceHistory,
        });
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
          governanceHistory,
          ceis: ceisRes,
          cnep: cnepRes,
          personSanctions,
          pepResults,
          processosDescobertos: discoveredProcesses,
          processDiscoveryExecuted: officialGazettes.ok || mediaRes.ok || tcePe.ok,
          processDiscoverySources: [
            mediaRes.ok ? 'MEDIA_SEARCH' : null,
            officialGazettes.ok ? 'QUERIDO_DIARIO' : null,
            tcePe.ok ? 'TCE_PE_DADOS_ABERTOS' : null,
          ].filter((item): item is string => Boolean(item)),
          adverseMedia: mediaRes,
          officialGazettes,
          tcePe,
          corporateNetwork,
          fundNetwork,
          offshore,
          pncp,
          federalExposure,
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
