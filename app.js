"use strict";
const LEVELS=[
 {min:0,name:"街头幸存者",icon:"🥀",desc:"积分跌到100以下，重新体验落魄球迷生活。"},
 {min:100,name:"普通球迷",icon:"👕",desc:"你回到世界杯开幕日，手里只有100积分。"},
 {min:300,name:"足球懂哥",icon:"⚽",desc:"开始有人觉得你确实懂球。"},
 {min:1000,name:"世界杯预言家",icon:"🧥",desc:"越来越多人怀疑你是不是知道未来。"},
 {min:5000,name:"时间旅行者",icon:"👑",desc:"皇冠已经戴上，你像真正的重生者一样俯瞰世界杯。"}
];
const HOME_SCORES=["1:0","2:0","2:1","3:0","3:1","3:2","4:0","4:1","4:2","5:0","5:1","5:2"];
const DRAW_SCORES=["0:0","1:1","2:2","3:3"];
const AWAY_SCORES=["0:1","0:2","1:2","0:3","1:3","2:3","0:4","1:4","2:4","0:5","1:5","2:5"];
const HTFT_LABEL={HH:"胜胜",HD:"胜平",HA:"胜负",DH:"平胜",DD:"平平",DA:"平负",AH:"负胜",AD:"负平",AA:"负负"};
const $=id=>document.getElementById(id);
function safeGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function safeSet(k,v){try{localStorage.setItem(k,v);return true}catch(e){return false}}
let state={balance:100,dayIndex:0,alive:0,hits:0,misses:0,maxBalance:100,bestLevel:1};
let picks={};
let custom=loadCustom();
let activeMatch=null;
let memTimer=null,memLeft=90;

function show(id){document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));$(id).classList.add("active");window.scrollTo(0,0)}
function toast(msg){let t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove("show"),1800)}
function money(x){x=Math.round(Number(x)*100)/100;return Number.isInteger(x)?String(x):x.toFixed(2)}
function levelIndex(b){let n=0;LEVELS.forEach((x,i)=>{if(b>=x.min)n=i});return n}
function currentLevel(){return LEVELS[levelIndex(state.balance)]}
function key(mid){return mid}
function pick(mid){return picks[key(mid)]||(picks[key(mid)]={market:null,selection:null,stake:null,odds:null,label:null,line:null,status:null})}
function customFor(mid,market){return custom[mid]?.[market]||null}
function loadCustom(){try{return JSON.parse(safeGet("wc26_v4_custom")||"{}")}catch(e){return {}}}
function saveCustom(){safeSet("wc26_v4_custom",JSON.stringify(custom))}
function realWdl(m){let c=customFor(m.matchId,"wdl");if(c){return {H:+c.H,D:+c.D,A:+c.A,book:c.source||"自定义导入",status:"真实导入"}}return {...m.realOdds,status:"真实赛前"}}

function renderFlagWall(){let names=["墨西哥","加拿大","美国","阿根廷","巴西","法国","西班牙","葡萄牙","英格兰","德国","日本","韩国"]; $("flagwall").innerHTML=names.map(n=>`<img alt="${n}" src="${FLAG_DATA[n]}">`).join("")}
function renderHome(){
 let d=DAYS[state.dayIndex]||DAYS[DAYS.length-1],lv=currentLevel(),idx=levelIndex(state.balance);
 $("homeDay").textContent=`DAY ${String(d.dayNo).padStart(2,"0")}`;$("balance").textContent=money(state.balance);$("daysAlive").textContent=state.alive;$("hits").textContent=state.hits;
 $("avatar").textContent=lv.icon;$("identityName").textContent=lv.name;$("identityDesc").textContent=lv.desc;
 let next=LEVELS[Math.min(idx+1,LEVELS.length-1)], pct=idx===LEVELS.length-1?100:Math.max(0,Math.min(100,(state.balance-lv.min)/(next.min-lv.min)*100));$("levelBar").style.width=pct+"%";
 $("dayDate").textContent=d.date;$("dayTitle").textContent=`DAY ${String(d.dayNo).padStart(2,"0")}`;$("dayCount").textContent=`今日 ${d.matches.length} 场`;$("dayStage").textContent=d.stage;$("dayIntro").textContent=d.matches.map(m=>m.time+" "+m.home+" vs "+m.away).join(" · ");
 renderFlagWall();
}
function renderMemory(){
 let stage="";let html="";
 DAYS.forEach(d=>{if(d.stage!==stage){stage=d.stage;html+=`<div class="memoryStage"><h3>${stage}</h3>`}else html+=`<div class="memoryStage">`;html+=`<div class="memoryDate">世界杯第${d.dayNo}天 · ${d.date}</div>`+d.matches.map(m=>`<div class="memoryMatch"><div>${m.home}</div><div class="memoryScore">${m.score90[0]} : ${m.score90[1]}</div><div class="right">${m.away}</div></div>`).join("")+`</div>`});
 $("memoryBody").innerHTML=html;
}
function startMemory(){memLeft=90;renderMemory();show("memory");updateTimer();clearInterval(memTimer);memTimer=setInterval(()=>{memLeft--;updateTimer();if(memLeft<=0){clearInterval(memTimer);enterDay()}},1000)}
function updateTimer(){let m=Math.floor(Math.max(0,memLeft)/60),s=Math.max(0,memLeft)%60;$("timer").textContent=String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}

function renderGame(){
 let d=DAYS[state.dayIndex];$("gameBrand").textContent=`DAY ${String(d.dayNo).padStart(2,"0")}`;$("gameBalance").textContent=money(state.balance)+"分";$("gameTitle").textContent=`${d.date} · ${d.stage}`;
 $("matchList").innerHTML=d.matches.map(m=>matchCard(m)).join("");updateDaySummary()
}
function matchCard(m){
 let o=realWdl(m),p=pick(m.matchId);
 return `<div class="matchCard">
 <div class="matchHeader"><b>${m.matchId.toUpperCase()} · ${m.group||m.stage}</b><span>${m.time} · ${o.status}</span></div>
 <div class="teams"><div><img class="teamFlag" src="${FLAG_DATA[m.home]}" alt="${m.home}"><div class="teamName">${m.home}</div></div><div class="vs">VS</div><div><img class="teamFlag" src="${FLAG_DATA[m.away]}" alt="${m.away}"><div class="teamName">${m.away}</div></div></div>
 <div class="odds3">
   ${quick(m,"H","主胜",o.H,p)}${quick(m,"D","平",o.D,p)}${quick(m,"A","客胜",o.A,p)}
 </div>
 <div class="matchFoot"><div class="pickSummary">${p.selection?`已选：<b>${p.label}</b> · ${p.odds} · 投入 ${p.stake??"未选"}`:`1X2来源：${o.book||"公开预览"} · 可展开完整玩法`}</div><button class="expand" data-action="open-sheet" data-mid="${m.matchId}">展开全部</button></div>
 <div class="stakes">${[10,20,50,100,"ALL"].map(s=>`<button class="stake ${String(p.stake)===String(s)?"selected":""}" data-action="stake" data-mid="${m.matchId}" data-stake="${s}">${s==="ALL"?"全部":s}</button>`).join("")}</div>
 </div>`
}
function quick(m,sel,label,odds,p){return `<button class="quickOpt ${p.market==="wdl"&&p.selection===sel?"selected":""}" data-action="quick" data-mid="${m.matchId}" data-sel="${sel}" data-label="${label}" data-odds="${odds}"><b>${label}</b><small>${money(odds)}</small></button>`}

function findMatch(mid){for(const d of DAYS)for(const m of d.matches)if(m.matchId===mid)return m;return null}
function openSheet(mid){activeMatch=findMatch(mid);if(!activeMatch)return;renderSheet();$("marketOverlay").classList.add("open");document.body.style.overflow="hidden"}
function closeSheet(){$("marketOverlay").classList.remove("open");document.body.style.overflow="";activeMatch=null;renderGame()}
function renderSheet(){
 let m=activeMatch,p=pick(m.matchId),wdl=realWdl(m),hc=handicapMarket(m),sc=scoreMarket(m),go=goalsMarket(m),hf=htftMarket(m);
 $("sheetTop").textContent=`${m.matchId.toUpperCase()}  ${m.stage}  ${m.date.slice(5).replace("-","-")} ${m.time}`;
 $("sheetHF").src=FLAG_DATA[m.home];$("sheetAF").src=FLAG_DATA[m.away];$("sheetHome").textContent=m.home;$("sheetAway").textContent=m.away;
 let wdlHtml=`<div class="marketSection"><div class="sectionTitle"><h3>胜平负</h3><span class="badge real">${wdl.status}</span></div><div class="optGrid3">${marketBtn(m,"wdl","H","主胜",wdl.H,p,"real")}${marketBtn(m,"wdl","D","平",wdl.D,p,"real")}${marketBtn(m,"wdl","A","客胜",wdl.A,p,"real")}</div><div class="sub" style="margin-top:6px">来源：${wdl.book||"公开预览"}</div></div>`;
 let hcHtml=`<div class="marketSection"><div class="sectionTitle"><h3>让球胜平负</h3><span class="badge ${hc.real?"real":"demo"}">${hc.real?"真实导入":"体验倍率"}</span></div><div class="handicapLine"><span class="lineBubble">${hc.line>0?"+":""}${hc.line}</span><span>主队让球线：${hc.line>0?"+":""}${hc.line}${hc.real?"":"（由1X2强弱自动生成，仅用于模拟）"}</span></div><div class="optGrid3">${marketBtn(m,"handicap","H","让胜",hc.H,p,hc.real?"real":"demo",hc.line)}${marketBtn(m,"handicap","D","让平",hc.D,p,hc.real?"real":"demo",hc.line)}${marketBtn(m,"handicap","A","让负",hc.A,p,hc.real?"real":"demo",hc.line)}</div></div>`;
 let scoreHtml=`<div class="marketSection"><div class="sectionTitle"><h3>比分</h3><span class="badge ${sc.real?"real":"demo"}">${sc.real?"真实导入":"体验倍率"}</span></div><div class="dividerLabel">主胜比分</div><div class="scoreGrid">
 ${HOME_SCORES.map(s=>marketBtn(m,"score",s,s,sc.odds[s],p,sc.real?"real":"demo")).join("")}
 ${marketBtn(m,"score","胜其它","胜其它",sc.odds["胜其它"],p,sc.real?"real":"demo",null,true)}
 </div><div class="dividerLabel">平局比分</div><div class="scoreGrid">${DRAW_SCORES.map(s=>marketBtn(m,"score",s,s,sc.odds[s],p,sc.real?"real":"demo")).join("")}${marketBtn(m,"score","平其它","平其它",sc.odds["平其它"],p,sc.real?"real":"demo")}</div>
 <div class="dividerLabel">客胜比分</div><div class="scoreGrid">${AWAY_SCORES.map(s=>marketBtn(m,"score",s,s,sc.odds[s],p,sc.real?"real":"demo")).join("")}${marketBtn(m,"score","负其它","负其它",sc.odds["负其它"],p,sc.real?"real":"demo",null,true)}</div></div>`;
 let goalsHtml=`<div class="marketSection"><div class="sectionTitle"><h3>总进球数</h3><span class="badge ${go.real?"real":"demo"}">${go.real?"真实导入":"体验倍率"}</span></div><div class="optGrid4">${["0","1","2","3","4","5","6","7+"].map(s=>marketBtn(m,"goals",s,s==="7+"?"7+球":s+"球",go.odds[s],p,go.real?"real":"demo")).join("")}</div></div>`;
 let hfHtml=`<div class="marketSection"><div class="sectionTitle"><h3>半全场</h3><span class="badge ${hf.real?"real":"lock"}">${hf.real?"真实导入":"待半场真实数据"}</span></div><div class="optGrid3">${Object.keys(HTFT_LABEL).map(s=>marketBtn(m,"htft",s,HTFT_LABEL[s],hf.odds[s]||"--",p,hf.real?"real":"locked",null,false,!hf.real)).join("")}</div><div class="notice">为避免把推测的半场比分当成真实历史数据，V4默认不伪造半全场结果；导入真实半场/半全场数据后自动解锁。</div></div>`;
 $("sheetScroll").innerHTML=wdlHtml+hcHtml+scoreHtml+goalsHtml+hfHtml+`<div style="height:6px"></div>`;
 updateSheetPick()
}
function marketBtn(m,market,sel,label,odds,p,status,line=null,wide=false,disabled=false){
 let cls=`option ${wide?"wide":""} ${p.market===market&&p.selection===sel?"selected":""} ${disabled?"disabled":""}`;
 return `<button class="${cls}" ${disabled?"disabled":""} data-action="market-pick" data-mid="${m.matchId}" data-market="${market}" data-sel="${sel}" data-label="${label}" data-odds="${odds}" data-status="${status}" ${line!==null?`data-line="${line}"`:""}><b>${label}</b><small>${typeof odds==="number"?money(odds):odds}</small></button>`
}
function updateSheetPick(){if(!activeMatch)return;let p=pick(activeMatch.matchId);$("sheetPick").innerHTML=p.selection?`当前选择：<b>${p.label}</b> · ${p.odds} · ${p.status==="real"?"真实赔率":"体验倍率"} · 投入 ${p.stake??"未选"}`:"尚未选择；你可以在上方任选一种玩法。"}

function normalizedProb(m){let o=realWdl(m),ps=[1/o.H,1/o.D,1/o.A],s=ps.reduce((a,b)=>a+b,0);return {H:ps[0]/s,D:ps[1]/s,A:ps[2]/s}}
function lambdas(m){let p=normalizedProb(m),edge=p.H-p.A,total=2.55+(0.24-Math.min(.24,p.D))*.9;let h=Math.max(.32,total/2+edge*1.25),a=Math.max(.32,total-h);return [h,a]}
function fact(n){let x=1;for(let i=2;i<=n;i++)x*=i;return x}
function pois(k,l){return Math.exp(-l)*Math.pow(l,k)/fact(k)}
function price(prob){if(!prob||prob<.0028)return 300;return Math.min(300,Math.max(1.12,Math.round((.88/prob)*100)/100))}
function scoreMarket(m){
 let c=customFor(m.matchId,"score");if(c){let o={};Object.keys(c).forEach(k=>{if(k!=="source")o[k]=+c[k]});return {real:true,odds:o}}
 let [lh,la]=lambdas(m),o={},homeAgg=0,drawAgg=0,awayAgg=0;
 for(let h=0;h<=10;h++)for(let a=0;a<=10;a++){let pr=pois(h,lh)*pois(a,la),s=`${h}:${a}`;if(h>a){if(HOME_SCORES.includes(s))o[s]=price(pr);else homeAgg+=pr}else if(h===a){if(DRAW_SCORES.includes(s))o[s]=price(pr);else drawAgg+=pr}else{if(AWAY_SCORES.includes(s))o[s]=price(pr);else awayAgg+=pr}}
 o["胜其它"]=price(homeAgg);o["平其它"]=price(drawAgg);o["负其它"]=price(awayAgg);
 [...HOME_SCORES,...DRAW_SCORES,...AWAY_SCORES].forEach(s=>{if(!o[s])o[s]=300});
 return {real:false,odds:o}
}
function goalsMarket(m){
 let c=customFor(m.matchId,"goals");if(c){let o={};Object.keys(c).forEach(k=>{if(k!=="source")o[k]=+c[k]});return {real:true,odds:o}}
 let [h,a]=lambdas(m),l=h+a,o={};for(let k=0;k<=6;k++)o[String(k)]=price(pois(k,l));let sum=0;for(let k=7;k<=16;k++)sum+=pois(k,l);o["7+"]=price(sum);return {real:false,odds:o}
}
function handicapMarket(m){
 let c=customFor(m.matchId,"handicap");if(c){return {real:true,line:+c.line,H:+c.H,D:+c.D,A:+c.A}}
 let o=realWdl(m),line=0;if(o.H<1.18)line=-2;else if(o.H<1.75)line=-1;else if(o.A<1.18)line=2;else if(o.A<1.75)line=1;
 let p=normalizedProb(m);let shift=-line*.11;let ph=Math.max(.08,Math.min(.78,p.H+shift)),pd=Math.max(.12,Math.min(.36,p.D)),pa=Math.max(.08,1-ph-pd),s=ph+pd+pa;ph/=s;pd/=s;pa/=s;
 return {real:false,line,H:price(ph),D:price(pd),A:price(pa)}
}
function htftMarket(m){let c=customFor(m.matchId,"htft");if(c){let o={};Object.keys(c).forEach(k=>{if(k!=="source")o[k]=+c[k]});return {real:true,odds:o}}return {real:false,odds:{}}}

function setPick(mid,market,sel,label,odds,status,line=null){
 let p=pick(mid);p.market=market;p.selection=sel;p.label=label;p.odds=+odds;p.status=status;p.line=line!==null?+line:null;
 if(activeMatch)renderSheet();else renderGame();updateDaySummary()
}
function setStake(mid,s){let p=pick(mid);p.stake=s==="ALL"?"ALL":+s;if(activeMatch)updateSheetPick();renderGame();updateDaySummary()}
function currentDayPicks(){let d=DAYS[state.dayIndex];return d.matches.map(m=>[m,pick(m.matchId)]).filter(([m,p])=>p.selection&&p.stake!==null)}
function stakeValue(p,startBal){return p.stake==="ALL"?startBal:+p.stake}
function updateDaySummary(){let ps=currentDayPicks(),start=state.balance,total=ps.reduce((a,[m,p])=>a+stakeValue(p,start),0);$("selectedSummary").textContent=`已选 ${ps.length} 场`;$("stakeSummary").textContent=`今日投入 ${money(total)} / 当前 ${money(start)}`}
function resultFor(m,p){
 if(p.market==="wdl")return p.selection===m.result90;
 if(p.market==="goals"){let g=m.goals90;return p.selection==="7+"?g>=7:String(g)===p.selection}
 if(p.market==="score"){let s=`${m.score90[0]}:${m.score90[1]}`;if(p.selection===s)return true;if(p.selection==="胜其它")return m.score90[0]>m.score90[1]&&!HOME_SCORES.includes(s);if(p.selection==="平其它")return m.score90[0]===m.score90[1]&&!DRAW_SCORES.includes(s);if(p.selection==="负其它")return m.score90[0]<m.score90[1]&&!AWAY_SCORES.includes(s);return false}
 if(p.market==="handicap"){let h=m.score90[0]+(p.line||0),a=m.score90[1],r=h>a?"H":h===a?"D":"A";return p.selection===r}
 if(p.market==="htft"){return null}
 return false
}
function settle(){
 let ps=currentDayPicks(),start=state.balance,total=ps.reduce((a,[m,p])=>a+stakeValue(p,start),0);
 if(!ps.length){toast("今天还没有选择任何比赛");return}
 if(total>start+1e-9){toast("今日投入超过当前积分，请减少投入");return}
 let delta=0,hit=0,best=-1e9,items=[];
 ps.forEach(([m,p])=>{let st=stakeValue(p,start),ok=resultFor(m,p);if(ok===null){items.push({m,p,st,delta:0,note:"缺真实半场数据，自动退还"});return}let d=ok?st*(p.odds-1):-st;delta+=d;if(ok){hit++;state.hits++}else state.misses++;best=Math.max(best,d);items.push({m,p,st,delta:d,note:ok?"命中":"未命中"})});
 state.balance=Math.max(0,Math.round((state.balance+delta)*100)/100);state.maxBalance=Math.max(state.maxBalance,state.balance);state.alive++;let li=levelIndex(state.balance);state.bestLevel=Math.max(state.bestLevel,li);
 renderResult(DAYS[state.dayIndex],items,delta,hit,best===-1e9?0:best);show("result")
}
function renderResult(d,items,delta,hit,best){$("resultDay").textContent=`DAY ${d.dayNo}`;$("delta").textContent=(delta>=0?"+":"")+money(delta);$("delta").className="bigDelta "+(delta<0?"bad":"");$("newBal").textContent=money(state.balance);$("todayHit").textContent=`${hit}/${items.length}`;$("bestGain").textContent=(best>=0?"+":"")+money(best);$("resultList").innerHTML=items.map(x=>`<div class="resultItem"><div><b>${x.m.home} ${x.m.score90[0]}:${x.m.score90[1]} ${x.m.away}</b><p>${x.p.label} · ${x.p.odds} · 投入${money(x.st)} · ${x.note}</p></div><div class="gain ${x.delta<0?"bad":"good"}">${x.delta>0?"+":""}${money(x.delta)}</div></div>`).join("")}
function nextDay(){if(state.balance<=0){toast("积分归零，已重置为街头幸存者");state.balance=50}if(state.dayIndex>=DAYS.length-1){state.dayIndex=0;toast("世界杯已通关，可再次重生");renderHome();show("home");return}state.dayIndex++;renderHome();show("home")}

function parseCSV(text){
 let rows=[],row=[],cell="",q=false;for(let i=0;i<text.length;i++){let c=text[i],n=text[i+1];if(q){if(c=='"'&&n=='"'){cell+='"';i++}else if(c=='"')q=false;else cell+=c}else{if(c=='"')q=true;else if(c==","){row.push(cell);cell=""}else if(c=="\n"){row.push(cell);rows.push(row);row=[];cell=""}else if(c!="\r")cell+=c}}if(cell||row.length){row.push(cell);rows.push(row)}if(rows.length<2)return[];let h=rows[0].map(x=>x.trim());return rows.slice(1).filter(r=>r.some(x=>x.trim())).map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]||"").trim()])))
}
function importRecords(records){
 let n=0;for(const r of records){let mid=(r.match_id||r.matchId||"").trim();let market=(r.market||"").trim().toLowerCase();let sel=(r.selection||"").trim();let odds=parseFloat(r.odds);if(!mid||!market||!sel||!isFinite(odds))continue;custom[mid]??={};custom[mid][market]??={};custom[mid][market][sel]=odds;if(r.source)custom[mid][market].source=r.source;if(market==="handicap"&&r.line!=="")custom[mid][market].line=parseFloat(r.line);n++}saveCustom();return n
}
async function handleFile(file){try{let text=await file.text(),records;if(file.name.toLowerCase().endsWith(".json")){let j=JSON.parse(text);records=Array.isArray(j)?j:(j.records||[])}else records=parseCSV(text);let n=importRecords(records);updateCustomCount();toast(`成功导入 ${n} 条赔率记录`)}catch(e){console.error(e);toast("导入失败：请检查CSV/JSON格式")}}
function updateCustomCount(){let n=0;Object.values(custom).forEach(m=>Object.values(m).forEach(v=>{n+=Object.keys(v).filter(k=>!["source","line"].includes(k)).length}));$("customCount").textContent=n?`已导入 ${n} 条`:"待额外导入"}
function enterDay(){clearInterval(memTimer);renderGame();show("game")}

/* unified click/touch-safe event delegation */
document.addEventListener("click",e=>{
 let b=e.target.closest("[data-action]");if(!b)return;let a=b.dataset.action;
 if(a==="activate"){if($("code").value.trim().toUpperCase()!=="WC26-V4-DEMO"){toast("激活码不正确");return}safeSet("wc26_v4_active","1");renderHome();show("home")}
 else if(a==="home"){renderHome();show("home")}
 else if(a==="memory")startMemory();
 else if(a==="enter-day")enterDay();
 else if(a==="data-center"){updateCustomCount();show("data")}
 else if(a==="quick"){setPick(b.dataset.mid,"wdl",b.dataset.sel,b.dataset.label,+b.dataset.odds,"real")}
 else if(a==="stake"){setStake(b.dataset.mid,b.dataset.stake)}
 else if(a==="open-sheet")openSheet(b.dataset.mid)
 else if(a==="close-sheet")closeSheet()
 else if(a==="market-pick"&&!b.disabled){setPick(b.dataset.mid,b.dataset.market,b.dataset.sel,b.dataset.label,+b.dataset.odds,b.dataset.status,b.dataset.line??null)}
 else if(a==="settle")settle();
 else if(a==="next-day")nextDay();
 else if(a==="clear-import"){custom={};saveCustom();updateCustomCount();toast("已清除自行导入数据")}
});
$("marketOverlay").addEventListener("click",e=>{if(e.target===$("marketOverlay"))closeSheet()});
$("fileInput").addEventListener("change",e=>{if(e.target.files&&e.target.files[0])handleFile(e.target.files[0]);e.target.value=""});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("marketOverlay").classList.contains("open"))closeSheet()});

renderFlagWall();
if(safeGet("wc26_v4_active")==="1"){renderHome();show("home")}