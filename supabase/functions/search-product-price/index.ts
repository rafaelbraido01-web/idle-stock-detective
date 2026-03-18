const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productName, productCode } = await req.json();

    if (!productName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nome do produto é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Perplexity não está configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching prices for:', productName, productCode);

    const prompt = `Pesquise o preço do produto "${productName}" (código: ${productCode}) nos sites Mercado Livre (mercadolivre.com.br) e Kabum (kabum.com.br).

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
          { role: 'user', content: prompt }
        ],
        search_domain_filter: ['mercadolivre.com.br', 'kabum.com.br', 'amazon.com.br', 'magazineluiza.com.br'],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Perplexity API error:', response.status, errText);
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'Créditos insuficientes no Perplexity. Recarregue sua conta.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: `Erro na API Perplexity: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    console.log('Perplexity response:', content);

    // Extract JSON from response (may contain markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Try to find JSON object directly
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse JSON from Perplexity:', jsonStr);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Não foi possível interpretar a resposta da pesquisa. Tente novamente.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: parsed, citations }),
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
