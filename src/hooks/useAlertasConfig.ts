import { useState, useEffect, useCallback } from 'react';

export interface AlertasConfig {
  estoqueParado: { enabled: boolean; diasMin: number; valorMin: number; valorMax?: number; estoqueMin: number };
  precoMercado: { enabled: boolean; diasVerde: number; diasVermelho: number };
  marcasPadrao: string[];
}

const STORAGE_KEY = 'alertas-config';

export const DEFAULT_ALERTAS_CONFIG: AlertasConfig = {
  estoqueParado: { enabled: true, diasMin: 90, valorMin: 10000, valorMax: undefined, estoqueMin: 0 },
  precoMercado: { enabled: true, diasVerde: 15, diasVermelho: 25 },
  marcasPadrao: [],
};

function loadConfig(): AlertasConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ALERTAS_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      estoqueParado: { ...DEFAULT_ALERTAS_CONFIG.estoqueParado, ...(parsed.estoqueParado || {}) },
      precoMercado: { ...DEFAULT_ALERTAS_CONFIG.precoMercado, ...(parsed.precoMercado || {}) },
      marcasPadrao: Array.isArray(parsed.marcasPadrao) ? parsed.marcasPadrao : [],
    };
  } catch {
    return DEFAULT_ALERTAS_CONFIG;
  }
}

export function useAlertasConfig() {
  const [config, setConfig] = useState<AlertasConfig>(loadConfig);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setConfig(loadConfig());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const updateConfig = useCallback((partial: Partial<AlertasConfig>) => {
    setConfig(prev => {
      const next: AlertasConfig = {
        ...prev,
        ...partial,
        estoqueParado: { ...prev.estoqueParado, ...(partial.estoqueParado || {}) },
        precoMercado: { ...prev.precoMercado, ...(partial.precoMercado || {}) },
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { config, updateConfig };
}
