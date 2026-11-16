let csrfToken = "";
let currentUser = null;
let currentView = "overview";
let authMode = "login";
const $ = id => document.getElementById(id);
const api = async (url, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (options.method && options.method !== "GET") headers["x-uno-csrf"] = csrfToken;
  const response = await fetch(url, { credentials: "same-origin", ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data;
};
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2600); }
function setAuthMode(mode) {
  authMode=mode;
  document.querySelectorAll(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.auth===mode));
  $("usernameLabel").classList.toggle("hidden",mode!=="register"); $("usernameInput").classList.toggle("hidden",mode!=="register");
  $("emailLabel").classList.toggle("hidden",mode!=="register"); $("emailInput").classList.toggle("hidden",mode!=="register");
  $("loginInput").placeholder=mode==="register"?"Choose a login email":"Enter email or username";
  $("loginInput").previousElementSibling.textContent=mode==="register"?"Email address":"Email or username";
  $("loginInput").classList.toggle("hidden",mode==="register");
  $("authSubmit").innerHTML=mode==="register"?"Create your account <span>→</span>":"Enter your space <span>→</span>";
}
async function boot() {
  const config=await fetch("/api/config").then(r=>r.json()); csrfToken=config.csrfToken;
  $("todayDate").textContent=new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric"}).format(new Date()).toUpperCase();
  $("year").textContent=new Date().getFullYear();
  try { const data=await api("/api/me"); currentUser=data.user; showDashboard(data); } catch { $("authScreen").classList.remove("hidden"); }
}
function showDashboard(data) {
  $("authScreen").classList.add("hidden"); $("dashboard").classList.remove("hidden"); $("subpage").classList.add("hidden");
  currentUser=data.user; $("welcomeName").textContent=data.user.username; $("profileInitial").textContent=data.user.username[0].toUpperCase();
  renderStats(data.user,data.quests); renderQuests(data.quests); loadContent();
}
function renderStats(user,quests) {
  const level=Math.max(1,user.level||1), within=user.xp%500, completed=quests.filter(q=>q.completed).length;
  $("xpValue").innerHTML=`${user.xp} <small>XP</small>`; $("xpBar").style.width=`${within/5}%`;
  $("xpNext").textContent=`${500-within} XP to next level`; $("levelValue").textContent=String(level).padStart(2,"0");
  $("rankName").textContent=level>=20?"ELITE":level>=10?"VANGUARD":level>=5?"DISCIPLINED":level>=2?"RISING":"NOVICE";
  $("completedValue").textContent=completed; $("streakValue").innerHTML=`${user.streak||0} <small>days</small>`;
}
function renderQuests(quests) {
  const list=$("questList"); list.innerHTML="";
  const pending=quests.filter(q=>!q.completed).slice(0,5);
  if(!pending.length) { list.innerHTML='<p class="muted small">No open quests. Add one commitment and get moving.</p>'; }
  pending.forEach(q=>{
    const item=document.createElement("div"); item.className="quest-item";
    const check=document.createElement("button"); check.className="quest-check"; check.setAttribute("aria-label","Complete quest"); check.textContent="✓";
    check.addEventListener("click",()=>completeQuest(q.id));
    const info=document.createElement("div"); info.className="quest-info";
    const title=document.createElement("div"); title.className="quest-title"; title.textContent=q.title;
    const desc=document.createElement("div"); desc.className="quest-description"; desc.textContent=q.description||"Personal commitment";
    info.append(title,desc); const xp=document.createElement("span"); xp.className="xp-tag"; xp.textContent=`+${q.xp_reward} XP`;
    item.append(check,info,xp); list.append(item);
  });
}
async function refresh() { const data=await api("/api/me"); showDashboard(data); }
async function completeQuest(id) {
  try { const result=await api(`/api/quests/${id}/complete`,{method:"POST",body:JSON.stringify({})}); await refresh(); toast(`Quest complete. +XP earned. Level ${result.level}.`); }
  catch(e){toast(e.message);}
}
async function addQuest(title) {
  await api("/api/quests",{method:"POST",body:JSON.stringify({title,xpReward:25})}); await refresh(); toast("Quest added to your list.");
}
async function loadContent() {
  try {
    const data=await api("/api/content");
    if(data.quotes.length){const q=data.quotes[0];$("featuredQuote").textContent=q.quote;$("quoteAuthor").textContent=`— ${q.author||"UNKNOWN"}`;}
    const list=$("sponsorList"); list.innerHTML="";
    if(!data.sponsors.length){list.innerHTML='<p class="muted small">Thoughtful partners will appear here.</p>';return;}
    data.sponsors.forEach(s=>{
      const row=document.createElement("div");row.className="sponsor-item";
      if(s.image_url){const img=document.createElement("img");img.className="sponsor-image";img.src=s.image_url;img.alt=`${s.name} logo`;row.append(img);}
      const info=document.createElement("div");const name=document.createElement("div");name.className="sponsor-name";name.textContent=s.name;
      const desc=document.createElement("p");desc.className="sponsor-desc";desc.textContent=s.description;
      info.append(name,desc);if(s.website_url){const link=document.createElement("a");link.className="sponsor-link";link.href=s.website_url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Learn more ↗";info.append(link);}row.append(info);list.append(row);
    });
  } catch {}
}
function switchView(view) {
  currentView=view; $("pageName").textContent=view.toUpperCase();
  document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="overview"){ $("dashboard").classList.remove("hidden");$("subpage").classList.add("hidden");return; }
  $("dashboard").classList.add("hidden");$("subpage").classList.remove("hidden");
  const titles={quests:["My quests","Your commitments, made visible.","All your active and completed quests."],progress:["Progress","Proof of consistent effort.","Your current level and measurable activity."],library:["Inspiration","Ideas worth returning to.","Quotes and partners curated for the community."]};
  $("subTitle").textContent=titles[view][0];$("subDescription").textContent=titles[view][1];$("subEyebrow").textContent=titles[view][2];
  const content=$("subContent");content.innerHTML="";
  if(view==="quests") api("/api/me").then(d=>{
    d.quests.forEach(q=>{const row=document.createElement("div");row.className="progress-row";const a=document.createElement("div");a.textContent=q.title;const b=document.createElement("span");b.className="xp-tag";b.textContent=q.completed?"COMPLETED":`+${q.xp_reward} XP`;row.append(a,b);content.append(row);});
    if(!d.quests.length)content.textContent="No quests yet. Add your first commitment from Overview.";
  });
  if(view==="progress") api("/api/me").then(d=>{
    const rows=[["Current level",d.user.level],["Total experience",`${d.user.xp} XP`],["Completed quests",d.quests.filter(q=>q.completed).length],["Total quests",d.quests.length],["Member since",new Date(d.user.created_at+" UTC").toLocaleDateString()]];
    rows.forEach(([k,v])=>{const row=document.createElement("div");row.className="progress-row";row.innerHTML=`<span class="muted">${k}</span><strong>${v}</strong>`;content.append(row);});
  });
  if(view==="library") api("/api/content").then(d=>{
    d.quotes.forEach(q=>{const row=document.createElement("div");row.className="progress-row";const a=document.createElement("div");a.textContent=`“${q.quote}” — ${q.author}`;row.append(a);content.append(row);});
    d.sponsors.forEach(s=>{const row=document.createElement("div");row.className="progress-row";row.textContent=`Partner: ${s.name} — ${s.description}`;content.append(row);});
  });
}
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();$("authMessage").textContent="";
  try {
    let data;
    if(authMode==="register") data=await api("/api/register",{method:"POST",body:JSON.stringify({username:$("usernameInput").value,email:$("emailInput").value,password:$("passwordInput").value})});
    else data=await api("/api/login",{method:"POST",body:JSON.stringify({login:$("loginInput").value,password:$("passwordInput").value})});
    csrfToken=data.csrfToken; await refresh();
  } catch(err){$("authMessage").textContent=err.message;}
});
document.querySelectorAll(".auth-tab").forEach(b=>b.addEventListener("click",()=>setAuthMode(b.dataset.auth)));
$("quickQuest").addEventListener("submit",async e=>{e.preventDefault();try{await addQuest($("quickQuestTitle").value.trim());$("quickQuestTitle").value="";}catch(err){toast(err.message);}});
document.querySelectorAll(".nav-link").forEach(b=>b.addEventListener("click",()=>{$("sidebar").classList.remove("open");switchView(b.dataset.view);}));
document.querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.jump)));
$("menuBtn").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("profileInitial").addEventListener("click",async()=>{if(confirm("Sign out of UNO LEVELING?")){try{await api("/api/logout",{method:"POST",body:JSON.stringify({})});location.reload();}catch(e){toast(e.message);}}});
boot().catch(()=>{$("authScreen").classList.remove("hidden");});
