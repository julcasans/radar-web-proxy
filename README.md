# Radar proxy

A tiny, stateless [Cloudflare Worker](https://developers.cloudflare.com/workers/) that lets Radar, a calm feed reader that follows a handful of people, read blogs, podcasts and YouTube channels.

## Why a proxy?

Browsers don't let a web page read another site's content unless that site allows it (CORS). Most blogs, RSS feeds and YouTube pages don't, so Radar can't fetch them directly.

This proxy fetches the feed on Radar's behalf and hands it back with the headers the browser needs. It **stores nothing, parses nothing and has no accounts**. It only passes the response through.

## Deploy your own (about 2 minutes)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up). No credit card is required.

1. Press the button:

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/OWNER/REPO/tree/main/proxy)

   > Maintainer: replace `OWNER/REPO` in the link above with this repository's path, e.g. `jane/radar-web-proxy`.

2. Follow Cloudflare's steps. It copies the `proxy/` folder of this repository into your account and deploys it.
3. When it finishes, copy the address Cloudflare gives you. It ends in `workers.dev`, for example:

   ```
   https://radar-proxy.jane.workers.dev
   ```

4. In Radar, open **Settings → Proxy**, paste that address into **Your proxy address** and press **Save**.

Paste the address of your **deployed Worker** (`…workers.dev`), not the address of this GitHub repository. Radar will refuse a GitHub address. To go back to the shared proxy, press **Use the shared proxy** in the same place.

## Deploy from the command line

```sh
cd proxy
pnpm install          # or npm install
npx wrangler login
pnpm run deploy       # or npm run deploy
```

Wrangler prints the `workers.dev` address when it finishes.

To try it locally:

```sh
cd proxy
npx wrangler dev      # http://localhost:8787
curl "http://localhost:8787/?url=https://example.com/feed.xml"
```

## How it behaves

Requests look like `GET https://<your-worker>/?url=<address to fetch>`.

| Rule | Detail |
|---|---|
| Method | `GET` only (`405` otherwise) |
| Target | `?url=` must be an `http` or `https` address (`400` otherwise) |
| Rate limit | 60 requests per minute per visitor IP (`429`) |
| Timeout | 10 seconds (`504`) |
| Size | 5 MB at most (`413`) |
| Content type | The response must be XML, JSON or HTML (`415`) |
| CORS | Every response allows any origin |

The limits live in [`proxy/src/index.ts`](proxy/src/index.ts) and [`proxy/wrangler.toml`](proxy/wrangler.toml).

## Cost

The Cloudflare free plan covers this. It allows 100,000 Worker requests per day, which is plenty for one person following a handful of feeds. When the limit is reached, requests fail until 00:00 UTC. The free plan never charges you. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Privacy

The Worker keeps no logs of its own and no data. Cloudflare may record ordinary request metadata for your account, as with any Worker. The per-IP rate limit counters live in Cloudflare's rate-limiting service, not in this code.

## Repository layout

```
proxy/
  package.json    # only depends on wrangler
  wrangler.toml   # Worker name, entry point and rate limit
  src/index.ts    # the whole proxy
```

The `proxy/` folder is self-contained on purpose: the Deploy to Cloudflare button downloads only that folder from the `main` branch, so nothing in it may import from outside. This repository must stay public for the button to work.

## License

[Apache License 2.0](LICENSE)
