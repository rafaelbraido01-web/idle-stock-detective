import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ExternalLink, Loader2, Search, CheckCircle2 } from 'lucide-react';

const FONTES = ['Mercado Livre', 'Kabum', 'Pichau', 'Amazon', 'Magazine Luiza', 'Netshoes', 'Outro'];

interface PriceResult {
  source: string;
  productName: string;
  price: number;
  url: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produtoCodigo: string;
  produtoDescricao: string;
  produtoMarca: string;
  precoTabela?: number;
  onSaved: (codigo: string, preco: number, updatedAt: string) => void;
}

export function MarketPriceUpdateDialog({
  open, onOpenChange, produtoCodigo, produtoDescricao, produtoMarca, precoTabela, onSaved,
}: Props) {
  const { toast } = useToast();

  const [tab, setTab] = useState<'busca' | 'manual'>('busca');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PriceResult[] | null>(null);

  const [precoInput, setPrecoInput] = useState('');
  const [fonte, setFonte] = useState('Mercado Livre');
  const [fonteOutro, setFonteOutro] = useState('');
  const [link, setLink] = useState('');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTab('busca');
      setResults(null);
      setPrecoInput('');
      setFonte('Mercado Livre');
      setFonteOutro('');
      setLink('');
      setObs('');
    }
  }, [open]);

  const getProvider = () => localStorage.getItem('preco-mercado-provider') || 'scraper';

  const runSearch = async () => {
    setSearching(true);
    setResults(null);
    try {
      const provider = getProvider();
      const functionName = provider === 'scraper' ? 'search-product-scraper' : 'search-product-price';
      const body = provider === 'scraper'
        ? { productName: `${produtoDescricao} ${produtoMarca}`.trim(), productCode: produtoCodigo }
        : { productName: `${produtoDescricao} ${produtoMarca}`.trim(), productCode: produtoCodigo, provider };

      const { data, error } = await supabase.functions.invoke(functionName, { body });
      if (error) throw error;
      if (data?.success) {
        setResults(data.data?.results || []);
      } else {
        toast({ title: 'Erro na pesquisa', description: data?.error || 'Não foi possível pesquisar preços.', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('Search error:', err);
      toast({ title: 'Erro', description: err.message || 'Falha ao pesquisar preços online.', variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const persist = async (
    preco: number,
    fonteVal: string,
    linkVal: string | null,
    obsVal: string | null,
    fonteOutroVal: string | null,
  ) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('precos_mercado')
      .insert({
        produto_id: produtoCodigo,
        preco,
        updated_at: now,
        fonte: fonteVal,
        link: linkVal,
        observacao: obsVal,
        fonte_outro: fonteOutroVal,
      } as any);
    if (error) throw error;
    onSaved(produtoCodigo, preco, now);

    // Notifica n8n via webhook (fire-and-forget)
    supabase.functions.invoke('notify-market-price-update', {
      body: {
        codigo: produtoCodigo,
        produto: produtoDescricao,
        marca: produtoMarca,
        preco_mercado: preco,
        fonte: fonteVal === 'Outro' ? (fonteOutroVal || fonteVal) : fonteVal,
        link: linkVal,
        observacao: obsVal,
        updated_at: now,
      },
    }).catch(err => console.error('notify-market-price-update failed:', err));

    toast({ title: 'Preço de mercado salvo!', description: `${formatCurrency(preco)} · ${fonteVal}` });
    onOpenChange(false);
  };

  const handleUseResult = async (r: PriceResult) => {
    setSaving(true);
    try {
      const matchFonte = FONTES.find(f => f !== 'Outro' && r.source.toLowerCase().includes(f.toLowerCase()));
      const fonteVal = matchFonte || 'Outro';
      await persist(
        r.price,
        fonteVal,
        r.url || null,
        r.productName || null,
        fonteVal === 'Outro' ? r.source : null,
      );
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleManualSave = async () => {
    const preco = parseFloat(precoInput.replace(',', '.'));
    if (isNaN(preco) || preco <= 0) {
      toast({ title: 'Valor inválido', description: 'Informe um preço válido.', variant: 'destructive' });
      return;
    }
    if (fonte === 'Outro' && !fonteOutro.trim()) {
      toast({ title: 'Informe a fonte', description: 'Descreva a fonte quando selecionar "Outro".', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await persist(
        preco,
        fonte,
        link.trim() || null,
        obs.trim() || null,
        fonte === 'Outro' ? fonteOutro.trim() : null,
      );
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Atualizar preço de mercado</DialogTitle>
          <DialogDescription className="text-sm">
            <span className="font-mono text-foreground">{produtoCodigo}</span> · {produtoDescricao}
            {produtoMarca && (
              <Badge variant="outline" className="text-[10px] py-0 h-4 ml-1.5 align-middle">{produtoMarca}</Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'busca' | 'manual')} className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="busca">Buscar online</TabsTrigger>
            <TabsTrigger value="manual">Cadastro manual</TabsTrigger>
          </TabsList>

          <TabsContent value="busca" className="space-y-3 mt-4">
            <Button onClick={runSearch} disabled={searching} className="w-full gap-2">
              {searching ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Pesquisando...</>
              ) : (
                <><Search className="h-4 w-4" /> Pesquisar agora</>
              )}
            </Button>

            {results && results.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum resultado encontrado. Tente o cadastro manual.
              </p>
            )}

            {results && results.length > 0 && (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {results.map((r, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="text-xs">{r.source}</Badge>
                      <span className="text-base font-bold font-mono">{formatCurrency(r.price)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.productName}</p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Validar link
                        </a>
                      ) : <span />}
                      <Button
                        size="sm"
                        variant="default"
                        disabled={saving}
                        onClick={() => handleUseResult(r)}
                        className="h-7 gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Usar este preço
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {precoTabela !== undefined && precoTabela > 0 && (
              <p className="text-xs text-muted-foreground border-t pt-2">
                Preço de tabela atual: <strong>{formatCurrency(precoTabela)}</strong>
              </p>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-sm">Preço (R$)</Label>
              <Input
                type="number" step="0.01" min="0" placeholder="0,00"
                value={precoInput} onChange={e => setPrecoInput(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Fonte</Label>
              <Select value={fonte} onValueChange={setFonte}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONTES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {fonte === 'Outro' && (
              <div className="space-y-2">
                <Label className="text-sm">Descreva a fonte</Label>
                <Input value={fonteOutro} onChange={e => setFonteOutro(e.target.value)} placeholder="Ex: Loja XYZ" />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm">Link (opcional)</Label>
              <Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Observação (opcional)</Label>
              <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || searching}>
            Cancelar
          </Button>
          {tab === 'manual' && (
            <Button onClick={handleManualSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Salvando...</>
              ) : 'Salvar preço'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
