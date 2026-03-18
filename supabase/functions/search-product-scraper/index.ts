const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Domínios confiáveis ──
const TRUSTED_DOMAINS = [
  'kabum.com.br',
  'mercadolivre.com.br',
  'produto.mercadolivre.com.br',
  'amazon.com.br',
  'magazineluiza.com.br',
  'magazinevoce.com.br',
  'pichau.com.br',
];

const BLOCKED_PATH_PATTERNS = ['/busca', '/search', '/categoria', '/listing', '/b/'];

// ── URL validation ──
function isValidProductUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace('www.', '');
    
    // Must be from a trusted domain
    const isTrusted = TRUSTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
    if (!isTrusted) return false;
    
    // Must not be a search/category page
    const path = parsed.pathname.toLowerCase();
    if (BLOCKED_PATH_PATTERNS.some(p => path.includes(p))) return false;
    
    // Should have some path (not just root)
    if (path === '/' || path === '') return false;
    
    return true;
  } catch {
    return false;
  }
}

// ── Extract source name from URL ──
function getSourceName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    if (hostname.includes('kabum')) return 'Kabum';
    if (hostname.includes('mercadolivre') || hostname.includes('mercadolibre')) return 'Mercado Livre';
    if (hostname.includes('amazon')) return 'Amazon';
    if (hostname.includes('magazineluiza') || hostname.includes('magazinevoce')) return 'Magazine Luiza';
    if (hostname.includes('pichau')) return 'Pichau';
    return hostname;
  } catch {
    return 'Desconhecido';
  }
}

// ── Price extraction ──
function extractPrices(html: string): number[] {
  const prices: number[] = [];
  
  // Pattern 1: R$ 1.234,56 or R$1234,56
  const patterns = [
    /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/g,
    /"price":\s*(\d+\.?\d*)/g,
    /"lowPrice":\s*(\d+\.?\d*)/g,
    /"offers?"[^}]*"price":\s*(\d+\.?\d*)/g,
    /data-price="(\d+\.?\d*)"/g,
  ];
  
  // R$ format
  const rPattern = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  let match;
  while ((match = rPattern.exec(html)) !== null) {
    const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
    if (val > 10 && val < 100000) prices.push(val);
  }
  
  // JSON-LD / structured data price
  const jsonPricePattern = /"price":\s*"?(\d+\.?\d*)"?/g;
  while ((match = jsonPricePattern.exec(html)) !== null) {
    const val = parseFloat(match[1]);
    if (val > 10 && val < 100000) prices.push(val);
  }
  
  return prices;
}

// ── Title extraction ──
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200);
  }
  
  // Try og:title
  const ogMatch = html.match(/property="og:title"\s+content="([^"]+)"/i) 
    || html.match(/content="([^"]+)"\s+property="og:title"/i);
  if (ogMatch) return ogMatch[1].trim().substring(0, 200);
  
  return '';
}

// ── Detect if code is a manufacturer model (has letters/slashes) vs internal numeric code ──
function isManufacturerCode(code: string): boolean {
  return /[a-zA-Z]/.test(code) || /[\/\-]/.test(code);
}

// ── Variant-safe code matching ──
function codeMatchesExact(title: string, code: string): boolean {
  if (!code) return false;
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, 'i');
  return regex.test(title);
}

// ── Extract model identifiers from product name ──
function extractModelCodes(productName: string): string[] {
  const models: string[] = [];
  const patterns = [
    /[A-Z0-9]{2,}[-][A-Z0-9]+(?:[-\.][A-Z0-9]+)*/gi,
    /[A-Z]{1,3}\d{2,}[A-Z]*/gi,
    /i[3579]-?\d{4,5}[A-Z]*/gi,
  ];
  for (const p of patterns) {
    const matches = productName.match(p);
    if (matches) models.push(...matches);
  }
  return [...new Set(models)].filter(m => m.length >= 3);
}

// ── URL relevance check ──
function isUrlRelevant(url: string, code: string, productName: string): boolean {
  const pathLower = url.toLowerCase();
  if (code && isManufacturerCode(code) && pathLower.includes(code.toLowerCase())) return true;
  const words = productName.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !['para', 'com', 'sem', 'que'].includes(w));
  const matchCount = words.filter(w => pathLower.includes(w)).length;
  return matchCount >= 1;
}

// ── Product relevance check (balanced) ──
function isRelevantProduct(title: string, code: string, productName: string): boolean {
  const titleLower = title.toLowerCase();
  const modelCodes = extractModelCodes(productName);

  // For manufacturer codes, require exact match in title
  if (code && isManufacturerCode(code)) {
    if (!codeMatchesExact(titleLower, code)) {
      console.log(`[Validation] REJECTED: manufacturer code "${code}" not in title "${title.substring(0, 80)}"`);
      return false;
    }
    return true;
  }

  // For internal numeric codes, rely on name/model matching
  if (modelCodes.length > 0) {
    const hasModelMatch = modelCodes.some(m => titleLower.includes(m.toLowerCase()));
    if (hasModelMatch) return true;
  }

  // Fallback: significant word overlap
  const significantWords = productName.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !['para', 'com', 'sem', 'que', 'led', 'ips'].includes(w));
  const matchCount = significantWords.filter(w => titleLower.includes(w)).length;
  const matchRatio = significantWords.length > 0 ? matchCount / significantWords.length : 0;

  if (matchRatio < 0.3) {
    console.log(`[Validation] REJECTED: low relevance (${matchCount}/${significantWords.length}) for "${title.substring(0, 80)}"`);
    return false;
  }

  return true;
}

// ── Google search via HTML ──
async function searchGoogle(query: string): Promise<string[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=br&num=5`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      console.error(`Google search failed: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    
    // Extract URLs from Google results
    const urls: string[] = [];
    const urlPattern = /href="\/url\?q=(https?[^&"]+)/g;
    let match;
    while ((match = urlPattern.exec(html)) !== null) {
      const decoded = decodeURIComponent(match[1]);
      if (isValidProductUrl(decoded) && !urls.includes(decoded)) {
        urls.push(decoded);
      }
    }
    
    // Fallback: try direct href patterns
    if (urls.length === 0) {
      const directPattern = /href="(https?:\/\/(?:www\.)?(?:kabum|mercadolivre|amazon|magazineluiza|pichau)[^"]+)"/g;
      while ((match = directPattern.exec(html)) !== null) {
        const decoded = decodeURIComponent(match[1]);
        if (isValidProductUrl(decoded) && !urls.includes(decoded)) {
          urls.push(decoded);
        }
      }
    }
    
    return urls.slice(0, 5);
  } catch (err) {
    console.error(`Google search error for "${query}":`, err);
    return [];
  }
}

// ── Fetch and scrape a product page ──
async function scrapePage(url: string, productCode: string, productName: string): Promise< {
  source: string;
  productName: string;
  price: number;
  url: string;
} | null> {
  try {
    // VALIDATION: URL must be relevant to the product
    if (!isUrlRelevant(url, productCode, productName)) {
      console.log(`[Validation] URL rejected (no relevance): ${url}`);
      return null;
    }
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });
    
    if (!response.ok) {
      console.log(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    const title = extractTitle(html);
    
    if (!title) {
      console.log(`[Validation] No title found at ${url}`);
      return null;
    }
    
    if (!isRelevantProduct(title, productCode, productName)) {
      return null;
    }
    
    const prices = extractPrices(html);
    if (prices.length === 0) {
      console.log(`No price found at ${url}`);
      return null;
    }
    
    // Use the lowest price (usually the main/promotional price)
    const price = Math.min(...prices);
    
    return {
      source: getSourceName(url),
      productName: title,
      price,
      url,
    };
  } catch (err) {
    console.error(`Scrape error for ${url}:`, err);
    return null;
  }
}

// ── Remove outliers ──
function removeOutliers(results: Array<{ source: string; productName: string; price: number; url: string }>) {
  if (results.length <= 2) return results;
  
  const prices = results.map(r => r.price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  // Remove items with price > 3x or < 0.3x the average
  return results.filter(r => r.price >= avg * 0.3 && r.price <= avg * 3);
}

// ── Deduplicate by source ──
function deduplicateBySouce(results: Array<{ source: string; productName: string; price: number; url: string }>) {
  const seen = new Map<string, typeof results[0]>();
  for (const r of results) {
    const existing = seen.get(r.source);
    // Keep the one with the lowest price per source
    if (!existing || r.price < existing.price) {
      seen.set(r.source, r);
    }
  }
  return Array.from(seen.values());
}

// ── Format with AI (cheap) ──
async function formatWithAI(rawResults: any[]): Promise<any> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey || rawResults.length === 0) {
    return { results: rawResults };
  }
  
  try {
    const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-nano',
        messages: [
          {
            role: 'system',
            content: `Organize os dados de preços em JSON limpo.
REGRAS:
- NÃO inventar dados
- NÃO alterar preços
- NÃO alterar URLs
- Se um item parecer inválido ou duplicado, remova-o
- Retorne APENAS JSON válido sem markdown`,
          },
          {
            role: 'user',
            content: `Organize estes resultados de pesquisa de preço:
${JSON.stringify(rawResults, null, 2)}

FORMATO:
{"results": [{"source": "", "productName": "", "price": 0.00, "url": ""}]}`,
          },
        ],
        temperature: 0,
        max_tokens: 1000,
      }),
    });
    
    if (!response.ok) {
      console.error('AI format error:', response.status);
      return { results: rawResults };
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];
    
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('AI formatting failed, returning raw:', err);
    return { results: rawResults };
  }
}

// ── Main handler ──
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
    
    console.log(`[Scraper] Searching: "${productName}" (${productCode})`);
    
    // Step 1: Generate search queries
    const queries = [
      `${productCode} site:kabum.com.br`,
      `${productCode} site:mercadolivre.com.br`,
      `${productCode} site:amazon.com.br`,
      `${productName} ${productCode} preço`,
    ].filter(q => q.trim());
    
    // Step 2: Search Google in parallel
    console.log(`[Scraper] Running ${queries.length} searches...`);
    const searchResults = await Promise.all(queries.map(q => searchGoogle(q)));
    
    // Flatten and deduplicate URLs
    const allUrls = new Set<string>();
    for (const urls of searchResults) {
      for (const url of urls) {
        allUrls.add(url);
      }
    }
    
    const uniqueUrls = Array.from(allUrls).slice(0, 8);
    console.log(`[Scraper] Found ${uniqueUrls.length} unique URLs to scrape`);
    
    if (uniqueUrls.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: { results: [] }, citations: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Step 3: Scrape pages in parallel
    const scrapeResults = await Promise.all(
      uniqueUrls.map(url => scrapePage(url, productCode, productName))
    );
    
    let validResults = scrapeResults.filter(Boolean) as Array<{
      source: string;
      productName: string;
      price: number;
      url: string;
    }>;
    
    console.log(`[Scraper] ${validResults.length} valid results from scraping`);
    
    // Step 4: Deduplicate and filter
    validResults = deduplicateBySouce(validResults);
    validResults = removeOutliers(validResults);
    
    // Step 5: Prioritize sources
    const priority: Record<string, number> = {
      'Kabum': 1,
      'Mercado Livre': 2,
      'Amazon': 3,
      'Magazine Luiza': 4,
      'Pichau': 5,
    };
    
    validResults.sort((a, b) => {
      const pa = priority[a.source] || 99;
      const pb = priority[b.source] || 99;
      return pa - pb;
    });
    
    // Take top 2-4 results
    const finalResults = validResults.slice(0, 4);
    
    // Step 6: Format with AI (cheap nano model)
    const formatted = await formatWithAI(finalResults);
    
    console.log(`[Scraper] Returning ${formatted.results?.length || 0} results`);
    
    return new Response(
      JSON.stringify({ success: true, data: formatted, citations: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Scraper] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
