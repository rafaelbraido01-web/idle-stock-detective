const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SEARCH_PROMPT = (productName: string, productCode: string) =>
  `Pesquise o preço do produto "${productName}" (código: ${productCode}) nos sites Mercado Livre (mercadolivre.com.br) e Kabum (kabum.com.br).

REGRAS IMPORTANTES:
- O produto encontrado DEVE ser IDÊNTICO ou MUITO similar ao pesquisado
- Retorne o produto mais barato de cada site
- Se não encontrar em um dos sites, use outra fonte confiável brasileira (Amazon.com.br, Magazine Luiza, etc.)
- Retorne EXATAMENTE 2 resultados, um de cada fonte diferente
- Os links DEVEM ser URLs reais e funcionais dos produtos

Retorne APENAS um JSON válido neste formato exato, sem texto adicional:
{
  "results": [
    {
      "source": "Mercado Livre",
      "productName": "nome exato do produto encontrado",
      "price": 0.00,
      "url": "https://..."
    },
    {
      "source": "Kabum",
      "productName": "nome exato do produto encontrado",
      "price": 0.00,
      "url": "https://..."
    }
  ]
}`;

function parseJsonResponse(content: string) {
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) {
    jsonStr = objMatch[0];
  }
  return JSON.parse(jsonStr);
}

async function searchWithPerplexity(productName: string, productCode: string) {
  const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) throw new Error('Perplexity não está configurado');

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: 'Você é um assistente de pesquisa de preços. Retorne APENAS JSON válido, sem markdown, sem explicações.' },
        { role: 'user', content: SEARCH_PROMPT(productName, productCode) },
      ],
      search_domain_filter: ['mercadolivre.com.br', 'kabum.com.br', 'amazon.com.br', 'magazineluiza.com.br'],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Perplexity API error:', response.status, errText);
    if (response.status === 402) throw new Error('Créditos insuficientes no Perplexity.');
    if (response.status === 429) throw new Error('Limite de requisições excedido. Tente novamente em alguns segundos.');
    throw new Error(`Erro na API Perplexity: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const citations = data.citations || [];
  console.log('Perplexity response:', content);

  const parsed = parseJsonResponse(content);
  return { data: parsed, citations };
}

async function searchWithChatGPT(productName: string, productCode: string) {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY não está configurado');

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-5',
      messages: [
        { role: 'system', content: 'Você é um assistente de pesquisa de preços no Brasil. Retorne APENAS JSON válido, sem markdown, sem explicações. Forneça URLs reais de produtos quando possível.' },
        { role: 'user', content: SEARCH_PROMPT(productName, productCode) },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Lovable AI error:', response.status, errText);
    if (response.status === 402) throw new Error('Créditos insuficientes. Adicione fundos ao workspace.');
    if (response.status === 429) throw new Error('Limite de requisições excedido. Tente novamente.');
    throw new Error(`Erro na API: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  console.log('ChatGPT response:', content);

  const parsed = parseJsonResponse(content);
  return { data: parsed, citations: [] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productName, productCode, provider = 'perplexity' } = await req.json();

    if (!productName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nome do produto é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching prices for: ${productName} (${productCode}) using provider: ${provider}`);

    let result;
    if (provider === 'chatgpt') {
      result = await searchWithChatGPT(productName, productCode);
    } else {
      result = await searchWithPerplexity(productName, productCode);
    }

    return new Response(
      JSON.stringify({ success: true, data: result.data, citations: result.citations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error searching prices:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
