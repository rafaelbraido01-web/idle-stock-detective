import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Produto, EstoqueSnapshot, EstoqueProdutoSnapshot } from '@/types/inventory';
import { supabase } from '@/integrations/supabase/client';

async function fetchAllRows(table: 'produtos' | 'estoque_snapshots' | 'estoque_produto_snapshots', orderBy?: { column: string; ascending: boolean }): Promise<any[]> {
  const PAGE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    let query = supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending });
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    allData = allData.concat(rows);
    hasMore = rows.length === PAGE;
    from += PAGE;
  }
  return allData;
}

interface InventoryState {
  produtos: Produto[];
  snapshots: EstoqueSnapshot[];
  produtoSnapshots: EstoqueProdutoSnapshot[];
  loading: boolean;
}

interface InventoryContextType extends InventoryState {
  addImport: (snapshot: EstoqueSnapshot, produtos: Produto[], produtoSnapshots: EstoqueProdutoSnapshot[]) => Promise<void>;
  clearData: () => Promise<void>;
  getLatestSnapshot: () => EstoqueSnapshot | null;
  getLatestProdutoSnapshots: () => EstoqueProdutoSnapshot[];
  getProdutoHistory: (produtoId: string) => Array<EstoqueProdutoSnapshot & { data_importacao: string }>;
  reload: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | null>(null);

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InventoryState>({
    produtos: [],
    snapshots: [],
    produtoSnapshots: [],
    loading: true,
  });

  const loadAll = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    try {
      const [prodData, snapData, psData] = await Promise.all([
        fetchAllRows('produtos'),
        fetchAllRows('estoque_snapshots', { column: 'data_importacao', ascending: true }),
        fetchAllRows('estoque_produto_snapshots'),
      ]);

      const produtos: Produto[] = (prodData).map((p: any) => ({
        id: p.id,
        codigo: p.codigo,
        descricao: p.descricao,
        grupo: p.grupo,
        subgrupo: p.subgrupo,
        marca: p.marca,
        data_criacao: p.data_criacao,
      }));

      const snapshots: EstoqueSnapshot[] = (snapData).map((s: any) => ({
        id: s.id,
        data_importacao: s.data_importacao,
        nome_arquivo: s.nome_arquivo,
        usuario: s.usuario,
        data_criacao: s.data_criacao,
        total_produtos: s.total_produtos,
        valor_total: Number(s.valor_total),
      }));

      const produtoSnapshots: EstoqueProdutoSnapshot[] = (psRes.data || []).map((ps: any) => ({
        id: ps.id,
        snapshot_id: ps.snapshot_id,
        produto_id: ps.produto_id,
        quantidade: Number(ps.quantidade),
        valor_unitario: Number(ps.valor_unitario),
        valor_total: Number(ps.valor_total),
        data_ultima_venda: ps.data_ultima_venda,
        data_ultima_compra: ps.data_ultima_compra,
        dias_sem_venda: ps.dias_sem_venda,
        dias_sem_compra: ps.dias_sem_compra,
        categoria_estoque: ps.categoria_estoque,
        nome_comissao: ps.nome_comissao,
        comissao: Number(ps.comissao),
        preco_tabela: Number(ps.preco_tabela),
        valor_promocao: ps.valor_promocao != null ? Number(ps.valor_promocao) : null,
        percentual_desconto: ps.percentual_desconto != null ? Number(ps.percentual_desconto) : null,
        data_fim_promocao: ps.data_fim_promocao,
        valor_venda_total: Number(ps.valor_venda_total),
      }));

      setState({ produtos, snapshots, produtoSnapshots, loading: false });
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const addImport = useCallback(async (
    snapshot: EstoqueSnapshot,
    newProdutos: Produto[],
    newProdutoSnapshots: EstoqueProdutoSnapshot[]
  ) => {
    // 1. Upsert produtos (by codigo)
    if (newProdutos.length > 0) {
      const produtoRows = newProdutos.map(p => ({
        id: p.id,
        codigo: p.codigo,
        descricao: p.descricao,
        grupo: p.grupo,
        subgrupo: p.subgrupo,
        marca: p.marca,
        data_criacao: p.data_criacao,
      }));

      // Insert in batches of 500
      for (let i = 0; i < produtoRows.length; i += 500) {
        const batch = produtoRows.slice(i, i + 500);
        const { error } = await supabase
          .from('produtos')
          .upsert(batch, { onConflict: 'codigo' });
        if (error) {
          console.error('Erro ao inserir produtos:', error);
          throw error;
        }
      }
    }

    // Fetch all produtos to get correct IDs (upsert may have kept existing IDs)
    const { data: allProdutos } = await supabase.from('produtos').select('id, codigo');
    const codigoToId = new Map((allProdutos || []).map((p: any) => [p.codigo, p.id]));

    // 2. Insert snapshot
    const { error: snapError } = await supabase
      .from('estoque_snapshots')
      .insert({
        id: snapshot.id,
        data_importacao: snapshot.data_importacao,
        nome_arquivo: snapshot.nome_arquivo,
        usuario: snapshot.usuario,
        data_criacao: snapshot.data_criacao,
        total_produtos: snapshot.total_produtos,
        valor_total: snapshot.valor_total,
      });
    if (snapError) {
      console.error('Erro ao inserir snapshot:', snapError);
      throw snapError;
    }

    // 3. Insert produto snapshots with correct produto IDs
    if (newProdutoSnapshots.length > 0) {
      // Build a map from old produto_id to codigo
      const oldIdToCodigo = new Map(newProdutos.map(p => [p.id, p.codigo]));
      // Also include existing produtos from context state
      state.produtos.forEach(p => oldIdToCodigo.set(p.id, p.codigo));

      const psRows = newProdutoSnapshots.map(ps => {
        const codigo = oldIdToCodigo.get(ps.produto_id);
        const dbProdutoId = codigo ? codigoToId.get(codigo) : ps.produto_id;
        return {
          id: ps.id,
          snapshot_id: ps.snapshot_id,
          produto_id: dbProdutoId || ps.produto_id,
          quantidade: ps.quantidade,
          valor_unitario: ps.valor_unitario,
          valor_total: ps.valor_total,
          data_ultima_venda: ps.data_ultima_venda,
          data_ultima_compra: ps.data_ultima_compra,
          dias_sem_venda: ps.dias_sem_venda,
          dias_sem_compra: ps.dias_sem_compra,
          categoria_estoque: ps.categoria_estoque,
          nome_comissao: ps.nome_comissao,
          comissao: ps.comissao,
          preco_tabela: ps.preco_tabela,
          valor_promocao: ps.valor_promocao,
          percentual_desconto: ps.percentual_desconto,
          data_fim_promocao: ps.data_fim_promocao,
          valor_venda_total: ps.valor_venda_total,
        };
      });

      for (let i = 0; i < psRows.length; i += 500) {
        const batch = psRows.slice(i, i + 500);
        const { error } = await supabase
          .from('estoque_produto_snapshots')
          .insert(batch);
        if (error) {
          console.error('Erro ao inserir produto snapshots:', error);
          throw error;
        }
      }
    }

    // Reload all data from DB
    await loadAll();
  }, [loadAll, state.produtos]);

  const clearData = useCallback(async () => {
    // Delete in order: produto_snapshots → snapshots → produtos
    await supabase.from('estoque_produto_snapshots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('estoque_snapshots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('produtos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    // Also clear precos_mercado
    await supabase.from('precos_mercado').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Clear old localStorage data
    localStorage.removeItem('inventory_data');

    setState({ produtos: [], snapshots: [], produtoSnapshots: [], loading: false });
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
    <InventoryContext.Provider value={{
      ...state,
      addImport,
      clearData,
      getLatestSnapshot,
      getLatestProdutoSnapshots,
      getProdutoHistory,
      reload: loadAll,
    }}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}
