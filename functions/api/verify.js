const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.REBIRTH_CODES) return json({ code: "NOT_CONFIGURED", message: "激活服务尚未配置" }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ code: "BAD_REQUEST" }, 400); }
  const token = String(body.token || "").trim();
  const deviceId = String(body.deviceId || "").trim();
  if (!token || !deviceId) return json({ code: "UNAUTHORIZED" }, 401);

  const raw = await env.REBIRTH_CODES.get(`session:${token}`);
  if (!raw) return json({ code: "SESSION_EXPIRED", message: "重生资格需要重新确认" }, 401);

  let session;
  try { session = JSON.parse(raw); } catch (_) { return json({ code: "UNAUTHORIZED" }, 401); }
  if (session.deviceId !== deviceId) return json({ code: "DEVICE_MISMATCH", message: "设备验证失败" }, 401);

  const codeRaw = await env.REBIRTH_CODES.get(`code:${session.code}`);
  if (!codeRaw) return json({ code: "INVALID_CODE" }, 401);
  let record;
  try { record = JSON.parse(codeRaw); } catch (_) { return json({ code: "INVALID_CODE" }, 401); }
  if (record.status === "disabled") return json({ code: "DISABLED", message: "该重生码已停用" }, 403);
  const devices = Array.isArray(record.devices) ? record.devices : [];
  if (!devices.some(x => x.id === deviceId)) return json({ code: "DEVICE_REVOKED", message: "该设备授权已被移除" }, 401);

  return json({ ok: true });
}
