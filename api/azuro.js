// api/azuro.js — Azuro Protocol (BNB Chain) proxy
// Fetches live prediction markets from Azuro's BNB subgraph
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const now = Math.floor(Date.now() / 1000);

  const query = `{
    games(
      first: 200
      where: { status: Created, startsAt_gt: "${now}" }
      orderBy: startsAt
      orderDirection: asc
    ) {
      gameId
      title
      startsAt
      sport { name }
      league { name country { name } }
      conditions(where: { status: Created }) {
        conditionId
        outcomes {
          outcomeId
          currentOdds
          title
        }
      }
    }
  }`;

  // Try multiple Azuro BNB endpoints
  const endpoints = [
    'https://thegraph.com/hosted-service/subgraph/azuro-protocol/azuro-api-bnb-v2',
    'https://api.thegraph.com/subgraphs/name/azuro-protocol/azuro-api-bnb-v2',
    'https://api.thegraph.com/subgraphs/name/azuro-protocol/azuro-api-bnb',
  ];

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ query }),
      });

      if (!r.ok) { lastError = `HTTP ${r.status}`; continue; }
      const json = await r.json();
      if (json.errors) { lastError = json.errors[0]?.message; continue; }

      const games = json?.data?.games || [];

      // Transform to unified format
      const markets = [];
      for (const game of games) {
        for (const condition of game.conditions) {
          if (condition.outcomes.length !== 2) continue;
          const [o1, o2] = condition.outcomes;
          if (!o1.currentOdds || !o2.currentOdds) continue;

          // Convert decimal odds to implied probability (price in 0-1 range)
          const raw1 = 1 / parseFloat(o1.currentOdds);
          const raw2 = 1 / parseFloat(o2.currentOdds);
          const total = raw1 + raw2;
          // Fair prices (remove vig)
          const price1 = raw1 / total;
          const price2 = raw2 / total;

          markets.push({
            id: `azuro_${condition.conditionId}`,
            question: `${game.title} — ${o1.title} vs ${o2.title}`,
            shortTitle: game.title,
            sport: game.sport?.name || 'Sports',
            league: game.league?.name || '',
            outcomes: [o1.title, o2.title],
            outcomePrices: [price1.toFixed(4), price2.toFixed(4)],
            // raw decimal odds for display
            odds: [parseFloat(o1.currentOdds), parseFloat(o2.currentOdds)],
            endDate: new Date(parseInt(game.startsAt) * 1000).toISOString(),
            volume: 0,
            source: 'azuro',
            slug: null,
            // Azuro fee is typically 1% (0.01)
            feeOverride: 0.01,
          });
        }
      }

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(markets);
    } catch(e) {
      lastError = e.message;
    }
  }

  return res.status(500).json({ error: `Azuro API unavailable: ${lastError}` });
}
