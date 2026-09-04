# Document Intelligence

Cataloga os documentos que as fontes oficiais já publicaram, com origem, vínculo
e disponibilidade declarados.

- **Entrada:** o retorno de `TcePeIntelligenceService.collect` e de
  `ContractIntelligenceService.analyze`.
- **Rede:** nenhuma para catalogar. A verificação de disponibilidade é opcional
  e desligada por padrão.
- **Custo:** R$ 0. Nenhuma dependência nova.

**Fronteira com a Central de Evidências:** são camadas distintas e não se
sobrepõem. A Central registra o que uma pessoa acrescenta e valida; esta camada
cataloga o que a fonte oficial publicou. Nada aqui escreve lá.

---

## Achado que determinou o desenho desta fase

Os PDFs de contrato e termo aditivo do TCE-PE **são imagens digitalizadas**.
Verificado contra os arquivos reais:

| Arquivo | Tamanho | `/Font` | Operadores de texto | `/Subtype /Image` |
|---|---|---|---|---|
| `LICON_Contrato_782_2018_069.pdf` | 2,3 MB | 0 | 0 | 10 |
| `LICON_Contrato_1655_2019_1002.pdf` | 1,3 MB | 0 | 0 | 4 |

Não há camada de texto. Extrair conteúdo exigiria OCR — que, conforme a
instrução desta fase, não se adiciona por reflexo.

Por isso o que foi implementado é a **camada de referência, disponibilidade e
proveniência**, e não um extrator de PDF. Os documentos existem, os links são
preservados, e o estado `OCR_REQUIRED` declara exatamente o que falta.

---

## A distinção central

Duas coisas que uma lista de "documentos" confundiria:

| Campo | O que é | Quando existe |
|---|---|---|
| `publishedMetadata` | Fatos que a API publicou no **registro** | Sempre. Não depende de abrir o PDF |
| `extractedFacts` | Fatos lidos de **dentro** do documento | Só quando o conteúdo foi obtido e processado |

Nesta fase `extractedFacts` está **vazio em todos os documentos**. Preenchê-lo
com metadado da API faria a tela exibir "extraído do documento" para algo que
ninguém leu.

Cada item de `publishedMetadata` declara `field` (campo original na API), `value`
(valor como veio) e `rule` (regra que o produziu).

---

## Estados do conteúdo

| Estado | Significado |
|---|---|
| `REFERENCED` | A fonte publicou a URL. O conteúdo não foi obtido |
| `AVAILABLE` | O conteúdo foi obtido e pode ser processado |
| `UNAVAILABLE` | Havia referência e o conteúdo não pôde ser obtido |
| `EMPTY` | A fonte respondeu e não publicou documento |
| `ERROR` | Erro técnico ao obter ou verificar |

**`UNAVAILABLE` nunca vira `EMPTY`.** Um documento que existe e não pôde ser
obtido é lacuna, e a URL permanece preservada. Um teste dedicado trava isso.

**`REFERENCED` não é `EMPTY`.** No primeiro existe documento e ninguém o abriu;
no segundo a fonte respondeu e não publicou nada.

## Estados da extração

`NOT_ATTEMPTED` · `SUCCESS` · `ERROR` · `OCR_REQUIRED` · `NOT_APPLICABLE`

`AVAILABLE` + `ERROR` é conteúdo obtido cuja leitura falhou — diferente de
ausência documental. `OCR_REQUIRED` é conteúdo obtido e ilegível sem OCR: o
documento existe, nós é que ainda não sabemos lê-lo.

---

## Tipos documentais

`CONTRACT` · `ADDITIVE` · `TENDER` · `PROCESS` · `DECISION` · `OTHER`

Todos sustentados pelas fontes atuais. Não existe `FRAUD_REPORT`,
`IRREGULARITY` ou equivalente: **classificação documental não é classificação de
risco**.

---

## Vínculos

| Confiança | Quando |
|---|---|
| `CONFIRMED` | Identificador oficial liga documento e objeto |
| `PROBABLE` | Chave composta oficial coincide, ou processo com posição definida |
| `CONTEXTUAL` | Há indício, sem identificador que comprove |
| `UNKNOWN` | Não foi possível determinar |

**Documento com vínculo incerto não é descartado.** Uma licitação da entidade que
nenhum contrato coletado referencia entra como `CONTEXTUAL`, com a base do
vínculo escrita. Descartá-la perderia um registro oficial por limitação nossa.

O vínculo do termo aditivo **herda** a confiança que a Contract Intelligence
apurou: se lá era provável, aqui não vira confirmado.

---

## Datas

Reutiliza o modelo temporal da Contract Timeline: `EXACT` · `APPROXIMATE` ·
`YEAR_ONLY` · `UNKNOWN`, com `dateSource` e `dateConfidence`.

As naturezas permanecem distintas e nunca se confundem:

| Natureza | Campo | Precisão típica |
|---|---|---|
| Publicação | `publicationDate` (só licitação) | `EXACT` |
| Julgamento | `DataSessaoJulgamento` | `EXACT` |
| Vigência | `vigenciaInicial` | `APPROXIMATE` |
| Coleta | `retrievedAt` | — nunca usada como data do documento |

**Nenhuma data de assinatura é inventada.** O TCE-PE não a publica para contrato
nem para termo aditivo; a vigência é a aproximação disponível e está marcada
como tal.

---

## Verificação de disponibilidade

Opcional, desligada por padrão. Ativada por `checkDocumentAvailability: true` no
corpo da requisição.

Não baixa o documento. Faz `HEAD` — que devolve tipo e tamanho sem corpo — e um
`Range` de 512 bytes para confirmar a assinatura `%PDF-`. Verificado contra o
servidor do TCE-PE: `HEAD` responde 200 com `content-length`, `Range` responde
206, e documento inexistente responde 404.

A detecção de camada de texto é conservadora: `/Font` no cabeçalho indica texto;
a **ausência** dele em 512 bytes devolve `null` — desconhecido —, não `false`.
Afirmar "sem texto" a partir de meio quilobyte seria conclusão sem base.

**Não verificar não é estar indisponível.** Documento não verificado permanece
`REFERENCED`, e `disponibilidadeNaoVerificada` registra quantos são.

---

## Deduplicação

Por identificador oficial. A URL do documento é o mais forte disponível: o LICON
a compõe com órgão, ano, número e sufixo único.

Sem identificador suficiente, **os dois documentos são preservados** e marcados
com `possibleDuplicate`. Título igual não é prova de duplicidade — apagar um em
silêncio perderia um registro oficial sem que ninguém soubesse.

---

## Fontes

### Fornecem o documento (URL oficial publicada)

| Fonte | Cobertura observada na fixture real |
|---|---|
| `Contratos` (LICON) | 96 de 96 contratos com `LinkArquivo` |
| `TermoAditivo` (LICON) | 237 de 240 termos com `LinkArquivo` |
| `LicitacoesDetalhes` | 245 de 245 registros com `LinkArquivo` |
| `Processos` | `LinkProcesso` e `LinkDocumento` quando existem |

### Fornecem apenas referência, sem conteúdo legível

Todas as acima. Os arquivos são acessíveis por HTTP, mas os de contrato e termo
aditivo são **digitalizados** e não têm camada de texto.

### Não permitem conteúdo documental atualmente

| Fonte | Motivo |
|---|---|
| `DespesasMunicipais` / `DespesasEstaduais` | Não publicam link de documento |
| `ObrasDadosContratacao` | Dataset publicado e vazio — sem registros para qualquer filtro |
| `Fornecedores` | Cadastro nominal, sem documento associado |

**Não implementados nesta fase:** `ContratoDocumentos` e `LicitacoesDocumentos`
existem no catálogo do TCE-PE e listariam documentos anexos por contrato e por
licitação. Ficaram de fora porque exigiriam um coletor novo, vedado nesta fase.
São o caminho natural para ampliar a cobertura documental.

---

## Limitações

- **O conteúdo dos documentos não é lido.** Os PDFs de contrato e aditivo são
  imagens; a leitura exigiria OCR.
- **`extractedFacts` está vazio em toda a base.** Por desenho, não por falha.
- **A verificação de disponibilidade tem teto** (`DOCUMENT_PROBE_MAX`, padrão 25).
  O excedente permanece `REFERENCED` e é contado em
  `disponibilidadeNaoVerificada`.
- **A detecção de camada de texto é heurística** sobre 512 bytes e devolve
  desconhecido quando não pode concluir.
- **Documento de processo depende de o TCE-PE publicar `LinkProcesso` /
  `LinkDocumento`**, o que nem todo processo traz.
- **O vínculo documento↔contrato para processos não existe:** o Tribunal não
  publica essa ligação. O vínculo é com a entidade.

---

## Variáveis de ambiente

Todas opcionais, com padrão embutido. Nenhuma exige chave ou serviço pago.

| Variável | Padrão | Função |
|---|---|---|
| `DOCUMENT_PROBE_TIMEOUT_MS` | `12000` | Timeout por verificação |
| `DOCUMENT_PROBE_CONCURRENCY` | `4` | Verificações simultâneas |
| `DOCUMENT_PROBE_MAX` | `25` | Teto de documentos verificados por execução |
| `DOCUMENT_PROBE_CACHE_TTL_MS` | `1800000` | TTL do cache de verificação |

---

## Rota

O catálogo acompanha a coleta do TCE-PE, sobre a mesma resposta:

```
POST /api/judicial/tce-pe/dados-abertos
{ "cnpj": "...", "checkDocumentAvailability": false }

→ { ...dadosAbertos, contractIntelligence, documentIntelligence }
```
