# Cloudflare Worker Backend

## Setup

```bash
cd worker
npm install
```

## Configure secrets

```bash
npx wrangler secret put TESLA_CLIENT_ID
npx wrangler secret put TESLA_CLIENT_SECRET
```

## Local development

```bash
npm run dev
```

## Deploy to Cloudflare

```bash
npm run deploy
```

This will output your Worker URL (e.g., `https://tesla-dashboard.<your-subdomain>.workers.dev`).

## Update frontend

After deploying, update `BACKEND_URL` in `app.js` to point to your Worker URL.
