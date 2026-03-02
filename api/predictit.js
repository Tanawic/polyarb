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

      // IMPORTANT: Only use markets with exactly 1 open contract (true binary YES/NO).
      // Multi-outcome markets (e.g. "Who wins?" with Republican/Democrat/Other contracts)
      // have a different resolution structure — NO does NOT mean "everything else fails".
      // Using NO from a multi-contract market in cross-arb would create FAKE arb signals.
      if (openContracts.length !== 1) continue;
      const contract = openContracts[0];
        const yesAsk = contract.bestBuyYesCost;  // price to buy YES
        const noAsk  = contract.bestBuyNoCost;   // price to buy NO

        if (!yesAsk || !noAsk || yesAsk <= 0 || noAsk <= 0) continue;
        if (yesAsk >= 1 || noAsk >= 1) continue;

        const question = market.name; // always binary now

        out.push({
          id:            String(contract.id),
          question,
          slug:          String(market.id),
          outcomePrices: JSON.stringify([yesAsk.toFixed(4), noAsk.toFixed(4)]),
          outcomes:      JSON.stringify(['Yes', 'No']),
          endDate:       contract.dateEnd || market.end || null,
          volume:        0,
          source:        'predictit',
          category:      'Politics',
          isBinaryMarket: true,
          predictitUrl:  market.url || `https://www.predictit.org/markets/detail/${market.id}`,
        });
      }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(out);

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
