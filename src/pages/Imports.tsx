import { motion } from 'framer-motion';
import { FileSpreadsheet, Trash2 } from 'lucide-react';
import { useInventory } from '@/store/InventoryContext';
import { formatCurrency, formatNumber } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function Imports() {
  const { snapshots, deleteSnapshot } = useInventory();
  const sorted = [...snapshots].reverse();

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Excluir a importação "${name}"? Os dados de estoque vinculados também serão removidos.`)) return;
    try {
      await deleteSnapshot(id);
      toast.success('Importação excluída com sucesso');
    } catch {
      toast.error('Erro ao excluir importação');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground tracking-tight">Importações</h1>

      {sorted.length === 0 ? (
        <div className="bg-card rounded-xl shadow-card p-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma importação realizada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((snap, i) => (
            <motion.div
              key={snap.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, ease: [0.2, 0, 0, 1] }}
              className="bg-card rounded-xl shadow-card p-4 flex items-center gap-4"
            >
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{snap.nome_arquivo}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(snap.data_importacao).toLocaleString('pt-BR')} · {snap.usuario}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono font-medium text-foreground">{formatNumber(snap.total_produtos)} produtos</p>
                <p className="text-xs font-mono text-muted-foreground">{formatCurrency(snap.valor_total)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => handleDelete(snap.id, snap.nome_arquivo)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
