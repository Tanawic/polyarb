// api/markets.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const limit  = parseInt(req.query.limit  || '500');
  const offset = parseInt(req.query.offset || '0');
  const url = `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=${limit}&offset=${offset}&order=volume&ascending=false`;

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    });
    if (!r.ok) return res.status(r.status).json({ error: `Polymarket ${r.status}` });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
