// api/kalshi.js — Kalshi prediction market proxy
// Kalshi REST API v2: https://trading.kalshi.com/trade-api/v2
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const BASE = 'https://trading.kalshi.com/trade-api/v2';
  const limit = 200;

  try {
    let allMarkets = [];
    let cursor = '';
    let pages = 0;

    // Paginate through open markets (Kalshi uses cursor pagination)
    while (pages < 5) {
      const url = `${BASE}/markets?status=open&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
      const r = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (!r.ok) {
        // Try demo endpoint as fallback
        throw new Error(`Kalshi API ${r.status}`);
      }

      const data = await r.json();
      const markets = data.markets || [];
      allMarkets = allMarkets.concat(markets);

      // Follow cursor for next page
      cursor = data.cursor || '';
      pages++;
      if (!cursor || markets.length < limit) break;
    }

    // Transform to unified format matching Polymarket shape
    const transformed = allMarkets
      .filter(m => {
        // Only binary YES/NO markets with valid prices
        const yesBid = m.yes_bid;
        const noBid  = m.no_bid;
        return yesBid > 0 && noBid > 0 && yesBid < 100 && noBid < 100;
      })
      .map(m => {
        // Kalshi prices are in cents (1-99), convert to 0-1 range
        // Use ask price (what you pay to buy)
        const yesAsk = (m.yes_ask || m.yes_bid) / 100;
        const noAsk  = (m.no_ask  || m.no_bid)  / 100;

        return {
          id: m.ticker,
          question: m.title || m.ticker,
          slug: m.ticker,
          // Standard Polymarket-compatible fields
          outcomePrices: JSON.stringify([yesAsk.toFixed(4), noAsk.toFixed(4)]),
          outcomes: JSON.stringify(['Yes', 'No']),
          endDate: m.close_time || null,
          volume: parseFloat(m.volume || 0),
          // Kalshi metadata
          source: 'kalshi',
          category: m.category || '',
          subtitle: m.subtitle || '',
          // Kalshi fee: 7¢ per contract flat, or ~1% on mid price
          // We approximate as 1% taker fee per side
          feeOverride: null, // use user's fee setting
        };
      });

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(transformed);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
