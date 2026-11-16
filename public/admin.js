let csrfToken="";
const $=id=>document.getElementById(id);
const request=async(url,options={})=>{
  const headers={...(options.headers||{})};if(options.body&&!(options.body instanceof FormData))headers["Content-Type"]="application/json";
  if(options.method&&options.method!=="GET")headers["x-uno-csrf"]=csrfToken;
  const r=await fetch(url,{credentials:"same-origin",...options,headers});const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||"Request failed.");if(data.csrfToken)csrfToken=data.csrfToken;return data;
};
function message(id,text){$(id).textContent=text;}
function toast(text){const t=$("adminToast");t.textContent=text;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500);}
async function init(){const c=await fetch("/api/config").then(r=>r.json());csrfToken=c.csrfToken;}
async function loadConsole(){
  $("adminLogin").classList.add("hidden");$("adminConsole").classList.remove("hidden");
  const s=await request("/api/admin/summary");
  $("adminStats").innerHTML=[["TOTAL USERS",s.users],["TOTAL QUESTS",s.quests],["COMPLETED",s.completed],["ACTIVE SPONSORS",s.sponsors],["LIVE QUOTES",s.quotes]].map(([k,v])=>`<div class="admin-stat"><span>${k}</span><strong>${v}</strong></div>`).join("");
  await Promise.all([loadSponsors(),loadQuotes()]);
}
async function loadSponsors(){
  const data=await request("/api/admin/sponsors"),list=$("sponsorAdminList");list.innerHTML="";
  if(!data.length){list.innerHTML='<p class="muted small">No sponsors added yet.</p>';return;}
  data.forEach(s=>{
    const row=document.createElement("div");row.className="admin-record";
    if(s.image_url){const img=document.createElement("img");img.className="record-thumb";img.src=s.image_url;img.alt="";row.append(img);}
    const main=document.createElement("div");main.className="admin-record-main";
    const title=document.createElement("div");title.className="admin-record-title";title.textContent=s.name;
    const desc=document.createElement("div");desc.className="admin-record-desc";desc.textContent=`${s.active?"Published":"Paused"} · ${s.description||"No description"}`;
    main.append(title,desc);row.append(main);
    const actions=document.createElement("div");actions.className="record-actions";
    const toggle=document.createElement("button");toggle.className="mini-button";toggle.textContent=s.active?"Pause":"Publish";toggle.addEventListener("click",async()=>{try{await request(`/api/admin/sponsors/${s.id}`,{method:"PATCH",body:JSON.stringify({active:!s.active})});await loadSponsors();await loadStats();}catch(e){toast(e.message);}});
    const del=document.createElement("button");del.className="mini-button danger";del.textContent="Delete";del.addEventListener("click",async()=>{if(!confirm(`Delete ${s.name}?`))return;try{await request(`/api/admin/sponsors/${s.id}`,{method:"DELETE",body:JSON.stringify({})});await loadSponsors();await loadStats();toast("Sponsor deleted.");}catch(e){toast(e.message);}});
    actions.append(toggle,del);row.append(actions);list.append(row);
  });
}
async function loadQuotes(){
  const data=await request("/api/admin/quotes"),list=$("quoteAdminList");list.innerHTML="";
  if(!data.length){list.innerHTML='<p class="muted small">No quotes added yet.</p>';return;}
  data.forEach(q=>{
    const row=document.createElement("div");row.className="admin-record";
    const main=document.createElement("div");main.className="admin-record-main";
    const title=document.createElement("div");title.className="admin-record-title";title.textContent=`“${q.quote}”`;
    const desc=document.createElement("div");desc.className="admin-record-desc";desc.textContent=`${q.author} · ${q.category} · ${q.active?"Published":"Paused"}`;
    main.append(title,desc);row.append(main);
    const actions=document.createElement("div");actions.className="record-actions";
    const toggle=document.createElement("button");toggle.className="mini-button";toggle.textContent=q.active?"Pause":"Publish";toggle.addEventListener("click",async()=>{try{await request(`/api/admin/quotes/${q.id}`,{method:"PATCH",body:JSON.stringify({active:!q.active})});await loadQuotes();await loadStats();}catch(e){toast(e.message);}});
    const del=document.createElement("button");del.className="mini-button danger";del.textContent="Delete";del.addEventListener("click",async()=>{if(!confirm("Delete this quote?"))return;try{await request(`/api/admin/quotes/${q.id}`,{method:"DELETE",body:JSON.stringify({})});await loadQuotes();await loadStats();toast("Quote deleted.");}catch(e){toast(e.message);}});
    actions.append(toggle,del);row.append(actions);list.append(row);
  });
}
async function loadStats(){const s=await request("/api/admin/summary");$("adminStats").innerHTML=[["TOTAL USERS",s.users],["TOTAL QUESTS",s.quests],["COMPLETED",s.completed],["ACTIVE SPONSORS",s.sponsors],["LIVE QUOTES",s.quotes]].map(([k,v])=>`<div class="admin-stat"><span>${k}</span><strong>${v}</strong></div>`).join("");}
$("adminLoginForm").addEventListener("submit",async e=>{e.preventDefault();message("adminLoginMessage","");try{const d=await request("/api/admin/login",{method:"POST",body:JSON.stringify({username:$("adminUsername").value,passcode:$("adminPasscode").value})});csrfToken=d.csrfToken;await loadConsole();}catch(err){message("adminLoginMessage",err.message);}});
$("adminLogout").addEventListener("click",async()=>{try{await request("/api/admin/logout",{method:"POST",body:JSON.stringify({})});location.reload();}catch(e){toast(e.message);}});
document.querySelectorAll(".admin-tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".admin-tab").forEach(x=>x.classList.toggle("active",x===b));$("sponsorsPanel").classList.toggle("hidden",b.dataset.tab!=="sponsors");$("quotesPanel").classList.toggle("hidden",b.dataset.tab!=="quotes");}));
$("sponsorForm").addEventListener("submit",async e=>{e.preventDefault();message("sponsorMessage","Uploading…");try{const form=new FormData(e.currentTarget);await request("/api/admin/sponsors",{method:"POST",body:form});e.currentTarget.reset();$("imagePreviewWrap").classList.add("hidden");await loadSponsors();await loadStats();message("sponsorMessage","Sponsor saved.");}catch(err){message("sponsorMessage",err.message);}});
$("quoteForm").addEventListener("submit",async e=>{e.preventDefault();message("quoteMessage","Saving…");const f=new FormData(e.currentTarget);try{await request("/api/admin/quotes",{method:"POST",body:JSON.stringify({quote:f.get("quote"),author:f.get("author"),category:f.get("category"),active:f.has("active")})});e.currentTarget.reset();await loadQuotes();await loadStats();message("quoteMessage","Quote saved.");}catch(err){message("quoteMessage",err.message);}});
$("sponsorImage").addEventListener("change",e=>{const file=e.target.files[0];if(!file){$("imagePreviewWrap").classList.add("hidden");return;}if(file.size>5*1024*1024){message("sponsorMessage","Image must be 5MB or smaller.");e.target.value="";return;}const reader=new FileReader();reader.onload=()=>{$("imagePreview").src=reader.result;$("imagePreviewWrap").classList.remove("hidden");};reader.readAsDataURL(file);});
$("clearImage").addEventListener("click",()=>{$("sponsorImage").value="";$("imagePreviewWrap").classList.add("hidden");});
init().catch(e=>message("adminLoginMessage",e.message));
