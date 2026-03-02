// api/predictit.js
// PredictIt public REST API — zero auth, zero login, works globally
// Endpoint: https://www.predictit.org/api/marketdata/all
// Returns all open markets with live bid/ask prices
// PredictIt fee: 10% of profits (factored into returned price field "fee")

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await fetch('https://www.predictit.org/api/marketdata/all', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ArbitrageScanner/1.0)',
      },
    });

    if (!r.ok) throw new Error(`PredictIt HTTP ${r.status}`);
    const data = await r.json();
    if (!data.markets) throw new Error('Unexpected response shape');

    const out = [];

    for (const market of data.markets) {
      if (!Array.isArray(market.contracts)) continue;
      const openContracts = market.contracts.filter(c => c.status === 'Open');

      for (const contract of openContracts) {
        const yesAsk = contract.bestBuyYesCost;  // price to buy YES
        const noAsk  = contract.bestBuyNoCost;   // price to buy NO

        if (!yesAsk || !noAsk || yesAsk <= 0 || noAsk <= 0) continue;
        if (yesAsk >= 1 || noAsk >= 1) continue;

        // PredictIt: question = market name if binary, else "market: contract"
        const isBinary = openContracts.length === 1;
        const question = isBinary
          ? market.name
          : `${market.name} — ${contract.name}`;

        out.push({
          id:            String(contract.id),
          question,
          slug:          String(market.id),           // used to build URL
          outcomePrices: JSON.stringify([yesAsk.toFixed(4), noAsk.toFixed(4)]),
          outcomes:      JSON.stringify(['Yes', 'No']),
          endDate:       contract.dateEnd || market.end || null,
          volume:        0, // PredictIt doesn't expose volume in this endpoint
          source:        'predictit',
          category:      'Politics',
          fee:           0.10,  // PredictIt 10% profit fee (for display info)
          predictitUrl:  market.url || `https://www.predictit.org/markets/detail/${market.id}`,
        });
      }
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(out);

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
