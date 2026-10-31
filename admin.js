const $=s=>document.querySelector(s);
const cfg=window.WESH_CONFIG||{};
const configured=!!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase);
const client=configured?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
let currentStatus="pending", cache=[];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function show(id,on){$(id).classList.toggle("hidden",!on)}
function message(id,text){$(id).textContent=text}
async function init(){
 if(!configured){show("#setup-warning",true);return}
 const {data:{session}}=await client.auth.getSession();
 if(session)showDashboard();else show("#login-panel",true);
 client.auth.onAuthStateChange((_event,session)=>{if(session)showDashboard();else{show("#dashboard",false);show("#login-panel",true);show("#logout-btn",false)}});
}
$("#login-form").addEventListener("submit",async e=>{
 e.preventDefault();message("#login-message","جارٍ تسجيل الدخول...");
 const {error}=await client.auth.signInWithPassword({email:$("#email").value,password:$("#password").value});
 message("#login-message",error?error.message:"تم الدخول.");
});
$("#logout-btn").addEventListener("click",()=>client.auth.signOut());
async function showDashboard(){show("#setup-warning",false);show("#login-panel",false);show("#dashboard",true);show("#logout-btn",true);await refresh();}
async function refresh(){
 const {data,error}=await client.from("articles").select("*").order("created_at",{ascending:false}).limit(300);
 if(error){$("#admin-list").innerHTML=`<div class="empty-admin">تعذر تحميل الأخبار: ${esc(error.message)}</div>`;return}
 cache=data||[];
 $("#pending-count").textContent=cache.filter(x=>x.status==="pending").length;
 $("#published-count").textContent=cache.filter(x=>x.status==="published").length;
 $("#other-count").textContent=cache.filter(x=>["draft","rejected"].includes(x.status)).length;
 renderList();
}
function renderList(){
 const rows=currentStatus==="all"?cache:cache.filter(x=>x.status===currentStatus);
 if(!rows.length){$("#admin-list").innerHTML='<div class="empty-admin">لا توجد أخبار في هذا القسم حالياً.</div>';return}
 $("#admin-list").innerHTML=rows.map(a=>`<article class="admin-item"><img src="${esc(a.image_url||"https://placehold.co/240x160?text=News")}" alt=""><div><h3>${esc(a.title)}</h3><p>${esc(a.category)} · ${esc(a.source_name||a.author||"تحرير الموقع")} · ${new Date(a.created_at).toLocaleString("ar-SA")}</p><span class="status-pill">${esc(a.status)}</span></div><div class="item-actions">${a.status!=="published"?`<button class="approve" data-action="publish" data-id="${a.id}">نشر</button>`:""}<button data-action="edit" data-id="${a.id}">تعديل</button>${a.status!=="rejected"?`<button class="reject" data-action="reject" data-id="${a.id}">رفض</button>`:""}<button data-action="delete" data-id="${a.id}">حذف</button></div></article>`).join("");
}
document.querySelectorAll(".admin-tabs button").forEach(b=>b.addEventListener("click",()=>{currentStatus=b.dataset.status;document.querySelectorAll(".admin-tabs button").forEach(x=>x.classList.toggle("active",x===b));renderList()}));
function clearForm(){ $("#article-id").value="";$("#article-title").value="";$("#article-category").value="ترند";$("#article-author").value="فريق التحرير";$("#article-image").value="";$("#article-excerpt").value="";$("#article-body").value="";$("#article-featured").checked=false;message("#editor-message","");}
function editArticle(a){
 clearForm();$("#form-heading").textContent=a?"تعديل الخبر":"إضافة خبر";
 if(a){$("#article-id").value=a.id;$("#article-title").value=a.title;$("#article-category").value=a.category;$("#article-author").value=a.author||"فريق التحرير";$("#article-image").value=a.image_url||"";$("#article-excerpt").value=a.excerpt||"";$("#article-body").value=a.body||"";$("#article-featured").checked=!!a.featured;}
 $("#edit-dialog").showModal();
}
$("#new-article").addEventListener("click",()=>editArticle(null));
$("#close-editor").addEventListener("click",()=>$("#edit-dialog").close());
async function saveArticle(status){
 const id=$("#article-id").value;
 const payload={title:$("#article-title").value.trim(),category:$("#article-category").value,author:$("#article-author").value.trim()||"فريق التحرير",image_url:$("#article-image").value.trim(),excerpt:$("#article-excerpt").value.trim(),body:$("#article-body").value.trim(),featured:$("#article-featured").checked,status,published_at:status==="published"?new Date().toISOString():null};
 if(!payload.title||!payload.body){message("#editor-message","العنوان ونص الخبر مطلوبان.");return}
 message("#editor-message","جارٍ الحفظ...");
 const result=id?await client.from("articles").update(payload).eq("id",id):await client.from("articles").insert(payload);
 if(result.error){message("#editor-message",result.error.message);return}
 $("#edit-dialog").close();await refresh();
}
$("#article-form").addEventListener("submit",e=>{e.preventDefault();saveArticle("published")});
$("#save-draft").addEventListener("click",()=>saveArticle("draft"));
$("#admin-list").addEventListener("click",async e=>{
 const b=e.target.closest("[data-action]");if(!b)return;const a=cache.find(x=>x.id===b.dataset.id);if(!a)return;
 if(b.dataset.action==="edit"){editArticle(a);return}
 if(b.dataset.action==="delete"){if(!confirm("تأكيد حذف الخبر نهائياً؟"))return;const {error}=await client.from("articles").delete().eq("id",a.id);if(error)alert(error.message);await refresh();return}
 const status=b.dataset.action==="publish"?"published":"rejected";
 const {error}=await client.from("articles").update({status,published_at:status==="published"?new Date().toISOString():a.published_at}).eq("id",a.id);
 if(error)alert(error.message);await refresh();
});
init();
