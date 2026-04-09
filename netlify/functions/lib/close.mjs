/**
 * Close CRM API client for Netlify Functions.
 * Uses in-memory cache (survives within warm Lambda instances).
 */

const BASE = "https://api.close.com/api/v1";
const CACHE_TTL = 900_000; // 15 min in ms
const cache = new Map();

function auth() {
  const key = process.env.CLOSE_API_KEY;
  if (!key) throw new Error("CLOSE_API_KEY env var is required");
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

async function request(endpoint, params = {}) {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { Authorization: auth(), Accept: "application/json" },
    });

    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After") || 2 ** (attempt + 1));
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Close API ${res.status}: ${body}`);
    }
    return res.json();
  }
  throw new Error("Close API: max retries exceeded");
}

async function paginate(endpoint, params = {}) {
  const all = [];
  let skip = 0;
  while (true) {
    const data = await request(endpoint, { ...params, _limit: 100, _skip: skip });
    const items = data.data || [];
    all.push(...items);
    if (!data.has_more) break;
    skip += items.length;
  }
  return all;
}

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return Promise.resolve(hit.data);
  return fn().then((data) => {
    cache.set(key, { ts: Date.now(), data });
    return data;
  });
}

// ── Public API ───────────────────────────────────────────────────────

export function clearCache() {
  cache.clear();
}

export function getActiveUsers() {
  return cached("users", async () => {
    const resp = await request("user");
    return (resp.data || [])
      .filter((u) => !u.date_deactivated)
      .map((u) => ({
        id: u.id,
        first_name: u.first_name || "",
        last_name: u.last_name || "",
        email: u.email || "",
        image: u.image || "",
      }));
  });
}

export function getCalls(dateFrom, dateTo) {
  return cached(`calls:${dateFrom}:${dateTo}`, () =>
    paginate("activity/call", {
      date_created__gte: dateFrom,
      date_created__lt: dateTo,
    }),
  );
}

export function getEmails(dateFrom, dateTo) {
  return cached(`emails:${dateFrom}:${dateTo}`, () =>
    paginate("activity/email", {
      date_created__gte: dateFrom,
      date_created__lt: dateTo,
    }),
  );
}

export function getWonOpportunities() {
  return cached("won_opps", () =>
    paginate("opportunity", { status_type: "won" }),
  );
}
