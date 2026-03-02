// api/markets.js — Vercel serverless function
// Runs server-side: no CORS, no browser restrictions
export default async function handler(req, res) {
  // Allow browser to call this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const limit  = parseInt(req.query.limit  || '500');
  const offset = parseInt(req.query.offset || '0');

  const upstream = `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=${limit}&offset=${offset}&order=volume&ascending=false`;

  try {
    const upstream_res = await fetch(upstream, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PolyArb/1.0)',
        'Accept': 'application/json',
      },
    });

    if (!upstream_res.ok) {
      return res.status(upstream_res.status).json({ error: `Polymarket returned ${upstream_res.status}` });
    }

    const data = await upstream_res.json();

    // Cache response for 30 seconds at CDN edge
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
