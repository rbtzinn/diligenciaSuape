# Base funcional interna

Coloque aqui a planilha autorizada de identidades funcionais e aponte
`INTERNAL_SUAPE_DATASET_PATH` para ela, com caminho relativo a `server/`:

```bash
INTERNAL_SUAPE_DATASET_PATH=data/folha-julho-2026.xlsx
```

O `.gitignore` da raiz ignora `*.xlsx` em todo o projeto e abre exceção apenas
para esta pasta, de modo que nenhuma planilha seja versionada por descuido.

O arquivo colocado aqui contém nome e CPF mascarado de pessoas identificáveis.
Versione somente com autorização da área responsável, e apenas em repositório
privado. Remuneração não é lida pela aplicação, mas a planilha original a
contém: o commit expõe o arquivo inteiro, não apenas o que a aplicação usa.

Em ambiente serverless o arquivo precisa ser implantado junto do código. O
`vercel.json` deste diretório-pai declara `includeFiles: "data/**"` porque a
leitura acontece por caminho vindo de variável de ambiente, que o rastreamento
de dependências da Vercel não consegue detectar sozinho.
