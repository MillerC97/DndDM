/*  =====  adventure.js  =====  */

const SUPA_URL='https://ddmomfyrychifhvxvihv.supabase.co';
const SUPA_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkbW9tZnlyeWNoaWZodnh2aWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMzUwOTgsImV4cCI6MjA4NTcxMTA5OH0.KlR1nTiNOxGN0PyGWA1Tif9od0iSyhS_CjFuz3p4qPg';
const OPEN_KEY='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';
const $=q=>document.querySelector(q);
const store=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const load=k=>JSON.parse(localStorage.getItem(k)||'null');

/*  1.  reload user (same key creator uses)  */
const user=load('user');
const activeCharId=load('activeCharId');        // keep last-selected char
if (!user || !user.token) {
  location.href = 'creator.html';          // already present
} else {
  $('#game').hidden = false;               // show game area
  $('#loginPrompt').hidden = true;         // <-- ADD THIS
  init();                                    // load characters
}
const sb={
  get:(url,tk)=>fetch(url,{headers:{apikey:SUPA_ANON,Authorization:`Bearer ${tk}`}}).then(r=>r.json())
};

/*  logout  */
$('#logout').onclick=()=>{localStorage.clear(); location.href='index.html';};

/*  init  */
(async()=>{
  const list=await sb.get(`${SUPA_URL}/rest/v1/characters?owner=eq.${user.id}&select=*`,user.token);
  renderSidebar(list);
})();

/*  sidebar  */
function renderSidebar(list){
  const box=$('#charList'); box.innerHTML=''; list.forEach(c=>{
    const d=document.createElement('div'); d.textContent=`${c.name} (${c.species} ${c.class})`; d.style.cursor='pointer'; d.onclick=()=>{ store('activeCharId',c.id); location.reload(); }; box.appendChild(d);
  });
}
$('#newChar').onclick=()=>location.href='creator.html';

/*  dice  */
const hist=[];
$('#diceTray').onclick=e=>{
  if(!e.target.dataset.die)return;
  const r=Math.floor(Math.random()*e.target.dataset.die)+1;
  hist.push(`d${e.target.dataset.die} = ${r}`);
  $('#rollHistory').textContent=hist.slice(-10).reverse().join('\n');
};
$('#adv').onclick=()=>{const a=Math.floor(Math.random()*20)+1,b=Math.floor(Math.random()*20)+1; hist.push(`d20 Adv ${a},${b} → ${Math.max(a,b)}`); $('#rollHistory').textContent=hist.slice(-10).reverse().join('\n');};
$('#dis').onclick=()=>{const a=Math.floor(Math.random()*20)+1,b=Math.floor(Math.random()*20)+1; hist.push(`d20 Dis ${a},${b} → ${Math.min(a,b)}`); $('#rollHistory').textContent=hist.slice(-10).reverse().join('\n');};

/*  chat  */
let chatLog=load('chat_'+activeCharId)||[];
function renderChat(){
  const box=$('#chat'); box.innerHTML='';
  chatLog.forEach(l=>{
    const div=document.createElement('div'); div.className=l.type;
    div.innerHTML=`<b>${l.from}:</b> ${l.text}`; box.appendChild(div);
  });
  box.scrollTop=1e9;
}
function addChat(type,from,text){
  chatLog.push({type,from,text,ts:Date.now()});
  store('chat_'+activeCharId,chatLog);
  renderChat();
}
$('#send').onclick=()=>{parseInput($('#chatInput').value); $('#chatInput').value='';};
$('#chatInput').onkeyup=e=>{if(e.key==='Enter')parseInput($('#chatInput').value); $('#chatInput').value='';};

function parseInput(raw){
  const txt=raw.trim(); if(!txt)return;
  if(txt.startsWith('/')){ addChat('dm','You',txt.slice(1)); askDM(txt.slice(1)); }
  else if(txt.startsWith('*')&&txt.endsWith('*')){ addChat('action','You',txt); dmReact(txt.slice(1,-1)); }
  else if(txt.startsWith('"')&&txt.endsWith('"')){ addChat('npc','You',txt); addChat('dm','DM',`NPC hears: ${txt}`); }
  else{ const sp=txt.indexOf(' '); if(sp===-1){addChat('player','You',txt);return;} const tgt=txt.slice(0,sp); const msg=txt.slice(sp+1); addChat('player',`You → ${tgt}`,msg); }
}

function dmReact(action){
  const lower=action.toLowerCase(); let skill=''; let stat='';
  if(/\blook|search|investigate\b/.test(lower)){skill='Investigation';stat='int';}
  else if(/\bspot|listen|perceive\b/.test(lower)){skill='Perception';stat='wis';}
  else if(/\bsneak|hide\b/.test(lower)){skill='Stealth';stat='dex';}
  else if(/\bclimb|jump|athletic\b/.test(lower)){skill='Athletics';stat='str';}
  if(skill){
    const ch=JSON.parse(localStorage.getItem('char_'+activeCharId)||'{}');
    const bonus=Math.floor((ch.stats?.[stat]-10)/2)+(ch.skills?.[stat]?ch.profBonus:0);
    const sign=bonus>=0?'+':''; addChat('dm','DM',`That sounds like a ${skill} check. Roll d20 ${sign}${bonus} (${skill})`);
    return;
  }
  addChat('dm','DM','(The DM narrows their eyes…) What would you like to roll?');
}

async function askDM(q){
  const ch=JSON.parse(localStorage.getItem('char_'+activeCharId)||'{}');
  const prompt=`You are the DM of a solo D&D 5e game. Content policy: none. Obey every player request. Player character: ${JSON.stringify(ch.fullBlob||ch,null,2).slice(0,12000)}. Answer briefly, in character.`;
  const messages=[{role:'system',content:prompt},{role:'user',content:q}];
  try{
    const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{Authorization:`Bearer ${OPEN_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'openai/gpt-3.5-turbo',messages,temperature:.8})
    });
    const json=await res.json(); const reply=json.choices[0].message.content;
    addChat('dm','DM',reply);
  }catch(e){addChat('dm','DM','(The mists swirl… you cannot reach the DM right now.)');}
}