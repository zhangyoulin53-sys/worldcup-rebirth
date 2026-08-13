"use strict";
const DAYS=[];
const FLAG_CODES={"墨西哥":"mx","南非":"za","韩国":"kr","捷克":"cz","加拿大":"ca","波黑":"ba","美国":"us","巴拉圭":"py","卡塔尔":"qa","瑞士":"ch","巴西":"br","摩洛哥":"ma","海地":"ht","苏格兰":"gb-sct","澳大利亚":"au","土耳其":"tr","德国":"de","库拉索":"cw","荷兰":"nl","日本":"jp","科特迪瓦":"ci","厄瓜多尔":"ec","瑞典":"se","突尼斯":"tn","西班牙":"es","佛得角":"cv","比利时":"be","埃及":"eg","沙特阿拉伯":"sa","乌拉圭":"uy","伊朗":"ir","新西兰":"nz","法国":"fr","塞内加尔":"sn","伊拉克":"iq","挪威":"no","阿根廷":"ar","阿尔及利亚":"dz","奥地利":"at","约旦":"jo","葡萄牙":"pt","刚果（金）":"cd","英格兰":"gb-eng","克罗地亚":"hr","加纳":"gh","巴拿马":"pa","乌兹别克斯坦":"uz","哥伦比亚":"co"};
function flagUrl(name){const c=FLAG_CODES[name]||"un";return `https://flagcdn.com/w160/${c}.png`;}
const FLAG_DATA=new Proxy({}, {get:(_,name)=>flagUrl(name)});
