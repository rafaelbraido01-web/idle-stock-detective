

## Plano: Campanhas como historico (inserir nova em vez de atualizar)

### Problema atual
Quando o usuario salva uma campanha para um produto que ja tem campanha, o sistema faz `update` no registro existente, apagando o historico anterior.

### Solucao
Mudar a logica de `handleSaveCampanha` para **sempre inserir** um novo registro em vez de atualizar o existente. O mapa local `campanhas` continua rastreando apenas a campanha **mais recente** (para colorir o botao), mas o historico completo fica preservado no banco.

O `ProductDrawer` ja busca todas as campanhas do produto ordenadas por `data_fim desc`, entao o historico ja aparece automaticamente.

### Alteracoes

| Arquivo | Mudanca |
|---|---|
| `src/pages/Promocoes.tsx` | Em `handleSaveCampanha`, remover o bloco `if (existing) { update }` e sempre fazer `insert`. Atualizar o mapa local com o novo registro retornado. |

Nenhuma migracao de banco necessaria.

