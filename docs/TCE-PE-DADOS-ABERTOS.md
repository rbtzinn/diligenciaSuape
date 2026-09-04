# TCE-PE — Dados Abertos

Coleta, normalização e resolução de identidade sobre os dados abertos do
Tribunal de Contas do Estado de Pernambuco.

- **Base:** `https://sistemas.tce.pe.gov.br/DadosAbertos`
- **Catálogo oficial de métodos:** `/DadosAbertos/Exemplo!listar`
- **Autenticação:** nenhuma. API pública, sem chave e sem cadastro.
- **Custo:** R$ 0.

Esta camada faz **coleta, resolução de vínculo, normalização e evidência**. Não
pontua risco, não classifica irregularidade e não deriva conclusão de volume.

---

## Providers implementados

| Provider | Método oficial | Parâmetro de CNPJ | Categoria |
|---|---|---|---|
| `tce-pe-fornecedores` | `Fornecedores` | `CPFCNPJ` | IDENTIDADE |
| `tce-pe-contratos` | `Contratos` | `NumeroDocumentoAjustado` | CONTRATOS |
| `tce-pe-aditivos` | `TermoAditivo` | `NumeroDocumentoAjustado` | ADITIVOS |
| `tce-pe-licitacoes` | `LicitacoesDetalhes` | `NUMERODOCUMENTOAJUSTADO` | LICITACOES |
| `tce-pe-obras` | `ObrasDadosContratacao` | `CPFCNPJ` | OBRAS |
| `tce-pe-despesas-municipais` | `DespesasMunicipais` | `CPF_CNPJ` | PAGAMENTOS |
| `tce-pe-despesas-estaduais` | `DespesasEstaduais` | `CPF_CNPJ` | PAGAMENTOS |

O nome do parâmetro de CNPJ **muda em cada dataset**. Não há padrão. Usar o nome
errado não devolve erro: devolve a base inteira sem filtro, o que é pior do que
falhar. Por isso cada provider declara o seu `cnpjParam` explicitamente.

O método `Obras` complementa `ObrasDadosContratacao`: a ficha da obra (título,
município, prazo, prazo aditado) é buscada por `Codigo` depois que o vínculo com
o CNPJ foi estabelecido. `Obras` **não** aceita filtro por CNPJ.

Processos de controle externo (`Processos`, `Resultados`, `Considerandos`,
`Determinacoes`) continuam em `server/src/services/tce-pe.service.js`, validado
nas fases anteriores e não reimplementado aqui.

---

## Arquitetura

```
Entity Profile        quem é a entidade                 entity-resolution/
      ↓
Search Matrix         o que perguntar                   search-matrix/
      ↓
TCE Client            como falar com o TCE              tce-pe/tce-pe.client.js
      ↓
TCE Adapters          como normalizar cada dataset      tce-pe/tce-pe.adapters.js
      ↓
Source Status         a consulta funcionou?             domain/source-status.js
      ↓
Entity Resolution     o registro é mesmo desta empresa? entity-resolution/
      ↓
TCE Intelligence      agrega e reporta por provider     tce-pe/tce-pe.intelligence.js
```

O cliente trata charset, envelope, timeout, teto local e cache. Os adaptadores
normalizam e preservam o registro bruto em `raw`. A inteligência orquestra e
produz o relatório por provider.

---

## Estratégia de identificação

Ordem de força, na sequência em que é aplicada:

1. **CPF/CNPJ exato no campo estruturado da fonte** → `CONFIRMED`.
   Todos os datasets desta camada publicam o documento do contratado. Quando ele
   coincide, a identidade está confirmada pela própria fonte oficial e não há
   texto a interpretar.
2. **CPF/CNPJ divergente** → `FALSE_POSITIVE`. Nome empresarial idêntico não
   transfere a titularidade do registro. É o caso da homônima de outro estado.
3. **Ausência de documento na linha** → cai no `resolveEntityMatch` da Fase 1,
   que julga nome mais contexto.

Município e UF **não confirmam identidade** e nunca são usados isoladamente.
Substring nunca é usada: a comparação é por documento ou por frase exata.

### `relationshipType`

Vocabulário compartilhado em `server/src/domain/relationship-type.js`, extraído
nesta fase de `tce-pe.service.js` porque três camadas passaram a precisar dele.

| Valor | Quando é atribuído nesta camada |
|---|---|
| `CONTRACTOR` | CNPJ confirmado em contrato, aditivo, obra ou despesa; licitante com licitação adjudicada |
| `PARTY` | Licitante não adjudicado — participar de certame não é vencer certame |
| `MENTIONED` | Usado pela camada de processos, não por estes datasets |
| `RELATED` | Vínculo indireto, ainda a confirmar |
| `UNKNOWN` | Sem documento e sem identificação nominal suficiente |
| `FALSE_POSITIVE` | Documento divergente ou identidade não sustentada |

Registros `FALSE_POSITIVE` saem das contagens e **permanecem em `descartados`**,
com o motivo registrado.

---

## Campos normalizados

Todo registro carrega, além dos campos do seu tipo: `entityMatch`,
`relationshipType`, `source`, `provider`, `endpoint`, `query`, `params`,
`sourceUrl`, `retrievedAt`, `dedupeKey` e `raw`.

- **Contrato:** `codigoContrato`, `numeroContrato`, `anoContrato`, `codigoPL`,
  `numeroProcesso`, `anoProcesso`, `tipoProcesso`, `unidadeGestora`,
  `unidadeOrcamentaria`, `siglaUG`, `codigoUG`, `esfera`, `esferaNome`,
  `municipio`, `cpfCnpj`, `razaoSocial`, `objeto`, `vigencia`,
  `vigenciaInicio`, `vigenciaFim`, `valor`, `estagio`, `situacao`,
  `linkArquivo`.
- **Termo aditivo:** `numeroTermoAditivo`, `anoTermoAditivo`, `numeroContrato`,
  `anoContrato`, `codigoContrato`, `unidadeGestora`, `esfera`, `municipio`,
  `cpfCnpj`, `razaoSocial`, `objetoAditivo`, `justificativaTermoAditivo`,
  `valorTermoAditivo`, `vigencia`, `estagio`, `situacao`, `linkArquivo`.
- **Licitação:** `codigoPL`, `numeroProcesso`, `modalidade`, `natureza`,
  `situacao`, `estagio`, `unidadeGestora`, `objeto`, `resultadoHabilitacao`,
  `adjudicada`, `valorAdjudicadoLicitante`, `valorAdjudicadoLicitacao`,
  `valorOrcamentoEstimativo`, `quantidadeLicitantes`, datas.
- **Obra:** `codigoObra`, `titulo`, `municipio`, `localExecucao`,
  `unidadeGestora`, `naturezaIntervencao`, `prazo`, `prazoAditado`,
  `dataUltimaAuditoria`.
- **Despesa:** `unidadeGestora`, `unidadeOrcamentaria`, `credor`, `cpfCnpj`,
  `numeroEmpenho`, `anoReferencia`, `dataEmpenho`, `valorEmpenhado`,
  `valorLiquidado`, `valorPago`, `funcao`, `historico`.

### Valores preservados sem interpretação

- `valorTermoAditivo` mantém o **sinal** da fonte. Negativo indica supressão na
  origem. Nenhum percentual é calculado e nenhum limite é avaliado nesta fase.
- `valorEmpenhado`, `valorLiquidado` e `valorPago` são **três estágios
  distintos** da despesa e nunca são somados entre si: empenhar é reservar,
  liquidar é reconhecer a dívida, pagar é quitar. Somá-los contaria o mesmo
  dinheiro até três vezes.
- `prazo` e `prazoAditado` da obra ficam lado a lado, sem comparação derivada.

---

## Estados de consulta

Vocabulário da Fase 2 (`domain/source-status.js`). Nenhum estado novo foi criado.

| Situação real | Estado |
|---|---|
| HTTP 200, envelope OK, com registros | `SUCCESS` |
| HTTP 200, envelope OK, zero registros | `EMPTY` |
| Resposta acima do teto local, ou parte dos providers falhou | `PARTIAL` |
| Timeout, erro de conexão, HTTP 5xx, HTTP 429 | `UNAVAILABLE` |
| HTTP 4xx, JSON inválido, envelope com `status` diferente de `OK` | `ERROR` |
| Entidade sem CNPJ | `NOT_APPLICABLE` |

**`EMPTY` nunca é apresentado como "a empresa não tem registros".** A formulação
usada é *"não foram encontrados registros na consulta realizada"*.

**Query gerada não é query executada.** A Search Matrix produz consultas em
estado `PLANNED`; o `sourceStatus` só existe depois da execução do provider.

---

## Paginação e truncamento

Nenhum método dos Dados Abertos do TCE-PE documenta paginação, e nenhum aceita
parâmetro de página — a resposta vem inteira. Nenhum parâmetro foi inventado.

O teto local é `TCE_PE_MAX_ROWS` (padrão 500). Ao ser atingido:

- o provider passa a `PARTIAL`;
- `truncado: true` e `totalLinhasNaFonte` registram o tamanho real;
- um `warning` declara quantas linhas existiam e quantas foram processadas.

Um CNPJ ativo pode devolver mais de mil linhas de despesa — a truncagem é real e
por isso é declarada em vez de silenciosa.

---

## Deduplicação

Por identificador oficial, nunca por nome:

| Tipo | Chave |
|---|---|
| Contrato | `codigoContrato`, ou `numeroContrato` + ano + unidade gestora |
| Termo aditivo | contrato + ano + `numeroTermoAditivo` + ano do termo |
| Licitação | `codigoPL` + CNPJ do licitante |
| Obra | `codigoObra` + CNPJ |
| Despesa | `idEmpenho` + ano + unidade gestora + mês |

Contrato, 1º aditivo e 2º aditivo são **três registros distintos**, não um
repetido. Só a mesma linha devolvida duas vezes é fundida, e o número de fusões
fica em `duplicatesMerged`.

---

## Cache

Em memória, no processo, sem infraestrutura externa. TTL padrão de 15 minutos
(`TCE_PE_CACHE_TTL_MS`). A chave inclui método e parâmetros normalizados e
ordenados, de modo que a resposta de uma empresa nunca seja servida para outra.

---

## Limitações conhecidas

Verificadas contra a API em produção, não presumidas.

- **`ObrasDadosContratacao` está publicado mas não populado.** Responde HTTP 200
  com `status: OK` e **zero linhas para qualquer filtro** — por CNPJ, por nome do
  contratado, por código de obra e até sem filtro nenhum. Enquanto permanecer
  assim, não há como vincular obra a empresa por CNPJ nesta fonte. O provider é
  consultado normalmente e reporta `EMPTY`; isso significa *"não foram
  encontrados registros na consulta realizada"*, e não que a empresa não tenha
  obras.
- **`Obras` não aceita filtro por CPF/CNPJ.** Só é alcançável por `Municipio`,
  `UG`, `Titulo`, `DataUltimaAuditoria` ou `Codigo`. Depende de
  `ObrasDadosContratacao` para o vínculo com a entidade.
- **`Processos` não retorna o CNPJ do interessado.** A identificação naquela base
  é nominal e continua sob a atribuição contextual já validada.
- **`JustificativaTermoAditivo` chega com `?` no lugar dos acentos**
  (`"acr?scimo de valor"`). A corrupção está no dado publicado, não na leitura:
  outros campos da mesma resposta decodificam corretamente. O texto é preservado
  como veio.
- **`NumeroDocumentoAjustado` vem preenchido com espaços à direita.** Normalizado
  na leitura.
- **Sem CNPJ não há consulta possível** nestes datasets. `NOT_APPLICABLE`.
- **A cobertura é a que o próprio Tribunal publica.** Nada aqui autoriza afirmar
  que a base cobre todos os contratos, obras ou despesas do estado.
- **Não implementado nesta fase:** `EmpenhoLiquidacao` e `EmpenhoPagamento`
  existem e são gratuitos, mas filtram por unidade gestora e número de empenho,
  não por CNPJ. Só seriam alcançáveis a partir dos empenhos já coletados em
  `Despesas*`, o que multiplicaria as requisições. `Sancoes` e `DebitosMultas`
  aceitam `CPFCNPJ` e ficam para a fase de sanções.

---

## Variáveis de ambiente

Todas opcionais, todas com padrão embutido. Nenhuma exige chave ou serviço pago.

| Variável | Padrão | Função |
|---|---|---|
| `TCE_PE_BASE_URL` | URL oficial | Base da API |
| `TCE_PE_TIMEOUT_MS` | `20000` | Timeout por requisição |
| `TCE_PE_CACHE_TTL_MS` | `900000` | TTL do cache em memória |
| `TCE_PE_MAX_ROWS` | `500` | Teto local de linhas por consulta |
| `TCE_PE_DEADLINE_MS` | `45000` | Orçamento global da rota |
| `TCE_PE_MAX_WORK_LOOKUPS` | `15` | Fichas de obra buscadas por execução |

---

## Rota

```
POST /api/judicial/tce-pe/dados-abertos
{ "cnpj": "10.811.370/0001-62", "razaoSocial": "...", "municipio": "...", "uf": "PE" }
```

Devolve `providers[]` (estado por fonte), `contratos`, `aditivos`, `licitacoes`,
`obras`, `obrasContratacao`, `despesas`, `fornecedores`, `descartados`,
`matrizDePesquisa` e `resumo`.
