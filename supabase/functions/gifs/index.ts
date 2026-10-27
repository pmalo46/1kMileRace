// Searches GIPHY for the comment GIF picker. The API key stays here, and every result is
// rated PG, whatever the app asks for.
//
// POST { q?: string }  (no q: what's trending)
//   200 { gifs: Gif[] } · 401 not signed in · 400 malformed · 502 GIPHY failed · 503 no API key

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { gifsFromGiphy } from "@1k/core";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const Body = z.object({ q: z.string().trim().max(50).optional() }).strict();

const LIMIT = 24;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return json(401, { error: "Please sign in again." });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json(400, { error: "Malformed request.", details: parsed.error.issues });
  const q = parsed.data.q;

  const key = Deno.env.get("GIPHY_API_KEY");
  if (!key) return json(503, { error: "GIFs aren’t set up yet." });

  const url = new URL(`https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}`);
  url.search = new URLSearchParams({ api_key: key, limit: String(LIMIT), rating: "pg", ...(q ? { q } : {}) }).toString();
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return json(502, { error: "Couldn’t reach GIPHY." });
  return json(200, { gifs: gifsFromGiphy(await res.json().catch(() => null)) });
});
