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
- Canal web: SearXNG (metabusca própria, sem chave) e DuckDuckGo Lite como reserva.

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

Compara o quadro societário investigado com as identidades funcionais da
organização, para revelar que uma pessoa do QSA também tem vínculo institucional.

Aponte `INTERNAL_SUAPE_DATASET_PATH` para a planilha autorizada:

```bash
INTERNAL_SUAPE_DATASET_PATH=/dados/folha-julho-2026.xlsx
```

A leitura reconhece o cabeçalho por nome de coluna e importa **somente**
`NOME`, `CHAPA`, `CPF` (mascarado), `TIPO DE FUNCIONÁRIO` e a competência
(`ANO`/`MÊS`). Cada aba vira um tipo de vínculo: funcionário, comissionado,
cedido, conselho de administração, conselho fiscal e comitê de auditoria.

Remuneração é descartada na leitura, não na exibição: salário, evento de folha,
provento, desconto e totais nunca entram em memória, então não podem alcançar o
grafo, o relatório em PDF nem o histórico. O teste
`server/test/payroll-workbook.test.js` falha se qualquer valor de folha
sobreviver ao carregamento.

O cruzamento é nominal e continua sendo hipótese: nome igual soma pontos, CPF
mascarado coincidente soma mais, e nada é tratado como identidade confirmada
sem validação documental. Sem a variável configurada, o painel de fontes mostra
a base como não importada e nenhuma comparação acontece.
