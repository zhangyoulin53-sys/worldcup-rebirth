const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function auth(request, env) {
  const v = request.headers.get("authorization") || "";
  return env.ADMIN_TOKEN && v === `Bearer ${env.ADMIN_TOKEN}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!auth(request, env)) return json({ code: "UNAUTHORIZED" }, 401);
  if (!env.REBIRTH_CODES) return json({ code: "NOT_CONFIGURED" }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ code: "BAD_REQUEST" }, 400); }
  const code = String(body.code || "").trim().toUpperCase().replace(/\s+/g, "");
  const raw = await env.REBIRTH_CODES.get(`code:${code}`);
  if (!raw) return json({ code: "NOT_FOUND" }, 404);
  let record;
  try { record = JSON.parse(raw); } catch (_) { return json({ code: "SERVER_DATA" }, 500); }

  record.maxDevices = 3;
  record.devices = [];
  record.lastResetAt = new Date().toISOString();
  await env.REBIRTH_CODES.put(`code:${code}`, JSON.stringify(record));
  return json({ ok: true, code, maxDevices: 3, usedDevices: 0 });
}
