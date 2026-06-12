import { useState, useEffect, useMemo } from 'react';
import { Check, Zap, Brain, Globe, Eye, EyeOff, AlertTriangle, X, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { usePageVisibility, type ToggleablePage } from '@/store/PageVisibilityContext';
import { useAlertasConfig } from '@/hooks/useAlertasConfig';
import { useInventory } from '@/store/InventoryContext';
import { cn } from '@/lib/utils';

type Provider = 'scraper' | 'perplexity' | 'chatgpt';

const STORAGE_KEY = 'preco-mercado-provider';

const providers = [
  {
    id: 'scraper' as Provider,
    name: 'Scraper (Recomendado)',
    description: 'Busca direta via HTTP scraping no Google + extração de preços das páginas. Usa IA apenas para formatar o resultado final. Custo ≈ R$0,002 por busca.',
    icon: Globe,
    pros: ['Custo extremamente baixo', 'Preços reais extraídos das páginas', 'Sem dependência de APIs pagas', 'Links diretos verificáveis'],
  },
  {
    id: 'perplexity' as Provider,
    name: 'Perplexity (Sonar)',
    description: 'Busca web real com links verificáveis via API Perplexity Sonar. Retorna citações reais de sites.',
    icon: Zap,
    pros: ['Links verificáveis com citações', 'Filtro por domínio (ML, Kabum)', 'Busca web em tempo real'],
  },
  {
    id: 'chatgpt' as Provider,
    name: 'ChatGPT',
    description: 'Usa o modelo GPT-4o via chave OpenAI. Mais consistente na estrutura de resposta.',
    icon: Brain,
    pros: ['Resposta mais estruturada e consistente', 'Controle próprio de custos', 'Melhor interpretação de contexto'],
  },
];

const toggleablePages: Array<{ key: ToggleablePage; label: string }> = [
  { key: 'produtos', label: 'Produtos' },
  { key: 'importacoes', label: 'Importações' },
  { key: 'comparacao', label: 'Comparação de Snapshots' },
  { key: 'promocoes', label: 'Promoções' },
  { key: 'campanhas', label: 'Campanhas' },
  { key: 'preco-mercado', label: 'Preço de Mercado' },
  { key: 'alertas', label: 'Alertas' },
];

export default function Configuracoes() {
  const { toast } = useToast();
  const { isPageVisible, togglePage } = usePageVisibility();
  const { config, updateConfig } = useAlertasConfig();
  const { produtos } = useInventory();

  const [activeProvider, setActiveProvider] = useState<Provider>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Provider) || 'scraper';
  });

  // Local mirrors (so inputs can be edited freely)
  const [diasMin, setDiasMin] = useState(config.estoqueParado.diasMin);
  const [valorMin, setValorMin] = useState(config.estoqueParado.valorMin);
  const [valorMax, setValorMax] = useState(config.estoqueParado.valorMax);
  const [estoqueMin, setEstoqueMin] = useState(config.estoqueParado.estoqueMin);
  const [diasVerde, setDiasVerde] = useState(config.precoMercado.diasVerde);
  const [diasVermelho, setDiasVermelho] = useState(config.precoMercado.diasVermelho);
  const [marcaSearch, setMarcaSearch] = useState('');

  useEffect(() => { setDiasMin(config.estoqueParado.diasMin); }, [config.estoqueParado.diasMin]);
  useEffect(() => { setValorMin(config.estoqueParado.valorMin); }, [config.estoqueParado.valorMin]);
  useEffect(() => { setValorMax(config.estoqueParado.valorMax); }, [config.estoqueParado.valorMax]);
  useEffect(() => { setEstoqueMin(config.estoqueParado.estoqueMin); }, [config.estoqueParado.estoqueMin]);
  useEffect(() => { setDiasVerde(config.precoMercado.diasVerde); }, [config.precoMercado.diasVerde]);
  useEffect(() => { setDiasVermelho(config.precoMercado.diasVermelho); }, [config.precoMercado.diasVermelho]);

  const marcas = useMemo(
    () => [...new Set(produtos.map(p => p.marca).filter(Boolean))].sort(),
    [produtos]
  );

  const handleSelect = (provider: Provider) => {
    setActiveProvider(provider);
    localStorage.setItem(STORAGE_KEY, provider);
    toast({
      title: 'Provedor atualizado',
      description: `Pesquisa de preços agora usa ${providers.find(p => p.id === provider)?.name}.`,
    });
  };

  const validInterval = diasVerde < diasVermelho;

  const persistEstoque = (patch: Partial<typeof config.estoqueParado>) => {
    updateConfig({ estoqueParado: { ...config.estoqueParado, ...patch } });
    toast({ title: 'Alertas atualizados', description: 'Configuração de estoque parado salva.' });
  };

  const persistPreco = (patch: Partial<typeof config.precoMercado>) => {
    if (patch.diasVerde !== undefined && patch.diasVerde >= (patch.diasVermelho ?? config.precoMercado.diasVermelho)) {
      toast({ title: 'Intervalo inválido', description: 'Dias verde deve ser menor que dias vermelho.', variant: 'destructive' });
      return;
    }
    if (patch.diasVermelho !== undefined && patch.diasVermelho <= (patch.diasVerde ?? config.precoMercado.diasVerde)) {
      toast({ title: 'Intervalo inválido', description: 'Dias vermelho deve ser maior que dias verde.', variant: 'destructive' });
      return;
    }
    updateConfig({ precoMercado: { ...config.precoMercado, ...patch } });
    toast({ title: 'Alertas atualizados', description: 'Configuração de preço de mercado salva.' });
  };

  const toggleMarca = (m: string) => {
    const next = config.marcasPadrao.includes(m)
      ? config.marcasPadrao.filter(x => x !== m)
      : [...config.marcasPadrao, m];
    updateConfig({ marcasPadrao: next });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie as configurações da plataforma.
        </p>
      </div>

      {/* Alertas */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-aging-alert" />
          Alertas
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Defina quando um produto deve aparecer na página de Alertas.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Estoque parado */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Estoque parado</CardTitle>
                <Switch
                  checked={config.estoqueParado.enabled}
                  onCheckedChange={(v) => persistEstoque({ enabled: v })}
                />
              </div>
              <CardDescription className="text-xs">
                Alerta quando o produto não tem compra recente e tem alto valor parado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Dias sem compra ≥</Label>
                  <Input
                    type="number"
                    min={1}
                    value={diasMin}
                    onChange={e => setDiasMin(Number(e.target.value))}
                    onBlur={() => diasMin !== config.estoqueParado.diasMin && persistEstoque({ diasMin })}
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Valor estoque (De)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={valorMin}
                    onChange={e => setValorMin(Number(e.target.value))}
                    onBlur={() => valorMin !== config.estoqueParado.valorMin && persistEstoque({ valorMin })}
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Valor estoque (Até)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={valorMax === undefined ? '' : valorMax}
                    onChange={e => setValorMax(e.target.value === '' ? undefined : Number(e.target.value))}
                    onBlur={() => valorMax !== config.estoqueParado.valorMax && persistEstoque({ valorMax })}
                    className="h-9 mt-1"
                    placeholder="Sem limite"
                  />
                </div>
                <div>
                  <Label className="text-xs">Estoque mínimo ≥</Label>
                  <Input
                    type="number"
                    min={0}
                    value={estoqueMin}
                    onChange={e => setEstoqueMin(Number(e.target.value))}
                    onBlur={() => estoqueMin !== config.estoqueParado.estoqueMin && persistEstoque({ estoqueMin })}
                    className="h-9 mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preço de mercado */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Preço de mercado</CardTitle>
                <Switch
                  checked={config.precoMercado.enabled}
                  onCheckedChange={(v) => persistPreco({ enabled: v })}
                />
              </div>
              <CardDescription className="text-xs">
                Define faixa de frescor: até verde está bom, acima de vermelho dispara alerta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-aging-healthy">Dias verde ≤</Label>
                  <Input
                    type="number"
                    min={1}
                    value={diasVerde}
                    onChange={e => setDiasVerde(Number(e.target.value))}
                    onBlur={() => diasVerde !== config.precoMercado.diasVerde && persistPreco({ diasVerde })}
                    className={cn('h-9 mt-1', !validInterval && 'border-destructive')}
                  />
                </div>
                <div>
                  <Label className="text-xs text-aging-critical">Dias vermelho &gt;</Label>
                  <Input
                    type="number"
                    min={1}
                    value={diasVermelho}
                    onChange={e => setDiasVermelho(Number(e.target.value))}
                    onBlur={() => diasVermelho !== config.precoMercado.diasVermelho && persistPreco({ diasVermelho })}
                    className={cn('h-9 mt-1', !validInterval && 'border-destructive')}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Marcas padrão */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Marcas padrão</CardTitle>
            <CardDescription className="text-xs">
              Marcas pré-selecionadas ao abrir a página de Alertas. Deixe vazio para mostrar todas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 justify-between font-normal min-w-[200px]">
                    <span className="truncate">
                      {config.marcasPadrao.length === 0
                        ? 'Nenhuma marca padrão'
                        : `${config.marcasPadrao.length} marca${config.marcasPadrao.length === 1 ? '' : 's'}`}
                    </span>
                    {config.marcasPadrao.length > 0 ? (
                      <X
                        className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); updateConfig({ marcasPadrao: [] }); }}
                      />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-2" align="start">
                  <Input
                    placeholder="Buscar marca..."
                    value={marcaSearch}
                    onChange={e => setMarcaSearch(e.target.value)}
                    className="h-8 mb-2"
                  />
                  <div className="max-h-[280px] overflow-y-auto">
                    {marcas.filter(m => m.toLowerCase().includes(marcaSearch.toLowerCase())).map(m => {
                      const checked = config.marcasPadrao.includes(m);
                      return (
                        <button
                          key={m}
                          onClick={() => toggleMarca(m)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                        >
                          <div className={cn('h-4 w-4 rounded border flex items-center justify-center', checked ? 'bg-primary border-primary' : 'border-input')}>
                            {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <span className="truncate">{m}</span>
                        </button>
                      );
                    })}
                    {marcas.length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">Nenhuma marca cadastrada.</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {config.marcasPadrao.map(m => (
                <Badge key={m} variant="secondary" className="gap-1">
                  {m}
                  <X className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100" onClick={() => toggleMarca(m)} />
                </Badge>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">Em breve</Badge>
              Identificação automática de compradora por marca.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Page visibility */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Páginas Visíveis</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Oculte ou exiba páginas do menu lateral.
        </p>
        <Card>
          <CardContent className="pt-6 space-y-4">
            {toggleablePages.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <Label htmlFor={`toggle-${key}`} className="flex items-center gap-2 text-sm cursor-pointer">
                  {isPageVisible(key) ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                  {label}
                </Label>
                <Switch
                  id={`toggle-${key}`}
                  checked={isPageVisible(key)}
                  onCheckedChange={() => togglePage(key)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Provider selection */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Provedor de Pesquisa de Preço</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Escolha qual serviço será usado para pesquisar preços online dos produtos.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {providers.map((provider) => {
            const isActive = activeProvider === provider.id;
            const Icon = provider.icon;

            return (
              <Card
                key={provider.id}
                className={`relative cursor-pointer transition-all duration-200 ${
                  isActive
                    ? 'ring-2 ring-primary border-primary shadow-md'
                    : 'hover:border-muted-foreground/30'
                }`}
                onClick={() => handleSelect(provider.id)}
              >
                {isActive && (
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-primary text-primary-foreground gap-1">
                      <Check className="h-3 w-3" />
                      Ativo
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{provider.name}</CardTitle>
                  </div>
                  <CardDescription className="text-xs mt-1">
                    {provider.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-green-600 mb-1">Vantagens</p>
                    <ul className="space-y-0.5">
                      {provider.pros.map((pro, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-green-500 mt-0.5">✓</span>
                          {pro}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    className="w-full mt-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(provider.id);
                    }}
                  >
                    {isActive ? 'Selecionado' : 'Selecionar'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
