// ==========================================================
// DILIGÊNCIA 360 — Rotas Judiciais (DataJud / CNJ)
// ==========================================================

const express = require('express');
const DatajudService = require('../services/datajud.service');
const { TcePeService } = require('../services/tce-pe.service');
const { TcePeIntelligenceService } = require('../services/tce-pe/tce-pe.intelligence');
const { ContractIntelligenceService } = require('../contract-intelligence/contract-intelligence.service');
const { DocumentIntelligenceService } = require('../document-intelligence/document-intelligence.service');
const { projectForDossier } = require('../document-intelligence/dossier-projection');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(authenticate);

// Consulta e enriquecimento de processo por numeração CNJ
router.get('/processo/:numero', async (req, res) => {
  const result = await DatajudService.consultarProcesso(req.params.numero);
  res.status(result.status || 200).json(result);
});

// Processos de controle externo do TCE-PE pesquisados pelo nome do interessado.
router.post('/tce-pe', async (req, res) => {
  const result = await TcePeService.searchCompany(req.body || {});
  res.status(result.status || 200).json(result);
});

// Dados abertos do TCE-PE: contratos, aditivos, licitações, obras e despesas.
// Rota separada da de processos porque a estratégia de identificação é outra —
// aqui todos os datasets filtram por CPF/CNPJ, e a confirmação vem do campo
// estruturado publicado pela fonte, não da leitura de texto.
router.post('/tce-pe/dados-abertos', async (req, res) => {
  const result = await TcePeIntelligenceService.collect(req.body || {}, {
    forceRefresh: req.body?.forceRefresh === true,
  });
  // Inteligência contratual sobre a MESMA coleta: contratos e aditivos viram
  // eventos e linha do tempo sem nenhuma requisição adicional ao Tribunal.
  const contractIntelligence = ContractIntelligenceService.analyze(result);
  // Catálogo documental sobre a MESMA coleta. A verificação de disponibilidade
  // é opcional: catalogar não é baixar, e por padrão nada é requisitado.
  const documentIntelligence = await DocumentIntelligenceService.collect(
    { tceResult: result, contractIntelligence },
    { checkAvailability: req.body?.checkDocumentAvailability === true },
  );
  // A coleta completa de uma empresa ativa passa de 8 MB — além do teto de
  // resposta da função serverless e do corpo aceito ao salvar o dossiê. A rota
  // devolve a projeção, que declara o que ficou de fora. O payload íntegro
  // continua disponível sob pedido explícito, para depuração.
  const projection = projectForDossier({ tceResult: result, contractIntelligence, documentIntelligence });
  if (req.body?.includeFullPayload === true) {
    return res.status(result.status || 200).json({ ...result, contractIntelligence, documentIntelligence });
  }
  return res.status(result.status || 200).json(projection);
});

module.exports = router;
