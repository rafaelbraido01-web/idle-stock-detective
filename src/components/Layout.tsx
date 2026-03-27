import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { ImportButton } from '@/components/ImportButton';
import { SyncERPButton } from '@/components/SyncERPButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Layout({ children }: { children: React.ReactNode }) {
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
              <SyncERPButton />
              <ImportButton />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <div className="w-full px-4 md:px-6 py-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
