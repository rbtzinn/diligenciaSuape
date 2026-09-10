# Pesquisa ampliada com IA

Em Notícias e links, selecione a empresa/pessoa e use **Pesquisar com IA**.
A IA cria até quatro consultas ancoradas nos nomes fornecidos. Buscadores de
notícias executam as consultas em lotes de duas. Uma segunda rodada pode usar
os títulos e trechos recebidos para propor mais consultas: até oito por clique.

## Configuração do backend

```env
OPENROUTER_API_KEY=sua-chave-apenas-no-backend
OPENROUTER_MODEL=openrouter/free
```

O modelo é opcional; `openrouter/free` é o padrão. Variantes `fornecedor/modelo:free`
também são aceitas. Não inclua chaves no frontend, no repositório nem em prints.
Depois de atualizar variáveis, publique o backend. Mudanças do painel precisam
também do deploy do frontend da mesma versão.

O planejador usa só OpenRouter gratuito. A integração bloqueia IDs pagos e
variantes de busca online, exige suporte aos parâmetros e envia limites de
preço zero para entrada, saída e requisição. Não ativa plugins pagos nem muda
preferências de privacidade da conta. A busca exclui Brave e usa Google News
RSS, GDELT e SearXNG quando já configurado.

## Etapas e recuperação

- `POST /api/ai/news-research/plan`: planejamento e validação, orçamento total
  de 42 segundos, no máximo duas tentativas. Cada consulta precisa estar
  ligada a um identificador fornecido, mesmo se vier de JSON válido.
- `POST /api/ai/news-research/search`: executa até quatro consultas, sem chamar
  o modelo. Revalida no servidor as consultas recebidas do cliente.
- Ambas exigem autenticação Firebase. A rota antiga `/news-research` permanece
  para compatibilidade; o painel usa as etapas independentes.
- Resultados são exibidos a cada lote. **Continuar pesquisa** retenta apenas
  consultas pendentes, sem gerar outro plano. **Aprofundar pesquisa** pede novas
  consultas, enviando histórico limitado de títulos, trechos e consultas.
- O progresso fica em memória enquanto o painel permanece aberto. Recarregar
  a página ou mudar a empresa/pessoa reinicia a sessão. **Pausar pesquisa**
  cancela o trabalho em andamento; os lotes já recebidos permanecem visíveis.

HTTP 200 com `error` no corpo é tratado como falha. Erros transitórios, resposta
vazia, truncamento e plano inválido permitem uma única nova tentativa gratuita,
dentro do mesmo orçamento de tempo. 401/402/403/429 não são repetidos; um
`Retry-After` interrompe tentativas antecipadas. O frontend pausa o botão e não
repete chamadas automaticamente ao terminar o intervalo. Liberar o botão não
significa que a cota já voltou. Os limites locais da aplicação também se aplicam.

JSON Schema é usado quando disponível. Se o roteamento de schema não tiver
endpoint, uma segunda tentativa pode usar JSON simples com validação local.
Um timeout inclui conexão e leitura do corpo. Uma fonte travada não elimina
respostas de outras fontes. Erros por fonte aparecem no painel, e ausência de
notícias não é confundida com consulta indisponível.

## Precisão e disponibilidade

Nenhum modelo garante acerto nem cobertura de toda a internet, mesmo havendo
cota. Links são fornecidos pelos buscadores, nunca pela resposta da IA. A busca
usa títulos e trechos; não lê o texto integral nem confirma a identidade de
homônimos. Resultados exigem revisão e não alteram automaticamente score, grafo
ou evidências salvas. CPF completo não é enviado ao modelo.

Referências oficiais (consultadas em 10/09/2026):
- https://openrouter.ai/openrouter/free
- https://openrouter.ai/docs/guides/features/structured-outputs
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/api_reference/errors-and-debugging

## Verificação

`npm --prefix server run test:ai` cobre erros de API, orçamento de tempo,
travas de custo, validação e fontes parciais. Os testes simulam os provedores;
não consomem cota. `npm run test:web` cobre preservação do progresso e cliente
HTTP. Uma validação real exige sessão autenticada e a chave configurada na Vercel.
