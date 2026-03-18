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

const BLOCKED_PATH_PATTERNS = ['/categoria', '/b/', '/busca', '/search', '/listing', '/s?k='];
const BLOCKED_HOSTNAME_PATTERNS = ['sacola.magazineluiza', 'sacola.magazinevoce', 'carrinho.', 'checkout.', 'login.'];
const FETCH_TIMEOUT = 8000;

// ── Known brands for relevance scoring ──
const KNOWN_BRANDS = [
  'kingston', 'crucial', 'corsair', 'hyperx', 'samsung', 'wd', 'western digital',
  'seagate', 'sandisk', 'intel', 'amd', 'nvidia', 'gigabyte', 'asus', 'msi',
  'asrock', 'evga', 'zotac', 'galax', 'pny', 'adata', 'patriot', 'gskill',
  'g.skill', 'lexar', 'winmemory', 'rise', 'redragon', 'logitech', 'razer',
  'lg', 'dell', 'aoc', 'benq', 'philips', 'elgscreen', 'multilaser', 'pcyes',
  'deepcool', 'cooler master', 'nzxt', 'thermaltake', 'gamemax', 'aerocool',
  'tp-link', 'intelbras', 'mercusys', 'tenda', 'dlink', 'edifier', 'jbl',
  'epson', 'brother', 'hp', 'lenovo', 'acer', 'positivo', 'vaio',
  'hiksemi', 'hikvision', 'duex', 'brazil pc', 'bluecase', 'knup', 'vinik',
  'elgin', 'bematech', 'toshiba', 'hbuster', 'philco',
];

// ── Product types/categories ──
const PRODUCT_TYPES = [
  'ssd', 'hd', 'nvme', 'sata', 'ddr4', 'ddr5', 'ddr3', 'ram', 'memoria',
  'processador', 'cpu', 'placa de video', 'gpu', 'placa mae', 'motherboard',
  'fonte', 'gabinete', 'monitor', 'teclado', 'mouse', 'headset', 'cooler',
  'notebook', 'desktop', 'impressora', 'roteador', 'switch', 'cabo', 'adaptador',
  'ips', 'led', 'pcie', 'm.2', '2280', 'fullhd', '4k',
];

// ── URL helpers ──
function isValidProductUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace('www.', '');
    const isTrusted = TRUSTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
    if (!isTrusted) return false;
    const path = parsed.pathname.toLowerCase();
    if (BLOCKED_PATH_PATTERNS.some(p => path.includes(p))) return false;
    if (path === '/' || path === '') return false;
    // Mercado Livre: reject likely fabricated URLs
    if (hostname.includes('mercadolivre') || hostname.includes('mercadolibre')) {
      if (!isValidMercadoLivreUrl(url)) return false;
    }
    // Kabum: URLs must have numeric product IDs
    if (hostname.includes('kabum')) {
      if (!isValidKabumUrl(url)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Mercado Livre URLs must match real patterns:
// - produto.mercadolivre.com.br/MLB-XXXXXXXXX-description-...
// - www.mercadolivre.com.br/produto-nome/p/MLBXXXXXXXXX
// Reject: /p/MLB1234567890 (sequential digits = fabricated by AI)
function isValidMercadoLivreUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    
    // Pattern 1: produto.mercadolivre.com.br/MLB-XXXXXXX-...
    if (parsed.hostname.includes('produto.') && /\/MLB-?\d{6,}/.test(path)) {
      // Reject sequential/round numbers (likely fabricated)
      const mlbMatch = path.match(/MLB-?(\d+)/);
      if (mlbMatch && isLikelyFabricatedMLB(mlbMatch[1])) return false;
      return true;
    }
    
    // Pattern 2: mercadolivre.com.br/.../p/MLBXXXXXXX
    if (/\/p\/MLB\d{6,}/.test(path)) {
      const mlbMatch = path.match(/MLB(\d+)/);
      if (mlbMatch && isLikelyFabricatedMLB(mlbMatch[1])) return false;
      return true;
    }
    
    // Pattern 3: mercadolivre.com.br/product-slug (with meaningful slug)
    if (path.split('/').filter(Boolean).length >= 1 && path.length > 20) {
      return true;
    }
    
    console.log(`[ML URL] Rejected non-matching pattern: ${url}`);
    return false;
  } catch {
    return false;
  }
}

function isLikelyFabricatedMLB(digits: string): boolean {
  // Round numbers like 1234567890 or 1000000000 are AI hallucinations
  if (/^(\d)\1+$/.test(digits)) return true; // all same digit
  if (/^1234567/.test(digits)) return true; // sequential
  if (/0{4,}$/.test(digits)) return true; // ends in many zeros
  // Check if it looks too "clean" - real MLB IDs are random-ish
  if (/^\d{10}$/.test(digits) && digits.endsWith('0000')) return true;
  return false;
}

// Kabum URLs must have numeric product IDs: /produto/123456/slug
function isValidKabumUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    // Valid: /produto/186763/... or /produto/186763
    if (/\/produto\/\d+/.test(path)) return true;
    console.log(`[Kabum URL] Rejected non-numeric ID: ${url}`);
    return false;
  } catch {
    return false;
  }
}

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
      if (Array.isArray(data)) data.forEach(extractFromObj);
      else extractFromObj(data);
    } catch {
      const priceMatch = content.match(/"price":\s*"?(\d+\.?\d*)"?/);
      if (priceMatch) {
        const val = parseFloat(priceMatch[1]);
        if (val > 50 && val < 100000) structuredPrices.push(val);
      }
    }
  }

  const dataPricePattern = /data-price="(\d+\.?\d*)"/g;
  while ((match = dataPricePattern.exec(html)) !== null) {
    const val = parseFloat(match[1]);
    if (val > 50 && val < 100000) structuredPrices.push(val);
  }

  if (structuredPrices.length > 0) return structuredPrices;

  const rPattern = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  while ((match = rPattern.exec(html)) !== null) {
    const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
    if (val < 50 || val > 100000) continue;
    const contextStart = Math.max(0, match.index - 30);
    const context = html.substring(contextStart, match.index).toLowerCase();
    const isInstallment = /\d+x\s*(?:de|sem)/.test(context) || /parcela/.test(context);
    if (!isInstallment) textPrices.push(val);
  }

  return textPrices;
}

// ── Title extraction ──
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1]
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ')
      .trim().substring(0, 200);
  }
  const ogMatch = html.match(/property="og:title"\s+content="([^"]+)"/i)
    || html.match(/content="([^"]+)"\s+property="og:title"/i);
  if (ogMatch) return ogMatch[1].trim().substring(0, 200);
  return '';
}

// ── Availability detection ──
function isProductAvailable(html: string): boolean {
  const jsonLdBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLdBlocks) {
    const content = block.replace(/<\/?script[^>]*>/gi, '');
    try {
      const data = JSON.parse(content);
      const checkAvail = (obj: any) => {
        const avail = obj?.offers?.availability || '';
        if (avail.includes('OutOfStock') || avail.includes('Discontinued')) return false;
        if (Array.isArray(obj?.offers)) {
          return !obj.offers.every((o: any) =>
            (o.availability || '').includes('OutOfStock') || (o.availability || '').includes('Discontinued')
          );
        }
        return true;
      };
      if (Array.isArray(data)) {
        if (data.some(d => !checkAvail(d))) return false;
      } else if (!checkAvail(data)) return false;
    } catch { /* ignore */ }
  }

  const unavailPatterns = [
    'produto indisponível', 'produto esgotado', 'out of stock',
    'item indisponível', 'não disponível', 'produto não encontrado',
    'este produto está esgotado', 'avise-me quando chegar',
  ];
  const bodyMatch = html.match(/<body[\s\S]*<\/body>/i);
  if (bodyMatch) {
    const bodyLower = bodyMatch[0].toLowerCase();
    for (const pattern of unavailPatterns) {
      if (bodyLower.includes(pattern)) return false;
    }
  }

  return true;
}

// ── Model/code helpers ──
function isManufacturerCode(code: string): boolean {
  return /[a-zA-Z]/.test(code) || /[\/\-]/.test(code);
}

function codeMatchesExact(title: string, code: string): boolean {
  if (!code) return false;
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, 'i');
  return regex.test(title);
}

function extractModelCodes(productName: string): string[] {
  const models: string[] = [];
  const patterns = [
    /[A-Z0-9]{2,}[-][A-Z0-9]+(?:[-\.][A-Z0-9]+)*/gi,  // SA400S37-480G, SWG256G-412H
    /[A-Z]{2,}\d+[A-Z0-9\/\-]*/gi,                      // DDR4, MK120, LS24D300GALMZD
    /[A-Z]\d{3,}[A-Z][A-Z0-9]*/gi,                      // B760M, H610M, Z790, B550M
    /i[3579]-?\d{4,5}[A-Z]*/gi,                          // i5-12400, i7-13700K
    /[A-Z]{1,2}\d{2,}[A-Z]\d+[A-Z0-9]*/gi,              // ST8000VE001, BX8071512400
  ];
  for (const p of patterns) {
    const matches = productName.match(p);
    if (matches) models.push(...matches);
  }
  return [...new Set(models)].map(m => m.trim()).filter(m => m.length >= 4);
}

// ── Extract product attributes from name ──
function extractProductAttributes(productName: string) {
  const nameLower = productName.toLowerCase();
  const brand = KNOWN_BRANDS.find(b => nameLower.includes(b)) || '';
  const capacityMatch = nameLower.match(/(\d+\s*(?:gb|tb|mb))/i);
  const capacity = capacityMatch ? capacityMatch[1].replace(/\s+/g, '') : '';
  const typeMatches: string[] = [];
  for (const t of PRODUCT_TYPES) {
    if (nameLower.includes(t)) typeMatches.push(t);
  }
  const specMatches = nameLower.match(/\d+\s*(?:ghz|mhz|w|"|\'|mm)/gi) || [];
  return { brand, capacity, types: typeMatches, specs: specMatches };
}

// ── RELEVANCE SCORING SYSTEM ──
function calculateRelevanceScore(
  title: string,
  productCode: string,
  productName: string,
): { score: number; details: string } {
  const titleLower = title.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  const modelCodes = extractModelCodes(productName);
  const genericTokens = new Set(['DDR3', 'DDR4', 'DDR5', 'SSD', 'NVME', 'M2', 'PCIE', 'IPS', 'LED', 'SATA', 'SATA3']);
  const significantModels = modelCodes.filter(m => !genericTokens.has(m.toUpperCase()));

  if (productCode && isManufacturerCode(productCode) && codeMatchesExact(titleLower, productCode)) {
    score += 50;
    reasons.push(`+50 code="${productCode}"`);
  } else if (significantModels.some(m => codeMatchesExact(titleLower, m))) {
    score += 50;
    reasons.push(`+50 model match`);
  }

  const attrs = extractProductAttributes(productName);
  if (attrs.brand && titleLower.includes(attrs.brand)) {
    score += 30;
    reasons.push(`+30 brand="${attrs.brand}"`);
  }

  if (attrs.capacity && titleLower.includes(attrs.capacity)) {
    score += 20;
    reasons.push(`+20 capacity="${attrs.capacity}"`);
  }

  const typeMatch = attrs.types.filter(t => titleLower.includes(t));
  if (typeMatch.length > 0) {
    score += 10;
    reasons.push(`+10 type="${typeMatch[0]}"`);
  }

  // PENALTY: spec mismatch
  const nameLower = productName.toLowerCase();
  const nameSpecs = nameLower.match(/\d+\s*(?:gb|tb|ghz|mhz|w)/gi) || [];
  const titleSpecs = titleLower.match(/\d+\s*(?:gb|tb|ghz|mhz|w)/gi) || [];
  if (nameSpecs.length > 0) {
    const nameNorm = nameSpecs.map(s => s.replace(/\s+/g, ''));
    const titleNorm = titleSpecs.map(s => s.replace(/\s+/g, ''));
    const mismatched = nameNorm.filter(s => !titleNorm.includes(s));
    if (mismatched.length > 0) {
      score -= 20;
      reasons.push(`-20 spec mismatch: ${mismatched.join(',')}`);
    }
  }

  return { score, details: reasons.join(' | ') };
}

// ── PERPLEXITY SEARCH (PRIMARY) ──
async function searchWithPerplexity(
  productName: string,
  productCode: string,
): Promise<{ urls: string[]; perplexityResults: Array<{ url: string; price: number; name: string }> }> {
  const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) {
    console.log('[Perplexity] No API key configured');
    return { urls: [], perplexityResults: [] };
  }

  const attrs = extractProductAttributes(productName);
  const modelCodes = extractModelCodes(productName);
  const genericTokens = new Set(['DDR3', 'DDR4', 'DDR5', 'SSD', 'NVME', 'M2', 'PCIE', 'IPS', 'LED', 'SATA', 'SATA3']);
  const bestModel = modelCodes.filter(m => !genericTokens.has(m.toUpperCase())).sort((a, b) => b.length - a.length)[0] || '';

  // Build search query with fallback terms
  const codeOrModel = (productCode && isManufacturerCode(productCode)) ? productCode : bestModel;
  let searchQuery = productName;
  if (codeOrModel) {
    searchQuery = `${codeOrModel} ${productName}`;
  }

  const prompt = `Encontre o produto "${searchQuery}" para comprar no Brasil.

INSTRUÇÕES:
- Retorne URLs REAIS de páginas de produto (NÃO de busca/listagem) com o preço atual
- Priorize: KaBuM, Mercado Livre, Amazon Brasil, Magazine Luiza, Pichau
- Para cada resultado, forneça: url, nome do produto na loja, preço em reais
- Retorne apenas produtos DISPONÍVEIS para compra
- Se não encontrar o modelo exato, busque variantes similares da mesma marca e especificação
${attrs.brand ? `- Marca: ${attrs.brand.toUpperCase()}` : ''}
${attrs.capacity ? `- Especificação: ${attrs.capacity.toUpperCase()}` : ''}
${codeOrModel ? `- Código/Modelo: ${codeOrModel}` : ''}

FORMATO JSON (retorne APENAS o JSON, sem markdown):
{"products": [{"url": "https://...", "name": "Nome do Produto", "price": 299.90}]}`;

  try {
    console.log(`[Perplexity] Searching: "${searchQuery.substring(0, 80)}"`);

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'Você é um assistente de pesquisa de preços de produtos de tecnologia no Brasil. Retorne APENAS JSON válido sem markdown.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        search_domain_filter: [
          'kabum.com.br',
          'mercadolivre.com.br',
          'amazon.com.br',
          'magazineluiza.com.br',
          'pichau.com.br',
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[Perplexity] API error ${response.status}: ${body.substring(0, 200)}`);
      return { urls: [], perplexityResults: [] };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    console.log(`[Perplexity] Response length: ${content.length}, citations: ${citations.length}`);

    // Extract URLs from citations
    const citationUrls = (citations as string[]).filter(u => isValidProductUrl(u));

    // Try to parse JSON response for structured data
    const perplexityResults: Array<{ url: string; price: number; name: string }> = [];
    try {
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) jsonStr = objMatch[0];
      
      const parsed = JSON.parse(jsonStr);
      const products = parsed.products || parsed.results || [];
      
      for (const p of products) {
        if (p.url && p.price && typeof p.price === 'number' && p.price > 50 && p.price < 100000) {
          perplexityResults.push({
            url: p.url,
            price: p.price,
            name: p.name || '',
          });
        }
      }
      console.log(`[Perplexity] Parsed ${perplexityResults.length} structured results`);
    } catch {
      console.log(`[Perplexity] Could not parse structured JSON, using citations only`);
    }

    // Also extract URLs from the text content
    const urlPattern = /https?:\/\/(?:www\.)?(?:kabum|mercadolivre|produto\.mercadolivre|amazon|magazineluiza|pichau)[^\s\)\"',\]]+/gi;
    const textUrls = (content.match(urlPattern) || []).filter(u => isValidProductUrl(u));

    // Merge all URLs
    const allUrls = new Set<string>();
    citationUrls.forEach(u => allUrls.add(u));
    textUrls.forEach(u => allUrls.add(u));
    perplexityResults.forEach(p => { if (isValidProductUrl(p.url)) allUrls.add(p.url); });

    console.log(`[Perplexity] Total unique URLs: ${allUrls.size} (citations: ${citationUrls.length}, text: ${textUrls.length}, structured: ${perplexityResults.length})`);

    return {
      urls: Array.from(allUrls),
      perplexityResults,
    };
  } catch (err) {
    console.error('[Perplexity] Error:', err);
    return { urls: [], perplexityResults: [] };
  }
}

// ── Kabum API search ──
async function searchKabumAPI(searchTerm: string, productName: string, productCode: string): Promise<Array<{
  source: string; productName: string; price: number; url: string; score: number;
}>> {
  const results: Array<{ source: string; productName: string; price: number; url: string; score: number }> = [];

  // Try multiple endpoints
  const endpoints = [
    `https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products?query=${encodeURIComponent(searchTerm)}&page_size=5&page_number=1`,
    `https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v1/products?query=${encodeURIComponent(searchTerm)}&page_size=5`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://www.kabum.com.br',
          'Referer': 'https://www.kabum.com.br/',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!response.ok) {
        console.log(`[KabumAPI] ${endpoint.includes('v2') ? 'v2' : 'v1'} failed: ${response.status}`);
        await response.text();
        continue;
      }

      const data = await response.json();
      const products = data?.data || data?.products || data?.items || [];

      for (const product of products) {
        const name = product.name || product.title || '';
        const price = parseFloat(product.priceWithDiscount || product.price || product.oldPrice || product.offer_price || '0');
        const code = product.code || product.id || '';
        const slug = product.slug || '';

        if (!name || price <= 50 || price > 100000) continue;
        if (product.available === false || product.quantity === 0) continue;

        // Kabum product IDs must be numeric
        if (!code || !/^\d+$/.test(String(code))) {
          console.log(`[KabumAPI] Skipping non-numeric code: "${code}" for "${name}"`);
          continue;
        }

        const url = slug
          ? `https://www.kabum.com.br/produto/${code}/${slug}`
          : `https://www.kabum.com.br/produto/${code}`;
        const { score, details } = calculateRelevanceScore(name, productCode, productName);

        if (score >= 60) {
          console.log(`[KabumAPI] ACCEPTED: "${name}" R$${price} score=${score} (${details})`);
          results.push({ source: 'Kabum', productName: name, price, url, score });
        } else {
          console.log(`[KabumAPI] REJECTED: "${name}" score=${score} (${details})`);
        }
      }

      if (results.length > 0) break; // Got results from this endpoint
    } catch (err) {
      console.error('[KabumAPI] Error:', err);
    }
  }

  return results;
}

// ── Concurrency limiter ──
async function withConcurrencyLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

// ── Blocked/invalid title patterns ──
const INVALID_TITLE_PATTERNS = [
  'recaptcha', 'captcha', 'ícone facebook', 'icon facebook', 'acesse para continuar',
  'just a moment', 'checking your browser', 'access denied', 'forbidden',
  'page not found', '404', 'erro', 'error', 'blocked',
];

function isValidTitle(title: string): boolean {
  if (!title || title.length < 5) return false;
  const lower = title.toLowerCase().trim();
  // Reject known invalid titles
  if (INVALID_TITLE_PATTERNS.some(p => lower.includes(p))) return false;
  // Reject generic store-only titles
  if (/^magazine luiza\s*\|?\s*pra voc/i.test(lower)) return false;
  if (/^kabum\s*$/i.test(lower)) return false;
  if (/^amazon\.com\.br/i.test(lower)) return false;
  if (/^pichau/i.test(lower)) return false;
  return true;
}

// ── Firecrawl scraping (JS rendering) ──
async function scrapeWithFirecrawl(url: string): Promise<{ html: string; markdown: string; metadataTitle: string } | null> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    console.log('[Firecrawl] No API key configured, skipping');
    return null;
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['html', 'markdown'],
        onlyMainContent: false,
        waitFor: 2000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const body = await response.text();
      console.log(`[Firecrawl] Failed ${url}: ${response.status} (${elapsed}ms) ${body.substring(0, 100)}`);
      return null;
    }

    const data = await response.json();
    const html = data?.data?.html || data?.html || '';
    const markdown = data?.data?.markdown || data?.markdown || '';
    const metadataTitle = data?.data?.metadata?.title || data?.metadata?.title || '';

    console.log(`[Firecrawl] OK ${url} (${elapsed}ms) html=${html.length}b md=${markdown.length}b title="${metadataTitle.substring(0, 60)}"`);
    return { html, markdown, metadataTitle };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.log(`[Firecrawl] Error ${url} (${elapsed}ms): ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── Fallback: simple fetch scraping ──
async function scrapeWithFetch(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.log(`[Fetch Fallback] Failed ${url}: ${response.status}`);
      await response.text();
      return null;
    }

    return await response.text();
  } catch (err) {
    console.log(`[Fetch Fallback] Error ${url}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── Scrape a product page (Firecrawl + fallback) ──
async function scrapePageWithFirecrawl(
  url: string,
  productCode: string,
  productName: string,
  perplexityPrice?: number,
): Promise<{ source: string; productName: string; price: number; url: string; score: number } | null> {
  try {
    // 1. Try Firecrawl first (JS rendering)
    let html = '';
    let markdown = '';
    let metadataTitle = '';
    const firecrawlResult = await scrapeWithFirecrawl(url);

    if (firecrawlResult) {
      html = firecrawlResult.html;
      markdown = firecrawlResult.markdown;
      metadataTitle = firecrawlResult.metadataTitle;
    } else {
      // 2. Fallback to simple fetch
      console.log(`[Scrape] Falling back to simple fetch for ${url}`);
      const fetchHtml = await scrapeWithFetch(url);
      if (fetchHtml) {
        html = fetchHtml;
      }
    }

    const content = html || markdown;
    if (!content || content.length < 100) {
      console.log(`[Scrape] No usable content for ${url} (${content.length}b)`);
      if (perplexityPrice && perplexityPrice > 50) {
        const source = getSourceName(url);
        console.log(`[Scrape] Using Perplexity price R$${perplexityPrice} for ${source} (no content)`);
        return { source, productName: productName.substring(0, 100), price: perplexityPrice, url, score: 50 };
      }
      return null;
    }

    // ── Title extraction: prioritize Firecrawl metadata → og:title → HTML title → markdown heading ──
    let title = '';

    // 1. Firecrawl metadata title (most reliable, from rendered page)
    if (metadataTitle && isValidTitle(metadataTitle)) {
      title = metadataTitle.substring(0, 200);
      console.log(`[Title] Using Firecrawl metadata: "${title.substring(0, 60)}"`);
    }

    // 2. og:title from HTML
    if (!title && html) {
      const ogMatch = html.match(/property="og:title"\s+content="([^"]+)"/i)
        || html.match(/content="([^"]+)"\s+property="og:title"/i);
      if (ogMatch && isValidTitle(ogMatch[1])) {
        title = ogMatch[1].trim().substring(0, 200);
        console.log(`[Title] Using og:title: "${title.substring(0, 60)}"`);
      }
    }

    // 3. HTML <title> tag
    if (!title && html) {
      const htmlTitle = extractTitle(html);
      if (htmlTitle && isValidTitle(htmlTitle)) {
        title = htmlTitle;
        console.log(`[Title] Using HTML title: "${title.substring(0, 60)}"`);
      }
    }

    // 4. First markdown heading
    if (!title && markdown) {
      const mdHeading = markdown.match(/^#\s+(.+)/m);
      if (mdHeading && isValidTitle(mdHeading[1])) {
        title = mdHeading[1].trim().substring(0, 200);
        console.log(`[Title] Using markdown heading: "${title.substring(0, 60)}"`);
      }
    }

    // 5. Try product name from JSON-LD
    if (!title && html) {
      const jsonLdBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
      for (const block of jsonLdBlocks) {
        try {
          const data = JSON.parse(block.replace(/<\/?script[^>]*>/gi, ''));
          const name = data?.name || (Array.isArray(data) ? data.find((d: any) => d.name)?.name : '');
          if (name && isValidTitle(name)) {
            title = name.substring(0, 200);
            console.log(`[Title] Using JSON-LD name: "${title.substring(0, 60)}"`);
            break;
          }
        } catch { /* ignore */ }
      }
    }

    if (!title) {
      console.log(`[Scrape] No valid title at ${url}`);
      if (perplexityPrice && perplexityPrice > 50) {
        const source = getSourceName(url);
        console.log(`[Scrape] Using Perplexity price R$${perplexityPrice} for ${source} (no title)`);
        return { source, productName: productName.substring(0, 100), price: perplexityPrice, url, score: 50 };
      }
      return null;
    }

    // ── Availability check: HTML structured data + text patterns + markdown ──
    if (!isProductAvailable(content)) {
      console.log(`[Scrape] Unavailable (HTML): ${url}`);
      return null;
    }
    // Also check markdown for availability signals
    if (markdown) {
      const mdLower = markdown.toLowerCase();
      const unavailMd = ['produto indisponível', 'produto esgotado', 'out of stock',
        'item indisponível', 'não disponível', 'este produto está esgotado',
        'avise-me quando chegar', 'produto não encontrado'];
      if (unavailMd.some(p => mdLower.includes(p))) {
        console.log(`[Scrape] Unavailable (markdown): ${url}`);
        return null;
      }
    }

    const { score, details } = calculateRelevanceScore(title, productCode, productName);
    if (score < 60) {
      console.log(`[Scoring] REJECTED: score=${score} (${details}) "${title.substring(0, 80)}" @ ${url}`);
      if (score >= 30 && perplexityPrice && perplexityPrice > 50) {
        const prices = extractPrices(content);
        const finalPrice = prices.length > 0
          ? prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]
          : perplexityPrice;
        console.log(`[Scoring] SOFT ACCEPT via Perplexity hint: score=${score}, price=R$${finalPrice}`);
        return { source: getSourceName(url), productName: title, price: finalPrice, url, score: Math.max(score, 40) };
      }
      return null;
    }

    // ── Price extraction: HTML JSON-LD/text → markdown R$ patterns ──
    let prices = extractPrices(content);
    if (prices.length === 0 && markdown) {
      const rPattern = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/g;
      let match;
      while ((match = rPattern.exec(markdown)) !== null) {
        const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        if (val > 50 && val < 100000) {
          // Check context for installment in markdown
          const contextStart = Math.max(0, match.index - 40);
          const context = markdown.substring(contextStart, match.index).toLowerCase();
          if (!/\d+x\s*(?:de|sem)/.test(context) && !/parcela/.test(context)) {
            prices.push(val);
          }
        }
      }
    }

    if (prices.length === 0) {
      if (perplexityPrice && perplexityPrice > 50) {
        console.log(`[Scrape] No price extracted, using Perplexity price R$${perplexityPrice}`);
        return { source: getSourceName(url), productName: title, price: perplexityPrice, url, score };
      }
      console.log(`[Scrape] No price at ${url}`);
      return null;
    }

    const sorted = [...prices].sort((a, b) => a - b);
    // Use lowest non-outlier price (likely the discounted/à vista price)
    const price = sorted[0];

    console.log(`[Scoring] ACCEPTED: score=${score} (${details}) "${title.substring(0, 60)}" R$${price} (${sorted.length} prices found: ${sorted.slice(0, 4).join(', ')})`);
    return { source: getSourceName(url), productName: title, price, url, score };
  } catch (err) {
    console.error(`[Scrape] Error ${url}:`, err);
    return null;
  }
}

// ── Outlier removal ──
function removeOutliers(results: Array<{ source: string; productName: string; price: number; url: string; score: number }>) {
  if (results.length <= 2) return results;
  const prices = results.map(r => r.price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  return results.filter(r => r.price >= avg * 0.3 && r.price <= avg * 3);
}

// ── Deduplicate by source ──
function deduplicateBySource(results: Array<{ source: string; productName: string; price: number; url: string; score: number }>) {
  const seen = new Map<string, typeof results[0]>();
  for (const r of results) {
    const existing = seen.get(r.source);
    if (!existing || r.score > existing.score || (r.score === existing.score && r.price < existing.price)) {
      seen.set(r.source, r);
    }
  }
  return Array.from(seen.values());
}

// ── Mercado Livre direct search via Firecrawl ──
async function searchMercadoLivre(
  searchTerm: string,
  productName: string,
  productCode: string,
): Promise<Array<{ source: string; productName: string; price: number; url: string; score: number }>> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) return [];

  try {
    console.log(`[ML Search] Searching: "${searchTerm}"`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${searchTerm} site:mercadolivre.com.br`,
        limit: 5,
        lang: 'pt-br',
        country: 'br',
        scrapeOptions: { formats: ['markdown'] },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[ML Search] Failed: ${response.status} ${body.substring(0, 100)}`);
      return [];
    }

    const data = await response.json();
    const searchResults = data?.data || [];
    const results: Array<{ source: string; productName: string; price: number; url: string; score: number }> = [];

    for (const item of searchResults) {
      const url = item.url || '';
      const title = item.title || item.metadata?.title || '';
      const markdown = item.markdown || '';

      if (!url || !url.includes('mercadolivre.com.br')) continue;
      // Skip search/listing pages
      if (url.includes('/busca') || url.includes('/search') || url.includes('/categoria')) continue;
      
      if (!title || !isValidTitle(title)) continue;

      const { score, details } = calculateRelevanceScore(title, productCode, productName);
      if (score < 60) {
        console.log(`[ML Search] REJECTED: score=${score} (${details}) "${title.substring(0, 60)}"`);
        continue;
      }

      // Extract price from markdown
      let price = 0;
      const priceMatches: number[] = [];
      const rPattern = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/g;
      let match;
      while ((match = rPattern.exec(markdown)) !== null) {
        const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        if (val > 50 && val < 100000) {
          const ctxStart = Math.max(0, match.index - 40);
          const ctx = markdown.substring(ctxStart, match.index).toLowerCase();
          if (!/\d+x\s*(?:de|sem)/.test(ctx) && !/parcela/.test(ctx)) {
            priceMatches.push(val);
          }
        }
      }

      if (priceMatches.length > 0) {
        price = Math.min(...priceMatches);
      }

      if (price <= 50) {
        console.log(`[ML Search] No valid price for "${title.substring(0, 60)}"`);
        continue;
      }

      console.log(`[ML Search] ACCEPTED: score=${score} (${details}) "${title.substring(0, 60)}" R$${price}`);
      results.push({ source: 'Mercado Livre', productName: title, price, url, score });
      
      if (results.length >= 1) break; // Only need best ML result
    }

    return results;
  } catch (err) {
    console.error('[ML Search] Error:', err);
    return [];
  }
}


async function formatWithAI(rawResults: any[]): Promise<any> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey || rawResults.length === 0) return { results: rawResults };

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
      await response.text();
      return { results: rawResults };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
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

// ── MAIN HANDLER ──
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

    const attrs = extractProductAttributes(productName);
    const modelCodes = extractModelCodes(productName);
    const genericTokens = new Set(['DDR3', 'DDR4', 'DDR5', 'SSD', 'NVME', 'M2', 'PCIE', 'IPS', 'LED', 'SATA', 'SATA3']);
    const bestModel = modelCodes
      .filter(m => !genericTokens.has(m.toUpperCase()))
      .sort((a, b) => b.length - a.length)[0] || '';

    // Build Kabum search term
    const kabumTerm = bestModel
      || (productCode && isManufacturerCode(productCode) ? productCode : '')
      || (attrs.brand ? `${attrs.brand} ${attrs.capacity} ${attrs.types[0] || ''}`.trim() : productName.split(/\s+/).slice(0, 4).join(' '));

    // ── Run Perplexity + Kabum API + ML Search in parallel ──
    const mlSearchTerm = bestModel
      || (productCode && isManufacturerCode(productCode) ? productCode : '')
      || `${attrs.brand} ${attrs.capacity} ${attrs.types[0] || ''}`.trim()
      || productName.split(/\s+/).slice(0, 5).join(' ');

    const [perplexityData, kabumResults, mlResults] = await Promise.all([
      searchWithPerplexity(productName, productCode),
      searchKabumAPI(kabumTerm, productName, productCode),
      searchMercadoLivre(mlSearchTerm, productName, productCode),
    ]);

    console.log(`[Scraper] Perplexity: ${perplexityData.urls.length} URLs, ${perplexityData.perplexityResults.length} structured. Kabum API: ${kabumResults.length} results. ML: ${mlResults.length} results`);

    // ── Build price map from Perplexity structured results ──
    const perplexityPriceMap = new Map<string, number>();
    for (const pr of perplexityData.perplexityResults) {
      if (pr.url && pr.price) {
        perplexityPriceMap.set(pr.url, pr.price);
      }
    }

    // ── Filter out ML URLs from Perplexity (they're usually fabricated) ──
    const nonMlUrls = perplexityData.urls.filter(u => {
      const hostname = new URL(u).hostname.replace('www.', '');
      return !hostname.includes('mercadolivre') && !hostname.includes('mercadolibre');
    });

    // ── Scrape non-ML Perplexity URLs with Firecrawl (max 2 URLs, max 3 concurrent) ──
    const urlsToScrape = nonMlUrls.slice(0, 2);
    const scrapeTasks = urlsToScrape.map(url => () =>
      scrapePageWithFirecrawl(url, productCode, productName, perplexityPriceMap.get(url))
    );
    const scraped = await withConcurrencyLimit(scrapeTasks, 3);
    const validScraped = scraped.filter(Boolean) as Array<{ source: string; productName: string; price: number; url: string; score: number }>;

    console.log(`[Scraper] Scraped ${urlsToScrape.length} non-ML URLs → ${validScraped.length} valid results`);

    // ── Combine all results ──
    let allResults = [...kabumResults, ...mlResults, ...validScraped];

    // If scraping yielded nothing but Perplexity gave structured results (non-ML), use them
    if (validScraped.length === 0 && perplexityData.perplexityResults.length > 0) {
      console.log(`[Scraper] Scraping failed, using non-ML Perplexity structured results as fallback`);
      for (const pr of perplexityData.perplexityResults) {
        if (pr.price > 50 && pr.price < 100000 && pr.url) {
          const hostname = new URL(pr.url).hostname.replace('www.', '');
          // Skip ML results from Perplexity - we have our own ML search
          if (hostname.includes('mercadolivre') || hostname.includes('mercadolibre')) continue;
          const { score, details } = calculateRelevanceScore(pr.name || productName, productCode, productName);
          if (score >= 30) {
            allResults.push({
              source: getSourceName(pr.url),
              productName: pr.name || productName,
              price: pr.price,
              url: pr.url,
              score,
            });
            console.log(`[Perplexity Fallback] Added: "${pr.name}" R$${pr.price} score=${score} (${details})`);
          }
        }
      }
    }

    // ── Post-processing ──
    allResults = deduplicateBySource(allResults);
    allResults = removeOutliers(allResults);

    // Sort by priority then score
    const priority: Record<string, number> = {
      'Kabum': 1, 'Mercado Livre': 2, 'Amazon': 3, 'Magazine Luiza': 4, 'Pichau': 5,
    };
    allResults.sort((a, b) => {
      const pa = priority[a.source] || 99;
      const pb = priority[b.source] || 99;
      if (pa !== pb) return pa - pb;
      return b.score - a.score;
    });

    const finalResults = allResults.slice(0, 4).map(({ score, ...rest }) => rest);
    console.log(`[Scraper] Final: ${finalResults.length} results`);

    const formatted = await formatWithAI(finalResults);

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
