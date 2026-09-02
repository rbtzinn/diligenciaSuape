# Diligência 360 — Compliance SUAPE

Aplicação React/Express de due diligence corporativa. O acesso é controlado exclusivamente pelo Firebase Authentication: toda conta ativa cadastrada no Firebase pode usar todas as funções do sistema. O histórico permanente fica em Google Sheets, com payload completo comprimido, versões, hash SHA-256, auditoria e exclusão lógica.

## Arquitetura

- Frontend: React 18, TypeScript e Vite.
- Backend: Node.js 24 e Express.
- Autenticação: Firebase Authentication por e-mail/senha.
- Persistência: Google Sheets API.
- Relatórios: PDF versionado com hash SHA-256.

O PostgreSQL, Prisma, cadastro local de usuários e RBAC não fazem mais parte da aplicação.

## Configuração local

1. Copie `.env.example` para `.env`.
2. Preencha as variáveis do Firebase e das integrações usadas.
3. Crie uma conta de serviço exclusiva para o Google Sheets, gere uma chave JSON e preencha `GOOGLE_SHEETS_CLIENT_EMAIL` e `GOOGLE_SHEETS_PRIVATE_KEY`.
4. Informe `GOOGLE_SHEETS_SPREADSHEET_ID`.
5. Compartilhe a planilha como **Editor** com o e-mail de `GOOGLE_SHEETS_CLIENT_EMAIL`.
6. Ative a Google Sheets API no projeto Google Cloud correspondente.

Também é possível reutilizar `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` se você já tiver uma conta Firebase Admin. Nesse caso, deixe as duas variáveis `GOOGLE_SHEETS_*` opcionais vazias. O roteiro completo está no guia de publicação.

```bash
npm install
npm --prefix server install
npm run dev:full
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Diagnóstico: `http://localhost:3000/api/status`

## Verificação

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Docker

```bash
docker compose up --build
```

O Compose inicia somente backend e frontend. Não existe mais contêiner ou volume PostgreSQL.

## Implantação

O tutorial completo e as variáveis separadas por projeto estão em [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md). A planilha criada para o histórico é [Diligência 360 — Histórico](https://docs.google.com/spreadsheets/d/1J9FwZv1lDDrRWDP-gWkpRj2rNimwh0gMlHitYCD4bSc/edit).

## Fontes integradas

- Receita Federal/QSA via provedores públicos configurados.
- Minha Receita (grafo dos dados abertos da RFB) para localizar outras empresas associadas ao mesmo nome e CPF mascarado; os elos permanecem como hipóteses até validação humana.
- CGU: CEIS, CNEP e PEP.
- CEIS e CNEP também para os sócios pessoa física, por busca nominal. O quadro
  societário público não expõe o CPF completo, então cada retorno é candidato
  sujeito a revisão: a identidade só se sustenta quando o CPF mascarado das duas
  fontes coincide, e mesmo assim exige validação documental.
- CNJ/DataJud.
- Brave Search para mídia adversa, quando configurada, incluindo co-menções entre entidades conhecidas na mesma publicação.
- Diários oficiais e ICIJ Offshore Leaks.

## Pesquisa gratuita e ampla

A busca não depende de provedor pago. Sem chave Brave, o sistema opera com quatro
fontes gratuitas, divididas em dois canais:

- Canal de notícias: Google News RSS e GDELT DOC.
- Canal web: SearXNG (metabusca própria) e DuckDuckGo Lite.

### O canal web está degradado

O DuckDuckGo Lite não é API: é página HTML consumida por scraping. Ele passou a
responder HTTP 202 com página de desafio ao detectar automação — IP de datacenter,
rajada de consultas e ausência de impressão digital de navegador. Não existe ajuste
de volume que torne isso confiável.

Com o SearXNG não configurado e o Brave impedido de persistir resultados, o canal
web fica sem provedor utilizável, e as consultas institucionais — tribunal de contas,
PNCP, CNJ, diários oficiais — não são respondidas. O dossiê marca essas consultas
como falha, nunca como ausência de achado.

O Google Programmable Search foi avaliado e descartado: a Custom Search JSON API está
fechada para novos clientes e será descontinuada em 1º de janeiro de 2027. Não vale
construir sobre ela.

A direção adotada é substituir a busca por operadores `site:` por integração direta
com os dados abertos de cada órgão, que é mais confiável e não depende de buscador.

O canal web existe porque índice de notícia não alcança documento. É ele que traz
portaria, ata, edital, contrato, acórdão e PDF institucional. Para cada pessoa
física do quadro societário e para a empresa são geradas consultas de:

- menção geral;
- termos adversos (investigação, denúncia, condenação, fraude, improbidade);
- documentos oficiais (`portaria`, `nomeação`, `edital`, `ata`, `diário oficial`);
- arquivos (`filetype:pdf`);
- domínios oficiais (`ADVERSE_MEDIA_INSTITUTIONAL_SITES`: Portal da Transparência,
  TCU, TCE-PE, TSE, PNCP, CNJ, MPF, MPPE, Imprensa Nacional, Diário Oficial de PE);
- variante abreviada do nome, sempre ancorada no nome da empresa.

Os diários oficiais do Querido Diário passam a ser pesquisados também pelo nome de
cada pessoa física do quadro, não só pela razão social.

O plano da empresa gera até 12 consultas distintas e a varredura institucional é a
última delas. Como o corte por teto seguia a ordem do plano, um `ADVERSE_MEDIA_MAX_QUERIES`
baixo descartava justamente TCE, PNCP e Ministério Público. Duas correções: o teto
padrão passou a cobrir o plano inteiro, e as consultas institucionais e por CNPJ
têm vaga reservada quando o teto é reduzido por ambiente. Os domínios oficiais
também deixaram de ser empilhados numa única expressão com dez operadores `site:`,
que os buscadores truncavam devolvendo quase só o primeiro domínio; agora saem em
blocos de quatro (`ADVERSE_MEDIA_INSTITUTIONAL_SITES_PER_QUERY`).

| Variável | Padrão | Teto duro |
| --- | --- | --- |
| `ADVERSE_MEDIA_MAX_QUERIES` | 14 | — |
| `ADVERSE_MEDIA_RESULTS_PER_QUERY` | 50 | 50 |
| `ADVERSE_MEDIA_MAX_RESULTS` | 500 | 500 |
| `ADVERSE_MEDIA_DEADLINE_MS` | 50000 | 65000 |

O prazo global continua em 50s por causa do `maxDuration` de 60s da função na
Vercel. Com mais consultas, é esperado que diligências de empresas muito citadas
terminem como cobertura `PARCIAL` — o dossiê registra isso explicitamente em vez
de fingir que varreu tudo. Para varredura sem esse teto, rode o backend fora de
função serverless e aumente `ADVERSE_MEDIA_DEADLINE_MS`.

Homônimo é o risco central da busca nominal. Nome completo sem âncora (empresa,
CNPJ ou CPF mascarado no mesmo texto) fica classificado como correlação média ou
baixa e não eleva risco sozinho. Nome com uma única palavra não é pesquisado.

Para subir a metabusca própria:

```bash
docker compose up -d searxng
```

O serviço fica em `http://127.0.0.1:8888` e a configuração está em
`searxng/settings.yml` — o formato `json` precisa continuar habilitado, senão o
backend recebe HTTP 403. Antes de uso compartilhado, troque `SEARXNG_SECRET`.
Sem SearXNG, defina `SEARXNG_BASE_URL` vazio: o DuckDuckGo Lite assume o canal
web sozinho, com menos cobertura.

## Base funcional interna (opcional)

Compara o quadro societario investigado com as identidades funcionais da
organizacao, para revelar que uma pessoa do QSA tambem tem vinculo institucional.

A aplicacao le a base minimizada, um CSV com apenas nome, chapa, CPF mascarado,
tipo de vinculo, competencia e aba de origem. Gere esse arquivo a partir da folha
institucional:

```bash
node server/scripts/build-functional-dataset.js /caminho/folha-julho-2026.xlsx server/data/base-funcional.csv
```

O script grava dois arquivos: `base-funcional.csv`, legivel em diff para auditoria,
e `base-funcional.js`, o mesmo conteudo embutido como modulo. A aplicacao carrega o
modulo automaticamente, sem precisar de variavel de ambiente.

`INTERNAL_SUAPE_DATASET_PATH` continua disponivel para apontar outro arquivo, CSV ou
XLSX, util em execucao local. Caminho absoluto vale local; caminho relativo e resolvido
a partir de `server/`. Se o caminho configurado nao existir, a base embutida assume.


A folha `.xlsx` original tambem e aceita diretamente, util em execucao local. Nos
dois formatos a remuneracao e descartada na leitura, nao na exibicao: salario,
evento de folha, provento, desconto e totais nunca entram em memoria e por isso
nao alcancam o grafo, o PDF nem o historico. O teste
`server/test/payroll-workbook.test.js` falha se algum valor de folha sobreviver.

O `.gitignore` versiona apenas o CSV de `server/data/` e continua ignorando
qualquer `.xlsx`, para que a folha original nao seja commitada por descuido. Em
ambiente serverless nao ha disco gravavel nem como enviar o arquivo por variavel
de ambiente, entao a base viaja no bundle: o `vercel.json` do backend declara
`includeFiles: "data/**"`, porque o rastreamento de dependencias da Vercel nao
detecta leitura por caminho vindo de variavel de ambiente.

Cada aba da folha vira um tipo de vinculo: funcionario, comissionado, cedido,
conselho de administracao, conselho fiscal e comite de auditoria.

O cruzamento e nominal e continua sendo hipotese: nome igual soma pontos, CPF
mascarado coincidente soma mais, e nada e tratado como identidade confirmada sem
validacao documental. Sem a variavel configurada, o painel de fontes mostra a
base como nao importada e nenhuma comparacao acontece.

## Leitura consolidada por IA (gratuita)

Um painel do dossiê aciona um modelo de linguagem para ler todas as evidências já
coletadas e redigir a análise consolidada: resumo executivo, achados ordenados por
severidade, cobertura de cada fonte, lacunas e perguntas sugeridas ao fornecedor.

A IA não pesquisa e não descobre fatos. Ela recebe apenas o pacote de evidências
numerado que o backend monta a partir do dossiê, e cada achado precisa citar um
identificador desse pacote. Achado sem citação válida é descartado antes de chegar
à tela — é a trava contra afirmação inventada.

Provedores suportados, todos em cota gratuita e sem cartão de crédito. Basta uma
chave; as demais servem de reserva quando a cota diária de uma acaba:

| Ordem | Provedor | Onde obter a chave | Variável |
| --- | --- | --- | --- |
| 1 | Groq | `console.groq.com/keys` | `GROQ_API_KEY` |
| 2 | Google Gemini (AI Studio) | `aistudio.google.com/apikey` | `GEMINI_API_KEY` |
| 3 | GitHub Models | `github.com/settings/tokens` | `GITHUB_MODELS_TOKEN` |
| 4 | OpenRouter (opcional) | `openrouter.ai/keys` | `OPENROUTER_API_KEY` |

O modelo de cada provedor é configurável (`GROQ_MODEL`, `GEMINI_MODEL`, ...). Os
catálogos mudam e um modelo aposentado passa a responder HTTP 404, com a mensagem
dizendo qual variável ajustar. Para ver o que a sua chave enxerga:

```bash
curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
```

Ao esgotar a cota o provedor responde HTTP 429 e o backend cai para o próximo da
fila, sem cobrança. Duas travas evitam gasto acidental: no OpenRouter só passam
modelos terminados em `:free`, e o Gemini deve ser usado pela chave do AI Studio,
sem faturamento ativado no projeto Google Cloud.

### Busca assistida por IA

Última camada, para quando o plano fixo de consultas termina sem achado relevante.

A tentação natural é perguntar ao modelo "quais fraudes esta empresa cometeu".
Não faça isso: o modelo não tem base de dados de empresas brasileiras e responde
completando padrões, produzindo número de processo, valor de multa e nome de
operação com aparência perfeita e origem inexistente. Num dossiê que vira PDF
sobre uma empresa real, isso é risco de difamação.

O que a rota faz em vez disso, em duas etapas:

1. o modelo propõe **consultas de busca** que o plano fixo não cobriu — órgãos
   estaduais e municipais, tribunal de contas da jurisdição, conselho profissional,
   agência reguladora do CNAE, sindicato, Ministério Público do Trabalho, variações
   do nome empresarial, sócio somado ao município;
2. os buscadores reais executam essas consultas e os resultados voltam com fonte,
   domínio e URL verificáveis.

Toda consulta precisa estar **ancorada** na razão social, no nome fantasia, no CNPJ
ou no nome completo de uma pessoa do quadro. Consulta sem âncora é rejeitada antes
de rodar, porque traria notícia de empresa homônima como se fosse da investigada.

O modelo ainda pode declarar hipóteses sobre a empresa, mas elas voltam num bloco
de **quarentena**, visualmente separado, marcadas como `NAO_CONFIRMADA`. Não contam
como evidência, não entram no cálculo de risco e não devem sair em relatório para
terceiros sem verificação humana. Quando o modelo não conhece a empresa, devolver
lista vazia é a resposta correta e é o que o prompt pede explicitamente.

Endpoints:

- `GET /api/ai/status` — provedores configurados.
- `POST /api/ai/evidence-pack` — mostra o que seria enviado ao modelo, sem gastar cota.
- `POST /api/ai/dossier-analysis` — gera a análise consolidada.
- `POST /api/ai/investigative-leads` — busca assistida: o modelo sugere, os buscadores confirmam.

A saída exige validação humana: não substitui parecer jurídico, e ausência de
achado não é atestado de idoneidade.
