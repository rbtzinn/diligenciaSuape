# Contract Intelligence

Transforma contratos e termos aditivos já coletados pela camada TCE-PE em
contrato com eventos e linha do tempo.

Responde **"o que aconteceu com este contrato?"**.

Não responde — e não deve passar a responder — "qual o risco desta empresa?".
Isso pertence ao Pattern Engine e ao Scoring, em fases posteriores.

- **Entrada:** o retorno de `TcePeIntelligenceService.collect`.
- **Rede:** nenhuma. A camada não consulta o Tribunal.
- **Custo:** R$ 0. Sem dependências novas.

---

## Arquivos

| Arquivo | Função |
|---|---|
| `server/src/contract-intelligence/contract.model.js` | Modelos, classificação de eventos, timeline, deduplicação |
| `server/src/contract-intelligence/contract-intelligence.service.js` | Agregação e associações |
| `src/features/diligence/types/contractIntelligence.types.ts` | Espelho no frontend |

---

## Modelo `Contract`

Campos: `id`, `codigoContrato`, `numeroContrato`, `anoContrato`, `codigoPL`,
`numeroProcesso`, `anoProcesso`, `tipoProcesso`, `unidadeGestora`,
`unidadeOrcamentaria`, `siglaUG`, `codigoUG`, `esfera`, `esferaNome`,
`municipio`, `uf`, `cnpj`, `cnpjNormalizado`, `razaoSocial`, `objeto`,
`valorInicial`, `valorAtualizado`, `valorAtualizadoDisponivel`,
`vigenciaInicial`, `vigenciaFinal`, `vigenciaInicialIso`, `vigenciaFinalIso`,
`situacao`, `estagio`, `relationshipType`, `entityMatch`, `compositeKey`,
`derivedFields` e a proveniência (`source`, `provider`, `endpoint`, `query`,
`params`, `sourceUrl`, `linkArquivo`, `retrievedAt`, `raw`).

### Campos derivados

`derivedFields` lista tudo que **não veio do registro**, com a origem declarada.
Hoje contém um único item:

- **`uf`** — o dataset de contratos do TCE-PE publica município e esfera, não UF.
  O valor vem do perfil da entidade e é marcado como `CONTEXTO_DA_ENTIDADE`.

### `valorAtualizado` é sempre nulo

O TCE-PE não publica valor atualizado no dataset de contratos, e esta camada
**não o calcula**. Somar os aditivos produziria um número com aparência de dado
oficial sem o ser: acréscimo, reajuste e reequilíbrio entram na conta de formas
distintas, e a base correta depende de informação que a fonte não publica.

`valorAtualizadoDisponivel: false` declara isso explicitamente.

---

## Modelo `ContractEvent`

Campos: `id`, `contractId`, `type`, `types`, `typeBasis`, `sequence`, `date`,
`year`, `dateKnown`, `description`, `value`, `objeto`, `justificativa`,
`vigenciaInicial`, `vigenciaFinal`, `numeroTermoAditivo`, `anoTermoAditivo`,
`situacao`, `estagio`, `relationshipType`, `entityMatch`,
`associationConfidence`, `associationBasis`, `duplicatesMerged` e a mesma
proveniência do contrato.

Um evento carrega **`types` no plural** porque um termo costuma acumular
naturezas: prorrogar o prazo e acrescer valor no mesmo instrumento é o caso
comum. Guardar uma só perderia metade do fato.

### Tipos implementados

Cada natureza só é atribuída quando um **campo publicado pela fonte** a sustenta,
e `typeBasis` registra qual.

| Tipo | Campo da fonte que o sustenta |
|---|---|
| `CONTRACT_CREATED` | O próprio registro do contrato |
| `ADDITIVE` | O próprio registro do termo aditivo |
| `VALUE_ADDITION` | `ValorTermoAditivo` positivo |
| `VALUE_SUPPRESSION` | `ValorTermoAditivo` negativo |
| `TERM_EXTENSION` | Vigência do termo ultrapassa a do contrato |
| `TERM_REDUCTION` | Vigência do termo encerra antes da do contrato |
| `QUANTITATIVE_CHANGE` | Justificativa do órgão menciona "quantitativ" |
| `QUALITATIVE_CHANGE` | Justificativa do órgão menciona "qualitativ" |
| `TERMINATION` | `Situacao` indica rescisão |

Declarados no enum e **ainda sem dado que os sustente**: `PAYMENT` (dependeria de
vínculo comprovado com despesa) e `OTHER`.

Termo sem nenhum campo determinante fica só como `ADDITIVE`, e `typeBasis`
registra: *"A fonte não publica campo que permita determinar a natureza do
termo."*

A comparação de justificativa tolera o `?` que o TCE-PE grava no lugar dos
acentos (`"acr?scimo"`) — corrupção do dado publicado, não da leitura.

### O que a camada não produz

Sem percentual, sem limite legal, sem contagem interpretada, sem severidade, sem
score de risco, sem "acréscimo indevido". Um teste dedicado varre o resultado
inteiro em busca de `score`, `suspeit`, `irregular`, `fraude`, `superfatur`,
`alto risco` e `severidade`, e falha se qualquer um aparecer.

O único `score` presente é `entityMatch.score`, da Fase 1, que mede **identidade**
— "é mesmo esta empresa?" — e não risco.

---

## `ContractProfile`

Visão agregada por contrato:

```
ContractProfile
├── contrato          Contract
├── eventos           ContractEvent[]  (assinatura primeiro, depois aditivos)
├── aditivos          ContractEvent[]  (só os termos)
├── timeline          ordenação + completude declarada
├── relacionamentos   licitações · despesas · obras
├── documentos        contrato e termos, com URL oficial
├── sourceStatuses    estado por fonte, lado a lado
└── resumo            contagens, não avaliações
```

---

## Timeline

Eventos com data são ordenados cronologicamente; eventos sem data vão ao fim,
preservando a ordem de sequência. **Nenhuma data é inventada.**

| `ordering` | Significado |
|---|---|
| `COMPLETE` | Todos os eventos têm data |
| `PARTIAL` | Parte não tem data; a posição desses eventos é desconhecida |
| `UNKNOWN` | Nenhum evento tem data |

Quando não é `COMPLETE`, `timeline.aviso` explica quantos eventos ficaram sem
posição conhecida.

---

## Associação contrato ↔ aditivo

Por identificador oficial, em duas etapas:

1. **`codigoContrato`** coincidente → `CONFIRMED`.
2. **`numeroContrato` + `anoContrato` + unidade gestora** → `PROBABLE`. Número
   sozinho não serve: "069" se repete em todo órgão.
3. Nenhum dos dois → `NOT_ASSOCIATED`, e o termo é preservado em
   `aditivosOrfaos`. Descartá-lo perderia um registro oficial que existe.

**O CNPJ nunca é usado** para ligar aditivo a contrato: toda a carteira
compartilha o mesmo CNPJ, e usá-lo ligaria qualquer termo a qualquer contrato.

O contrato original **nunca é sobrescrito**. Cinco aditivos permanecem cinco
eventos distintos — o que será essencial para a detecção de recorrência.

---

## Associação com outras fontes

| Relação | Confiança máxima | Base |
|---|---|---|
| Licitação | `CONFIRMED` | `codigoPL` publicado nos dois registros |
| Despesa | `UNCERTAIN` | Histórico do empenho cita o número do contrato **e** a unidade gestora coincide |
| Obra | — nenhuma | O TCE-PE não publica identificador que ligue obra a contrato |

**Despesa nunca chega a `CONFIRMED`**: o dataset de despesas não publica o código
do contrato. Menção no histórico é indício documental, e a unidade gestora
coincidente é exigida porque o mesmo número de contrato existe em dezenas de
órgãos. Sem os dois, nenhuma associação é criada.

**Obra não é associada.** Empresa mais município não é evidência de que aquela
obra decorre daquele contrato. As obras da entidade seguem contabilizadas em
`resumo.obrasDaEntidade`, apenas não atribuídas a um contrato, e
`relacionamentos.obrasLimitacao` explica por quê.

---

## Deduplicação

| Registro | Chave |
|---|---|
| Evento de assinatura | `CONTRACT_CREATED:{contractId}` |
| Termo aditivo | `ADDITIVE:{contractId}:{numeroTermoAditivo}:{anoTermoAditivo}` |

O mesmo termo devolvido duas vezes pela API vira um evento, com
`duplicatesMerged` registrando a fusão. Aditivo 1 e aditivo 2 continuam sendo
dois eventos.

**Nunca por texto do objeto:** termos diferentes do mesmo contrato costumam
repetir o mesmo objeto, e deduplicar por ele apagaria fatos distintos.

---

## Source Status

Reutiliza `domain/source-status.js`. Cada perfil expõe o estado de cada fonte
**separadamente**:

```json
{ "contrato": "SUCCESS", "aditivos": "PARTIAL",
  "obras": "EMPTY", "licitacoes": "UNAVAILABLE", "despesas": "NOT_APPLICABLE" }
```

Nenhum status global é derivado: colapsá-los esconderia exatamente a parte que
importa. `EMPTY` e `UNAVAILABLE` produzem a mesma lista vazia e continuam sendo
estados distintos.

---

## Rastreabilidade

Todo evento responde, sem exceção: de onde veio (`source`, `provider`), qual
endpoint (`endpoint`), qual consulta (`query`, `params`), quando foi coletado
(`retrievedAt`), qual documento oficial o sustenta (`sourceUrl`, `linkArquivo`)
e qual registro bruto o originou (`raw`).

Um teste garante que nenhum evento existe sem esses campos.

---

## Limitações

- **`valorAtualizado` não existe** enquanto a fonte não publicar. A consolidação
  por natureza de aditivo depende do Pattern Engine.
- **Nenhum percentual de acréscimo** é calculado. A base correta e o regime
  aplicável não estão nos dados abertos.
- **Obra não se liga a contrato** — o Tribunal não publica esse vínculo.
- **Despesa se liga ao contrato apenas por indício documental**, nunca por
  identificador.
- **Timeline usa a vigência como data do evento.** O TCE-PE não publica data de
  assinatura do termo aditivo; a data de início de vigência é a melhor
  aproximação disponível e está declarada como tal.
- **PDFs não são lidos.** `linkArquivo` é preservado para o Document
  Intelligence, em fase posterior.
- **Recorrência entre contratos não é analisada.** Os eventos ficam estruturados
  para que o Pattern Engine o faça depois.

---

## Rota

Os perfis acompanham a coleta do TCE-PE, construídos sobre a **mesma** resposta,
sem requisição adicional:

```
POST /api/judicial/tce-pe/dados-abertos
→ { ...dadosAbertos, contractIntelligence: { contratos, aditivosOrfaos, cobertura, resumo } }
```

---

## Variáveis de ambiente

Nenhuma. A camada não consulta rede e não tem parâmetro configurável.

---

# Contract Timeline

Ordena os eventos já produzidos e acrescenta o que outras fontes sustentam com
data confiável: a licitação de origem, os empenhos associados e os processos de
controle externo.

Responde **"o que aconteceu, e em que momento"**. Não responde "isso é regular?".

**Arquivo:** `server/src/contract-intelligence/contract-timeline.js`
**Rede:** nenhuma. Opera sobre o `ContractProfile` já montado.

## Modelo temporal

Cada entrada carrega cinco campos que viajam até a tela:

| Campo | Função |
|---|---|
| `eventDate` | Data ISO, ou `null` |
| `dateSource` | Campo da fonte de onde a data veio |
| `datePrecision` | `EXACT` · `APPROXIMATE` · `YEAR_ONLY` · `UNKNOWN` |
| `dateConfidence` | `HIGH` · `MEDIUM` · `LOW` · `NONE` |
| `orderingBasis` | Frase que explica de onde a posição veio |

### Precisão das datas

| Precisão | Quando | Exemplo |
|---|---|---|
| `EXACT` | A fonte publica a data do próprio evento | `dataPublicacaoHomologacao`, `dataEmpenho`, `DataSessaoJulgamento` |
| `APPROXIMATE` | A data vem da vigência | Contrato e termo aditivo |
| `YEAR_ONLY` | Só o ano é conhecido | `anoTermoAditivo` sem vigência |
| `UNKNOWN` | Nada sustenta uma data | Termo sem vigência e sem ano |

**A limitação mais importante:** o TCE-PE **não publica data de assinatura** de
contrato nem de termo aditivo. A vigência é a melhor aproximação disponível, e
por isso contrato e aditivo são sempre `APPROXIMATE`. A interface exibe *"data
aproximada, derivada da vigência"* junto de cada uma. Apresentá-las como data
exata afirmaria um fato que documento nenhum sustenta.

## Ordenação

Pela melhor evidência temporal, na ordem: data explícita do evento → vigência →
ano → sem data (ao fim, preservando a sequência).

Empate na mesma data é resolvido por precisão, tipo, número do termo e id —
**apenas para a interface não mudar de ordem entre execuções**. Essa ordem é
técnica, não cronológica, e `orderWithinDateIsTechnical: true` a marca como tal.

## Eventos na linha do tempo

Além dos eventos do contrato: `LICITACAO` (associada por `codigoPL`, com data
publicada), `EMPENHO` (associação `UNCERTAIN`) e `PROCESSO` (vínculo com a
empresa, `PROBABLE` quando há posição definida, `UNCERTAIN` quando apenas
citada).

**Falso positivo nunca entra.** Processo cuja identidade não se sustenta, ou
marcado como não atribuível, fica fora da linha principal.

**Obra nunca entra.** O TCE-PE não publica vínculo obra↔contrato, e empresa mais
município não é evidência.

**Sem data confiável, nada entra.** Licitação, empenho e processo sem data ficam
de fora em vez de receber posição inventada.

## `CONTRACT_CLOSED` × `TERMINATION`

Fatos opostos, tipos separados:

- `CONTRACT_CLOSED` — "Concluído", "Encerrado", "Fim de Vigência", "Finalizado".
  O contrato cumpriu o que foi pactuado.
- `TERMINATION` — "Rescindido", "Distrato", "Cancelado", "Extinto". O vínculo
  foi rompido.

Um contrato concluído **nunca** produz `TERMINATION`. Situação "Regular" não
produz desfecho algum — é contrato em curso.

## Vigência não é execução

O intervalo publicado é apresentado como vigência, com a nota: *"Vigência não é
execução: a fonte não informa o que foi efetivamente executado no período."* Um
contrato vigente por doze meses pode não ter sido executado um único dia.

## Conflitos temporais

Quando o ano declarado no registro diverge do ano derivado da data, **as duas
informações são preservadas** com as respectivas origens e `temporalConflict:
true`. Nenhuma é escolhida automaticamente: resolver divergência documental exige
ler o documento, e isso é fase posterior.

## Source Status na linha do tempo

`EMPTY` e `UNAVAILABLE` produzem formulações obrigatoriamente distintas:

- `EMPTY` → *"Não foram encontrados registros de termos aditivos na consulta realizada."*
- `UNAVAILABLE` → *"Não foi possível verificar termos aditivos nesta consulta. A ausência na linha do tempo não significa que não existam."*
- `PARTIAL` → *"A consulta de termos aditivos foi concluída apenas em parte."*

## Cobertura temporal

`totalEventos`, `eventosComDataExata`, `eventosComDataAproximada`,
`eventosApenasComAno`, `eventosSemData`, `conflitosTemporais`, e a contagem de
fontes `SUCCESS` / `EMPTY` / `PARTIAL` / `UNAVAILABLE`.

É cobertura, não risco. Nenhum score é produzido.

## Limitações

- **Sem data de assinatura** para contrato e aditivo — a mais relevante.
- **Vigência do termo aditivo não permite deduzir dias acrescidos** ao prazo:
  a fonte publica o intervalo do termo, não a diferença sobre o prazo anterior.
- **Empenho nunca chega a vínculo confirmado** — a fonte não publica o código do
  contrato.
- **Processo liga-se à empresa, não ao contrato** — o TCE-PE não publica essa ligação.
- **Obra não entra na linha do tempo.**
- **A linha do tempo não é a história do contrato.** É a linha construída a
  partir dos dados oficiais efetivamente disponíveis e consultados.
