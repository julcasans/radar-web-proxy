// Stateless CORS proxy for feeds the browser can't read directly. It parses and stores
// nothing: it checks the request, then streams the upstream body back with CORS headers.

interface Env {
  RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

// YouTube channel pages, read to find the channel_id, run 2–3 MB.
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const ALLOWED_TYPE = /\b(xml|json|html)\b/i;
const CORS = { "access-control-allow-origin": "*" };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET") return reply(405, "Only GET is allowed", { allow: "GET" });

    const target = parseTarget(new URL(request.url).searchParams.get("url"));
    if (!target) return reply(400, "Pass an http(s) URL as ?url=");

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (!(await env.RATE_LIMITER.limit({ key: ip })).success) return reply(429, "Too many requests");

    let upstream: Response;
    try {
      upstream = await fetch(target, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "RadarProxy/1" } });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      return reply(timedOut ? 504 : 502, timedOut ? "Upstream timed out" : "Upstream unreachable");
    }

    const type = upstream.headers.get("content-type") ?? "";
    if (!ALLOWED_TYPE.test(type)) return reply(415, "Upstream is not XML, JSON or HTML");
    if (Number(upstream.headers.get("content-length") ?? 0) > MAX_BYTES) return reply(413, "Upstream is over 5 MB");

    let body: Uint8Array<ArrayBuffer> | undefined;
    try {
      body = await readCapped(upstream);
    } catch {
      // The timeout signal also aborts a body that is still streaming.
      return reply(504, "Upstream timed out");
    }
    if (!body) return reply(413, "Upstream is over 5 MB");
    return new Response(body, { status: upstream.status, headers: { ...CORS, "content-type": type } });
  },
};

function parseTarget(value: string | null): URL | undefined {
  try {
    const url = new URL(value ?? "");
    if (url.protocol === "http:" || url.protocol === "https:") return url;
  } catch {
    return undefined;
  }
}

// Content-Length can be missing or wrong, so the cap is enforced while reading.
async function readCapped(response: Response): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function reply(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(message, { status, headers: { ...CORS, ...headers, "content-type": "text/plain; charset=utf-8" } });
}
