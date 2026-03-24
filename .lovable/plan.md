

## Plano: Botao de Campanha em Lote + Preparacao para Analise Futura

### Resumo
Adicionar um botao no topo da pagina de Promocoes para cadastrar uma campanha vinculando multiplos produtos de uma vez, inserindo os codigos em um campo de texto livre. Alem disso, ajustar a estrutura para viabilizar analises futuras de frequencia promocional por produto.

### 1. Botao "Subir Campanha" no topo da pagina
- Botao visivel no header da pagina de Promocoes (ao lado dos filtros ou KPIs)
- Ao clicar, abre um Dialog com:
  - **Nome da campanha** (texto)
  - **Canais** (checkboxes multiplos: Marketplace, Ecommerce, Mailing, Televendas)
  - **Data inicio** e **Data fim** (date pickers)
  - **Codigos dos produtos** (textarea grande, aceita codigos separados por virgula, ponto-e-virgula ou quebra de linha)
- Ao salvar: busca os `produto_id` correspondentes na tabela `produtos` pelo campo `codigo`, e insere um registro na tabela `campanhas_produto` para cada produto encontrado
- Exibe toast com quantidade de produtos vinculados e quantos codigos nao foram encontrados

### 2. Sobre a analise futura (Duvida 1)
**Sim, ja e possivel.** A tabela `campanhas_produto` ja registra cada vinculo produto-campanha com datas. Futuramente, basta criar uma consulta agrupando por `produto_id` e contando quantas campanhas cada produto participou, com filtros por periodo e canal. Nenhuma mudanca de schema e necessaria agora -- a estrutura atual ja suporta esse tipo de analise.

### Alteracoes

| Arquivo | Mudanca |
|---|---|
| `src/pages/Promocoes.tsx` | Adicionar botao "Subir Campanha", dialog com formulario em lote, logica de lookup de codigos e insercao em batch |

Nenhuma migracao de banco necessaria -- a tabela `campanhas_produto` ja suporta multiplos registros por produto.

