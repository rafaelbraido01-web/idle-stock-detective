import React, { createContext, useContext, useState, useCallback } from 'react';

export type ToggleablePage = 'produtos' | 'comparacao' | 'preco-mercado' | 'importacoes' | 'promocoes' | 'campanhas';

const STORAGE_KEY = 'hidden-pages';

function getInitialHidden(): Set<ToggleablePage> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch {}
  return new Set<ToggleablePage>(['produtos', 'comparacao', 'preco-mercado']);
}

interface PageVisibilityContextType {
  hiddenPages: Set<ToggleablePage>;
  isPageVisible: (page: ToggleablePage) => boolean;
  togglePage: (page: ToggleablePage) => void;
}

const PageVisibilityContext = createContext<PageVisibilityContextType | null>(null);

export function PageVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hiddenPages, setHiddenPages] = useState<Set<ToggleablePage>>(getInitialHidden);

  const isPageVisible = useCallback((page: ToggleablePage) => !hiddenPages.has(page), [hiddenPages]);

  const togglePage = useCallback((page: ToggleablePage) => {
    setHiddenPages(prev => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return (
    <PageVisibilityContext.Provider value={{ hiddenPages, isPageVisible, togglePage }}>
      {children}
    </PageVisibilityContext.Provider>
  );
}

export function usePageVisibility() {
  const ctx = useContext(PageVisibilityContext);
  if (!ctx) throw new Error('usePageVisibility must be used within PageVisibilityProvider');
  return ctx;
}
