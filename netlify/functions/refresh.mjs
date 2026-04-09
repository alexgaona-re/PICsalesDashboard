import { clearCache } from "./lib/close.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405 });
  }
  clearCache();
  return Response.json({ status: "cache_cleared" });
};

export const config = { path: "/api/refresh" };
