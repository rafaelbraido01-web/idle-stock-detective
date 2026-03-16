import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Produto, EstoqueSnapshot, EstoqueProdutoSnapshot } from '@/types/inventory';

interface InventoryState {
  produtos: Produto[];
  snapshots: EstoqueSnapshot[];
  produtoSnapshots: EstoqueProdutoSnapshot[];
}

interface InventoryContextType extends InventoryState {
  addImport: (snapshot: EstoqueSnapshot, produtos: Produto[], produtoSnapshots: EstoqueProdutoSnapshot[]) => void;
  getLatestSnapshot: () => EstoqueSnapshot | null;
  getLatestProdutoSnapshots: () => EstoqueProdutoSnapshot[];
  getProdutoHistory: (produtoId: string) => Array<EstoqueProdutoSnapshot & { data_importacao: string }>;
}

const InventoryContext = createContext<InventoryContextType | null>(null);

const STORAGE_KEY = 'inventory_data';

function loadFromStorage(): InventoryState {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch {}
  return { produtos: [], snapshots: [], produtoSnapshots: [] };
}

function saveToStorage(state: InventoryState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InventoryState>(loadFromStorage);

  useEffect(() => { saveToStorage(state); }, [state]);

  const addImport = useCallback((snapshot: EstoqueSnapshot, newProdutos: Produto[], newProdutoSnapshots: EstoqueProdutoSnapshot[]) => {
    setState(prev => {
      const existingCodigos = new Set(prev.produtos.map(p => p.codigo));
      const uniqueNewProdutos = newProdutos.filter(p => !existingCodigos.has(p.codigo));
      
      // Merge produtos - update existing, add new
      const mergedProdutos = prev.produtos.map(existing => {
        const updated = newProdutos.find(p => p.codigo === existing.codigo);
        return updated ? { ...existing, ...updated, id: existing.id } : existing;
      });

      return {
        produtos: [...mergedProdutos, ...uniqueNewProdutos],
        snapshots: [...prev.snapshots, snapshot],
        produtoSnapshots: [...prev.produtoSnapshots, ...newProdutoSnapshots],
      };
    });
  }, []);

  const getLatestSnapshot = useCallback(() => {
    if (state.snapshots.length === 0) return null;
    return state.snapshots[state.snapshots.length - 1];
  }, [state.snapshots]);

  const getLatestProdutoSnapshots = useCallback(() => {
    const latest = getLatestSnapshot();
    if (!latest) return [];
    return state.produtoSnapshots.filter(ps => ps.snapshot_id === latest.id);
  }, [state.produtoSnapshots, getLatestSnapshot]);

  const getProdutoHistory = useCallback((produtoId: string) => {
    return state.produtoSnapshots
      .filter(ps => ps.produto_id === produtoId)
      .map(ps => {
        const snap = state.snapshots.find(s => s.id === ps.snapshot_id);
        return { ...ps, data_importacao: snap?.data_importacao || '' };
      })
      .sort((a, b) => new Date(a.data_importacao).getTime() - new Date(b.data_importacao).getTime());
  }, [state.produtoSnapshots, state.snapshots]);

  return (
    <InventoryContext.Provider value={{ ...state, addImport, getLatestSnapshot, getLatestProdutoSnapshots, getProdutoHistory }}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}
