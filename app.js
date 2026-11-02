const $ = s => document.querySelector(s);
const escapeHTML = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fallbackImage = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1000&q=80";
let articles = [];
let db = null;
if (window.WESH_CONFIG?.SUPABASE_URL && window.WESH_CONFIG?.SUPABASE_ANON_KEY && window.supabase) {
  db = window.supabase.createClient(window.WESH_CONFIG.SUPABASE_URL, window.WESH_CONFIG.SUPABASE_ANON_KEY);
}
function normalise(row){return {...row, dateLabel: row.published_at ? new Intl.DateTimeFormat("ar-SA",{dateStyle:"medium"}).format(new Date(row.published_at)) : "حديثاً"}}
function showDataStatus(message, type="info"){
  const status=$("#data-status");
  if(!status)return;
  status.textContent=message;
  status.dataset.type=type;
  status.classList.remove("hidden");
}
function hideDataStatus(){
  const status=$("#data-status");
  if(status)status.classList.add("hidden");
}
async function loadArticles(){
  articles=[];
  if(!db){
    renderHome();
    showDataStatus("الأخبار غير متاحة حالياً. تعذّر الاتصال بقاعدة البيانات؛ يرجى المحاولة لاحقاً.","error");
    return;
  }
  const {data,error}=await db.from("articles").select("*").eq("status","published").order("published_at",{ascending:false}).limit(60);
  if(error){
    console.error("تعذّر تحميل الأخبار من Supabase:",error);
    renderHome();
    showDataStatus("تعذّر تحميل الأخبار حالياً. نعمل على حل المشكلة؛ يرجى المحاولة لاحقاً.","error");
    return;
  }
  articles=(data||[]).map(normalise);
  renderHome();
  if(!articles.length)showDataStatus("لا توجد أخبار منشورة حالياً. تابعنا قريباً لآخر التحديثات.");
  else hideDataStatus();
}
function cardMarkup(a,hero=false,small=false){
 const image=a.image_url||fallbackImage, cls=hero?`hero-card${small?" small":""}`:"news-card";
 if(hero)return `<article class="${cls}"><img class="hero-image" src="${escapeHTML(image)}" alt="" onerror="this.src='${fallbackImage}'"><div class="hero-copy"><span class="category-label">${escapeHTML(a.category)}</span><h2><a href="#article/${encodeURIComponent(a.id)}" data-article="${escapeHTML(a.id)}">${escapeHTML(a.title)}</a></h2><div class="meta">${escapeHTML(a.author||"فريق التحرير")} · ${escapeHTML(a.dateLabel)}</div></div></article>`;
 return `<article class="news-card"><a class="news-thumb" href="#article/${encodeURIComponent(a.id)}" data-article="${escapeHTML(a.id)}"><img src="${escapeHTML(image)}" alt="${escapeHTML(a.title)}" loading="lazy" onerror="this.src='${fallbackImage}'"></a><div class="news-info"><span class="category-label">${escapeHTML(a.category)}</span><h3><a href="#article/${encodeURIComponent(a.id)}" data-article="${escapeHTML(a.id)}">${escapeHTML(a.title)}</a></h3><p>${escapeHTML(a.excerpt||"")}</p><div class="news-meta"><span>${escapeHTML(a.author||"فريق التحرير")}</span><span>${escapeHTML(a.dateLabel)}</span></div></div></article>`;
}
function renderHome(){
 const featured=articles.filter(a=>a.featured).slice(0,3), picks=[...featured,...articles.filter(a=>!featured.includes(a))].slice(0,3);
 $("#hero-grid").innerHTML=picks.length?`<div>${cardMarkup(picks[0],true)}</div><div class="hero-stack">${picks[1]?cardMarkup(picks[1],true,true):""}${picks[2]?cardMarkup(picks[2],true,true):""}</div>`:"";
 $("#trend-chips").innerHTML=[...new Set(articles.map(a=>a.category))].slice(0,8).map(t=>`<button class="trend-chip" data-trend="${escapeHTML(t)}"># ${escapeHTML(t)}</button>`).join("");
 $("#popular-list").innerHTML=articles.slice(0,5).map(a=>`<li><a href="#article/${encodeURIComponent(a.id)}" data-article="${escapeHTML(a.id)}">${escapeHTML(a.title)}</a></li>`).join("");
 renderFeed(articles);
}
function renderFeed(list,title="أحدث الأخبار"){
 $("#feed-title").textContent=title;$("#feed-eyebrow").textContent=title==="أحدث الأخبار"?"آخر التحديثات":"نتائج التصفح";$("#results-count").textContent=`${list.length} أخبار`;
 $("#news-grid").innerHTML=list.map(a=>cardMarkup(a)).join("");$("#empty-state").classList.toggle("hidden",!!list.length);$("#news-grid").classList.toggle("hidden",!list.length);
}
function setActive(c){document.querySelectorAll(".nav-link").forEach(a=>a.classList.toggle("active",a.dataset.category===c))}
function filterCategory(c){const list=c==="الكل"?articles:articles.filter(a=>a.category===c);setActive(c);renderFeed(list,c==="الكل"?"أحدث الأخبار":`أخبار ${c}`)}
function search(q){const s=q.trim().toLowerCase();renderFeed(articles.filter(a=>[a.title,a.category,a.excerpt,a.body].join(" ").toLowerCase().includes(s)),`نتائج البحث: ${q}`);setActive("")}
function openArticle(id){
 const a=articles.find(x=>String(x.id)===String(id));if(!a)return;
 $("#article-content").innerHTML=`<div class="article-content"><span class="category-label">${escapeHTML(a.category)}</span><h1>${escapeHTML(a.title)}</h1><div class="meta">${escapeHTML(a.author||"فريق التحرير")} · ${escapeHTML(a.dateLabel)}</div><img src="${escapeHTML(a.image_url||fallbackImage)}" alt=""><p class="article-lead">${escapeHTML(a.excerpt||"")}</p><p>${escapeHTML(a.body||"")}</p><div class="article-actions"><a target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(a.title+" "+location.href)}">مشاركة واتساب</a><a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(a.title)}">مشاركة على X</a></div></div>`;
 $("#article-dialog").showModal();
}
document.addEventListener("click",e=>{
 const link=e.target.closest("[data-article]");if(link){e.preventDefault();openArticle(link.dataset.article);return}
 const trend=e.target.closest("[data-trend]");if(trend){filterCategory(trend.dataset.trend);return}
 const nav=e.target.closest("[data-category]");if(nav){e.preventDefault();filterCategory(nav.dataset.category);$("#main-nav").classList.remove("open")}
});
$("#search-form").addEventListener("submit",e=>{e.preventDefault();search($("#search-input").value)});
$("#reset-filter").addEventListener("click",()=>{filterCategory("الكل");$("#search-input").value=""});
$("#dialog-close").addEventListener("click",()=>$("#article-dialog").close());
$("#article-dialog").addEventListener("click",e=>{if(e.target===$("#article-dialog"))$("#article-dialog").close()});
$("#theme-toggle").addEventListener("click",()=>{document.body.classList.toggle("dark");localStorage.setItem("wesh-theme",document.body.classList.contains("dark")?"dark":"light")});
$("#menu-toggle").addEventListener("click",()=>$("#main-nav").classList.toggle("open"));
if(localStorage.getItem("wesh-theme")==="dark")document.body.classList.add("dark");
$("#today-date").textContent=new Intl.DateTimeFormat("ar-SA",{weekday:"long",day:"numeric",month:"long"}).format(new Date());$("#year").textContent=new Date().getFullYear();
window.addEventListener("hashchange",()=>{const h=decodeURIComponent(location.hash);if(h.startsWith("#article/"))openArticle(h.split("/")[1]);else if(h.startsWith("#category/"))filterCategory(h.split("/")[1])});
loadArticles();
