import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InventoryProvider } from "@/store/InventoryContext";
import { PageVisibilityProvider } from "@/store/PageVisibilityContext";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Imports from "./pages/Imports";
import Comparacao from "./pages/Comparacao";
import Promocoes from "./pages/Promocoes";
import PrecoMercado from "./pages/PrecoMercado";
import Campanhas from "./pages/Campanhas";
import Configuracoes from "./pages/Configuracoes";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedApp = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <PageVisibilityProvider>
      <InventoryProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/produtos" element={<Products />} />
              <Route path="/importacoes" element={<Imports />} />
              <Route path="/comparacao" element={<Comparacao />} />
              <Route path="/promocoes" element={<Promocoes />} />
              <Route path="/campanhas" element={<Campanhas />} />
              <Route path="/preco-mercado" element={<PrecoMercado />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </InventoryProvider>
    </PageVisibilityProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <ProtectedApp />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
