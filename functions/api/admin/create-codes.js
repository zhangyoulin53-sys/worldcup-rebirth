const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function auth(request, env) {
  const v = request.headers.get("authorization") || "";
  return env.ADMIN_TOKEN && v === `Bearer ${env.ADMIN_TOKEN}`;
}
function randomPart(n = 4) {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => alphabet[b % alphabet.length]).join("");
}
function makeCode() { return `RF26-${randomPart()}-${randomPart()}`; }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!auth(request, env)) return json({ code: "UNAUTHORIZED" }, 401);
  if (!env.REBIRTH_CODES) return json({ code: "NOT_CONFIGURED" }, 503);

  let body = {};
  try { body = await request.json(); } catch (_) {}
  let count = Math.floor(Number(body.count || 1));
  if (!Number.isFinite(count) || count < 1) count = 1;
  count = Math.min(count, 100);
  const maxDevices = Math.min(5, Math.max(1, Math.floor(Number(body.maxDevices || 2))));
  const created = [];

  for (let i = 0; i < count; i++) {
    let code;
    for (let tries = 0; tries < 10; tries++) {
      code = makeCode();
      if (!(await env.REBIRTH_CODES.get(`code:${code}`))) break;
    }
    const record = {
      status: "active",
      maxDevices,
      devices: [],
      createdAt: new Date().toISOString(),
      note: String(body.note || "").slice(0, 120)
    };
    await env.REBIRTH_CODES.put(`code:${code}`, JSON.stringify(record));
    created.push(code);
  }
  return json({ ok: true, count: created.length, codes: created });
}
