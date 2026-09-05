// Live status dashboard for GET / — dependency-free single HTML page.
// Shows service health, DB latency, catalog counts and every endpoint.
// Never include secrets here (no DATABASE_URL / JWT values).

export function statusPage({ service, version, uptime, time, db, counts, origins }) {
  const up = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h}h ${m}m ${sec}s`;
  };
  const dot = (ok) => `<span class="dot ${ok ? 'ok' : 'bad'}"></span>`;
  const endpoints = [
    ['GET', '/health', 'liveness probe (Render health check)'],
    ['GET', '/', 'this status page'],
    ['POST', '/api/auth/register', '{email,password,name} → {token,user}'],
    ['POST', '/api/auth/login', '{email,password} → {token,user}'],
    ['GET', '/api/auth/me', 'Bearer → {user,profiles}'],
    ['GET', '/api/movies', '?category=&lang=&q=&page=&limit='],
    ['GET', '/api/movies/rows/grouped', 'home feed ?lang='],
    ['GET', '/api/movies/:id', 'single title'],
    ['POST / PUT / DELETE', '/api/movies', 'admin Bearer'],
    ['GET', '/api/hero', 'spotlight slides'],
    ['GET / POST', '/api/rows', 'row config (POST admin)'],
    ['PUT / DELETE', '/api/rows/:id', 'admin Bearer'],
    ['GET / POST', '/api/mylist', 'Bearer (POST /:movieId)'],
    ['DELETE', '/api/mylist/:movieId', 'Bearer'],
    ['GET / POST', '/api/mylist/progress', 'Bearer (POST /:movieId {progress})'],
    ['GET', '/api/stats', 'counts'],
  ];
  const rows = endpoints.map(([m, p, d]) => {
    const tryLink = m === 'GET' && !p.includes(':') ? `<a href="${p}">try</a>` : '';
    return `<tr><td><span class="m">${m}</span></td><td><code>${p}</code></td><td>${d}</td><td>${tryLink}</td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${service} — status</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect x='4' y='4' width='56' height='56' rx='13' fill='%23E50914'/><path d='M17 51V16h7l8 12.5L40 16h7v35h-7.5V32.5L32 43.5 24.5 32.5V51z' fill='white'/></svg>">
<style>
*{box-sizing:border-box}body{margin:0;background:#0B0B0F;color:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:880px;margin:0 auto;padding:32px 20px 64px}
.brand{display:flex;align-items:center;gap:12px}
.brand h1{margin:0;font-size:26px;letter-spacing:2px;color:#E50914}
.sub{color:#a1a1aa;font-size:13px;margin:4px 0 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:24px 0}
.card{background:#14141B;border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:14px 16px}
.card .k{font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px}
.card .v{font-size:20px;font-weight:800;margin-top:4px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:baseline}
.dot.ok{background:#22c55e;box-shadow:0 0 8px #22c55e}.dot.bad{background:#E50914;box-shadow:0 0 8px #E50914}
h2{font-size:15px;margin:28px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px;background:#14141B;border:1px solid rgba(255,255,255,.07);border-radius:16px;overflow:hidden}
th,td{text-align:left;padding:9px 12px;border-top:1px solid rgba(255,255,255,.05)}
th:first-child,td:first-child{border-top:none}
thead th{background:#101016;color:#a1a1aa;font-size:11px;text-transform:uppercase;letter-spacing:1px}
code{color:#fda4af}.m{font-size:11px;font-weight:800;color:#ffb4ab;white-space:nowrap}
a{color:#ff6b73}.foot{margin-top:24px;color:#71717a;font-size:12px}
.pill{display:inline-block;background:rgba(229,9,20,.15);color:#ff8a90;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700}
</style></head><body><div class="wrap">
<div class="brand">
<svg width="40" height="40" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="13" fill="#E50914"/><path d="M17 51V16h7l8 12.5L40 16h7v35h-7.5V32.5L32 43.5 24.5 32.5V51z" fill="#fff"/></svg>
<div><h1>METFILIX</h1><p class="sub">${service} v${version} — <span id="live">${dot(true)} live</span></p></div>
</div>
<div class="grid">
<div class="card"><div class="k">API</div><div class="v">${dot(db.ok)} ${db.ok ? 'UP' : 'DOWN'}</div></div>
<div class="card"><div class="k">Database</div><div class="v">${dot(db.ok)} ${db.ok ? db.latencyMs + ' ms' : 'unreachable'}</div></div>
<div class="card"><div class="k">Movies</div><div class="v">${counts ? counts.movies : '–'}</div></div>
<div class="card"><div class="k">Users</div><div class="v">${counts ? counts.users : '–'}</div></div>
<div class="card"><div class="k">Watchlists</div><div class="v">${counts ? counts.mylist : '–'}</div></div>
<div class="card"><div class="k">Uptime</div><div class="v" style="font-size:15px">${up(uptime)}</div></div>
</div>
<p><span class="pill">CORS: ${origins.length ? origins.length + ' origin(s) allowed' : 'local-dev mode'}</span>
<span style="color:#71717a;font-size:12px"> ${origins.map(o => `<code>${o}</code>`).join(' ')}</span></p>
<h2>Endpoints</h2>
<table><thead><tr><th>Method</th><th>Path</th><th>Notes</th><th></th></tr></thead><tbody>${rows}</tbody></table>
<p class="foot">Rendered at ${time} • auto-refreshes every 30s</p>
</div>
<script>
setInterval(async () => {
  try {
    const r = await fetch('/health'); const j = await r.json();
    document.getElementById('live').innerHTML = '<span class="dot ok"></span> live';
  } catch { document.getElementById('live').innerHTML = '<span class="dot bad"></span> unreachable'; }
}, 10000);
setTimeout(() => location.reload(), 30000);
</script>
</body></html>`;
}
