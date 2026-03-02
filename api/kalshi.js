// api/kalshi.js
// Kalshi public REST API — NO API key required for reading market data
// Correct base URL: api.elections.kalshi.com (despite "elections" it covers ALL markets)
// Docs: https://docs.kalshi.com/getting_started/quick_start_market_data

const BASE = 'https://api.elections.kalshi.com/trade-api/v2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let all = [];
    let cursor = '';
    let pages = 0;

    while (pages < 5) {
      const url = `${BASE}/markets?limit=200&status=open${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;

      const r = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; ArbitrageScanner/1.0)',
        },
      });

      if (!r.ok) {
        const body = await r.text();
        throw new Error(`Kalshi API HTTP ${r.status}: ${body.slice(0, 300)}`);
      }

      const data = await r.json();
      const markets = data.markets || [];
      all = all.concat(markets);
      cursor = data.cursor || '';
      pages++;
      if (!cursor || markets.length < 200) break;
    }

    // Transform to Polymarket-compatible shape
    // Kalshi: yes_ask/yes_bid are in cents (1–99)
    const out = all
      .filter(m => {
        const ya = m.yes_ask ?? m.yes_bid ?? null;
        const na = m.no_ask  ?? m.no_bid  ?? null;
        return ya != null && na != null && ya > 0 && na > 0 && ya < 100 && na < 100;
      })
      .map(m => {
        const yesPrice = (m.yes_ask ?? m.yes_bid) / 100;
        const noPrice  = (m.no_ask  ?? m.no_bid)  / 100;
        return {
          id:            m.ticker || '',
          question:      m.title  || m.ticker || '',
          slug:          m.ticker || '',
          outcomePrices: JSON.stringify([yesPrice.toFixed(4), noPrice.toFixed(4)]),
          outcomes:      JSON.stringify(['Yes', 'No']),
          endDate:       m.close_time || m.expiration_time || null,
          volume:        parseFloat(m.volume || m.dollar_volume || 0),
          source:        'kalshi',
          category:      m.category || '',
          subtitle:      m.subtitle || '',
          kalshiUrl:     `https://kalshi.com/markets/${m.event_ticker || m.ticker}`,
        };
      })
      .filter(m => m.question);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(out);

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
