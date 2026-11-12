/**
 * Invite links. Messaging apps only make https links tappable, so an invite is
 * https://<this worker>/join/<code>: a small page that says whose race it is and opens the
 * app at Join with the code filled in (onekmiles://join?code=...).
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

interface Preview {
  name: string;
  organizer_name: string;
  member_count: number;
  starts_at: string;
}

const normalize = (code: string) => code.replace(/[^a-z0-9]/gi, '').toLowerCase();
const display = (code: string) => (/^[a-z]{8}$/.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}`.toUpperCase() : code);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

    const match = /^\/join\/([A-Za-z0-9-]{4,40})\/?$/.exec(url.pathname);
    if (!match) return page(home(), 404);

    const code = normalize(match[1]!);
    const preview = await lookUp(env, code);
    return page(invite(code, preview), preview ? 200 : 404);
  },
} satisfies ExportedHandler<Env>;

async function lookUp(env: Env, code: string): Promise<Preview | null> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/invite_preview`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_invite_code: code }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Preview[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

function invite(code: string, p: Preview | null): string {
  const appLink = `onekmiles://join?code=${encodeURIComponent(code)}`;
  if (!p) {
    return `
      <h1>That code doesn't match a race.</h1>
      <p>Check it with whoever sent it. Codes look like <b>ABCD-EFGH</b>.</p>`;
  }
  const starts = new Date(p.starts_at);
  const when = starts.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  const startLine = starts.getTime() > Date.now() ? `Starts ${when}.` : `Started ${when}.`;
  const people = `${p.member_count} ${p.member_count === 1 ? 'person' : 'people'} in so far.`;
  return `
    <p class="label">${esc(p.name)}</p>
    <h1>${esc(p.organizer_name)} saved you a spot.</h1>
    <p>1,000 miles in 365 days, run or walked. ${esc(people)} ${esc(startLine)}</p>
    <a class="button" href="${esc(appLink)}">Open 1K Miles</a>
    <div class="bib">
      <span class="label">Your code</span>
      <span class="code">${esc(display(code))}</span>
    </div>
    <p class="muted">No app yet? Ask ${esc(p.organizer_name)} how to get it, then come back and tap the button, or type the code in Join a race.</p>`;
}

function home(): string {
  return `
    <h1>1,000 miles. 365 days.</h1>
    <p>Got an invite? Open the link your friend sent you.</p>`;
}

function page(body: string, status: number): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="format-detection" content="telephone=no">
<title>1K Miles invite</title>
<style>
  :root { --bg:#FFF8F1; --surface:#fff; --text:#1C1433; --muted:#6E6584; --border:#EFE2D6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#120D1F; --surface:#1D1630; --text:#FFF6EC; --muted:#B3A8C9; --border:#2F2648; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--text);
    font: 500 17px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display:flex; align-items:center; justify-content:center; padding:24px 16px; }
  main { width:100%; max-width:420px; display:flex; flex-direction:column; gap:16px; }
  h1 { font-size:30px; line-height:1.15; font-weight:800; letter-spacing:-0.3px; margin:0; }
  p { margin:0; }
  .label { font-size:13px; font-weight:700; letter-spacing:.6px; text-transform:uppercase; color:var(--muted); }
  .muted { color:var(--muted); font-size:15px; }
  .button { display:block; text-align:center; text-decoration:none; color:#fff; font-weight:800; font-size:17px;
    padding:16px; border-radius:999px; background:linear-gradient(135deg,#FF4D6D,#FF8A3D,#FFC94A); }
  .bib { background:var(--surface); border:1px solid var(--border); border-radius:16px; overflow:hidden;
    display:flex; flex-direction:column; align-items:center; gap:4px; padding:0 16px 20px; }
  .bib::before { content:""; align-self:stretch; height:14px; margin:0 -16px 12px;
    background:linear-gradient(90deg,#FF4D6D,#FF8A3D,#FFC94A); }
  .code { font: 800 34px/1 ui-rounded, -apple-system, sans-serif; letter-spacing:2px; font-variant-numeric: tabular-nums; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
