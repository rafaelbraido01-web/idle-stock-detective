import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInventory } from '@/store/InventoryContext';
import { processExcelFile } from '@/lib/importExcel';
import { useToast } from '@/hooks/use-toast';

export function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const { addImport, produtos } = useInventory();
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const result = await processExcelFile(file, produtos);
      addImport(result.snapshot, result.produtos, result.produtoSnapshots);
      toast({
        title: 'Importação concluída',
        description: `${result.produtoSnapshots.length} produtos processados.`,
      });
    } catch (err: any) {
      toast({
        title: 'Erro na importação',
        description: err.message || 'Erro ao processar arquivo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFile}
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
    </>
  );
}
