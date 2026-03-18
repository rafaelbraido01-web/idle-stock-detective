const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SYSTEM_PROMPT = `Você é um assistente de pesquisa de preços no Brasil.

REGRAS ABSOLUTAS:
- NÃO inventar links
- NÃO inventar preços
- NÃO preencher dados incertos
- Priorizar Mercado Livre e Kabum quando disponíveis
- Incluir outras lojas confiáveis como complemento
- Se houver dúvida, deixar campos vazios ou omitir resultado

Retorne APENAS JSON válido.`;

const SEARCH_PROMPT = (productName: string, productCode: string) =>
  `Pesquise o preço do produto "${productName}" (código: ${productCode}) em lojas brasileiras confiáveis.

REGRAS CRÍTICAS:
- Buscar APENAS produtos idênticos ou extremamente similares
- Priorizar: Mercado Livre e Kabum
- Incluir uma terceira ou quarta opção de outra loja confiável (Amazon, Magazine Luiza, etc.), se possível
- Retornar entre 2 e 4 resultados, de fontes diferentes
- SEMPRE priorizar páginas de produto (não categorias ou busca)
- NÃO inventar links
- Se não tiver certeza da URL, retornar "url": ""
- NÃO inventar preços
- NÃO retornar produtos genéricos ou diferentes
- Se não encontrar com segurança, retornar lista vazia

VALIDAÇÃO DE LINK (OBRIGATÓRIO):
- O link deve ser direto do produto
- Evitar "/busca", "/search", "/categoria"
- Preferir URLs com identificador de produto (ex: /dp/, /p/, /item)

FORMATO DE SAÍDA (JSON PURO):
{
  "results": [
    {
      "source": "Nome da loja",
      "productName": "nome exato do produto",
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
        { role: 'system', content: SYSTEM_PROMPT },
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
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('Chave da OpenAI não está configurada');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: SEARCH_PROMPT(productName, productCode) },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('OpenAI API error:', response.status, errText);
    if (response.status === 402) throw new Error('Créditos insuficientes na OpenAI.');
    if (response.status === 429) throw new Error('Limite de requisições excedido. Tente novamente.');
    throw new Error(`Erro na API OpenAI: ${response.status}`);
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