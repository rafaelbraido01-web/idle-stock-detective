

## Plano: Conexão Direta ao Banco do ERP

### Análise do Script

O script que você compartilhou é um **Qlik Sense/QlikView** load script que conecta via ODBC a um banco **MySQL** com 3 schemas:
- `mesquita_publico` — cadastro de produtos, grupos, marcas, tabelas de preço, comissões
- `mesquita_estoque` — estoque por setor
- `mesquita_vendas` — orçamentos/vendas, comissões

### Mapeamento: Campos do ERP → Campos da Plataforma

| Plataforma | Origem no ERP |
|---|---|
| `codigo` | `cad_prod.codigo` |
| `descricao` | `cad_prod.descricao` |
| `grupo` | `cad_pgru.nome` |
| `subgrupo` | `subgrupos.descricao` |
| `marca` | `cad_pmar.descricao` (via `cad_prod.marca`) |
| `quantidade` | `prod_setor.estoque` (soma por produto) |
| `valor_unitario` / `custo_medio` | `prod_custos.custo_medio` |
| `valor_total` | quantidade × custo_medio |
| `preco_tabela` | `prod_tabprecos.preco` |
| `valor_promocao` | `prod_tabprecos.promocao` |
| `data_fim_promocao` | `prod_tabprecos.valid_prom` |
| `data_ultima_compra` | `prod_custos.ult_compra` |
| `data_ultima_venda` | Calculado via `cad_orca` (última venda baixada por produto) |
| `comissao` / `nome_comissao` | `regras_comis` + `itens_regra_comis` |

### Arquitetura proposta

```text
┌──────────────┐      ┌─────────────────────┐      ┌──────────────┐
│  Frontend    │ ───► │  Edge Function      │ ───► │  MySQL ERP   │
│  (Botão      │      │  sync-erp           │      │  (read-only) │
│  Sincronizar)│      │  - conecta ao MySQL │      └──────────────┘
│              │ ◄─── │  - monta snapshot   │
│              │      │  - insere no Supabase│
└──────────────┘      └─────────────────────┘
```

### O que será feito

**1. Edge Function `sync-erp`**
- Recebe do frontend: `data_referencia` (data do snapshot)
- Conecta ao MySQL do ERP usando credenciais armazenadas como secrets
- Executa as queries necessárias (adaptadas do script Qlik):
  - Produtos + grupo + subgrupo + marca
  - Estoque por setor (soma por produto)
  - Custos (custo_medio, ult_compra)
  - Tabela de preços + promoções
  - Última venda (via cad_orca/pro_orca)
  - Comissões (regras_comis + itens_regra_comis)
- Monta os objetos `Produto`, `EstoqueSnapshot`, `EstoqueProdutoSnapshot`
- Insere tudo no banco da plataforma (upsert produtos, insert snapshot + produto_snapshots)
- Usa driver MySQL compatível com Deno (`npm:mysql2`)

**2. Secrets necessárias (4 novas)**
- `ERP_DB_HOST` — host do MySQL
- `ERP_DB_PORT` — porta (padrão 3306)
- `ERP_DB_USER` — usuário read-only
- `ERP_DB_PASSWORD` — senha
- `ERP_DB_NAME` — nome do database (provavelmente `mesquita_publico` ou similar)

**3. Frontend — Nova opção na página de Importações**
- Botão "Sincronizar com ERP" ao lado do "Importar Relatório ERP"
- Abre dialog para selecionar a data de referência (mesmo padrão atual)
- Chama a Edge Function e cria o snapshot automaticamente
- Importação manual continua funcionando como fallback

**4. SQL consolidado (query principal)**
Uma única query principal que junta:
```sql
SELECT
  p.codigo, p.descricao,
  g.nome AS grupo,
  sg.descricao AS subgrupo,
  pm.descricao AS marca,
  SUM(ps.estoque) AS quantidade,
  pc.custo_medio AS valor_unitario,
  SUM(ps.estoque) * pc.custo_medio AS valor_total,
  pc.ult_compra AS data_ultima_compra,
  tp.preco AS preco_tabela,
  tp.promocao AS valor_promocao,
  tp.valid_prom AS data_fim_promocao
FROM mesquita_publico.cad_prod p
  JOIN mesquita_publico.cad_pgru g ON p.grupo = g.codigo
  JOIN mesquita_publico.subgrupos sg ON p.subgrupo = sg.codigo AND p.grupo = sg.cod_grupo
  LEFT JOIN mesquita_publico.cad_pmar pm ON p.marca = pm.codigo
  LEFT JOIN mesquita_estoque.prod_setor ps ON ps.produto = p.codigo AND ps.estoque > 0
  LEFT JOIN mesquita_publico.prod_custos pc ON pc.produto = p.codigo
  LEFT JOIN mesquita_publico.prod_tabprecos tp ON tp.produto = p.codigo
WHERE p.tipo IN ('1','7','8') AND p.ativo = 's'
GROUP BY p.codigo
```
Plus queries separadas para última venda e comissões.

### Pré-requisitos / Perguntas pendentes

1. **O banco MySQL está acessível pela internet?** Se estiver atrás de firewall/VPN, precisaremos de alternativa (túnel SSH, IP liberado, etc.)
2. **Qual filial/tabela de preço usar?** O script Qlik cruza com `filial_setor` e há múltiplas tabelas de preço (`prod_tabprecos.tabela`). Qual é a tabela de preço padrão?
3. **Setores de estoque**: O script filtra setores específicos (`in (1,415,3,77,...)`). Devemos manter os mesmos filtros?
4. **Credenciais**: Você tem ou pode criar um usuário MySQL read-only para essa conexão?

### O que NÃO muda
- Estrutura das tabelas da plataforma (produtos, snapshots, etc.)
- Importação manual via Excel (continua como fallback)
- Toda a lógica de visualização, Dashboard, Campanhas, etc.

