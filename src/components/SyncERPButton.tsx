import { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const { reload } = useInventory();
  const { toast } = useToast();

  const handleConfirm = async () => {
    setDialogOpen(false);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-erp', {
        body: { data_referencia: reportDate.toISOString() },
      });

      if (error) throw new Error(error.message || 'Erro ao sincronizar');
      if (data?.error) throw new Error(data.error);

      await reload();

      toast({
        title: 'Sincronização concluída',
        description: `${data.total_produtos} produtos sincronizados do ERP.\nData de referência: ${format(reportDate, 'dd/MM/yyyy')}`,
        duration: 10000,
      });
    } catch (err: any) {
      toast({
        title: 'Erro na sincronização',
        description: err.message || 'Erro ao conectar com o ERP.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setDialogOpen(false);
  };

  return (
    <>
      <Button
        onClick={() => { setReportDate(new Date()); setDialogOpen(true); }}
        disabled={loading}
        variant="outline"
        className="gap-2 shadow-subtle"
        size="sm"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Sincronizar ERP
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sincronizar com ERP</DialogTitle>
            <DialogDescription>
              Selecione a data de referência para buscar os dados diretamente do banco do ERP.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 py-2">
            <Calendar
              mode="single"
              selected={reportDate}
              onSelect={(date) => date && setReportDate(date)}
              locale={ptBR}
              className={cn("p-3 pointer-events-auto rounded-lg border")}
              disabled={(date) => date > new Date()}
            />
            <p className="text-sm font-medium text-foreground">
              Data selecionada: {format(reportDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
            <Button onClick={handleConfirm}>Sincronizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
