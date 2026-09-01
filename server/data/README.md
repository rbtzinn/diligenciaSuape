# Base funcional interna

Esta pasta guarda a base funcional em formato minimizado, gerada a partir da
folha institucional. Aponte `INTERNAL_SUAPE_DATASET_PATH` para ela:

```bash
INTERNAL_SUAPE_DATASET_PATH=data/base-funcional.csv
```

Para gerar ou atualizar o arquivo em uma nova competência:

```bash
node scripts/build-functional-dataset.js /caminho/folha-agosto-2026.xlsx data/base-funcional.csv
```

O CSV contém apenas nome, chapa, CPF mascarado, tipo de vínculo, competência e
aba de origem. Salário, evento de folha, provento, desconto e totais não são
gravados, então a remuneração nunca entra no repositório.

O `.gitignore` da raiz versiona o CSV desta pasta e continua ignorando qualquer
planilha `.xlsx`, para que a folha original não seja commitada por descuido.

O arquivo ainda contém nome e CPF mascarado de pessoas identificáveis. Versione
apenas em repositório privado e com autorização da área responsável.

Em ambiente serverless o arquivo precisa ser implantado junto do código. O
`vercel.json` do backend declara `includeFiles: "data/**"` porque a leitura
acontece por caminho vindo de variável de ambiente, que o rastreamento de
dependências da Vercel não detecta sozinho.
