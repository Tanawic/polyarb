// api/clob.js
// Polymarket CLOB API — 100% public, zero auth, zero login, works globally
// Fetches live best-ask prices from the CLOB orderbook for each YES+NO token

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const GAMMA = 'https://gamma-api.polymarket.com';
  const CLOB  = 'https://clob.polymarket.com';

  try {
    // Fetch active binary markets from Gamma
    let gammaMarkets = [];
    for (let p = 0; p < 3; p++) {
      const r = await fetch(
        `${GAMMA}/markets?active=true&closed=false&limit=500&offset=${p*500}&order=volume&ascending=false`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
      );
      if (!r.ok) break;
      const d = await r.json();
      if (!Array.isArray(d) || !d.length) break;
      gammaMarkets = gammaMarkets.concat(d);
      if (d.length < 500) break;
    }

    // Filter to binary markets with valid CLOB token IDs
    const withTokens = gammaMarkets.filter(m => {
      try {
        const t = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : (m.clobTokenIds || []);
        return t.length === 2 && t[0] && t[1];
      } catch { return false; }
    }).slice(0, 300);

    // Batch fetch CLOB prices (8 markets = 16 price lookups per batch)
    const BATCH = 8;
    const results = [];

    for (let i = 0; i < withTokens.length; i += BATCH) {
      const batch = withTokens.slice(i, i + BATCH);

      const pricePromises = batch.flatMap(m => {
        const t = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
        const outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || ['Yes','No']);
        const yesIdx = outcomes.findIndex(o => /yes/i.test(o));
        const noIdx  = outcomes.findIndex(o => /no/i.test(o));
        const yesToken = t[yesIdx !== -1 ? yesIdx : 0];
        const noToken  = t[noIdx  !== -1 ? noIdx  : 1];

        return [
          fetch(`${CLOB}/prices?token_id=${yesToken}&side=BUY`, { headers: { Accept: 'application/json' } })
            .then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${CLOB}/prices?token_id=${noToken}&side=BUY`,  { headers: { Accept: 'application/json' } })
            .then(r => r.ok ? r.json() : null).catch(() => null),
        ];
      });

      const prices = await Promise.all(pricePromises);

      for (let j = 0; j < batch.length; j++) {
        const m = batch[j];
        const yesData = prices[j * 2];
        const noData  = prices[j * 2 + 1];

        const yesAsk = yesData?.price != null ? parseFloat(yesData.price) : null;
        const noAsk  = noData?.price  != null ? parseFloat(noData.price)  : null;

        if (!yesAsk || !noAsk || isNaN(yesAsk) || isNaN(noAsk)) continue;
        if (yesAsk <= 0 || noAsk <= 0 || yesAsk >= 1 || noAsk >= 1) continue;

        results.push({
          id:            m.id || m.conditionId || '',
          question:      m.question || '',
          slug:          m.slug || '',
          outcomePrices: JSON.stringify([yesAsk.toFixed(4), noAsk.toFixed(4)]),
          outcomes:      JSON.stringify(['Yes', 'No']),
          endDate:       m.endDate || null,
          volume:        parseFloat(m.volume || 0),
          source:        'clob',
        });
      }

      if (i + BATCH < withTokens.length) {
        await new Promise(r => setTimeout(r, 150));
      }
    }

    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
    return res.status(200).json(results);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
