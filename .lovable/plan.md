

## Plan: Remove "Limpar Dados" button

**File: `src/components/Layout.tsx`**
- Remove the `Trash2` icon import
- Remove the `clearData` and `snapshots` destructuring from `useInventory()`
- Remove the `handleClear` function
- Remove the "Limpar Dados" `Button` from the header
- If `useInventory` is no longer needed, remove that import too

Single file, minimal change.

