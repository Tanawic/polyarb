// api/kalshi.js — Kalshi prediction market proxy
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Try multiple Kalshi endpoints — their URL has shifted between versions
  const BASES = [
    'https://trading.kalshi.com/trade-api/v2',
    'https://api.kalshi.com/trade-api/v2',
  ];

  const errors = [];

  for (const base of BASES) {
    try {
      const url = `${base}/markets?limit=200&status=open`;
      const r = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; ArbitrageScanner/1.0)',
        },
      });

      const text = await r.text();

      if (!r.ok) {
        errors.push(`${base} → HTTP ${r.status}: ${text.slice(0, 200)}`);
        continue;
      }

      let data;
      try { data = JSON.parse(text); }
      catch(e) { errors.push(`${base} → JSON parse failed: ${text.slice(0,100)}`); continue; }

      const rawMarkets = data.markets || [];
      if (!Array.isArray(rawMarkets)) {
        errors.push(`${base} → unexpected shape: ${JSON.stringify(data).slice(0,100)}`);
        continue;
      }

      // Paginate
      let all = [...rawMarkets];
      let cursor = data.cursor || '';
      for (let p = 0; p < 4 && cursor; p++) {
        try {
          const nr = await fetch(`${base}/markets?limit=200&status=open&cursor=${encodeURIComponent(cursor)}`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          });
          if (!nr.ok) break;
          const nd = await nr.json();
          all = all.concat(nd.markets || []);
          cursor = nd.cursor || '';
          if ((nd.markets || []).length < 200) break;
        } catch(e) { break; }
      }

      // Transform → Polymarket-compatible shape
      const out = all
        .filter(m => {
          const ya = m.yes_ask ?? m.yes_bid;
          const na = m.no_ask  ?? m.no_bid;
          return ya > 0 && na > 0 && ya < 100 && na < 100;
        })
        .map(m => ({
          id:            m.ticker || '',
          question:      m.title  || m.ticker || '',
          slug:          m.ticker || '',
          outcomePrices: JSON.stringify([
            ((m.yes_ask ?? m.yes_bid) / 100).toFixed(4),
            ((m.no_ask  ?? m.no_bid)  / 100).toFixed(4),
          ]),
          outcomes:  JSON.stringify(['Yes', 'No']),
          endDate:   m.close_time || m.expiration_time || null,
          volume:    parseFloat(m.volume || m.dollar_volume || 0),
          source:    'kalshi',
          category:  m.category || '',
          subtitle:  m.subtitle || '',
        }))
        .filter(m => m.question);

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(out);

    } catch(e) {
      errors.push(`${base} → ${e.message}`);
    }
  }

  // All failed — surface exact error so you can see what's happening
  return res.status(500).json({ error: errors.join(' | ') });
}
