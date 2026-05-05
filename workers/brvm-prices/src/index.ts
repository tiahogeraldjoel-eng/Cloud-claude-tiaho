const UPSTREAM = "https://openapi.brvm.org";
const CACHE_TTL = 300; // 5 minutes

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const upstreamUrl = UPSTREAM + url.pathname + url.search;

    const cacheKey = new Request(upstreamUrl, { method: "GET" });
    const cache = caches.default;

    const cached = await cache.match(cacheKey);
    if (cached) {
      return addCors(cached);
    }

    try {
      const upstream = await fetch(upstreamUrl, {
        headers: {
          "User-Agent": "BRVM-Prices-Worker/1.0",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(25_000),
      });

      const body = await upstream.arrayBuffer();
      const headers = new Headers(upstream.headers);
      headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));

      const response = new Response(body, { status: upstream.status, headers });
      if (upstream.ok) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }
      return response;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "upstream_unavailable", message: String(err) }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }
  },
};

function addCors(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
