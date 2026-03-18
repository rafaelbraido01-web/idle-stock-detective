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
  const structuredPrices: number[] = [];
  const textPrices: number[] = [];
  let match;

  // 1. JSON-LD / structured data (most reliable — represents the actual product price)
  // Try to extract from full JSON-LD blocks first
  const jsonLdBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLdBlocks) {
    const content = block.replace(/<\/?script[^>]*>/gi, '');
    try {
      const data = JSON.parse(content);
      const extractFromObj = (obj: any) => {
        if (!obj) return;
        const price = obj?.offers?.price ?? obj?.offers?.lowPrice ?? obj?.offers?.highPrice;
        if (price) {
          const val = parseFloat(String(price));
          if (val > 50 && val < 100000) structuredPrices.push(val);
        }
        // Check array of offers
        if (Array.isArray(obj?.offers)) {
          for (const offer of obj.offers) {
            const p = offer?.price ?? offer?.lowPrice;
            if (p) {
              const val = parseFloat(String(p));
              if (val > 50 && val < 100000) structuredPrices.push(val);
            }
          }
        }
      };
      if (Array.isArray(data)) {
        data.forEach(extractFromObj);
      } else {
        extractFromObj(data);
      }
    } catch {
      // Fallback: regex on JSON-LD content
      const priceMatch = content.match(/"price":\s*"?(\d+\.?\d*)"?/);
      if (priceMatch) {
        const val = parseFloat(priceMatch[1]);
        if (val > 50 && val < 100000) structuredPrices.push(val);
      }
    }
  }

  // 2. data-price attributes
  const dataPricePattern = /data-price="(\d+\.?\d*)"/g;
  while ((match = dataPricePattern.exec(html)) !== null) {
    const val = parseFloat(match[1]);
    if (val > 50 && val < 100000) structuredPrices.push(val);
  }

  // If we got structured prices, prefer those (they represent the actual product price, not installments)
  if (structuredPrices.length > 0) {
    return structuredPrices;
  }

  // 3. Fallback: R$ text prices — but filter out installment values
  // We look for R$ prices that are NOT preceded by installment context (e.g., "10x de", "12x de")
  const rPattern = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  while ((match = rPattern.exec(html)) !== null) {
    const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
    if (val < 50 || val > 100000) continue;

    // Check context around the match — skip if it looks like an installment
    const contextStart = Math.max(0, match.index - 30);
    const context = html.substring(contextStart, match.index).toLowerCase();
    const isInstallment = /\d+x\s*(?:de|sem)/.test(context) || /parcela/.test(context);
    
    if (!isInstallment) {
      textPrices.push(val);
    }
  }

  return textPrices;
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
    /[A-Z0-9]{2,}[-][A-Z0-9]+(?:[-\.][A-Z0-9]+)*/gi, // H610M-H, 24MS500-B.AWZM
    /[A-Z]{2,}\d+[A-Z0-9\/\-]*/gi, // KVR32N22S6/8, SWG256G
    /i[3579]-?\d{4,5}[A-Z]*/gi, // i5-12400, i7-13700K
  ];

  for (const p of patterns) {
    const matches = productName.match(p);
    if (matches) models.push(...matches);
  }

  return [...new Set(models)]
    .map(m => m.trim())
    .filter(m => m.length >= 4);
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

  if (matchRatio < 0.25) {
    console.log(`[Validation] REJECTED: low relevance (${matchCount}/${significantWords.length}) for "${title.substring(0, 80)}"`);
    return false;
  }

  return true;
}

function extractTrustedUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const patterns = [
    /href="\/url\?q=(https?[^&"]+)/g,
    /href="(https?:\/\/(?:www\.)?(?:kabum|mercadolivre|amazon|magazineluiza|pichau)[^"]+)"/g,
    /"url":"(https?:\\\/\\\/(?:www\\\.)?(?:kabum|mercadolivre|amazon|magazineluiza|pichau)[^"]+)"/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const raw = match[1].replace(/\\\//g, '/');
      const decoded = decodeURIComponent(raw);
      if (isValidProductUrl(decoded) && !urls.includes(decoded)) {
        urls.push(decoded);
      }
    }
  }

  return urls.slice(0, 5);
}

async function searchEngine(url: string, query: string, source: string): Promise<string[]> {
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
      console.error(`${source} search failed: ${response.status}`);
      return [];
    }

    const html = await response.text();

    // Google frequently returns CAPTCHA in server-side environments
    if (source === 'Google' && (html.includes('/sorry/index') || html.includes('g-recaptcha'))) {
      console.log(`[Search] Google CAPTCHA detected for query "${query}"`);
      return [];
    }

    return extractTrustedUrlsFromHtml(html);
  } catch (err) {
    console.error(`${source} search error for "${query}":`, err);
    return [];
  }
}

// ── Search: Google first, then free HTML fallbacks if blocked ──
async function searchGoogle(query: string): Promise<string[]> {
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=br&num=5`;
  const googleResults = await searchEngine(googleUrl, query, 'Google');
  if (googleResults.length > 0) return googleResults;

  const duckUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const duckResults = await searchEngine(duckUrl, query, 'DuckDuckGo');
  if (duckResults.length > 0) return duckResults;

  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=5&setlang=pt-BR`;
  return await searchEngine(bingUrl, query, 'Bing');
}

// ── Fallback: scrape product links directly from store search pages ──
function extractProductLinksByStore(html: string, store: string): string[] {
  const links = new Set<string>();

  const addMatches = (regex: RegExp) => {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const raw = match[1].replace(/\\\//g, '/');
      const decoded = decodeURIComponent(raw);
      if (isValidProductUrl(decoded)) links.add(decoded);
    }
  };

  switch (store) {
    case 'kabum':
      addMatches(/"(https?:\/\/www\.kabum\.com\.br\/(?:produto|p)\/[^"]+)"/g);
      break;
    case 'mercadolivre':
      addMatches(/"(https?:\/\/(?:produto\.)?mercadolivre\.com\.br\/[^"]*MLB-[^"]+)"/g);
      break;
    case 'amazon':
      addMatches(/"(https?:\/\/www\.amazon\.com\.br\/(?:gp\/product|dp)\/[A-Z0-9]{8,15}[^"]*)"/g);
      break;
    case 'magalu':
      addMatches(/"(https?:\/\/www\.magazineluiza\.com\.br\/[^"]+\/p\/[^"]+)"/g);
      break;
    case 'pichau':
      addMatches(/"(https?:\/\/www\.pichau\.com\.br\/(?:produto|product)\/[^"]+)"/g);
      break;
  }

  return Array.from(links).slice(0, 3);
}

async function searchStoresDirectly(searchTerm: string): Promise<string[]> {
  const stores = [
    { name: 'kabum', url: `https://www.kabum.com.br/busca/${encodeURIComponent(searchTerm)}` },
    { name: 'mercadolivre', url: `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm)}` },
    { name: 'amazon', url: `https://www.amazon.com.br/s?k=${encodeURIComponent(searchTerm)}` },
    { name: 'magalu', url: `https://www.magazineluiza.com.br/busca/${encodeURIComponent(searchTerm)}` },
    { name: 'pichau', url: `https://www.pichau.com.br/search?q=${encodeURIComponent(searchTerm)}` },
  ];

  const urls = new Set<string>();

  await Promise.all(
    stores.map(async ({ name, url }) => {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'pt-BR,pt;q=0.9',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) return;
        const html = await response.text();
        const extracted = extractProductLinksByStore(html, name);
        extracted.forEach((u) => urls.add(u));
      } catch {
        // silent
      }
    })
  );

  return Array.from(urls).slice(0, 8);
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
    
    // Use the median price (avoids picking installment values or inflated prices)
    const sorted = [...prices].sort((a, b) => a - b);
    const price = sorted[Math.floor(sorted.length / 2)];
    
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
    
    // Extract model codes from name for better search queries
    const modelCodes = extractModelCodes(productName);
    const genericModelTokens = new Set(['DDR3', 'DDR4', 'DDR5', 'SSD', 'NVME', 'M2', 'PCIE', 'IPS', 'LED']);
    const bestModel = modelCodes
      .filter((m) => !genericModelTokens.has(m.toUpperCase()))
      .sort((a, b) => b.length - a.length)[0];

    const searchTerm = bestModel || productName.split(' ').slice(0, 5).join(' ');
    const isInternalCode = productCode && !isManufacturerCode(productCode);
    
    // Step 1: Generate search queries - use product name for internal codes
    const queries = isInternalCode
      ? [
          `${searchTerm} site:kabum.com.br`,
          `${searchTerm} site:mercadolivre.com.br`,
          `${searchTerm} site:amazon.com.br`,
          `${productName} preço comprar`,
        ]
      : [
          `${productCode} site:kabum.com.br`,
          `${productCode} site:mercadolivre.com.br`,
          `${productCode} site:amazon.com.br`,
          `${productName} ${productCode} preço`,
        ];
    const filteredQueries = queries.filter(q => q.trim());
    
    // Step 2: Search Google in parallel
    console.log(`[Scraper] Running ${filteredQueries.length} searches (internal=${isInternalCode}, searchTerm="${searchTerm}")...`);
    const searchResults = await Promise.all(filteredQueries.map(q => searchGoogle(q)));
    
    // Flatten and deduplicate URLs
    const allUrls = new Set<string>();
    for (const urls of searchResults) {
      for (const url of urls) {
        allUrls.add(url);
      }
    }
    
    let uniqueUrls = Array.from(allUrls).slice(0, 8);

    // Fallback when search engines return no links
    if (uniqueUrls.length === 0) {
      console.log(`[Scraper] No URLs from search engines. Trying direct store search...`);
      uniqueUrls = await searchStoresDirectly(searchTerm);
    }

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
