

## Revisão da Plataforma — Problemas Identificados e Melhorias

Após analisar o código e o replay da sessão (onde os dados estavam carregados), identifiquei os seguintes problemas e oportunidades de melhoria:

---

### Problemas Encontrados

**1. Todos os produtos classificados como "Crítico" (365+ dias)**
No replay, o gráfico de distribuição por aging mostra 120 produtos em "Crítico" e 0 em todas as outras categorias. Isso indica que o parser de datas (`parseExcelDate`) provavelmente não está reconhecendo o formato da coluna "última venda" do arquivo Excel, fazendo com que `calcDiasSemVenda` retorne 9999 para todos.

**Causa provável:** A detecção automática de colunas (`findKey`) pode não estar encontrando a coluna de data de última venda, ou o formato da data no Excel não está sendo parseado corretamente (ex: formato `dd.mm.yyyy`, data como texto com separadores inesperados, ou coluna com nome diferente do esperado).

**Correção:**
- Melhorar `findKey` para incluir mais variantes de nomes de colunas (ex: "Dt Ult Venda", "DT.ULT.VENDA", "Ult. Venda", "Data Última Venda")
- Adicionar log/debug mostrando quais colunas foram detectadas durante a importação
- Melhorar `parseExcelDate` para suportar mais formatos (dd.mm.yyyy, dd-mm-yyyy, timestamps)
- Mostrar um resumo pós-importação com as colunas detectadas para o usuário validar

**2. Warning no console: KPICard não suporta refs**
O `motion.div` dentro de `KPICard` usa `framer-motion` que tenta passar uma ref, mas `KPICard` é um function component sem `forwardRef`.

**Correção:** Não é necessário forwardRef aqui — o warning vem do Dashboard tentando passar ref. Verificar se há algum wrapper passando ref indevidamente.

**3. Tabela de produtos sem paginação**
Com ~3500 produtos, renderizar todos de uma vez pode causar lentidão. Não há paginação nem virtualização.

**Correção:** Adicionar paginação simples (50 itens por página) na tabela de produtos.

---

### Melhorias Propostas

**4. Feedback visual na importação**
Após importar, mostrar um resumo com:
- Colunas detectadas automaticamente
- Quantos produtos foram importados vs ignorados
- Distribuição por categoria de aging
- Alertar se alguma coluna importante não foi encontrada

**5. Valor de "dias sem venda" quando não há data**
Atualmente usa 9999 como placeholder. Na tabela mostra "—" mas no cálculo conta como 365+. Melhorar a exibição e tratar como "Sem registro de venda" separadamente.

**6. Filtro por subgrupo e marca na tela de Produtos**
A especificação original pede filtros por subgrupo e marca, mas só há filtro por grupo.

---

### Plano de Implementação

1. **Corrigir parser de importação** — Ampliar a lista de nomes de colunas reconhecidos, melhorar o parsing de datas, adicionar suporte a mais formatos, e exibir toast com resumo das colunas detectadas após importação
2. **Adicionar paginação na tabela de produtos** — 50 itens por página com controles de navegação
3. **Corrigir warning do KPICard** — Ajustar componente com `forwardRef`
4. **Adicionar filtros de subgrupo e marca** — Na tela de produtos, conforme especificação
5. **Melhorar tratamento de "sem data de venda"** — Separar "sem registro" de "crítico" na classificação

