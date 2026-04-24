import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InventoryProvider } from "@/store/InventoryContext";
import { PageVisibilityProvider, usePageVisibility, type ToggleablePage } from "@/store/PageVisibilityContext";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Imports from "./pages/Imports";
import Comparacao from "./pages/Comparacao";
import Promocoes from "./pages/Promocoes";
import PrecoMercado from "./pages/PrecoMercado";
import Campanhas from "./pages/Campanhas";
import Alertas from "./pages/Alertas";
import Configuracoes from "./pages/Configuracoes";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function GuardedRoute({ page, children }: { page: ToggleablePage; children: React.ReactNode }) {
  const { allowedPages } = usePageVisibility();
  if (allowedPages !== null && !allowedPages.includes(page)) {
    // Redirect to first allowed page
    const firstAllowed = allowedPages[0];
    const routeMap: Record<string, string> = {
      'produtos': '/produtos', 'importacoes': '/importacoes', 'comparacao': '/comparacao',
      'promocoes': '/promocoes', 'campanhas': '/campanhas', 'preco-mercado': '/preco-mercado',
      'alertas': '/alertas',
    };
    return <Navigate to={routeMap[firstAllowed] || '/'} replace />;
  }
  return <>{children}</>;
}

const AppRoutes = () => {
  const { allowedPages } = usePageVisibility();
  const hasRestriction = allowedPages !== null;

  // If restricted, redirect dashboard to first allowed page
  const dashboardElement = hasRestriction
    ? <Navigate to={`/${allowedPages[0]?.replace('preco-mercado', 'preco-mercado')}`} replace />
    : <Dashboard />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={dashboardElement} />
        <Route path="/produtos" element={<GuardedRoute page="produtos"><Products /></GuardedRoute>} />
        <Route path="/importacoes" element={<GuardedRoute page="importacoes"><Imports /></GuardedRoute>} />
        <Route path="/comparacao" element={<GuardedRoute page="comparacao"><Comparacao /></GuardedRoute>} />
        <Route path="/promocoes" element={<GuardedRoute page="promocoes"><Promocoes /></GuardedRoute>} />
        <Route path="/campanhas" element={<GuardedRoute page="campanhas"><Campanhas /></GuardedRoute>} />
        <Route path="/preco-mercado" element={<GuardedRoute page="preco-mercado"><PrecoMercado /></GuardedRoute>} />
        <Route path="/alertas" element={<GuardedRoute page="alertas"><Alertas /></GuardedRoute>} />
        <Route path="/configuracoes" element={hasRestriction ? <Navigate to="/" replace /> : <Configuracoes />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
};

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
          <AppRoutes />
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
