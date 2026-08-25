# Publicar o frontend na Vercel

Este projeto publica somente o frontend React/Vite na Vercel. O backend Express e o PostgreSQL precisam estar publicados separadamente e acessiveis por HTTPS.

## Antes de importar

1. Confirme que o codigo esta no GitHub, na branch `main`.
2. O backend ja esta publicado em `https://diligencia360-api.vercel.app`.
3. No backend, configure `CORS_ALLOWED_ORIGINS` com o dominio final da Vercel, por exemplo `https://diligencia-suape.vercel.app`.
4. No Firebase Authentication, adicione o dominio da Vercel em **Settings > Authorized domains**.

## Importar o projeto

1. Acesse https://vercel.com/new e conecte a conta do GitHub.
2. Importe o repositorio `rbtzinn/diligenciaSuape`.
3. Mantenha **Root Directory** como `./`.
4. Confirme estas configuracoes (o arquivo `vercel.json` ja as define):
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install` (automatico)

## Variaveis de ambiente

Em **Project > Settings > Environment Variables**, use a opcao de colar varias variaveis e cole o conteudo de `.env.vercel.example`, trocando os valores.

Marque pelo menos **Production**. Se quiser testar deployments de branches, marque tambem **Preview**.

Variaveis exigidas:

```dotenv
VITE_API_BASE_URL=https://diligencia360-api.vercel.app
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

Use a URL do backend sem barra no final. Nao coloque `DATABASE_URL`, `FIREBASE_PRIVATE_KEY`, `CGU_API_KEY`, `DATAJUD_API_KEY` ou `BRAVE_SEARCH_API_KEY` no projeto do frontend: essas variaveis pertencem ao backend.

## Primeiro deploy

1. Clique em **Deploy**.
2. Ao finalizar, abra a URL `*.vercel.app`.
3. Atualize `CORS_ALLOWED_ORIGINS` no backend com essa URL exata e reinicie/republique o backend.
4. Adicione o mesmo dominio em **Firebase Authentication > Settings > Authorized domains**.
5. Teste login, consulta, historico e download de PDF.

Se alterar uma variavel na Vercel, abra **Deployments**, use o menu do ultimo deployment e clique em **Redeploy**. Variaveis alteradas nao modificam deployments antigos.

## Dominio proprio (opcional)

Em **Project > Settings > Domains**, adicione o dominio desejado e siga os registros DNS mostrados pela Vercel. Depois, inclua esse novo dominio tanto em `CORS_ALLOWED_ORIGINS` no backend quanto nos dominios autorizados do Firebase.

## Diagnostico rapido

- Tela branca com erro de Firebase: faltou alguma variavel `VITE_FIREBASE_*` ou o deployment nao foi refeito.
- Login bloqueado: confira o dominio autorizado no Firebase.
- Erro de rede/CORS: confira `VITE_API_BASE_URL`, HTTPS e `CORS_ALLOWED_ORIGINS` do backend.
- Recarregar uma rota gera 404: confirme que `vercel.json` esta na raiz do repositorio.
