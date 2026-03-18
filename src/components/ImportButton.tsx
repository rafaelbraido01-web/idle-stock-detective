import { useRef, useState } from 'react';
import { Upload, Loader2, CalendarIcon } from 'lucide-react';
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
import { processExcelFile } from '@/lib/importExcel';
import { useToast } from '@/hooks/use-toast';

export function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const { addImport, produtos } = useInventory();
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setReportDate(new Date());
    setDialogOpen(true);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleConfirm = async () => {
    if (!pendingFile) return;
    setDialogOpen(false);
    setLoading(true);
    try {
      const result = await processExcelFile(pendingFile, produtos, reportDate);
      addImport(result.snapshot, result.produtos, result.produtoSnapshots);

      const colSummary = Object.entries(result.detectedColumns)
        .map(([label, col]) => `${label}: ${col}`)
        .join('\n');

      const warningText = result.warnings.length > 0
        ? `\n\n⚠️ ${result.warnings.join('; ')}`
        : '';

      const d = result.diagnostics;
      const diagText = `📊 Linhas no arquivo: ${d.totalLinhasArquivo}\n❌ Sem código: ${d.linhasSemCodigo}\n🚫 Valor estoque zero: ${d.linhasValorZero}\n✅ Processadas: ${d.linhasProcessadas}`;

      toast({
        title: 'Importação concluída',
        description: `${result.produtoSnapshots.length} produtos processados.\nData de referência: ${format(reportDate, 'dd/MM/yyyy')}\n\n${diagText}\n\nColunas detectadas:\n${colSummary}${warningText}`,
        duration: 15000,
      });
    } catch (err: any) {
      toast({
        title: 'Erro na importação',
        description: err.message || 'Erro ao processar arquivo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setPendingFile(null);
    }
  };

  const handleCancel = () => {
    setDialogOpen(false);
    setPendingFile(null);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="gap-2 shadow-subtle"
        size="sm"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Importar Relatório ERP
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Data do Relatório</DialogTitle>
            <DialogDescription>
              Selecione a data de referência deste relatório (quando os dados foram extraídos do ERP).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Arquivo: <span className="font-medium text-foreground">{pendingFile?.name}</span>
            </p>
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
            <Button onClick={handleConfirm}>Confirmar e Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
