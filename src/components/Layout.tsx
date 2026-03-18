import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { ImportButton } from '@/components/ImportButton';
import { useInventory } from '@/store/InventoryContext';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Layout({ children }: { children: React.ReactNode }) {
  const { clearData, snapshots } = useInventory();

  const handleClear = () => {
    if (window.confirm('Tem certeza que deseja excluir todos os dados importados?')) {
      clearData();
      toast.success('Dados excluídos com sucesso');
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger className="h-9 w-9 border border-input bg-background hover:bg-accent" />
                </TooltipTrigger>
                <TooltipContent side="right">Ocultar/Exibir menu</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              {snapshots.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleClear} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" /> Limpar Dados
                </Button>
              )}
              <ImportButton />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <div className="max-w-7xl mx-auto p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
