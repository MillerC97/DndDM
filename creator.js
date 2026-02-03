const SUPA_URL='https://ddmomfyrychifhvxvihv.supabase.co';
const SUPA_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkbW9tZnlyeWNoaWZodnh2aWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMzUwOTgsImV4cCI6MjA4NTcxMTA5OH0.KlR1nTiNOxGN0PyGWA1Tif9od0iSyhS_CjFuz3p4qPg';
const $=q=>document.querySelector(q);
const store=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const load=k=>JSON.parse(localStorage.getItem(k)||'null');
const sb={post:(url,body)=>fetch(url,{method:'POST',headers:{apikey:SUPA_ANON,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()),rpc:(fn,p)=>sb.post(`${SUPA_URL}/rest/v1/rpc/${fn}`,p)};

let user=load('user');
let build={species:'',class:'',scores:[],assigned:{str:null,dex:null,con:null,int:null,wis:null,cha:null},equipment:[],name:''};

async function rpc(fn,body){
  const r=await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`,{
    method:'POST',
    headers:{apikey:SUPA_ANON,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if(!r.ok){const e=await r.json(); throw e;}
  return r.json();
}
async function login(em,pw){
  try{const res=await rpc('sign_in_with_password',{email:em,password:pw});
        user={id:res.user.id,email:res.user.email,token:res.session.access_token}; store('user',user);
        $('#loginPage').hidden=true; $('#builder').hidden=false;
  }catch(e){alert(e.message||'Login failed');}
}
async function signup(em,pw){
  try{const res=await rpc('sign_up',{email:em,password:pw});
        user={id:res.user.id,email:res.user.email,token:res.session.access_token}; store('user',user);
        $('#loginPage').hidden=true; $('#builder').hidden=false;
  }catch(e){alert(e.message||'Sign-up failed');}
}
$('#loginBtn').onclick=()=>login($('#email').value,$('#pw').value);
$('#signupBtn').onclick=()=>signup($('#email').value,$('#pw').value);
if(user){$('#loginPage').hidden=true; $('#builder').hidden=false;}

/* flow */
const pages=['species','class','abilities','equipment','finish'];
function show(p){
  pages.forEach(x=>$(`#${x}`).hidden=true);
  $(`#${p}`).hidden=false;
  document.querySelectorAll('.step').forEach(b=>b.classList.toggle('active',b.dataset.page===p));
}
document.querySelectorAll('.step').forEach(b=>b.onclick=()=>show(b.dataset.page));

/* species */
const SPECIES=[{n:'Dragonborn',b:{str:2,cha:1}},{n:'Dwarf',b:{con:2}},{n:'Elf',b:{dex:2}},{n:'Human',b:{str:1,dex:1,con:1,int:1,wis:1,cha:1}}];
$('#speciesGrid').innerHTML=SPECIES.map(s=>`<div class="card" data-species="${s.n}">${s.n}</div>`).join('');
$('#speciesGrid').onclick=e=>{if(e.target.classList.contains('card')){build.species=e.target.dataset.species; show('class');}};

/* class */
const CLASSES=[{n:'Wizard',hd:6,p:'int'},{n:'Fighter',hd:10,p:'str'},{n:'Rogue',hd:8,p:'dex'},{n:'Cleric',hd:8,p:'wis'}];
$('#classGrid').innerHTML=CLASSES.map(c=>`<div class="card" data-class="${c.n}">${c.n}</div>`).join('');
$('#classGrid').onclick=e=>{if(e.target.classList.contains('card')){build.class=e.target.dataset.class; show('abilities');}};

/* abilities */
$('#rollScores').onclick=()=>{
  build.scores=['str','dex','con','int','wis','cha'].map(()=>{
    const r=Array.from({length:4},()=>Math.floor(Math.random()*6)+1); r.sort((a,b)=>b-a); r.pop(); return r.reduce((a,b)=>a+b,0);
  }).sort((a,b)=>b-a);
  $('#scoreBox').innerHTML=build.scores.map(n=>`<span class="score-chip" draggable="true">${n}</span>`).join('');
  renderDrops();
};
function renderDrops(){
  const grid=$('#abilityGrid'); grid.innerHTML='';
  Object.keys(build.assigned).forEach(ab=>{
    const div=document.createElement('div'); div.className='ability drop-target'; div.dataset.ability=ab;
    div.innerHTML=`${ab.toUpperCase()}<br><span class="val">${build.assigned[ab]||'—'}</span>`;
    div.ondrop=e=>{e.preventDefault(); build.assigned[ab]=+e.dataTransfer.getData('text'); renderDrops();};
    div.ondragover=e=>e.preventDefault();
    grid.appendChild(div);
  });
}
$('#scoreBox').ondragstart=e=>{if(e.target.classList.contains('score-chip'))e.dataTransfer.setData('text',e.target.textContent);};

/* equipment */
const PACKS=[{n:'Scholar',i:['Spellbook','Ink','Ink pen','Parchment ×10']},{n:'Explorer',i:['Backpack','Bedroll','Mess kit','Tinderbox','Torches ×10','Rations ×10','Waterskin','50 ft rope']}];
$('#packs').innerHTML=PACKS.map(p=>`<label><input type="radio" name="pack" value="${p.n}"> ${p.n} pack</label>`).join('');

/* finish */
$('#saveChar').onclick=async()=>{
  build.name=$('#charName').value.trim(); if(!build.name){alert('Name required');return;}
  if(!build.species||!build.class||Object.values(build.assigned).some(v=>v===null)){alert('Finish all steps');return;}
  const pack=PACKS.find(p=>p.n===$('input[name="pack"]:checked')?.value)||PACKS[0];
  build.equipment=pack.i;
  const bonus=SPECIES.find(s=>s.n===build.species).b;
  Object.keys(bonus).forEach(ab=>build.assigned[ab]+=bonus[ab]);
  const sheet={
    owner:user.id,
    name:build.name,
    species:build.species,
    class:build.class,
    level:1,
    hp:{max:CLASSES.find(c=>c.n===build.class).hd+Math.floor((build.assigned.con-10)/2),current:0,temp:0},
    ac:10+Math.floor((build.assigned.dex-10)/2),
    speed:30,
    stats:build.assigned,
    profBonus:2,
    skills:{},saves:{},
    spells:[],
    inventory:build.equipment.map(n=>({name:n,qty:1})),
    fullBlob:build
  };
  sheet.inventory.push({name:'Gold',qty:10});
  await sb.post(`${SUPA_URL}/rest/v1/characters`,sheet);
  alert('Saved!'); location.href='adventure.html';
};