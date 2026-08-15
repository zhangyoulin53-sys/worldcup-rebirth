const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Rebirth Football · 管理后台</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:#08142d;color:#fff;min-height:100vh}main{max-width:720px;margin:auto;padding:28px 18px 60px}.brand{font-weight:800;letter-spacing:.08em;color:#f2c56b}.sub{color:#9fb0ce;font-size:13px;line-height:1.6}.card{background:#101f3e;border:1px solid #27395d;border-radius:18px;padding:18px;margin-top:16px;box-shadow:0 14px 36px #0004}h1{font-size:28px;margin:8px 0}h2{font-size:18px;margin:0 0 14px}label{display:block;font-size:13px;color:#bdc9df;margin:12px 0 6px}input{width:100%;border:1px solid #344b75;background:#091630;color:#fff;padding:12px;border-radius:10px;font-size:15px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fixedBox{border:1px solid #344b75;background:#091630;padding:12px;border-radius:10px;font-size:15px;color:#f0c568;font-weight:800}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}button{border:0;border-radius:10px;padding:12px 16px;font-weight:700;cursor:pointer;background:#f0c568;color:#1b2230}button.secondary{background:#20365e;color:#fff}button.danger{background:#662c35;color:#fff}button:disabled{opacity:.5;cursor:wait}.status{margin-top:12px;color:#a9bad6;font-size:13px;min-height:20px}.codes{margin-top:12px;display:grid;gap:8px}.code{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#08142d;border:1px solid #2c426b;border-radius:10px;padding:10px 12px}.code b{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em}.warning{color:#f0c568;font-size:12px;line-height:1.5;margin-top:12px}@media(max-width:520px){.row{grid-template-columns:1fr}.code{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body><main>
<div class="brand">REBIRTH FOOTBALL</div>
<h1>重生码管理</h1>
<div class="sub">仅供项目所有者使用。管理员密钥不会写入网页源码，只在本次浏览器会话中使用。</div>

<section class="card">
<h2>管理员验证</h2>
<label>ADMIN_TOKEN</label>
<input id="token" type="password" autocomplete="off" placeholder="输入 Cloudflare 中保存的管理员密钥" />
<div class="actions"><button class="secondary" id="remember">本次会话记住</button><button class="secondary" id="forget">清除</button></div>
<div class="warning">不要把 ADMIN_TOKEN 发给买家，也不要截图公开。买家只需要收到 RF26-XXXX-XXXX 重生码。</div>
</section>

<section class="card">
<h2>生成重生码</h2>
<div class="row">
<div><label>生成数量</label><input id="count" type="number" min="1" max="100" value="5" /></div>
<div><label>每码允许设备</label><div class="fixedBox">固定 3 个浏览器/设备环境</div></div>
</div>
<label>备注（可选）</label><input id="note" placeholder="例如：小红书首批 / 订单20260815" maxlength="120" />
<div class="actions"><button id="generate">生成重生码</button><button class="secondary" id="copyAll" disabled>复制全部</button></div>
<div class="status" id="genStatus">后台脚本已加载，等待操作。</div>
<div class="codes" id="codes"></div>
</section>

<section class="card">
<h2>重置设备绑定</h2>
<div class="sub">用户换手机、清浏览器数据或误占设备名额时使用。重置后会清空现有绑定，该码可重新绑定最多 3 个浏览器/设备环境。</div>
<label>重生码</label><input id="resetCode" placeholder="RF26-XXXX-XXXX" autocomplete="off" />
<div class="actions"><button class="danger" id="reset">清空该码设备绑定</button></div>
<div class="status" id="resetStatus"></div>
</section>
</main>
<script>
const $=id=>document.getElementById(id);let latest=[];
window.addEventListener("error",e=>{const s=$("genStatus");if(s)s.textContent="页面脚本错误："+(e.message||"未知错误")});
const token=()=>$("token").value.trim();
const api=async(path,body)=>{const t=token();if(!t)throw new Error("请先输入 ADMIN_TOKEN");const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+t},body:JSON.stringify(body||{}),cache:"no-store"});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.message||d.code||("请求失败 "+r.status));return d};
const esc=s=>String(s).replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function renderCodes(){const box=$("codes");box.innerHTML=latest.map(c=>'<div class="code"><b>'+esc(c)+'</b><button class="secondary one" data-code="'+esc(c)+'">复制</button></div>').join('');$("copyAll").disabled=!latest.length}
$("remember").onclick=()=>{if(!token())return alert("先输入 ADMIN_TOKEN");sessionStorage.setItem("rf_admin_token",token());$("genStatus").textContent="已仅在本次浏览器会话中记住"};
$("forget").onclick=()=>{sessionStorage.removeItem("rf_admin_token");$("token").value=""};
$("generate").onclick=async()=>{const b=$("generate");b.disabled=true;$("genStatus").textContent="正在生成…";try{const d=await api("/api/admin/create-codes",{count:Number($("count").value||1),note:$("note").value});latest=d.codes||[];renderCodes();$("genStatus").textContent="已生成 "+latest.length+" 个重生码 · 每码固定最多 3 个浏览器/设备环境"}catch(e){$("genStatus").textContent="失败："+e.message}finally{b.disabled=false}};
$("copyAll").onclick=async()=>{if(!latest.length)return;await navigator.clipboard.writeText(latest.join(String.fromCharCode(10)));$("genStatus").textContent="已复制全部重生码"};
document.addEventListener("click",async e=>{const b=e.target.closest(".one");if(!b)return;await navigator.clipboard.writeText(b.dataset.code);b.textContent="已复制";setTimeout(()=>b.textContent="复制",900)});
$("reset").onclick=async()=>{const code=$("resetCode").value.trim().toUpperCase();if(!code)return $("resetStatus").textContent="请输入重生码";if(!confirm("确定清空 "+code+" 的全部设备绑定吗？"))return;const b=$("reset");b.disabled=true;$("resetStatus").textContent="正在重置…";try{const d=await api("/api/admin/reset-code",{code});$("resetStatus").textContent=d.ok?"已清空设备绑定，该码现在可重新绑定最多 3 个浏览器/设备环境":"操作完成"}catch(e){$("resetStatus").textContent="失败："+e.message}finally{b.disabled=false}};
const saved=sessionStorage.getItem("rf_admin_token");if(saved)$("token").value=saved;
</script></body></html>`;

export async function onRequestGet() {
  return new Response(page, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}
