"use strict";

const LEVELS=[
  {min:0,name:"街头幸存者",icon:"🥀",desc:"积分见底，但你的世界杯还没有完全结束。"},
  {min:100,name:"普通球迷",icon:"👕",desc:"你带着100积分回到了世界杯开幕日。"},
  {min:300,name:"足球懂哥",icon:"⚽",desc:"你的选择开始让身边的人刮目相看。"},
  {min:1000,name:"世界杯预言家",icon:"🧥",desc:"越来越多人怀疑，你是不是知道未来。"},
  {min:5000,name:"时间旅行者",icon:"👑",desc:"皇冠已经戴上，你像真正的重生者一样俯瞰世界杯。"}
];
const HOME_SCORES=["1:0","2:0","2:1","3:0","3:1","3:2","4:0","4:1","4:2","5:0","5:1","5:2"];
const DRAW_SCORES=["0:0","1:1","2:2","3:3"];
const AWAY_SCORES=["0:1","0:2","1:2","0:3","1:3","2:3","0:4","1:4","2:4","0:5","1:5","2:5"];
const HTFT_LABEL={HH:"胜胜",HD:"胜平",HA:"胜负",DH:"平胜",DD:"平平",DA:"平负",AH:"负胜",AD:"负平",AA:"负负"};
const BASE_UNIT=2;
const $=id=>document.getElementById(id);

function safeGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function safeSet(k,v){try{localStorage.setItem(k,v);return true}catch(e){return false}}
function money(x){x=Math.round(Number(x)*100)/100;return Number.isInteger(x)?String(x):x.toFixed(2)}
function show(id){document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));$(id).classList.add("active");window.scrollTo(0,0)}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove("show"),1700)}

let state={balance:100,dayIndex:0,alive:0,hits:0,misses:0,maxBalance:100,bestLevel:1};
let picks={};
let activeMatch=null;
let memTimer=null,memLeft=60;

function levelIndex(b){let n=0;LEVELS.forEach((x,i)=>{if(b>=x.min)n=i});return n}
function currentLevel(){return LEVELS[levelIndex(state.balance)]}
function pick(mid){return picks[mid]||(picks[mid]={stake:BASE_UNIT,selections:{}})}
function selectionKey(market,sel){return market+"|"+sel}
function selections(mid){return Object.values(pick(mid).selections)}
function isSelected(mid,market,sel){return !!pick(mid).selections[selectionKey(market,sel)]}
function fixed(mid,market){return (typeof SPORTTERY_FIXED!=="undefined"&&SPORTTERY_FIXED[mid]&&SPORTTERY_FIXED[mid][market])||null}
function fixedWdl(m){const v=fixed(m.matchId,"wdl");return v?{H:+v.H,D:+v.D,A:+v.A}:null}
function fixedHandicap(m){const v=fixed(m.matchId,"handicap");return v?{line:+v.line,H:+v.H,D:+v.D,A:+v.A}:null}
function fixedScore(m){return fixed(m.matchId,"score")}
function fixedGoals(m){return fixed(m.matchId,"goals")}
function fixedHtft(m){return fixed(m.matchId,"htft")}
function halfScore(m){const x=(typeof SPORTTERY_FIXED!=="undefined"&&SPORTTERY_FIXED[m.matchId]?.halfScore)||null;return Array.isArray(x)?x:null}

function renderFlagWall(){
  const names=["墨西哥","加拿大","美国","阿根廷","巴西","法国","西班牙","葡萄牙","英格兰","德国","日本","韩国"];
  $("flagwall").innerHTML=names.map(n=>`<img alt="${n}" src="${FLAG_DATA[n]}">`).join("")
}
function renderHome(){
  const d=DAYS[state.dayIndex]||DAYS[DAYS.length-1],lv=currentLevel(),idx=levelIndex(state.balance);
  $("homeDay").textContent=`DAY ${String(d.dayNo).padStart(2,"0")}`;
  $("balance").textContent=money(state.balance);$("daysAlive").textContent=state.alive;$("hits").textContent=state.hits;
  $("avatar").textContent=lv.icon;$("identityName").textContent=lv.name;$("identityDesc").textContent=lv.desc;
  const next=LEVELS[Math.min(idx+1,LEVELS.length-1)],pct=idx===LEVELS.length-1?100:Math.max(0,Math.min(100,(state.balance-lv.min)/(next.min-lv.min)*100));
  $("levelBar").style.width=pct+"%";
  $("dayDate").textContent=d.date;$("dayTitle").textContent=`DAY ${String(d.dayNo).padStart(2,"0")}`;$("dayCount").textContent=`今日 ${d.matches.length} 场`;$("dayStage").textContent=d.stage;
  $("dayIntro").innerHTML=d.matches.map(m=>`<div>${m.time}　${m.home} vs ${m.away}</div>`).join("");
  renderFlagWall();
}

function memoryScore(m){
  if(m.display&&m.display.startsWith(m.home)&&m.display.endsWith(m.away))return m.display.slice(m.home.length,m.display.length-m.away.length);
  return `${m.score90[0]}-${m.score90[1]}`;
}
function renderMemory(){
  const grouped=[];
  DAYS.forEach(d=>{
    let g=grouped[grouped.length-1];
    if(!g||g.stage!==d.stage){g={stage:d.stage,days:[]};grouped.push(g)}
    g.days.push(d);
  });
  $("memoryBody").innerHTML=grouped.map(g=>`<section class="memoryStage">
    <div class="memoryStageTitle"><h3>${g.stage}</h3><span>${g.days.reduce((n,d)=>n+d.matches.length,0)} 场</span></div>
    ${g.days.map(d=>`<div class="memoryDayBlock">
      <div class="memoryDate">世界杯第 ${d.dayNo} 天 · ${d.date}</div>
      ${d.matches.map(m=>`<div class="memoryMatch">
        <div class="memoryTeam"><img src="${FLAG_DATA[m.home]}" alt="">${m.home}</div>
        <div class="memoryScore">${memoryScore(m)}</div>
        <div class="memoryTeam right">${m.away}<img src="${FLAG_DATA[m.away]}" alt=""></div>
        ${m.note?`<div class="memoryNote" style="grid-column:1/-1">${m.note}</div>`:""}
      </div>`).join("")}
    </div>`).join("")}
  </section>`).join("");
}
function startMemory(){
  memLeft=60;renderMemory();show("memory");updateTimer();clearInterval(memTimer);
  memTimer=setInterval(()=>{memLeft--;updateTimer();if(memLeft<=0){clearInterval(memTimer);finishMemory()}},1000)
}
function updateTimer(){const m=Math.floor(Math.max(0,memLeft)/60),s=Math.max(0,memLeft)%60;$("timer").textContent=String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function finishMemory(){clearInterval(memTimer);renderHome();show("home")}

function findMatch(mid){for(const d of DAYS)for(const m of d.matches)if(m.matchId===mid)return m;return null}
function marketBtn(m,market,sel,label,odds,opts={}){
  const valid=typeof odds==="number"&&Number.isFinite(odds)&&odds>0;
  const disabled=!!opts.disabled||!valid,selected=isSelected(m.matchId,market,sel),wide=!!opts.wide;
  return `<button class="option ${wide?"wide":""} ${selected?"selected":""} ${disabled?"disabled":""}" ${disabled?"disabled":""}
    data-action="market-pick" data-mid="${m.matchId}" data-market="${market}" data-sel="${sel}" data-label="${label}" data-odds="${valid?odds:""}" ${opts.line!==undefined?`data-line="${opts.line}"`:""}>
    <b>${label}</b><small>${valid?money(odds):"--"}</small></button>`;
}
function quick(m,sel,label,odds){
  const valid=typeof odds==="number"&&Number.isFinite(odds)&&odds>0;
  return `<button class="quickOpt ${isSelected(m.matchId,"wdl",sel)?"selected":""} ${valid?"":"disabled"}" ${valid?"":"disabled"}
    data-action="quick" data-mid="${m.matchId}" data-sel="${sel}" data-label="${label}" data-odds="${valid?odds:""}"><b>${label}</b><small>${valid?money(odds):"--"}</small></button>`;
}
function matchCard(m){
  const o=fixedWdl(m),p=pick(m.matchId),count=selections(m.matchId).length,cost=count*p.stake,mult=Math.max(1,Math.round(p.stake/BASE_UNIT));
  return `<div class="matchCard">
    <div class="matchHeader"><b>${m.group||m.stage}</b><span>${m.time}</span></div>
    <div class="teams"><div><img class="teamFlag" src="${FLAG_DATA[m.home]}" alt="${m.home}"><div class="teamName">${m.home}</div></div><div class="vs">VS</div><div><img class="teamFlag" src="${FLAG_DATA[m.away]}" alt="${m.away}"><div class="teamName">${m.away}</div></div></div>
    <div class="odds3">${quick(m,"H","主胜",o?.H)}${quick(m,"D","平",o?.D)}${quick(m,"A","客胜",o?.A)}</div>
    <div class="matchFoot"><div class="pickSummary">${count?`本场已选 <b>${count}</b> 注 · ${BASE_UNIT}积分/注 × <b>${mult}</b>倍 · 本场投入 <b>${money(cost)}</b> 积分`:(o?"选择一个或多个结果；再次点击即可取消":"本场固定奖金暂未载入")}</div><button class="expand" data-action="open-sheet" data-mid="${m.matchId}">更多玩法</button></div>
    <div class="perBet">
      <div class="perBetTitle">本场倍数 <span>${BASE_UNIT} 积分 / 注</span></div>
      <div class="multiplierRow">
        <div class="multiplierControl">
          <button class="multBtn" data-action="mult-minus" data-mid="${m.matchId}">−</button>
          <input class="multInput" inputmode="numeric" pattern="[0-9]*" data-mid="${m.matchId}" value="${mult}" aria-label="本场倍数">
          <button class="multBtn" data-action="mult-plus" data-mid="${m.matchId}">＋</button>
        </div>
        <div class="quickMult">${[1,5,10,20].map(v=>`<button class="multPreset ${mult===v?"selected":""}" data-action="mult-set" data-mid="${m.matchId}" data-mult="${v}">${v}倍</button>`).join("")}</div>
        <button class="matchAllIn ${count?"":"disabled"}" data-action="all-in-match" data-mid="${m.matchId}" ${count?"":"disabled"}>本场全投</button>
      </div>
    </div>
  </div>`;
}
function renderGame(){
  const d=DAYS[state.dayIndex];$("gameBrand").textContent=`DAY ${String(d.dayNo).padStart(2,"0")}`;$("gameBalance").textContent=money(state.balance)+"分";$("gameTitle").textContent=`${d.date} · ${d.stage}`;
  $("matchList").innerHTML=d.matches.map(matchCard).join("");updateDaySummary();
}

function openSheet(mid){activeMatch=findMatch(mid);if(!activeMatch)return;renderSheet();$("marketOverlay").classList.add("open");document.body.style.overflow="hidden"}
function closeSheet(){$("marketOverlay").classList.remove("open");document.body.style.overflow="";activeMatch=null;renderGame()}
function sectionTitle(name,available=true){return `<div class="sectionTitle"><h3>${name}</h3>${available?"":"<span class=\"marketHint\">暂无数据</span>"}</div>`}
function renderSheet(){
  const m=activeMatch,wdl=fixedWdl(m),hc=fixedHandicap(m),sc=fixedScore(m),go=fixedGoals(m),hf=fixedHtft(m),half=halfScore(m);
  $("sheetTop").textContent=`${m.stage} · ${m.date.slice(5)} ${m.time}`;
  $("sheetHF").src=FLAG_DATA[m.home];$("sheetAF").src=FLAG_DATA[m.away];$("sheetHome").textContent=m.home;$("sheetAway").textContent=m.away;

  const wdlHtml=`<div class="marketSection">${sectionTitle("胜平负",!!wdl)}<div class="optGrid3">${marketBtn(m,"wdl","H","主胜",wdl?.H)}${marketBtn(m,"wdl","D","平",wdl?.D)}${marketBtn(m,"wdl","A","客胜",wdl?.A)}</div></div>`;
  const hcHtml=`<div class="marketSection">${sectionTitle("让球胜平负",!!hc)}${hc?`<div class="handicapLine"><span class="lineBubble">${hc.line>0?"+":""}${hc.line}</span><span>主队让球 ${hc.line>0?"+":""}${hc.line}</span></div>`:""}<div class="optGrid3">${marketBtn(m,"handicap","H","让胜",hc?.H,{line:hc?.line})}${marketBtn(m,"handicap","D","让平",hc?.D,{line:hc?.line})}${marketBtn(m,"handicap","A","让负",hc?.A,{line:hc?.line})}</div></div>`;
  const scoreHtml=`<div class="marketSection">${sectionTitle("比分",!!sc)}
    <div class="dividerLabel">主胜比分</div><div class="scoreGrid">${HOME_SCORES.map(s=>marketBtn(m,"score",s,s,sc?.[s])).join("")}${marketBtn(m,"score","胜其它","胜其它",sc?.["胜其它"],{wide:true})}</div>
    <div class="dividerLabel">平局比分</div><div class="scoreGrid">${DRAW_SCORES.map(s=>marketBtn(m,"score",s,s,sc?.[s])).join("")}${marketBtn(m,"score","平其它","平其它",sc?.["平其它"])}</div>
    <div class="dividerLabel">客胜比分</div><div class="scoreGrid">${AWAY_SCORES.map(s=>marketBtn(m,"score",s,s,sc?.[s])).join("")}${marketBtn(m,"score","负其它","负其它",sc?.["负其它"],{wide:true})}</div>
  </div>`;
  const goalsHtml=`<div class="marketSection">${sectionTitle("总进球数",!!go)}<div class="optGrid4">${["0","1","2","3","4","5","6","7+"].map(s=>marketBtn(m,"goals",s,s==="7+"?"7+球":s+"球",go?.[s])).join("")}</div></div>`;
  const canH=!!hf&&!!half;
  const hfHtml=`<div class="marketSection">${sectionTitle("半全场",canH)}<div class="optGrid3">${Object.keys(HTFT_LABEL).map(s=>marketBtn(m,"htft",s,HTFT_LABEL[s],canH?hf?.[s]:null,{disabled:!canH})).join("")}</div></div>`;
  $("sheetScroll").innerHTML=wdlHtml+hcHtml+scoreHtml+goalsHtml+hfHtml+'<div style="height:8px"></div>';
  updateSheetPick();
}
function updateSheetPick(){
  if(!activeMatch)return;
  const p=pick(activeMatch.matchId),ss=selections(activeMatch.matchId),mult=Math.max(1,Math.round(p.stake/BASE_UNIT));
  $("sheetPick").innerHTML=ss.length?`已选 <b>${ss.length}</b> 注 · ${BASE_UNIT}积分/注 × <b>${mult}</b>倍 · 本场投入 <b>${money(ss.length*p.stake)}</b> 积分<br><span>再次点击已选项即可取消；倍数可在比赛卡片中单独调整。</span>`:"尚未选择。支持单选、双选和多选。";
}
function togglePick(mid,market,sel,label,odds,line=null){
  if(!Number.isFinite(+odds)||+odds<=0)return;
  const p=pick(mid),k=selectionKey(market,sel);
  if(p.selections[k])delete p.selections[k];
  else{
    p.selections[k]={market,sel,label,odds:+odds,line:line!==null?+line:null};
    const max=maxAffordableMultiplier(mid);
    if(max<1){delete p.selections[k];toast("当前积分不足以增加这一注");return}
    const cur=Math.max(1,Math.round(p.stake/BASE_UNIT));
    if(cur>max){p.stake=BASE_UNIT*max;toast(`本场倍数已自动调整为 ${max} 倍`)}
  }
  if(activeMatch)renderSheet();renderGame();updateDaySummary();
}
function currentDayEntries(){const d=DAYS[state.dayIndex],out=[];d.matches.forEach(m=>selections(m.matchId).forEach(s=>out.push({m,s,stake:pick(m.matchId).stake})));return out}
function currentDayTotal(excludeMid=null){return currentDayEntries().filter(x=>!excludeMid||x.m.matchId!==excludeMid).reduce((a,x)=>a+x.stake,0)}
function maxAffordableMultiplier(mid){
  const count=selections(mid).length;if(!count)return 9999;
  const other=currentDayTotal(mid),available=Math.max(0,state.balance-other);
  return Math.floor(available/(BASE_UNIT*count));
}
function setMultiplier(mid,mult,quiet=false){
  const p=pick(mid);let v=Math.floor(Number(mult));if(!Number.isFinite(v)||v<1)v=1;if(v>9999)v=9999;
  const max=maxAffordableMultiplier(mid);
  if(selections(mid).length&&max<1){if(!quiet)toast("当前积分不足以覆盖本场最低一注");return false}
  if(selections(mid).length&&v>max){v=max;if(!quiet)toast(`本场最多可设为 ${max} 倍`)}
  p.stake=BASE_UNIT*v;
  if(activeMatch)updateSheetPick();renderGame();updateDaySummary();return true;
}
function changeMultiplier(mid,delta){const p=pick(mid),cur=Math.max(1,Math.round(p.stake/BASE_UNIT));setMultiplier(mid,cur+delta)}
function allInMatch(mid){
  const count=selections(mid).length;if(!count){toast("先在本场选择至少一个结果");return}
  const max=maxAffordableMultiplier(mid);if(max<1){toast("剩余积分不足本场最低一注");return}
  setMultiplier(mid,max,true);
  const total=count*BASE_UNIT*max,left=Math.round((state.balance-currentDayTotal(mid)-total)*100)/100;
  toast(`本场已设为 ${max} 倍，投入 ${money(total)} 积分，剩余 ${money(Math.max(0,left))}`);
}
function updateDaySummary(){
  const entries=currentDayEntries(),matchCount=new Set(entries.map(x=>x.m.matchId)).size,total=entries.reduce((a,x)=>a+x.stake,0);
  $("selectedSummary").textContent=`已选 ${matchCount} 场 · ${entries.length} 注`;
  $("stakeSummary").textContent=entries.length?`今日投入 ${money(total)} / 当前 ${money(state.balance)}`:`今天可以不出手，直接跳过`;
  const settleBtn=$("settleBtn");if(settleBtn)settleBtn.textContent=entries.length?"结束今天":"跳过今天";
}

function resultFor(m,s){
  if(s.market==="wdl")return s.sel===m.result90;
  if(s.market==="goals"){const g=m.goals90;return s.sel==="7+"?g>=7:String(g)===s.sel}
  if(s.market==="score"){
    const score=`${m.score90[0]}:${m.score90[1]}`;
    if(s.sel===score)return true;
    if(s.sel==="胜其它")return m.score90[0]>m.score90[1]&&!HOME_SCORES.includes(score);
    if(s.sel==="平其它")return m.score90[0]===m.score90[1]&&!DRAW_SCORES.includes(score);
    if(s.sel==="负其它")return m.score90[0]<m.score90[1]&&!AWAY_SCORES.includes(score);
    return false;
  }
  if(s.market==="handicap"){const h=m.score90[0]+(s.line||0),a=m.score90[1],r=h>a?"H":h===a?"D":"A";return s.sel===r}
  if(s.market==="htft"){
    const hs=halfScore(m);if(!hs)return null;
    const hr=hs[0]>hs[1]?"H":hs[0]===hs[1]?"D":"A";
    return s.sel===(hr+m.result90);
  }
  return false;
}
function settle(){
  const entries=currentDayEntries(),start=state.balance,total=entries.reduce((a,x)=>a+x.stake,0);
  if(!entries.length){
    state.alive++;
    renderResult(DAYS[state.dayIndex],[],0,0,0);
    show("result");
    return;
  }
  if(total>start+1e-9){toast("今日投入超过当前积分，请减少每注积分或取消部分选项");return}
  let delta=0,hit=0,best=-1e9,items=[];
  entries.forEach(x=>{
    const ok=resultFor(x.m,x.s);let d=0,note="";
    if(ok===null){d=0;note="本注退还"}
    else if(ok){d=x.stake*(x.s.odds-1);note="命中";hit++;state.hits++}
    else{d=-x.stake;note="未命中";state.misses++}
    delta+=d;best=Math.max(best,d);items.push({...x,delta:d,note});
  });
  state.balance=Math.max(0,Math.round((state.balance+delta)*100)/100);state.maxBalance=Math.max(state.maxBalance,state.balance);state.alive++;state.bestLevel=Math.max(state.bestLevel,levelIndex(state.balance));
  renderResult(DAYS[state.dayIndex],items,delta,hit,best===-1e9?0:best);show("result");
}
function renderResult(d,items,delta,hit,best){
  $("resultDay").textContent=`DAY ${d.dayNo}`;
  $("delta").textContent=(delta>=0?"+":"")+money(delta);
  $("delta").className="bigDelta "+(delta<0?"bad":"");
  $("newBal").textContent=money(state.balance);
  $("todayHit").textContent=items.length?`${hit}/${items.length}`:"0 注";
  $("bestGain").textContent=items.length?(best>=0?"+":"")+money(best):"—";
  $("resultList").innerHTML=items.length?items.map(x=>`<div class="resultItem"><div><b>${x.m.home} ${x.m.score90[0]}:${x.m.score90[1]} ${x.m.away}</b><p>${x.s.label} · ${money(x.s.odds)} · ${x.stake}积分/注 · ${x.note}</p></div><div class="gain ${x.delta<0?"bad":"good"}">${x.delta>0?"+":""}${money(x.delta)}</div></div>`).join(""):`<div class="skipResult">今天你选择了观望。<br>没有投入，也没有损失。</div>`;
  const next=$("nextDayBtn");if(next)next.textContent=state.balance<BASE_UNIT?"查看旅程结局":"进入下一天";
}
function failJourney(){
  $("failBalance").textContent=money(state.balance);
  $("failDays").textContent=state.alive;
  $("failBest").textContent=LEVELS[state.bestLevel]?.name||currentLevel().name;
  show("failure");
}
function nextDay(){
  if(state.balance<BASE_UNIT){failJourney();return}
  if(state.dayIndex>=DAYS.length-1){state.dayIndex=0;picks={};toast("世界杯旅程完成，可以再次重生");renderHome();show("home");return}
  state.dayIndex++;renderHome();show("home");
}
function restartJourney(){state={balance:100,dayIndex:0,alive:0,hits:0,misses:0,maxBalance:100,bestLevel:1};picks={};renderHome();show("home")}
function enterDay(){clearInterval(memTimer);if(state.balance<BASE_UNIT){failJourney();return}renderGame();show("game")}

document.addEventListener("click",e=>{
  const b=e.target.closest("[data-action]");if(!b)return;const a=b.dataset.action;
  if(a==="activate"){
    if($("code").value.trim().toUpperCase()!=="WC26-REBIRTH"){toast("重生码不正确");return}
    safeSet("wc26_v5_active","1");show("intro");
  }else if(a==="intro")show("intro");
  else if(a==="memory")startMemory();
  else if(a==="finish-memory")finishMemory();
  else if(a==="home"){renderHome();show("home")}
  else if(a==="enter-day")enterDay();
  else if(a==="quick"&&!b.disabled)togglePick(b.dataset.mid,"wdl",b.dataset.sel,b.dataset.label,+b.dataset.odds);
  else if(a==="mult-minus")changeMultiplier(b.dataset.mid,-1);
  else if(a==="mult-plus")changeMultiplier(b.dataset.mid,1);
  else if(a==="mult-set")setMultiplier(b.dataset.mid,b.dataset.mult);
  else if(a==="all-in-match")allInMatch(b.dataset.mid);
  else if(a==="open-sheet")openSheet(b.dataset.mid);
  else if(a==="close-sheet")closeSheet();
  else if(a==="market-pick"&&!b.disabled)togglePick(b.dataset.mid,b.dataset.market,b.dataset.sel,b.dataset.label,+b.dataset.odds,b.dataset.line??null);
  else if(a==="settle")settle();
  else if(a==="next-day")nextDay();
  else if(a==="restart")restartJourney();
});
document.addEventListener("change",e=>{
  const input=e.target.closest?.(".multInput");if(!input)return;
  setMultiplier(input.dataset.mid,input.value);
});
$("marketOverlay").addEventListener("click",e=>{if(e.target===$("marketOverlay"))closeSheet()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("marketOverlay").classList.contains("open"))closeSheet()});
renderFlagWall();
if(safeGet("wc26_v5_active")==="1")show("intro");
