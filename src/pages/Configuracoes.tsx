import { useState, useEffect } from 'react';
import { Settings, Check, Zap, Brain } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type Provider = 'perplexity' | 'chatgpt';

const STORAGE_KEY = 'preco-mercado-provider';

const providers = [
  {
    id: 'perplexity' as Provider,
    name: 'Perplexity (Sonar)',
    description: 'Busca web real com links verificáveis via API Perplexity Sonar. Retorna citações reais de sites.',
    icon: Zap,
    pros: ['Links verificáveis com citações', 'Filtro por domínio (ML, Kabum)', 'Busca web em tempo real'],
    cons: ['Pode retornar formatação inconsistente', 'Créditos pagos necessários'],
  },
  {
    id: 'chatgpt' as Provider,
    name: 'ChatGPT',
    description: 'Usa o modelo GPT-4o via sua chave OpenAI. Mais consistente na estrutura de resposta, mas links podem não ser reais.',
    icon: Brain,
    pros: ['Resposta mais estruturada e consistente', 'Controle próprio de custos', 'Melhor interpretação de contexto'],
    cons: ['Links podem não ser verificáveis', 'Sem busca web real'],
  },
];

export default function Configuracoes() {
  const { toast } = useToast();
  const [activeProvider, setActiveProvider] = useState<Provider>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Provider) || 'perplexity';
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie as integrações de pesquisa de preço de mercado.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Provedor de Pesquisa de Preço</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Escolha qual serviço será usado para pesquisar preços online dos produtos.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
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
                  <div>
                    <p className="text-xs font-medium text-orange-600 mb-1">Limitações</p>
                    <ul className="space-y-0.5">
                      {provider.cons.map((con, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-orange-500 mt-0.5">⚠</span>
                          {con}
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
