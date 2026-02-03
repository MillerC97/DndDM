/*  Pocket DM – plain JS, no frameworks, no build step  */
/*  config ========================================================= */
const SUPA_URL  = 'https://ddmomfyrychifhvxvihv.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkbW9tZnlyeWNoaWZodnh2aWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMzUwOTgsImV4cCI6MjA4NTcxMTA5OH0.KlR1nTiNOxGN0PyGWA1Tif9od0iSyhS_CjFuz3p4qPg';
const OPEN_KEY  = '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';
const DEFAULT_CHAR_ID = 144992417;          // Alder – pre-loads if no local chars

/*  tiny helpers ================================================== */
const $   = q => document.querySelector(q);
const $$  = q => document.querySelectorAll(q);
const store  = (k,v) => localStorage.setItem(k,JSON.stringify(v));
const load   = k => JSON.parse(localStorage.getItem(k)||'null');

/*  service-worker (offline cache) ================================ */
navigator.serviceWorker.register('data:text/javascript;base64,'+btoa(`
const C="pocketdm-v1";
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(C).then(c=>c.addAll(["./","./styles.css","./app.js"])))
});
self.addEventListener("fetch",e=>{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))
});
`));

/*  Supabase mini-client ========================================== */
const sb = {
  async rpc(fn,params){
    const r=await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`,{
      method:'POST',headers:{apikey:SUPA_ANON,'Content-Type':'application/json'},
      body:JSON.stringify(params)
    });return r.json();
  },
  async from(t){return{
    async insert(row){
      await fetch(`${SUPA_URL}/rest/v1/${t}`,{
        method:'POST',headers:{apikey:SUPA_ANON,'Content-Type':'application/json','Prefer':'return=minimal'},
        body:JSON.stringify(row)
      });
    },
    async select(){const r=await fetch(`${SUPA_URL}/rest/v1/${t}?select=*`,{headers:{apikey:SUPA_ANON}});return r.json();}
  }}
};

/*  dice roller =================================================== */
const roll = (sides,ad=0) => Math.floor(Math.random()*sides)+1+ad;
const rollAdvantage = (sides,ad=0)=>{
  const a=roll(sides,ad), b=roll(sides,ad);
  return {res:Math.max(a,b), rolls:[a,b]};
};
const rollDisadvantage = (sides,ad=0)=>{
  const a=roll(sides,ad), b=roll(sides,ad);
  return {res:Math.min(a,b), rolls:[a,b]};
};

/*  ability mod =================================================== */
const mod = score => Math.floor((score-10)/2);

/*  load / save characters ======================================== */
let CHARS = load('chars')||[];
let ACTIVE_ID = load('activeCharId')||(CHARS[0]?CHARS[0].id:null);

function saveChars(){store('chars',CHARS);}
function saveActive(){store('activeCharId',ACTIVE_ID);}

/*  default empty character ======================================= */
function blankChar(){
  return {
    id:crypto.randomUUID(),
    name:'New Adventurer',
    race:'',
    class:'',
    level:1,
    hp:{max:8,current:8,temp:0},
    ac:10,
    initiative:0,
    speed:30,
    stats:{str:10,dex:10,con:10,int:10,wis:10,cha:10},
    profBonus:2,
    skills:{},   // keyed by short name 'acr','ani' etc
    saves:{},    // same
    spells:[],
    inventory:[{name:'Gold',qty:0}]
  };
}

/*  preload Alder if no chars exist =============================== */
/*  preload Alder with FULL sheet ================================= */
async function seedAlder(){
  if(CHARS.length)return;
  const raw = await fetch(`https://character-service.dndbeyond.com/character/v5/character/${DEFAULT_CHAR_ID}`);
  const data = await raw.json();
  const c = data.data;

  const stats={};
  ['str','dex','con','int','wis','cha'].forEach((s,i)=>stats[s]=c.stats[i].value);

  const ch={
    id:crypto.randomUUID(),
    name:c.name,
    race:c.race.baseName,
    class:c.classes[0].definition.name,
    level:c.classes[0].level,
    hp:{max:c.baseHitPoints,current:c.baseHitPoints,temp:0},
    ac:c.armorClass,
    initiative:mod(stats.dex),
    speed:30,
    stats,
    profBonus:Math.floor((c.classes[0].level-1)/4+2),
    skills:{},saves:{},spells:[],inventory:[],
    fullBlob:c                                // <-- entire sheet for DM
  };

  /* proficiencies */
  const addProf=list=>list?.forEach(m=>{if(m.type==='proficiency'&&m.subType){ch.skills[m.subType]=true;}});
  addProf(c.modifiers.race);
  addProf(c.modifiers.class);
  addProf(c.modifiers.background);
  (c.choices?.class||[]).forEach(g=>g.options?.forEach(o=>addProf(o.options)));
  (c.choices?.race||[]).forEach(g=>g.options?.forEach(o=>addProf(o.options)));

  /* saving throws */
  const saveMap={str:'strength-save',dex:'dexterity-save',con:'constitution-save',int:'intelligence-save',wis:'wisdom-save',cha:'charisma-save'};
  Object.entries(saveMap).forEach(([short,long])=>{if(ch.skills[long]){ch.saves[short]=true; delete ch.skills[long];}});

  /* inventory */
  c.inventory.forEach(it=>{if(it.definition)ch.inventory.push({name:it.definition.name,qty:it.quantity||1});});
  const gp=(c.currencies?.gp||0)+(c.currencies?.pp||0)*10+(c.currencies?.sp||0)*0.1+(c.currencies?.cp||0)*0.01;
  if(gp)ch.inventory.push({name:'Gold',qty:gp});

  /* spells */
  ['prepared','race','class'].forEach(k=>c.spells[k]?.forEach(sp=>ch.spells.push(sp.definition.name)));

  CHARS.push(ch); saveChars(); ACTIVE_ID=ch.id; saveActive();
}

/*  sidebar character list ======================================== */
function renderSidebar(){
  const list=$('#charList'); list.innerHTML='';
  CHARS.forEach(c=>{
    const div=document.createElement('div'); div.className='charRow';
    div.innerHTML=`<span>${c.name} (${c.race} ${c.class} ${c.level})</span>`;
    if(c.id===ACTIVE_ID)div.classList.add('active');
    div.onclick=()=>{ACTIVE_ID=c.id;saveActive();renderAll();};
    list.appendChild(div);
  });
}

/*  character builder ============================================ */
function startBuilder(){
  const ch=blankChar();
  const popup=document.createElement('div'); popup.id='builder';
  popup.innerHTML=`
    <h3>New Character</h3>
    <div>Step 1 – Race & Class</div>
    <input id="bName" placeholder="Name">
    <input id="bRace" placeholder="Race">
    <input id="bClass" placeholder="Class">
    <div>Step 2 – Roll Ability Scores (4d6 drop lowest)</div>
    <button id="rollScores">Roll Scores</button>
    <div id="scoreBox"></div>
    <div>Step 3 – Finalise</div>
    <button id="finish">Create</button>
    <button id="cancelBuild">Cancel</button>
  `;
  document.body.appendChild(popup);
  let rolled=[];
  $('#rollScores').onclick=()=>{
    rolled=['str','dex','con','int','wis','cha'].map(()=>{
      const rolls=Array.from({length:4},()=>roll(6));
      rolls.sort((a,b)=>b-a); rolls.pop(); return rolls.reduce((a,b)=>a+b,0);
    });
    $('#scoreBox').innerHTML=rolled.map(s=>`<span>${s}</span>`).join('');
  };
  $('#finish').onclick=()=>{
    if(!$('#bName').value||!$('#bRace').value||!$('#bClass').value||rolled.length!==6){alert('Fill everything and roll scores');return;}
    ch.name=$('#bName').value; ch.race=$('#bRace').value; ch.class=$('#bClass').value;
    rolled.forEach((v,i)=>ch.stats[['str','dex','con','int','wis','cha'][i]]=v);
    ch.hp.max=8+mod(ch.stats.con); ch.hp.current=ch.hp.max;
    ch.initiative=mod(ch.stats.dex);
    CHARS.push(ch); saveChars(); ACTIVE_ID=ch.id; saveActive();
    popup.remove(); renderAll();
  };
  $('#cancelBuild').onclick=()=>popup.remove();
}

/*  get current character ========================================= */
function active(){return CHARS.find(c=>c.id===ACTIVE_ID)||blankChar();}

/*  render character sheet ======================================== */
function renderSheet(){
  const ch=active();
  $('#sheetName').textContent=`${ch.name} – ${ch.race} ${ch.class} ${ch.level}`;
  $('#hpMax').textContent=ch.hp.max;
  $('#hpCurrent').value=ch.hp.current;
  $('#hpTemp').value=ch.hp.temp;
  $('#ac').textContent=ch.ac;
  $('#init').textContent=ch.initiative;
  $('#speed').textContent=ch.speed;
  // stats
  const statDiv=$('#stats'); statDiv.innerHTML='';
  Object.entries(ch.stats).forEach(([s,v])=>{
    const m=mod(v); const sign=m>=0?'+':'';
    statDiv.innerHTML+=`<div>${s.toUpperCase()} ${v} (${sign}${m})</div>`;
  });
  // skills
  const skillDiv=$('#skills'); skillDiv.innerHTML='';
  const list={
    acr:'Acrobatics',ani:'Animal Handling',arc:'Arcana',ath:'Athletics',
    dec:'Deception',his:'History',ins:'Insight',itm:'Intimidation',
    inv:'Investigation',med:'Medicine',nat:'Nature',prc:'Perception',
    prf:'Performance',prs:'Persuasion',rel:'Religion',slt:'Sleight of Hand',
    ste:'Stealth',sur:'Survival'
  };
  Object.entries(list).forEach(([short,long])=>{
    const stat={acr:'dex',ani:'wis',arc:'int',ath:'str',dec:'cha',his:'int',ins:'wis',itm:'cha',inv:'int',med:'wis',nat:'int',prc:'wis',prf:'cha',prs:'cha',rel:'int',slt:'dex',ste:'dex',sur:'wis'}[short];
    const bonus=mod(ch.stats[stat])+(ch.skills[short]?ch.profBonus:0);
    const sign=bonus>=0?'+':''; const checked=ch.skills[short]?'checked':'';
    skillDiv.innerHTML+=`<label><input type="checkbox" data-skill="${short}" ${checked}> ${long} ${sign}${bonus}</label>`;
  });
  // saves
  const saveDiv=$('#saves'); saveDiv.innerHTML='';
  Object.entries(ch.stats).forEach(([s,v])=>{
    const bonus=mod(v)+(ch.saves[s]?ch.profBonus:0);
    const sign=bonus>=0?'+':''; const checked=ch.saves[s]?'checked':'';
    saveDiv.innerHTML+=`<label><input type="checkbox" data-save="${s}" ${checked}> ${s.toUpperCase()} ${sign}${bonus}</label>`;
  });
  // spells
  const spellDiv=$('#spells'); spellDiv.innerHTML='';
  ch.spells.forEach(sp=>{
    spellDiv.innerHTML+=`<div>${sp}</div>`;
  });
  // inventory
  const invDiv=$('#inventory'); invDiv.innerHTML='';
  ch.inventory.forEach(it=>{
    invDiv.innerHTML+=`<div>${it.name} ×${it.qty||1}</div>`;
  });
}

/*  attach sheet listeners ======================================= */
function attachSheetListeners(){
  // hp
  $('#hpMinus').onclick=()=>{const ch=active();ch.hp.current=Math.max(0,ch.hp.current-1);saveChars();renderSheet();};
  $('#hpPlus').onclick =()=>{const ch=active();ch.hp.current=Math.min(ch.hp.max,ch.hp.current+1);saveChars();renderSheet();};
  $('#hpCurrent').onchange=()=>{const ch=active();ch.hp.current=Math.max(0,Math.min(ch.hp.max,+$('#hpCurrent').value));saveChars();};
  $('#hpTemp').onchange =()=>{const ch=active();ch.hp.temp=+$('#hpTemp').value;saveChars();};
  // skills / saves toggle
  $$('#skills input').forEach(el=>el.onchange=()=>{
    const ch=active(); ch.skills[el.dataset.skill]=el.checked; saveChars(); renderSheet();
  });
  $$('#saves input').forEach(el=>el.onchange=()=>{
    const ch=active(); ch.saves[el.dataset.save]=el.checked; saveChars(); renderSheet();
  });
}

/*  dice roller UI =============================================== */
const ROLL_HISTORY=[];
function renderRollHistory(){
  const box=$('#rollHistory'); box.innerHTML='';
  ROLL_HISTORY.slice(-10).reverse().forEach(r=>{
    const div=document.createElement('div'); div.textContent=r; box.appendChild(div);
  });
}
function addRoll(str){ROLL_HISTORY.push(str);renderRollHistory();}

$('#rollD4').onclick =()=>{const r=roll(4); addRoll(`d4 = ${r}`);};
$('#rollD6').onclick =()=>{const r=roll(6); addRoll(`d6 = ${r}`);};
$('#rollD8').onclick =()=>{const r=roll(8); addRoll(`d8 = ${r}`);};
$('#rollD10').onclick=()=>{const r=roll(10);addRoll(`d10 = ${r}`);};
$('#rollD12').onclick=()=>{const r=roll(12);addRoll(`d12 = ${r}`);};
$('#rollD20').onclick=()=>{const r=roll(20);addRoll(`d20 = ${r}`);};
$('#rollD100').onclick=()=>{const r=roll(100);addRoll(`d100 = ${r}`);};

$('#rollAdv').onclick=()=>{
  const {res,rolls}=rollAdvantage(20);
  addRoll(`d20 Adv ${rolls.join(', ')} → ${res}`);
};
$('#rollDis').onclick=()=>{
  const {res,rolls}=rollDisadvantage(20);
  addRoll(`d20 Dis ${rolls.join(', ')} → ${res}`);
};

/*  chat system ================================================== */
let CHAT_LOG=load('chat_'+ACTIVE_ID)||[];
function saveChat(){store('chat_'+ACTIVE_ID,CHAT_LOG);}
function renderChat(){
  const box=$('#chatBox'); box.innerHTML='';
  CHAT_LOG.forEach(line=>{
    const div=document.createElement('div'); div.className=line.type;
    div.innerHTML=`<b>${line.from}:</b> ${line.text}`; box.appendChild(div);
  });
  box.scrollTop=1e9;
}
function addChat(type,from,text){
  CHAT_LOG.push({type,from,text,ts:Date.now()}); saveChat(); renderChat();
}

/*  command parser =============================================== */
function parseInput(raw){
  const txt=raw.trim(); if(!txt)return;
  if(txt.startsWith('/')){          // DM
    addChat('dm','You',txt.slice(1));
    askDM(txt.slice(1));
  }else if(txt.startsWith('*')&&txt.endsWith('*')){ // action
    addChat('action','You',txt);
    dmReactToAction(txt.slice(1,-1));
  }else if(txt.startsWith('"')&&txt.endsWith('"')){ // NPC
    addChat('npc','You',txt);
    addChat('dm','DM',`NPC hears: ${txt}`);
  }else{                             // player chat
    const sp=txt.indexOf(' '); if(sp===-1){addChat('player','You',txt);return;}
    const target=txt.slice(0,sp); const msg=txt.slice(sp+1);
    addChat('player',`You → ${target}`,msg);
  }
}
$('#chatSend').onclick=()=>{parseInput($('#chatInput').value); $('#chatInput').value='';};
$('#chatInput').onkeyup=e=>{if(e.key==='Enter')parseInput($('#chatInput').value); $('#chatInput').value='';};

/*  smarter DM reactions ========================================= */
function dmReactToAction(action){
  const lower=action.toLowerCase();
  let skill=''; let stat=''; let bonus=0;
  if(/\blook|search|investigate|inspect\b/.test(lower)){skill='Investigation'; stat='int';}
  else if(/\blisten|spot|perceive|watch\b/.test(lower)){skill='Perception'; stat='wis';}
  else if(/\bsneak|hide|sneaky\b/.test(lower)){skill='Stealth'; stat='dex';}
  else if(/\bclimb|jump|run|athletic\b/.test(lower)){skill='Athletics'; stat='str';}
  else if(/\bbalance|flip|acrobatic\b/.test(lower)){skill='Acrobatics'; stat='dex';}
  else if(/\bpersuad|convince|talk|charm\b/.test(lower)){skill='Persuasion'; stat='cha';}
  else if(/\bdeciev|lie|bluff\b/.test(lower)){skill='Deception'; stat='cha';}
  if(skill){
    const ch=active();
    bonus=mod(ch.stats[stat])+(ch.skills[stat]==='prof'?ch.profBonus:0);
    const sign=bonus>=0?'+':'';    addChat('dm','DM',`That sounds like a ${skill} check. Roll d20 ${sign}${bonus} (${skill})`);
    return;
  }
  // fallback
  addChat('dm','DM','(The DM narrows their eyes…) What would you like to roll?');
}

/*  ask OpenRouter DM with FULL sheet ============================= */
async function askDM(question){
  const ch=active();
  const sheetBlob=JSON.stringify(ch.fullBlob||{},null,2).slice(0,12_000); // trim if huge
  const prompt=`You are the DM of a solo D&D 5e game. The player is ${ch.name}, a level ${ch.level} ${ch.race} ${ch.class}. Here is their complete D&D Beyond character sheet (every feature, spell, item, DC, passive score, etc.): ${sheetBlob}. Use any number or rule in that sheet when you adjudicate. Answer briefly, in character.`;
  const messages=[
    {role:'system',content:prompt},
    ...CHAT_LOG.filter(l=>l.type==='dm'||l.type==='action').slice(-6).map(l=>({role:l.from==='You'?'user':'assistant',content:l.text})),
    {role:'user',content:question}
  ];
  try{
    const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{Authorization:`Bearer ${OPEN_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'openai/gpt-3.5-turbo',messages,temperature:.8})
    });
    const json=await res.json();
    const reply=json.choices[0].message.content;
    addChat('dm','DM',reply);
  }catch(e){
    addChat('dm','DM','(The mists swirl… you cannot reach the DM right now.)');
  }
}

/*  clear chat =================================================== */
$('#clearChat').onclick=()=>{if(confirm('Delete this campaign’s chat history?')){CHAT_LOG=[];saveChat();renderChat();}};

/*  render all =================================================== */
function renderAll(){
  renderSidebar();
  renderSheet();
  attachSheetListeners();
  CHAT_LOG=load('chat_'+ACTIVE_ID)||[];
  renderChat();
  renderRollHistory();
}

/*  initial load ================================================= */
(async()=>{
  if(!CHARS.length)await seedAlder();
  renderAll();
})();

/*  new character button ======================================== */
$('#newChar').onclick=startBuilder;