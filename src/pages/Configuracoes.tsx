import { useState } from 'react';
import { Check, Zap, Brain, Globe, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { usePageVisibility, type ToggleablePage } from '@/store/PageVisibilityContext';

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
];

export default function Configuracoes() {
  const { toast } = useToast();
  const { isPageVisible, togglePage } = usePageVisibility();
  const [activeProvider, setActiveProvider] = useState<Provider>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Provider) || 'scraper';
  });

  const handleSelect = (provider: Provider) => {
    setActiveProvider(provider);
    localStorage.setItem(STORAGE_KEY, provider);
    toast({
      title: 'Provedor atualizado',
      description: `Pesquisa de preços agora usa ${providers.find(p => p.id === provider)?.name}.`,
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie as configurações da plataforma.
        </p>
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
