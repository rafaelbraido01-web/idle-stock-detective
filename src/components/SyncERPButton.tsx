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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function SyncERPButton() {
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    setDialogOpen(false);
    setLoading(true);

    try {
      // Fire-and-forget: envia a data para o n8n, não espera resposta com dados
      await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_sync: new Date().toISOString() }),
      });

      toast({
        title: 'Solicitação enviada',
        description: 'A data foi enviada ao ERP. Os dados serão importados automaticamente quando o n8n concluir o processamento.',
        duration: 8000,
      });
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar solicitação',
        description: err.message || 'Não foi possível contactar o webhook.',
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
        {loading ? 'Enviando...' : 'Sincronizar ERP'}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sincronizar com ERP</DialogTitle>
            <DialogDescription>
              Deseja solicitar a sincronização dos dados do ERP? A data atual será enviada como referência e os dados serão importados automaticamente.
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
