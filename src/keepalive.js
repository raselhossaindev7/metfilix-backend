// Free-tier keep-warm — Render spins free web services down after ~15 min
// without inbound traffic (next hit = "Bad Gateway" / 30-60s cold start).
//
// Two layers (both free):
//  1) Self-ping (this file): while the process is awake, GET our own public
//     /health every KEEPALIVE_INTERVAL_MS (default 10 min). Render provides
//     RENDER_EXTERNAL_URL automatically, so zero config is needed there.
//     NOTE: a sleeping process cannot wake itself — self-ping only *delays*
//     sleep while awake.
//  2) External ping: .github/workflows/keepalive.yml hits /health every
//     10 min via GitHub Actions (free). THIS is what actually wakes the
//     service. Keep the repo active (GitHub pauses schedules after 60 days
//     without commits) or add UptimeRobot / cron-job.org as backup.
//
// Env:
//   KEEPALIVE_ENABLED     default "true" (set "false" to disable)
//   KEEPALIVE_URL         base URL to ping (no trailing slash needed),
//                         default RENDER_EXTERNAL_URL (auto-set by Render)
//   KEEPALIVE_INTERVAL_MS default 600000 (10 min), clamped to min 60000

const DEFAULT_MS = 600_000;
const MIN_MS = 60_000;

export function keepAliveConfig(env = process.env) {
  const enabled = (env.KEEPALIVE_ENABLED ?? 'true').toString().toLowerCase() !== 'false';
  const base = (env.KEEPALIVE_URL || env.RENDER_EXTERNAL_URL || '').toString().replace(/\/$/, '');
  const intervalMs = Math.max(MIN_MS, Number(env.KEEPALIVE_INTERVAL_MS) || DEFAULT_MS);
  return { enabled, base, intervalMs };
}

export async function pingOnce(base, fetchFn = fetch) {
  const url = `${base}/health`;
  const started = Date.now();
  try {
    const r = await fetchFn(url, { signal: AbortSignal.timeout(30_000) });
    return { ok: r.ok, status: r.status, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export function startKeepAlive(env = process.env, fetchFn = fetch) {
  const { enabled, base, intervalMs } = keepAliveConfig(env);
  if (!enabled) { console.log('[keepalive] disabled'); return null; }
  if (!base) { console.log('[keepalive] disabled: set KEEPALIVE_URL or deploy on Render (RENDER_EXTERNAL_URL)'); return null; }
  console.log(`[keepalive] pinging ${base}/health every ${Math.round(intervalMs / 1000)}s`);
  const timer = setInterval(async () => {
    const r = await pingOnce(base, fetchFn);
    console.log(`[keepalive] ${r.ok ? `ok (${r.status}, ${r.ms}ms)` : `FAIL: ${r.error || r.status}`}`);
  }, intervalMs);
  timer.unref?.();
  return timer;
}
