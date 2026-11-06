(() => {
"use strict";
const $=s=>document.querySelector(s), esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cfg=window.WESH_CONFIG||{};
if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const cats=[
["السعودية","saudi","المناطق والمدن، القرارات والخدمات، الاقتصاد والمشاريع، المجتمع والفعاليات"],
["العالم","world","السياسة والعلاقات الدولية، الاقتصاد العالمي، الأحداث، العلوم"],
["الترندات","trending","ترند السعودية، الخليج والعالم العربي، الترند العالمي، التحقق"],
["التقنية والذكاء الاصطناعي","technology","الذكاء الاصطناعي، الأجهزة، التطبيقات، الأمن والخصوصية"],
["الرياضة","sports","الدوري السعودي، المنتخب، كرة القدم العالمية، البطولات"],
["الترفيه والفن","entertainment","الأفلام والمسلسلات، الفن، الفعاليات، الألعاب"],
["الاقتصاد والأعمال","business","الأسواق، الشركات، الاستثمار، التجارة"],
["السيارات والنقل","automotive","أخبار السيارات، المراجعات، الأسعار، السلامة والكهربائية"],
["الوظائف وسوق العمل","careers","الوظائف الحكومية والخاصة، التدريب، المهارات"],
["التعليم","education","التعليم العام، الجامعات، الابتعاث، النتائج"],
["السياحة والسفر","tourism","السياحة السعودية والعالمية، المواسم، الطيران والضيافة"],
["منوعات وحياة","lifestyle","الطعام، الصحة والتوعية، القصص"],
["وش السالفة؟","explained","خلفية الأحداث، شرح القرارات، سؤال وجواب، تحقق وتصحيح"]
];
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem("wesh_preview_"+k))??d}catch{return d}};
const write=(k,v)=>localStorage.setItem("wesh_preview_"+k,JSON.stringify(v));
let uid=null, role=null, trends=[];
function panel(id,title,desc,body){const el=$("#view-"+id);if(el)el.innerHTML='<div class="admin-title-row"><div><span class="eyebrow">إدارة المحتوى</span><h1>'+title+'</h1><p>'+desc+'</p></div></div>'+body;}
function field(label,id,value="",type="text"){return '<label>'+label+'<input id="'+id+'" type="'+type+'" value="'+esc(value)+'"></label>'}
function select(label,id,opts,val){return '<label>'+label+'<select id="'+id+'">'+opts.map(o=>'<option value="'+esc(o[0])+'" '+(o[0]===val?'selected':'')+'>'+esc(o[1])+'</option>').join("")+'</select></label>'}
function msg(id,s){const e=$("#"+id);if(e)e.textContent=s}
function setupTrends(){
panel("trends","إدارة الترندات","إضافة ومراجعة الترندات وربط حالة التحقق بالمصدر.",'<div class="admin-panel"><form id="trend-form" class="edit-form"><input type="hidden" id="trend-id"><div class="form-row">'+field("اسم الترند","trend-name")+field("الرابط المختصر (slug)","trend-slug")+'</div><label>ملخص محايد<textarea id="trend-summary" rows="3"></textarea></label><div class="form-row">'+select("النطاق","trend-region",[["saudi","السعودية"],["gulf","الخليج"],["arab_world","العالم العربي"],["global","عالمي"]],"saudi")+select("المنصة","trend-platform",[["x","X"],["tiktok","TikTok"],["instagram","Instagram"],["youtube","YouTube"],["search","محركات البحث"],["other","أخرى"]],"x")+'</div>'+field("رابط المصدر","trend-source","","url")+'<label>مصادر التحقق (JSON)<textarea id="trend-sources" rows="4" placeholder="[{&quot;name&quot;:&quot;مصدر رسمي&quot;,&quot;url&quot;:&quot;https://example.com&quot;,&quot;is_primary&quot;:true}]"></textarea></label>'+'<div class="form-row">'+select("حالة التحقق","trend-verification",[["unverified","غير متحقق"],["checking","قيد التحقق"],["verified","موثق"],["debunked","تم نفيه"]],"unverified")+select("الحالة","trend-status",[["pending","بانتظار المراجعة"],["draft","مسودة"],["active","نشط"],["paused","موقوف"],["expired","منتهي"]],"pending")+'</div><div class="form-row">'+field("بداية الظهور","trend-start","","datetime-local")+field("نهاية الظهور","trend-end","","datetime-local")+'</div><div class="form-row">'+field("ترتيب العرض","trend-order","0","number")+'<span></span></div><div class="editor-actions"><button class="button button-primary" type="submit">حفظ الترند</button><button class="button button-outline" type="button" id="trend-reset">تفريغ</button></div><p id="trend-message" class="form-message"></p></form></div><div class="admin-panel"><div class="panel-heading"><h2>الترندات المسجلة</h2><button id="trend-refresh" class="text-action" type="button">تحديث</button></div><div id="trend-list" class="admin-list"></div></div>');
$("#trend-form").addEventListener("submit",saveTrend);
$("#trend-reset").onclick=()=>$("#trend-form").reset();
$("#trend-refresh").onclick=loadTrends;
$("#trend-list").addEventListener("click",trendAction);
loadTrends();
}
async function loadTrends(){
const box=$("#trend-list");box.textContent="جارٍ التحميل…";
const {data,error}=await db.from("trends").select("*").order("created_at",{ascending:false}).limit(200);
if(error){box.textContent="تعذر تحميل الترندات: "+error.message;return}
trends=data||[];
box.innerHTML=trends.length?trends.map(t=>'<article class="admin-item"><div><h3>'+esc(t.name)+'</h3><p>'+esc(t.region)+' · '+esc(t.platform)+' · '+esc(t.verification_status)+' · '+esc(t.status)+'</p><small>'+esc(t.summary)+'</small></div><div class="item-actions"><button data-tedit="'+t.id+'">تعديل</button>'+(role==="admin"?((t.status!=="active"&&t.verification_status!=="verified")?'<button data-tverify="'+t.id+'">اعتماد وتفعيل</button>':"")+'<button data-tpause="'+t.id+'">إيقاف</button><button data-tdelete="'+t.id+'">حذف</button>':"")+'</div></article>').join(""):'<div class="empty-admin">لا توجد ترندات مسجلة حتى الآن.</div>';
}
function fillTrend(t){
$("#trend-id").value=t.id;["name","slug","summary","region","platform","source_url","verification_status","status","display_order"].forEach(k=>{const id="trend-"+({"source_url":"source","verification_status":"verification","display_order":"order"}[k]||k);if($("#"+id))$("#"+id).value=t[k]??""});
["starts_at","ends_at"].forEach(k=>{const id=k==="starts_at"?"trend-start":"trend-end";$("#"+id).value=t[k]?new Date(t[k]).toISOString().slice(0,16):""});
}
async function saveTrend(e){
e.preventDefault();const id=$("#trend-id").value;
const payload={name:$("#trend-name").value.trim(),slug:$("#trend-slug").value.trim().toLowerCase(),summary:$("#trend-summary").value.trim(),region:$("#trend-region").value,platform:$("#trend-platform").value,source_url:$("#trend-source").value.trim()||null,verification_sources:[]};
try{payload.verification_sources=JSON.parse($("#trend-sources").value||"[]");if(!Array.isArray(payload.verification_sources))throw new Error("يجب أن تكون قائمة");}catch(err){msg("trend-message","صيغة مصادر التحقق غير صحيحة.");return}
if(!payload.name||!payload.slug){msg("trend-message","الاسم والرابط المختصر مطلوبان.");return}
if(role==="admin"){payload.verification_status=$("#trend-verification").value;payload.status=$("#trend-status").value;if(payload.verification_status==="verified"&&!payload.verification_sources.length){msg("trend-message","أضف مصادر التحقق أولًا.");return}payload.display_order=Number($("#trend-order").value)||0;payload.starts_at=$("#trend-start").value?new Date($("#trend-start").value).toISOString():null;payload.ends_at=$("#trend-end").value?new Date($("#trend-end").value).toISOString():null;}
else{payload.verification_status="unverified";payload.status="pending";payload.created_by=uid}
msg("trend-message","جارٍ الحفظ…");
const q=id?db.from("trends").update(payload).eq("id",id):db.from("trends").insert(payload);
const {error}=await q;
if(error){msg("trend-message","لم يتم الحفظ: "+error.message);return}
$("#trend-form").reset();$("#trend-id").value="";msg("trend-message","تم حفظ الترند.");await loadTrends();
}
async function trendAction(e){
const b=e.target.closest("button");if(!b)return;
if(b.dataset.tedit){const t=trends.find(x=>x.id===b.dataset.tedit);if(t)fillTrend(t);return}
if(role!=="admin")return;
const id=b.dataset.tverify||b.dataset.tpause||b.dataset.tdelete;if(!id)return;
let q;
if(b.dataset.tverify){const t=trends.find(x=>x.id===id);if(!t||!Array.isArray(t.verification_sources)||!t.verification_sources.length){alert("أضف مصادر تحقق موثقة أولًا.");return}q=db.from("trends").update({status:"active",verification_status:"verified",verified_at:new Date().toISOString(),reviewed_by:uid}).eq("id",id);}
if(b.dataset.tpause)q=db.from("trends").update({status:"paused"}).eq("id",id);
if(b.dataset.tdelete){if(!confirm("تأكيد حذف الترند؟"))return;q=db.from("trends").delete().eq("id",id)}
const {error}=await q;if(error)alert("تعذر تنفيذ العملية: "+error.message);else await loadTrends();
}
function setupCategories(){
const saved=read("categories",cats.map(x=>({name:x[0],slug:x[1],description:x[2],enabled:true})));
panel("categories","الأقسام والتصنيفات","تفعيل الأقسام وترتيبها وتحرير وصفها — هذه الإعدادات محلية للمعاينة ولا تؤثر على الموقع العام.",'<div class="admin-panel"><p class="feature-note">وضع المعاينة: التغييرات محفوظة في هذا المتصفح فقط. لم يتم تغيير تصنيف المقالات في Supabase.</p><div id="category-list" class="admin-list"></div><button id="category-save" class="button button-primary">حفظ ترتيب الأقسام محليًا</button><span id="category-message" class="form-message"></span></div>');
const list=$("#category-list");list.innerHTML=saved.map((c,i)=>'<article class="admin-item"><div><strong>'+esc(c.name)+'</strong><p>'+esc(c.description)+'</p><small>'+esc(c.slug)+'</small></div><div class="item-actions"><button data-up="'+i+'">↑</button><button data-down="'+i+'">↓</button><label><input type="checkbox" data-enabled="'+i+'" '+(c.enabled?'checked':'')+'> مفعّل</label></div></article>').join("");
list.onclick=e=>{const b=e.target.closest("button");if(!b)return;const i=Number(b.dataset.up??b.dataset.down),j=b.dataset.up!==undefined?i-1:i+1;if(j<0||j>=saved.length)return;[saved[i],saved[j]]=[saved[j],saved[i]];setupCategories()};
$("#category-save").onclick=()=>{list.querySelectorAll("[data-enabled]").forEach(x=>saved[Number(x.dataset.enabled)].enabled=x.checked);write("categories",saved);msg("category-message","تم حفظ إعدادات الأقسام على هذا المتصفح.");};
}
function setupPages(){
const defaults=[["about","من نحن","تعريف بالموقع ورسالة التحرير"],["contact","اتصل بنا","وسائل التواصل واستقبال الأخبار"],["privacy","سياسة الخصوصية","البيانات وملفات الارتباط"],["terms","الشروط والأحكام","شروط استخدام الموقع"],["corrections","سياسة التصحيح","آلية تصحيح الأخطاء والتحديثات"]];
const data=read("pages",Object.fromEntries(defaults.map(x=>[x[0],{title:x[1],body:""}])));
panel("pages","الصفحات الثابتة","تحرير صفحات الموقع وحفظ مسوداتها محليًا للمعاينة.",'<div class="admin-panel"><p class="feature-note">المحتوى هنا لا يُنشر للزوار ولا يُحفظ في قاعدة البيانات حتى اعتماد تخزين آمن وربطه بالموقع.</p>'+select("اختر الصفحة","page-key",defaults.map(x=>[x[0],x[1]]),"about")+'<label>عنوان الصفحة<input id="page-title"></label><label>المحتوى<textarea id="page-body" rows="12"></textarea></label><button id="page-save" class="button button-primary">حفظ المسودة</button><span id="page-message" class="form-message"></span></div>');
function load(){const p=data[$("#page-key").value]||{};$("#page-title").value=p.title||"";$("#page-body").value=p.body||""}
$("#page-key").onchange=load;load();
$("#page-save").onclick=()=>{data[$("#page-key").value]={title:$("#page-title").value.trim(),body:$("#page-body").value};write("pages",data);msg("page-message","حُفظت المسودة محليًا في هذا المتصفح.");};
}
function setupSettings(){
const d=read("settings",{siteName:"وش السالفة؟",description:"آخر الأخبار والترندات العربية والعالمية",contact:"weshalsalfah.news@gmail.com",canonical:"",ogImage:"",twitter:"",facebook:"",robots:"index,follow"});
panel("settings","الإعدادات و SEO","إعدادات تعريفية ومسودات SEO للمعاينة فقط.",'<div class="admin-panel"><p class="feature-note">لن تتغير ملفات robots.txt أو sitemap.xml أو وسوم الموقع الحي من هذه الشاشة.</p>'+field("اسم الموقع","set-name",d.siteName)+ '<label>وصف الموقع<textarea id="set-description" rows="3">'+esc(d.description)+'</textarea></label>'+field("بريد التواصل","set-contact",d.contact,"email")+field("الرابط الأساسي (Canonical)","set-canonical",d.canonical,"url")+field("صورة المشاركة","set-og",d.ogImage,"url")+field("حساب X","set-x",d.twitter,"url")+field("فيسبوك","set-facebook",d.facebook,"url")+field("Robots meta","set-robots",d.robots)+'<button id="settings-save" class="button button-primary">حفظ الإعدادات محليًا</button><span id="settings-message" class="form-message"></span></div>');
$("#settings-save").onclick=()=>{write("settings",{siteName:$("#set-name").value,description:$("#set-description").value,contact:$("#set-contact").value,canonical:$("#set-canonical").value,ogImage:$("#set-og").value,twitter:$("#set-x").value,facebook:$("#set-facebook").value,robots:$("#set-robots").value});msg("settings-message","تم الحفظ محليًا للمعاينة.");};
}
function setupHomepage(){
const d=read("homepage",{lead:"",featured:[],sections:["السعودية","العالم","الترندات","التقنية","الرياضة","الترفيه","الاقتصاد","السيارات","الوظائف","التعليم","السياحة"]});
panel("homepage","محرر الصفحة الرئيسية","إعداد ترتيب وحدات الصفحة كمسودة محلية، دون تغيير واجهة الزوار.",'<div class="admin-panel"><p class="feature-note">هذه معاينة ترتيب فقط؛ لن يظهر أي تغيير على الموقع العام.</p>'+field("عنوان الخبر الرئيسي","home-lead",d.lead)+'<label>الأقسام الظاهرة (سطر لكل قسم)<textarea id="home-sections" rows="8">'+esc(d.sections.join("\n"))+'</textarea></label><label>معرّفات الأخبار المميزة (UUID، سطر لكل خبر)<textarea id="home-featured" rows="5">'+esc(d.featured.join("\n"))+'</textarea></label><button id="home-save" class="button button-primary">حفظ ترتيب المعاينة</button><span id="home-message" class="form-message"></span></div>');
$("#home-save").onclick=()=>{write("homepage",{lead:$("#home-lead").value,sections:$("#home-sections").value.split("\n").map(x=>x.trim()).filter(Boolean),featured:$("#home-featured").value.split("\n").map(x=>x.trim()).filter(Boolean)});msg("home-message","تم حفظ ترتيب المعاينة محليًا.");};
}
function setupActivity(){
panel("activity","سجل النشاط","عرض العمليات المسجلة في قاعدة البيانات (للمدير فقط).",'<div class="admin-panel"><button id="activity-refresh" class="button button-outline">تحديث السجل</button><div id="activity-list" class="admin-list"></div></div>');
async function load(){const box=$("#activity-list");box.textContent="جارٍ تحميل السجل…";const {data,error}=await db.from("content_activity").select("id,actor_id,entity_type,entity_id,action,details,created_at").order("created_at",{ascending:false}).limit(100);if(error){box.textContent="تعذر تحميل السجل: "+error.message;return}box.innerHTML=data.length?data.map(a=>'<article class="admin-item"><div><strong>'+esc(a.action)+' · '+esc(a.entity_type)+'</strong><p>'+esc(a.entity_id)+' · '+new Date(a.created_at).toLocaleString("ar-SA")+'</p><small>'+esc(JSON.stringify(a.details||{}))+'</small></div></article>').join(""):'<div class="empty-admin">لا توجد عمليات مسجلة بعد.</div>'}
$("#activity-refresh").onclick=load;load();
}
function init(){
setupTrends();setupCategories();setupPages();setupSettings();setupHomepage();
if(role==="admin")setupActivity();else panel("activity","سجل النشاط","هذا السجل متاح للمدير فقط.",'<div class="admin-panel">تحتاج صلاحية مدير لعرض سجل النشاط.</div>');
}
async function initAfterAuth(){
try{
const {data:{user},error:uerr}=await db.auth.getUser();
const {data:assurance,error:aerr}=await db.auth.mfa.getAuthenticatorAssuranceLevel();
if(uerr||aerr||!user||assurance.currentLevel!=="aal2")return;
const {data,error}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
if(error||!data||!["admin","editor"].includes(data.role))return;
uid=user.id;role=data.role;init();
}catch(e){console.error("Admin modules init failed",e)}
}
window.addEventListener("wesh:admin-ready",initAfterAuth);
document.addEventListener("DOMContentLoaded",async()=>{const {data:{session}}=await db.auth.getSession();if(session)await initAfterAuth()});
})();