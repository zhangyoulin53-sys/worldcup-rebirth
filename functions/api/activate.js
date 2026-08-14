const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function normalizeCode(v) {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.REBIRTH_CODES) return json({ code: "NOT_CONFIGURED", message: "激活服务尚未配置" }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ code: "BAD_REQUEST", message: "请求格式错误" }, 400); }
  const code = normalizeCode(body.code);
  const deviceId = String(body.deviceId || "").trim();
  if (!code || !deviceId || deviceId.length > 80) return json({ code: "BAD_REQUEST", message: "请输入有效的重生码" }, 400);

  const key = `code:${code}`;
  const raw = await env.REBIRTH_CODES.get(key);
  if (!raw) return json({ code: "INVALID_CODE", message: "重生码不存在或已失效" }, 403);

  let record;
  try { record = JSON.parse(raw); } catch (_) { return json({ code: "SERVER_DATA", message: "重生码数据异常" }, 500); }
  if (record.status === "disabled") return json({ code: "DISABLED", message: "这个重生码已停用" }, 403);

  const devices = Array.isArray(record.devices) ? record.devices : [];
  const maxDevices = Number(record.maxDevices || 2);
  const now = new Date().toISOString();
  let found = devices.find(x => x.id === deviceId);
  if (!found) {
    if (devices.length >= maxDevices) return json({ code: "DEVICE_LIMIT", message: `该重生码最多可激活 ${maxDevices} 台设备` }, 403);
    found = { id: deviceId, firstSeen: now, lastSeen: now };
    devices.push(found);
  } else {
    found.lastSeen = now;
  }

  record.devices = devices;
  record.lastActivatedAt = now;
  if (!record.firstActivatedAt) record.firstActivatedAt = now;
  await env.REBIRTH_CODES.put(key, JSON.stringify(record));

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await env.REBIRTH_CODES.put(`session:${token}`, JSON.stringify({ code, deviceId, createdAt: now }), { expirationTtl: 60 * 60 * 24 * 365 });

  return json({ ok: true, token, maxDevices, usedDevices: devices.length });
}
