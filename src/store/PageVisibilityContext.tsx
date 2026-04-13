import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ToggleablePage = 'produtos' | 'comparacao' | 'preco-mercado' | 'importacoes' | 'promocoes' | 'campanhas';

const STORAGE_KEY = 'hidden-pages';

function getInitialHidden(): Set<ToggleablePage> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch {}
  return new Set<ToggleablePage>();
}

interface PageVisibilityContextType {
  hiddenPages: Set<ToggleablePage>;
  isPageVisible: (page: ToggleablePage) => boolean;
  togglePage: (page: ToggleablePage) => void;
  allowedPages: string[] | null; // null = full access
}

const PageVisibilityContext = createContext<PageVisibilityContextType | null>(null);

export function PageVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hiddenPages, setHiddenPages] = useState<Set<ToggleablePage>>(getInitialHidden);
  const [allowedPages, setAllowedPages] = useState<string[] | null>(null);

  useEffect(() => {
    async function fetchPermissions() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_allowed_pages')
        .select('allowed_pages')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.allowed_pages) {
        setAllowedPages(data.allowed_pages as string[]);
      } else {
        setAllowedPages(null); // full access
      }
    }
    fetchPermissions();
  }, []);

  const isPageVisible = useCallback((page: ToggleablePage) => {
    // If user has restricted pages, check if this page is allowed
    if (allowedPages !== null && !allowedPages.includes(page)) {
      return false;
    }
    return !hiddenPages.has(page);
  }, [hiddenPages, allowedPages]);

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
    <PageVisibilityContext.Provider value={{ hiddenPages, isPageVisible, togglePage, allowedPages }}>
      {children}
    </PageVisibilityContext.Provider>
  );
}

export function usePageVisibility() {
  const ctx = useContext(PageVisibilityContext);
  if (!ctx) throw new Error('usePageVisibility must be used within PageVisibilityProvider');
  return ctx;
}
