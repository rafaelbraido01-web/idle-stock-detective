## Mudanças

### 1. `src/hooks/useAlertasConfig.ts`
Adicionar campo `estoqueMin` em `estoqueParado`:
```ts
estoqueParado: { enabled, diasMin, valorMin, estoqueMin: number }  // default 0
```
Atualizar `DEFAULT_ALERTAS_CONFIG` e o merge no `loadConfig`.

### 2. `src/pages/Configuracoes.tsx`
No card "Estoque parado", adicionar terceiro input "Estoque mínimo ≥" ao lado de "Dias sem compra ≥" e "Valor estoque ≥". Layout passa de `grid-cols-2` para `grid-cols-3`. Persiste via `persistEstoque({ estoqueMin })`.

### 3. `src/pages/Alertas.tsx`

**a) Aplicar filtro de estoque mínimo na regra de alerta** (junto com diasMin e valorMin):
```ts
ps.quantidade >= config.estoqueParado.estoqueMin
```

**b) Adicionar duas opções novas no Select de ordenação:**
- `estoque_desc` → "Maior estoque"
- `estoque_asc` → "Menor estoque"

Ordena por `ps.quantidade`.

**c) Filtro por data da última pesquisa de preço de mercado (Date Picker)**

Adicionar um botão com `CalendarIcon` ao lado dos demais filtros. Ao clicar, abre um `Popover` contendo o componente `Calendar` (shadcn) em modo `single`.

- O usuário escolhe uma **data inicial** (`desdeData`); o filtro mantém apenas alertas cujo `precoMercado.updated_at >= desdeData` e `<= hoje`.
- `disabled={(date) => date > new Date()}` — não permite datas futuras.
- Botão exibe `format(desdeData, 'dd/MM/yyyy')` quando selecionado, ou "Preço pesquisado desde…" quando vazio.
- Ícone `X` no botão para limpar a seleção.
- Quando vazio, não filtra nada (mostra todos, inclusive sem preço).

Implementação:
```tsx
const [desdeData, setDesdeData] = useState<Date | undefined>();
// no filtered:
if (desdeData) {
  arr = arr.filter(a => {
    if (!a.precoMercadoValor) return false;
    // updated_at já está em precosMap[codigo]
    const upd = parseLocalDate(precosMap[a.produto.codigo].updated_at.slice(0,10));
    return upd >= desdeData;
  });
}
```

## Detalhes técnicos
- `estoqueMin` armazenado em localStorage junto com o resto da config.
- Calendar usa `className={cn("p-3 pointer-events-auto")}` para funcionar dentro do Popover.
- Comparação de datas no horário local (meia-noite) via `parseLocalDate`.
