

## Plano: Adicionar campos Obs, Link e "Outro local" no popup de Preço de Mercado

### O que muda

**1. Banco de dados** — Adicionar 3 colunas na tabela `precos_mercado`:
- `observacao` (text, nullable)
- `link` (text, nullable)
- `fonte_outro` (text, nullable) — para guardar o nome quando a fonte é "Outro"

**2. Frontend (src/pages/Promocoes.tsx)**

- Adicionar 3 novos estados: `mercadoObs`, `mercadoLink`, `mercadoFonteOutro`
- No `handleOpenMercado`: carregar valores existentes (se houver) para os novos campos
- No dialog, após o campo de preço:
  - Campo **Link** (Input, tipo url, placeholder "https://...")
  - Campo **Obs** (Textarea, placeholder "Observação...")
  - Quando fonte = "Outro": campo **Local** (Input, placeholder "Nome do local")
- No `handleSaveMercado`: incluir `observacao`, `link` e `fonte_outro` no insert
- No bloco de "Preço de mercado atual": exibir obs, link e fonte_outro quando preenchidos

### Detalhes técnicos

- Migration SQL: `ALTER TABLE precos_mercado ADD COLUMN observacao text, ADD COLUMN link text, ADD COLUMN fonte_outro text;`
- O campo "Local" só aparece condicionalmente quando `mercadoFonte === 'Outro'`
- Interface `PrecoMercado` atualizada com os 3 novos campos opcionais

