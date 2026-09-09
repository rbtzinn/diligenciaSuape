# Pesquisa ampliada com IA

Em Notícias e links, selecione a empresa/pessoa e use **Pesquisar com IA**.
O fluxo é independente da coleta de notícias convencional: um modelo cria
consultas, buscadores executam e uma segunda rodada usa os títulos e trechos
encontrados para sugerir consultas novas. Até 12 consultas por execução.

## Configuração no servidor

- `OPENROUTER_API_KEY`: chave da conta OpenRouter, apenas no backend.
- `OPENROUTER_MODEL`: identificador de um modelo disponível terminado em `:free`.

Esta rota aceita apenas o provedor OpenRouter com modelo `:free` e usa
`CompositeSearchProvider({ freeOnly: true })`, excluindo Brave pago.
Não há fallback para modelos pagos. Consulte o catálogo e as cotas vigentes:
https://openrouter.ai/collections/free-models
https://openrouter.ai/docs/api-reference/limits

Sem chave/modelo configurado, a interface apresenta o motivo. Cotas esgotadas
e fontes indisponíveis são erros explícitos. Links obtidos antes de uma falha
na segunda rodada são preservados na resposta.

## Limites

Os links vêm das respostas dos buscadores, nunca do modelo. A pesquisa usa
títulos e trechos retornados; ela não baixa nem verifica o texto integral das
páginas. Resultados ficam no painel para revisão e não alteram automaticamente
o score, o grafo ou as evidências salvas do dossiê. CPF completo não é enviado
ao modelo. Coincidência nominal não comprova identidade.

Teste: `node --test server/test/news-research.test.js server/test/investigative-leads.test.js`
