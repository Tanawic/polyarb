// api/opinion.js — Opinion.trade (BNB Chain) prediction market proxy
// Docs: https://docs.opinion.trade/developer-guide/opinion-open-api/overview
// Get API key: https://docs.google.com/forms/d/1h7gp8UffZeXzYQ-lv4jcou9PoRNOqMAQhyW4IwZDnII
// Set OPINION_API_KEY in Vercel environment variables

const BASE = 'https://proxy.opinion.trade:8443/openapi';
const BASE2 = 'https://openapi.opinion.trade/openapi'; // fallback

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.OPINION_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({
      error: 'OPINION_API_KEY environment variable not set. Get a free key at https://docs.google.com/forms/d/1h7gp8UffZeXzYQ-lv4jcou9PoRNOqMAQhyW4IwZDnII and add it to Vercel: Settings → Environment Variables → OPINION_API_KEY'
    });
  }

  const headers = {
    'apikey': API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0',
  };

  async function opinionFetch(path) {
    // Try primary then fallback base URL
    for (const base of [BASE, BASE2]) {
      try {
        const r = await fetch(`${base}${path}`, { headers });
        if (!r.ok) {
          const txt = await r.text();
          if (r.status === 401) throw new Error('Invalid API key — check OPINION_API_KEY in Vercel env vars');
          if (r.status === 429) throw new Error('Rate limit exceeded (15 req/s)');
          throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
        }
        const data = await r.json();
        if (data.code !== 0) throw new Error(`Opinion API error: ${data.msg}`);
        return data.result;
      } catch(e) {
        if (e.message.includes('API key') || e.message.includes('Rate limit') || e.message.includes('Opinion API')) throw e;
        // Network error — try next base URL
      }
    }
    throw new Error('Opinion API unreachable on all endpoints');
  }

  try {
    // Step 1: Fetch top markets sorted by volume (max 20/page, fetch 3 pages = 60 markets)
    const allMarkets = [];
    for (let page = 1; page <= 3; page++) {
      try {
        const result = await opinionFetch(`/market?status=activated&sortBy=5&limit=20&page=${page}`);
        const list = result.list || [];
        allMarkets.push(...list);
        if (list.length < 20) break; // no more pages
      } catch(e) {
        if (page === 1) throw e; // fail hard on first page
        break; // ok to stop on later pages
      }
    }

    if (!allMarkets.length) {
      return res.status(200).json([]);
    }

    // Step 2: Fetch YES + NO latest prices for all markets concurrently
    // Rate limit: 15 req/s — batch in groups of 10 pairs (20 req) with small delay
    const BATCH = 8; // 8 markets = 16 price calls per batch (safe under 15/s with slight delay)
    const enriched = [];

    for (let i = 0; i < allMarkets.length; i += BATCH) {
      const batch = allMarkets.slice(i, i + BATCH);

      const priceResults = await Promise.allSettled(
        batch.flatMap(m => [
          opinionFetch(`/token/latest-price?token_id=${encodeURIComponent(m.yesTokenId)}`),
          opinionFetch(`/token/latest-price?token_id=${encodeURIComponent(m.noTokenId)}`),
        ])
      );

      batch.forEach((m, idx) => {
        const yesResult = priceResults[idx * 2];
        const noResult  = priceResults[idx * 2 + 1];

        const yesPrice = yesResult.status === 'fulfilled' ? parseFloat(yesResult.value?.price || 0) : null;
        const noPrice  = noResult.status  === 'fulfilled' ? parseFloat(noResult.value?.price  || 0) : null;

        if (!yesPrice || !noPrice || yesPrice <= 0 || noPrice <= 0) return;

        // Determine end date from cutoffAt (unix seconds)
        const endDate = m.cutoffAt ? new Date(m.cutoffAt * 1000).toISOString() : null;

        enriched.push({
          id:            String(m.marketId),
          question:      m.marketTitle || `Market #${m.marketId}`,
          slug:          String(m.marketId),
          // Polymarket-compatible price format (0-1 decimal range)
          outcomePrices: JSON.stringify([yesPrice.toFixed(4), noPrice.toFixed(4)]),
          outcomes:      JSON.stringify(['Yes', 'No']),
          endDate,
          volume:        parseFloat(m.volume || 0),
          volume24h:     parseFloat(m.volume24h || 0),
          source:        'opinion',
          category:      '',
          // Opinion fee: typically 2% per side
          feeOverride:   null,
          // Direct link
          opinionUrl:    `https://opinion.trade/market/${m.marketId}`,
        });
      });

      // Small delay between batches to respect 15 req/s
      if (i + BATCH < allMarkets.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(enriched);

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
