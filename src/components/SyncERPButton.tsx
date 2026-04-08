import { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInventory } from '@/store/InventoryContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function SyncERPButton() {
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { reload } = useInventory();
  const { toast } = useToast();

  const handleConfirm = async () => {
    setDialogOpen(false);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('sync-erp-webhook', {
        body: { data_sync: new Date().toISOString() },
      });

      if (error) throw new Error(error.message || 'Erro ao chamar função');
      if (data?.error) throw new Error(data.error);

      await reload();

      toast({
        title: 'Sincronização concluída',
        description: `${data?.total_produtos ?? 0} produtos importados.`,
        duration: 10000,
      });
    } catch (err: any) {
      toast({
        title: 'Erro na sincronização',
        description: err.message || 'Erro ao processar importação.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        disabled={loading}
        variant="outline"
        className="gap-2 shadow-subtle"
        size="sm"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {loading ? 'Sincronizando...' : 'Sincronizar ERP'}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sincronizar com ERP</DialogTitle>
            <DialogDescription>
              Deseja iniciar a sincronização dos dados do ERP? A data atual será enviada como referência.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirm}>Sincronizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
