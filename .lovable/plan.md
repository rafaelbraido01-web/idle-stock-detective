

## Plano: Substituir edge function sync-erp por chamada ao webhook n8n

### Contexto
Atualmente o botão "Sincronizar ERP" chama a edge function `sync-erp` que conecta direto ao MySQL do ERP. O objetivo é substituir essa chamada por um POST ao webhook do n8n, que retornará os dados para popular o banco.

### O que será feito

**1. Atualizar `src/components/SyncERPButton.tsx`**
- Remover a chamada `supabase.functions.invoke('sync-erp', ...)`.
- Substituir por um `fetch` POST direto ao webhook n8n:
  - URL de produção: `https://n8n.syma.com.br/webhook/Solicitação_data_Lovable_estoque`
  - Body: `{ "data_sync": new Date().toISOString() }` (data atual, não a do calendário)
  - Header: `Content-Type: application/json`
- Processar a resposta do n8n e, se retornar dados de produtos/estoque, inserir no banco via Supabase client (upsert produtos + criar snapshot + inserir produto_snapshots), reaproveitando a lógica que hoje está na edge function.
- Manter os estados de loading e os toasts de sucesso/erro.
- Remover o calendário de seleção de data (já que agora envia `new Date()`) ou mantê-lo — depende se o n8n precisa de data específica.

**2. Decisão sobre o calendário**
- Como o requisito diz "data atual", o dialog com calendário pode ser simplificado para uma confirmação simples, sem seleção de data. O botão abrirá um dialog de confirmação e enviará a data corrente.

**3. Processar resposta do n8n**
- A resposta do webhook será recebida e os dados serão inseridos no banco Supabase usando o client existente (tabelas `produtos`, `estoque_snapshots`, `estoque_produto_snapshots`).
- Após inserção, chamar `reload()` para atualizar a interface.

**4. Remover a edge function `sync-erp`**
- Deletar o arquivo `supabase/functions/sync-erp/index.ts`.
- Usar a ferramenta de delete para remover a função deployada.

### Observação importante
Preciso entender o formato da resposta do n8n para mapear corretamente os dados. Se o webhook retornar os dados no mesmo formato que a edge function produzia (produtos com estoque, preços, datas), a migração será direta. Caso contrário, será necessário adaptar o mapeamento.

### Arquivos afetados
- `src/components/SyncERPButton.tsx` — reescrever lógica de sync
- `supabase/functions/sync-erp/index.ts` — deletar

