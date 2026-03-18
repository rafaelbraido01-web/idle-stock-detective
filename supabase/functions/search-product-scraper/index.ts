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

// Search pages allowed for link extraction but NOT as final results
const SEARCH_PATH_PATTERNS = ['/busca', '/search', '/listing', '/s?k='];
const BLOCKED_PATH_PATTERNS = ['/categoria', '/b/'];

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
function isSearchPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return SEARCH_PATH_PATTERNS.some(p => path.includes(p));
  } catch {
    return false;
  }
}

function isValidProductUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace('www.', '');
    const isTrusted = TRUSTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
    if (!isTrusted) return false;
    const path = parsed.pathname.toLowerCase();
    if (BLOCKED_PATH_PATTERNS.some(p => path.includes(p))) return false;
    if (path === '/' || path === '') return false;
    return true;
  } catch {
    return false;
  }
}

function isValidFinalUrl(url: string): boolean {
  return isValidProductUrl(url) && !isSearchPage(url);
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
  const htmlLower = html.toLowerCase();
  // Check JSON-LD availability
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

  // Check common unavailability patterns in HTML
  const unavailPatterns = [
    'produto indisponível', 'produto esgotado', 'out of stock',
    'item indisponível', 'não disponível', 'produto não encontrado',
    'este produto está esgotado', 'avise-me quando chegar',
  ];
  // Only flag if these appear prominently (not in random script tags)
  const bodyMatch = html.match(/<body[\s\S]*<\/body>/i);
  if (bodyMatch) {
    const bodyLower = bodyMatch[0].toLowerCase();
    for (const pattern of unavailPatterns) {
      if (bodyLower.includes(pattern)) {
        console.log(`[Availability] Product unavailable: found "${pattern}"`);
        return false;
      }
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
    /[A-Z0-9]{2,}[-][A-Z0-9]+(?:[-\.][A-Z0-9]+)*/gi,
    /[A-Z]{2,}\d+[A-Z0-9\/\-]*/gi,
    /i[3579]-?\d{4,5}[A-Z]*/gi,
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

  // Extract brand
  const brand = KNOWN_BRANDS.find(b => nameLower.includes(b)) || '';

  // Extract capacity/size specs (256GB, 8TB, 16GB, etc.)
  const capacityMatch = nameLower.match(/(\d+\s*(?:gb|tb|mb))/i);
  const capacity = capacityMatch ? capacityMatch[1].replace(/\s+/g, '') : '';

  // Extract type/technology
  const typeMatches: string[] = [];
  for (const t of PRODUCT_TYPES) {
    if (nameLower.includes(t)) typeMatches.push(t);
  }

  // Extract numeric specs (frequencies, sizes)
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
  const nameLower = productName.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  // +50: exact manufacturer code match
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

  // +30: brand match
  const attrs = extractProductAttributes(productName);
  if (attrs.brand && titleLower.includes(attrs.brand)) {
    score += 30;
    reasons.push(`+30 brand="${attrs.brand}"`);
  }

  // +20: capacity match
  if (attrs.capacity && titleLower.includes(attrs.capacity)) {
    score += 20;
    reasons.push(`+20 capacity="${attrs.capacity}"`);
  }

  // +10: type match (at least one product type)
  const typeMatch = attrs.types.filter(t => titleLower.includes(t));
  if (typeMatch.length > 0) {
    score += 10;
    reasons.push(`+10 type="${typeMatch[0]}"`);
  }

  // PENALTY: spec mismatch (e.g., 12400 vs 12400F, 256GB vs 512GB)
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

// ── FALLBACK QUERY BUILDER ──
function buildFallbackQueries(productName: string, productCode: string, level: number): string[] {
  const attrs = extractProductAttributes(productName);
  const modelCodes = extractModelCodes(productName);
  const genericTokens = new Set(['DDR3', 'DDR4', 'DDR5', 'SSD', 'NVME', 'M2', 'PCIE', 'IPS', 'LED', 'SATA', 'SATA3']);
  const bestModel = modelCodes
    .filter(m => !genericTokens.has(m.toUpperCase()))
    .sort((a, b) => b.length - a.length)[0];

  const isInternal = productCode && !isManufacturerCode(productCode);
  const codeOrModel = isInternal ? bestModel : productCode;

  switch (level) {
    case 1: {
      // Level 1: exact code/model
      if (!codeOrModel) return []; // skip to level 2
      return [
        `${codeOrModel} site:kabum.com.br`,
        `${codeOrModel} site:mercadolivre.com.br`,
        `${codeOrModel} site:amazon.com.br`,
        `${productName} ${codeOrModel} preço`,
      ];
    }
    case 2: {
      // Level 2: brand + capacity + type
      const parts: string[] = [];
      if (attrs.brand) parts.push(attrs.brand.toUpperCase());
      if (attrs.capacity) parts.push(attrs.capacity.toUpperCase());
      if (attrs.types.length > 0) parts.push(attrs.types[0].toUpperCase());
      if (parts.length < 2) {
        // Use first 4 words of product name if we can't extract enough
        parts.length = 0;
        parts.push(...productName.split(/\s+/).slice(0, 4));
      }
      const term = parts.join(' ');
      return [
        `${term} site:kabum.com.br`,
        `${term} site:mercadolivre.com.br`,
        `${term} preço comprar`,
      ];
    }
    case 3: {
      // Level 3: generic category
      const parts: string[] = [];
      if (attrs.types.length > 0) parts.push(attrs.types[0].toUpperCase());
      if (attrs.capacity) parts.push(attrs.capacity.toUpperCase());
      // Add more type context
      if (attrs.types.length > 1) parts.push(attrs.types[1].toUpperCase());
      // Fallback: first 5 words of name
      if (parts.length < 2) {
        parts.length = 0;
        parts.push(...productName.split(/\s+/).slice(0, 5));
      }
      const term = parts.join(' ');
      return [
        `${term} preço comprar`,
        `${term} site:kabum.com.br`,
      ];
    }
    default:
      return [];
  }
}

// ── URL extraction from search HTML ──
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
      // Allow search pages here — they'll be used for link extraction
      if (isValidProductUrl(decoded) && !urls.includes(decoded)) {
        urls.push(decoded);
      }
    }
  }

  return urls.slice(0, 8);
}

// ── Search engines ──
async function searchEngine(url: string, query: string, source: string): Promise<string[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!response.ok) {
      console.error(`${source} search failed: ${response.status}`);
      await response.text(); // consume body
      return [];
    }

    const html = await response.text();

    if (source === 'Google' && (html.includes('/sorry/index') || html.includes('g-recaptcha'))) {
      console.log(`[Search] Google CAPTCHA detected`);
      return [];
    }

    return extractTrustedUrlsFromHtml(html);
  } catch (err) {
    console.error(`${source} search error for "${query}":`, err);
    return [];
  }
}

async function searchAllEngines(query: string): Promise<string[]> {
  // Try all engines in parallel, merge results
  const [google, duck, bing] = await Promise.all([
    searchEngine(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=br&num=5`, query, 'Google'),
    searchEngine(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, query, 'DuckDuckGo'),
    searchEngine(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=5&setlang=pt-BR`, query, 'Bing'),
  ]);

  const all = new Set<string>();
  for (const u of [...google, ...duck, ...bing]) all.add(u);
  return Array.from(all);
}

// ── Kabum API search ──
async function searchKabumAPI(searchTerm: string, productName: string, productCode: string): Promise<Array<{
  source: string; productName: string; price: number; url: string; score: number;
}>> {
  const results: Array<{ source: string; productName: string; price: number; url: string; score: number }> = [];

  try {
    const response = await fetch(
      `https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products?query=${encodeURIComponent(searchTerm)}&page_size=5&page_number=1`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(6000),
      }
    );

    if (!response.ok) {
      console.log(`[KabumAPI] Failed: ${response.status}`);
      await response.text();
      return [];
    }

    const data = await response.json();
    const products = data?.data || [];

    for (const product of products) {
      const name = product.name || product.title || '';
      const price = parseFloat(product.priceWithDiscount || product.price || product.oldPrice || '0');
      const code = product.code || product.id || '';
      const slug = product.slug || '';

      if (!name || price <= 50 || price > 100000) continue;

      // Check availability
      if (product.available === false || product.quantity === 0) continue;

      const url = `https://www.kabum.com.br/produto/${code}/${slug}`;
      const { score, details } = calculateRelevanceScore(name, productCode, productName);

      if (score >= 60) {
        console.log(`[KabumAPI] ACCEPTED: "${name}" R$${price} score=${score} (${details})`);
        results.push({ source: 'Kabum', productName: name, price, url, score });
      } else {
        console.log(`[KabumAPI] REJECTED: "${name}" score=${score} (${details})`);
      }
    }
  } catch (err) {
    console.error('[KabumAPI] Error:', err);
  }

  return results;
}

// ── Direct store search (extract product links from search pages) ──
function extractProductLinksByStore(html: string, store: string): string[] {
  const links = new Set<string>();

  const addMatches = (regex: RegExp) => {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const raw = match[1].replace(/\\\//g, '/');
      const decoded = decodeURIComponent(raw);
      if (isValidFinalUrl(decoded)) links.add(decoded);
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
      addMatches(/"(https?:\/\/www\.pichau\.com\.br\/(?!search)[^"]+)"/g);
      break;
  }

  return Array.from(links).slice(0, 3);
}

async function searchStoresDirectly(searchTerm: string): Promise<string[]> {
  const stores = [
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
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });

        if (!response.ok) {
          await response.text();
          return;
        }
        const html = await response.text();
        const extracted = extractProductLinksByStore(html, name);
        extracted.forEach(u => urls.add(u));
      } catch { /* silent */ }
    })
  );

  return Array.from(urls).slice(0, 8);
}

// ── Scrape a product page ──
async function scrapePage(
  url: string,
  productCode: string,
  productName: string,
): Promise<{ source: string; productName: string; price: number; url: string; score: number } | null> {
  try {
    // Reject search pages as final results
    if (isSearchPage(url)) {
      console.log(`[Scraper] Skipping search page: ${url}`);
      return null;
    }

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
      console.log(`Failed to fetch ${url}: ${response.status}`);
      await response.text();
      return null;
    }

    const html = await response.text();
    const title = extractTitle(html);

    if (!title) {
      console.log(`[Scraper] No title at ${url}`);
      return null;
    }

    // Availability check
    if (!isProductAvailable(html)) {
      console.log(`[Scraper] Product unavailable at ${url}`);
      return null;
    }

    // Relevance score
    const { score, details } = calculateRelevanceScore(title, productCode, productName);
    if (score < 60) {
      console.log(`[Scoring] REJECTED: score=${score} (${details}) for "${title.substring(0, 80)}" @ ${url}`);
      return null;
    }

    const prices = extractPrices(html);
    if (prices.length === 0) {
      console.log(`[Scraper] No price at ${url}`);
      return null;
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const price = sorted[Math.floor(sorted.length / 2)];

    console.log(`[Scoring] ACCEPTED: score=${score} (${details}) "${title.substring(0, 60)}" R$${price}`);

    return { source: getSourceName(url), productName: title, price, url, score };
  } catch (err) {
    console.error(`Scrape error for ${url}:`, err);
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
    // Keep highest score; tie-break by lowest price
    if (!existing || r.score > existing.score || (r.score === existing.score && r.price < existing.price)) {
      seen.set(r.source, r);
    }
  }
  return Array.from(seen.values());
}

// ── Format with AI ──
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

    let allResults: Array<{ source: string; productName: string; price: number; url: string; score: number }> = [];

    // ── 3-LEVEL FALLBACK LOOP ──
    for (let level = 1; level <= 3; level++) {
      const queries = buildFallbackQueries(productName, productCode, level);
      if (queries.length === 0) continue;

      const searchTerm = level === 1
        ? (bestModel || (productCode && isManufacturerCode(productCode) ? productCode : ''))
        : attrs.brand ? `${attrs.brand} ${attrs.capacity}` : productName.split(/\s+/).slice(0, 4).join(' ');

      console.log(`[Scraper] Level ${level}: ${queries.length} queries, searchTerm="${searchTerm}"`);

      // Run search engines + Kabum API + direct stores in parallel
      const [searchUrls, kabumResults, directUrls] = await Promise.all([
        Promise.all(queries.map(q => searchAllEngines(q))).then(results => {
          const s = new Set<string>();
          results.flat().forEach(u => s.add(u));
          return Array.from(s).slice(0, 10);
        }),
        searchTerm ? searchKabumAPI(searchTerm, productName, productCode) : Promise.resolve([]),
        searchTerm ? searchStoresDirectly(searchTerm) : Promise.resolve([]),
      ]);

      // Merge URLs (search engines + direct stores, excluding search pages for scraping)
      const allUrls = new Set<string>();
      for (const u of [...searchUrls, ...directUrls]) {
        if (isValidFinalUrl(u)) allUrls.add(u);
      }

      // Also extract product links FROM search pages found by search engines
      for (const u of searchUrls) {
        if (isSearchPage(u)) {
          try {
            const resp = await fetch(u, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html',
              },
              signal: AbortSignal.timeout(FETCH_TIMEOUT),
            });
            if (resp.ok) {
              const html = await resp.text();
              const hostname = new URL(u).hostname;
              let store = '';
              if (hostname.includes('kabum')) store = 'kabum';
              else if (hostname.includes('mercadolivre')) store = 'mercadolivre';
              else if (hostname.includes('amazon')) store = 'amazon';
              else if (hostname.includes('magazineluiza')) store = 'magalu';
              else if (hostname.includes('pichau')) store = 'pichau';
              if (store) {
                const links = extractProductLinksByStore(html, store);
                links.forEach(l => allUrls.add(l));
              }
            } else {
              await resp.text();
            }
          } catch { /* silent */ }
        }
      }

      const uniqueUrls = Array.from(allUrls).slice(0, 10);
      console.log(`[Scraper] Level ${level}: ${uniqueUrls.length} product URLs + ${kabumResults.length} Kabum API results`);

      // Scrape product pages
      const scraped = await Promise.all(
        uniqueUrls.map(url => scrapePage(url, productCode, productName))
      );
      const validScraped = scraped.filter(Boolean) as typeof allResults;

      // Combine with Kabum API results
      const levelResults = [...kabumResults, ...validScraped];

      if (levelResults.length > 0) {
        allResults.push(...levelResults);
        console.log(`[Scraper] Level ${level}: ${levelResults.length} results found. Stopping fallback.`);
        break; // Stop fallback — we have results
      }

      console.log(`[Scraper] Level ${level}: 0 results. Trying next level...`);
    }

    // ── Post-processing ──
    allResults = deduplicateBySource(allResults);
    allResults = removeOutliers(allResults);

    // Sort by priority (Kabum > ML > Amazon > Magalu > Pichau), then by score
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
