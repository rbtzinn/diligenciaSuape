# Diligência 360 — Compliance SUAPE

Plataforma unificada de due diligence e conformidade corporativa para o Porto de Suape. Realiza consultas cadastrais, análise societária (QSA), checagem de Pessoas Expostas Politicamente (PEP), sanções oficiais (CEIS / CNEP), pesquisa de mídia adversa na web e enriquecimento processual pelo DataJud (CNJ), com persistência permanente e imutabilidade histórica em PostgreSQL.

---

## 1. Pré-Requisitos

* **Docker** (versão 24.0 ou superior)
* **Docker Compose** (versão 2.20 ou superior)

> *(Opcional para desenvolvimento local sem contêineres: Node.js 20+ e PostgreSQL 16+).*

---

## 2. Configuração de Variáveis de Ambiente

Copie o arquivo de exemplo para criar seu `.env` local:

```bash
cp .env.example .env
```

Preencha as chaves opcionais de API no arquivo `.env`:
* `CGU_API_KEY`: Chave da API do Portal da Transparência (para consultas completas de CEIS/CNEP/PEP).
* `BRAVE_SEARCH_API_KEY`: Chave da Brave Search API (para pesquisa de mídia adversa).

### Desenvolvimento local

Para iniciar o frontend e o backend juntos, use:

```bash
npm run dev:full
```

O frontend fica em `http://localhost:5173` e a API em `http://localhost:3000`. Executar apenas `npm run dev` inicia somente o frontend; nesse caso, as chamadas para `/api` falham porque o backend não está disponível.

### Primeiro acesso

O e-mail definido em `INITIAL_ADMIN_EMAIL` autoriza o administrador no Diligência 360, mas a identidade também precisa existir no **Firebase Authentication**, com o provedor **E-mail/senha**. A senha não é armazenada neste projeto. Crie a conta no Firebase ou use **Esqueci minha senha** na tela de entrada para definir uma nova senha de forma segura.

---

## 3. Inicialização Rápida com Docker Compose

Para construir as imagens e iniciar todos os serviços (PostgreSQL, Backend Express e Frontend Nginx):

```bash
docker compose up --build
```

O Docker Compose inicializa automaticamente os serviços na seguinte ordem:
1. Sobe o container `postgres` e executa o **healthcheck** de prontidão.
2. Sobe o container `backend`, gera o Prisma Client, aplica as **migrations pendentes** (`prisma migrate deploy`) e inicia o servidor Express.
3. Sobe o container `frontend` com Nginx e proxy reverso para `/api/`.

---

## 4. Acesso às Aplicações

* **Interface Web (Frontend):** [http://localhost:8080](http://localhost:8080)
* **API REST (Backend):** [http://localhost:3000](http://localhost:3000)
* **Diagnóstico de Saúde:** [http://localhost:3000/api/status](http://localhost:3000/api/status)

---

## 5. Comandos Operacionais

### Execução em Segundo Plano
```bash
docker compose up -d
```

### Visualizar Logs em Tempo Real
```bash
docker compose logs -f
```

### Checar Status dos Contêineres
```bash
docker compose ps
```

### Parar os Serviços (Preserva os Dados)
```bash
docker compose down
```
> *Os dados históricos de diligências ficam preservados com segurança no volume nomeado `postgres_data`.*

### Reconstruir as Imagens do Zero
```bash
docker compose build --no-cache
```

---

## 6. Arquitetura da Stack

```text
┌────────────────────────────────────────────────────────┐
│                   DILIGÊNCIA 360                       │
├────────────────────────────────────────────────────────┤
│  Frontend (Porta 8080)                                 │
│  React 18 • TypeScript • Vite • Nginx Alpine           │
│  Proxy reverso transparente para /api/*                │
├────────────────────────────────────────────────────────┤
│  Backend (Porta 3000)                                  │
│  Node.js 20 • Express • Prisma ORM                     │
│  Transações Atômicas • Dossiês Históricos              │
├────────────────────────────────────────────────────────┤
│  Banco de Dados (Interno / 5432)                       │
│  PostgreSQL 16 Alpine • Volume persistente             │
└────────────────────────────────────────────────────────┘
```

---

## 7. Módulos e Fontes Oficiais Integradas

* **Receita Federal / QSA:** Dados cadastrais, endereço e quadro societário (via BrasilAPI / ReceitaWS).
* **CGU / CEIS:** Cadastro de Empresas Inidôneas e Suspensas.
* **CGU / CNEP:** Cadastro Nacional de Empresas Punidas (Lei Anticorrupção).
* **CGU / PEP:** Pessoas Expostas Politicamente com prevenção de homonímia nominal.
* **Mídia Adversa:** Varredura web com Brave Search API, deduplicação e categorização de risco.
* **CNJ / DataJud:** Enriquecimento de metadados de processos judiciais (TJPE, TRF5, TRT6).
