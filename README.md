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
- CNJ/DataJud.
- Brave Search para mídia adversa, quando configurada, incluindo co-menções entre entidades conhecidas na mesma publicação.
- Diários oficiais e ICIJ Offshore Leaks.
