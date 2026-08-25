# Registro da migração Neon → Google Sheets

Migração executada em 25/08/2026, antes da remoção local do Prisma/PostgreSQL.

- Planilha: `Diligência 360 — Histórico`
- Spreadsheet ID: `1J9FwZv1lDDrRWDP-gWkpRj2rNimwh0gMlHitYCD4bSc`
- Diligências copiadas: 4
- Blocos de payload copiados: 7
- Eventos de auditoria copiados: 72
- Relatórios copiados: 6
- Neon alterado ou excluído: não; leitura apenas

Validação feita após a importação:

- `Diligencias!A1:U5`: 1 cabeçalho + 4 registros
- `Payloads!A1:H8`: 1 cabeçalho + 7 blocos
- `Auditoria!A1:M73`: 1 cabeçalho + 72 eventos
- `Relatorios!A1:L7`: 1 cabeçalho + 6 relatórios

Cada payload foi compactado com gzip, codificado em Base64, dividido em células de até 45.000 caracteres e associado ao hash SHA-256 do JSON original. O índice guarda a versão ativa e o intervalo exato das partes. Exclusões novas são lógicas: o payload e a auditoria permanecem na planilha.

Importante: qualquer diligência criada no backend antigo após esta data precisa ser migrada antes do primeiro deploy da versão nova. Por isso, faça uma janela curta sem novas gravações durante o corte para produção.
