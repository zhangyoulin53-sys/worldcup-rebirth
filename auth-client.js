"use strict";

/*
  Rebirth Football activation client.
  - GitHub Pages remains preview mode while we finish the game.
  - Cloudflare Pages/custom production hosts require server-side activation.
  - One anonymous browser/device id is stored locally; no phone number or account is collected.
*/
(() => {
  const TOKEN_KEY = "rf26_session";
  const DEVICE_KEY = "rf26_device";
  const LEGACY_ACTIVE_KEY = "wc26_v5_active";

  const host = location.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const isGithubPreview = host.endsWith("github.io");
  const required = !isLocal && !isGithubPreview;

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = "dev_" + [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  async function api(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
      cache: "no-store"
    });
    let data = {};
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) {
      const err = new Error(data.message || "验证服务暂时不可用");
      err.code = data.code || "AUTH_ERROR";
      throw err;
    }
    return data;
  }

  async function activate(code) {
    const clean = String(code || "").trim().toUpperCase();
    if (!clean) throw new Error("请输入重生码");
    const data = await api("/api/activate", { code: clean, deviceId: getDeviceId() });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(LEGACY_ACTIVE_KEY, "1");
    return data;
  }

  async function verify() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    try {
      await api("/api/verify", { token, deviceId: getDeviceId() });
      localStorage.setItem(LEGACY_ACTIVE_KEY, "1");
      return true;
    } catch (_) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_ACTIVE_KEY);
      return false;
    }
  }

  window.RebirthAuth = { required, activate, verify, getDeviceId };

  // In production, intercept the old preview-code handler before app.js receives the click.
  document.addEventListener("click", async (e) => {
    if (!required) return;
    const btn = e.target.closest?.('[data-action="activate"]');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "正在确认时间线…";
    try {
      await activate(document.getElementById("code")?.value || "");
      if (typeof window.show === "function") window.show("intro");
      else location.reload();
    } catch (err) {
      const msg = err.code === "DEVICE_LIMIT" ? "这个重生码已经绑定了两台设备" : (err.message || "重生码验证失败");
      if (typeof window.toast === "function") window.toast(msg);
      else alert(msg);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }, true);

  document.addEventListener("DOMContentLoaded", async () => {
    if (!required) return;
    const ok = await verify();
    if (ok && typeof window.show === "function") window.show("intro");
    if (!ok && typeof window.show === "function") window.show("activation");
  });
})();
