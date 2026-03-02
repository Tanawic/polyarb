# POLY·ARB — Polymarket Arbitrage Scanner

Live arbitrage tracker for Polymarket. Finds markets where YES + NO < $1.00 (after fees), sorted by APY.

## Deploy to Vercel (3 steps)

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Deploy
```bash
cd polyarb
vercel
```
Follow the prompts — select "No" for existing project, accept defaults.

### 3. Done
Your live URL will be something like `https://polyarb-xxx.vercel.app`

---

## How it works

```
Browser → /api/markets (Vercel serverless) → gamma-api.polymarket.com
```

The `/api/markets` route runs **server-side** on Vercel, so there is no CORS issue.
The browser only ever talks to your own domain.

## Project structure

```
polyarb/
├── api/
│   └── markets.js      ← Vercel serverless function (proxies Polymarket)
├── public/
│   └── index.html      ← Frontend dashboard
└── vercel.json         ← Routing config
```

## Arbitrage logic

```
Cost    = YES × (1 + fee%) + NO × (1 + fee%)
Profit  = $1.00 − Cost
APY     = (Profit / Cost) × (365 / days_left) × 100
```

Arbitrage exists when **Cost < $1.00** — buy both YES and NO, one resolves to $1.00, pocket the difference.

Default fee is 2% per side (Polymarket's standard ~1% taker fee each leg).
