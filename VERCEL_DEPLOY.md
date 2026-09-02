# Publicação na Vercel — Firebase + Google Sheets

Este arquivo é o roteiro da próxima publicação. As alterações estão somente no computador local; este procedimento não foi executado e nenhum código foi enviado ao GitHub.

## 1. Preparar o Google Sheets

A planilha já criada e preenchida com o legado é:

`https://docs.google.com/spreadsheets/d/1J9FwZv1lDDrRWDP-gWkpRj2rNimwh0gMlHitYCD4bSc/edit`

Antes do deploy do backend, crie uma conta de serviço exclusiva para a planilha. É o caminho recomendado porque o projeto não precisa de uma conta Firebase Admin já existente:

1. Abra o [Google Cloud Console](https://console.cloud.google.com/apis/library/sheets.googleapis.com) no projeto `diligencia-8e779` e ative **Google Sheets API**.
2. Abra **IAM e administrador > Contas de serviço > Criar conta de serviço**. Use, por exemplo, o nome `diligencia360-sheets`.
3. Não é necessário conceder uma função ampla do projeto: conclua a criação e, na conta nova, abra **Chaves > Adicionar chave > Criar nova chave > JSON**.
4. Guarde o arquivo JSON em local seguro. Você usará apenas `client_email` e `private_key`; nunca envie esse arquivo ao GitHub.
5. Abra a planilha, clique em **Compartilhar**, informe o `client_email` da conta criada e escolha **Editor**.
6. Mantenha o acesso geral como **Restrito**. Não publique a planilha na Web e não use “qualquer pessoa com o link”.

O backend usa essa conta de serviço para escrever na planilha; os usuários do site não precisam receber acesso direto ao arquivo.

## 2. Projeto do backend na Vercel

Abra o projeto `diligencia360-api` e acesse **Settings > Environment Variables**. Cadastre em **Production**:

```dotenv
FIREBASE_PROJECT_ID=diligencia-8e779
FIREBASE_WEB_API_KEY=CHAVE_WEB_DO_FIREBASE

GOOGLE_SHEETS_SPREADSHEET_ID=1J9FwZv1lDDrRWDP-gWkpRj2rNimwh0gMlHitYCD4bSc
GOOGLE_SHEETS_CLIENT_EMAIL=CLIENT_EMAIL_DO_JSON
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nCHAVE_PRIVADA_DO_JSON\n-----END PRIVATE KEY-----\n"

CORS_ALLOWED_ORIGINS=https://diligencia-suape.vercel.app
CGU_API_KEY=SUA_CHAVE
DATAJUD_API_KEY=SUA_CHAVE
BRAVE_SEARCH_API_KEY=SUA_CHAVE_SE_USAR
ADVERSE_MEDIA_MAX_QUERIES=4
```

Se já existir uma conta Firebase Admin funcional, você pode reutilizá-la: configure `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`, compartilhe a planilha com esse e-mail e deixe as duas variáveis `GOOGLE_SHEETS_*` opcionais vazias. A conta exclusiva do Sheets acima é mais simples e reduz o alcance da credencial.

Em **Settings > Build and Deployment**:

- Root Directory: `server`
- Node.js Version: `24.x`
- Install Command: padrão (`npm install`/`npm ci`)
- Não existe mais `prisma generate`, `prisma migrate` nem etapa de banco.

O `package.json` do backend já fixa Node `24.x`.

## 2.1 Análise consolidada por IA (gratuita)

A leitura do dossiê por IA roda **somente no backend**. A chave nunca vai para o
projeto do frontend: variáveis `VITE_*` são embutidas no JavaScript entregue ao
navegador e ficariam públicas.

Ainda em `diligencia360-api` > **Settings > Environment Variables > Production**,
acrescente ao menos uma destas. Todas operam em cota gratuita e nenhuma exige
cartão de crédito:

```dotenv
GROQ_API_KEY=SUA_CHAVE
GEMINI_API_KEY=SUA_CHAVE_SE_USAR
GITHUB_MODELS_TOKEN=SEU_TOKEN_SE_USAR
```

| Provedor | Onde obter | Observação |
| --- | --- | --- |
| Groq | `console.groq.com/keys` | Login com GitHub ou Google. Mais rápido. |
| Google Gemini | `aistudio.google.com/apikey` | Use a chave do AI Studio. **Não** ative faturamento no projeto Google Cloud. |
| GitHub Models | `github.com/settings/tokens` | Token sem escopos extras. Cota diária menor. |

Configurar as três dá redundância: quando a cota diária da primeira acaba, o
provedor responde HTTP 429 e o backend cai para a próxima da fila sozinho. Sem
cartão cadastrado não existe cobrança por excedente; o pedido apenas falha.

O `server/vercel.json` define `maxDuration: 60` para a função. A análise usa tempo
limite interno de 45s, abaixo desse teto, para que um provedor lento vire mensagem
tratada na tela em vez de corte da plataforma.

## 3. Projeto do frontend na Vercel

No projeto `diligencia-suape`, configure em **Settings > Environment Variables > Production**:

```dotenv
VITE_API_BASE_URL=https://diligencia360-api.vercel.app
VITE_FIREBASE_API_KEY=CHAVE_WEB_DO_FIREBASE
VITE_FIREBASE_AUTH_DOMAIN=diligencia-8e779.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=diligencia-8e779
VITE_FIREBASE_STORAGE_BUCKET=VALOR_DO_FIREBASE
VITE_FIREBASE_MESSAGING_SENDER_ID=VALOR_DO_FIREBASE
VITE_FIREBASE_APP_ID=VALOR_DO_FIREBASE
VITE_FIREBASE_MEASUREMENT_ID=VALOR_DO_FIREBASE
```

Não coloque `FIREBASE_PRIVATE_KEY`, `GOOGLE_SHEETS_PRIVATE_KEY`, chaves da CGU/DataJud/Brave ou qualquer segredo no projeto do frontend. Variáveis `VITE_*` são incorporadas ao JavaScript entregue ao navegador.

## 4. Firebase Authentication

No Firebase Console:

1. Abra **Authentication > Settings > Authorized domains**.
2. Confirme `diligencia-suape.vercel.app` — ele já aparece autorizado na configuração atual.
3. Se adicionar domínio próprio ou URL de Preview, autorize também esse hostname.
4. Em **Authentication > Users**, crie somente as contas que podem entrar no sistema.

Não existe perfil Admin/Analista/Revisor/Consulta. Toda conta Firebase autenticada recebe acesso completo.

## 5. Publicar e validar

Quando você decidir enviar o código:

1. Faça o deploy/redeploy do backend.
2. Abra `https://diligencia360-api.vercel.app/api/status`.
3. Confirme `status: "online"`, `database.provider: "Google Sheets"` e `database.connected: true`.
4. Faça o deploy/redeploy do frontend.
5. Entre com uma conta criada no Firebase.
6. Crie uma diligência curta, atualize a página e abra-a pelo histórico.
7. Execute uma transição do workflow, ajuste o risco e gere um PDF.
8. Confira as novas linhas nas abas `Diligencias`, `Payloads`, `Auditoria` e `Relatorios`.

Alterações em variáveis de ambiente só entram em novos deployments. Depois de salvar uma variável, use **Deployments > menu do último deployment > Redeploy**.

## 6. Quando remover o Neon da Vercel

O código novo não lê `DATABASE_URL`. Mesmo assim, não exclua o projeto Neon imediatamente:

1. Antes do primeiro deploy novo, evite criar diligências no site antigo; a cópia realizada cobre os dados existentes até 25/08/2026.
2. Valide na planilha os 4 dossiês, 6 relatórios e 72 eventos migrados.
3. Depois do backend novo aprovado, remova `DATABASE_URL` e qualquer integração Neon do projeto backend na Vercel.
4. Guarde o Neon como backup somente leitura por um período definido por você.
5. Exclua o banco apenas em uma ação separada e consciente; isso não é necessário para o site funcionar.

## 7. Diagnóstico rápido

- `Google Sheets API has not been used`: ative a API no Google Cloud e refaça o deploy.
- `The caller does not have permission`: compartilhe a planilha como Editor com o `GOOGLE_SHEETS_CLIENT_EMAIL` (ou `FIREBASE_CLIENT_EMAIL`) exato.
- `invalid_grant` ou erro PEM: recoloque a chave privada correspondente preservando `\n` e os marcadores BEGIN/END.
- `Credencial de serviço do Google ausente`: preencha `GOOGLE_SHEETS_CLIENT_EMAIL` e `GOOGLE_SHEETS_PRIVATE_KEY` no projeto de backend.
- Status online, mas login falha: confira o usuário no Firebase e o domínio autorizado.
- Erro de CORS: confira `VITE_API_BASE_URL` e `CORS_ALLOWED_ORIGINS` sem barra final.
- Variável alterada sem efeito: faça Redeploy; deployments antigos não recebem valores novos.
- Dossiê muito grande: a Vercel aceita até 4,5 MB por request/response; o backend recusa acima de 4 MB para deixar uma margem segura. Reduza evidências muito extensas antes de salvar.

Referências oficiais: [variáveis de ambiente da Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables), [Node.js na Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [ativação da Sheets API](https://developers.google.com/workspace/sheets/api/quickstart/nodejs), [compartilhamento no Drive](https://support.google.com/drive/answer/2494822) e [domínios autorizados do Firebase](https://firebase.google.com/docs/auth/web/email-link-auth).
