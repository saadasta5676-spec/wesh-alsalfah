(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const cfg = window.WESH_CONFIG || {};
  const client = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;
  let role = null, factorId = null, rows = [], activeStatus = "pending";
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const show = (el, yes) => el?.classList.toggle("hidden", !yes);
  const note = (s, error=false) => { const el=$("#auth-message"); if(el){el.textContent=s;el.dataset.type=error?"error":"info";} };
  const editorNote = (s) => { const el=$("#editor-message"); if(el)el.textContent=s; };
  function hideDashboard(){show($("#dashboard"),false);show($("#login-panel"),true);document.querySelectorAll(".admin-view").forEach(x=>x.classList.add("hidden"));}
  function activateDashboard(){
    show($("#login-panel"),false);show($("#dashboard"),true);
    document.querySelectorAll(".admin-view").forEach(x=>x.classList.remove("hidden"));
    const notice=document.querySelector('#dashboard [role="status"]');
    if(notice) notice.innerHTML="<h2>مرحبًا بك في مركز الإدارة</h2><p>تم التحقق من حسابك ومستوى المصادقة. راجع الأخبار وأدر المحتوى وفق صلاحيات حسابك.</p>";
    $("#new-article").hidden = role !== "admin";
    $("#new-article-secondary").hidden = role !== "admin";
    refreshArticles();
  }
  function switchTo(section){
    document.querySelectorAll(".sidebar-link").forEach(x=>x.classList.toggle("active",x.dataset.view===section));
    document.querySelectorAll(".admin-view").forEach(x=>x.classList.toggle("active",x.id==="view-"+section));
  }
  async function signOut(msg){
    if(client) await client.auth.signOut();
    role=null;factorId=null;show($("#mfa-enroll"),false);show($("#mfa-challenge"),false);show($("#logout-button"),false);hideDashboard();if(msg)note(msg,true);
  }
  async function verifyRole(){
    const {data:{user},error}=await client.auth.getUser();
    if(error||!user)throw new Error("تعذّر تأكيد حساب الدخول.");
    const {data,error:roleError}=await client.from("profiles").select("role").eq("id",user.id).maybeSingle();
    if(roleError)throw roleError;
    if(!data||!["admin","editor"].includes(data.role))throw new Error("هذا الحساب غير مخوّل لدخول الإدارة.");
    role=data.role;
  }
  async function getFactors(){
    const {data,error}=await client.auth.mfa.listFactors();if(error)throw error;
    return {verified:(data.totp||[]).filter(x=>x.status==="verified"),unverified:(data.totp||[]).filter(x=>x.status!=="verified")};
  }
  async function requireAAL2(){
    const {data,error}=await client.auth.mfa.getAuthenticatorAssuranceLevel();if(error)throw error;
    if(data.currentLevel==="aal2"){show($("#mfa-challenge"),false);show($("#mfa-enroll"),false);show($("#logout-button"),true);note("تم التحقق من المصادقة الثنائية.");activateDashboard();return;}
    const {verified,unverified}=await getFactors();
    if(verified.length){await challenge(verified[0]);return;}
    if(unverified.length)throw new Error("يوجد إعداد TOTP غير مكتمل. يلزم تنظيف العامل القديم من إعدادات حساب Auth قبل إعادة التسجيل.");
    const {data:enroll,error:enrollError}=await client.auth.mfa.enroll({factorType:"totp",friendlyName:"Wesh Admin Authenticator"});
    if(enrollError)throw enrollError;
    factorId=enroll.id;$("#mfa-qr").src=enroll.totp.qr_code;$("#mfa-secret").value=enroll.totp.secret;
    show($("#mfa-enroll"),true);note("امسح QR بتطبيق المصادقة وأدخل الرمز الحالي. لا تشارك QR أو المفتاح.");
  }
  async function challenge(factor){
    const {error}=await client.auth.mfa.challenge({factorId:factor.id});if(error)throw error;
    factorId=factor.id;show($("#mfa-challenge"),true);show($("#mfa-enroll"),false);note("أدخل رمز تطبيق المصادقة لإكمال الدخول.");
  }
  async function verifyCode(input,enrolling){
    const code=$(input).value.replace(/\D/g,"");if(!factorId||!/^\d{6}$/.test(code)){note("أدخل رمزًا صحيحًا من 6 أرقام.",true);return;}
    const {data,error}=await client.auth.mfa.challenge({factorId});if(error)throw error;
    const {error:verifyError}=await client.auth.mfa.verify({factorId,challengeId:data.id,code});if(verifyError)throw verifyError;
    $(input).value="";await requireAAL2();
  }
  async function refreshArticles(){
    $("#admin-list").innerHTML='<div class="empty-admin">جارٍ تحميل الأخبار…</div>';
    const {data,error}=await client.from("articles").select("id,title,category,author,image_url,excerpt,body,source_name,source_url,status,featured,published_at,created_at").order("created_at",{ascending:false}).limit(300);
    if(error){$("#admin-list").innerHTML='<div class="empty-admin">تعذر تحميل الأخبار. '+esc(error.message)+'</div>';return;}
    rows=data||[];
    const count=s=>rows.filter(a=>a.status===s).length;
    ["pending-count","articles-pending-count"].forEach(id=>$("#"+id)&&($("#"+id).textContent=count("pending")));
    ["published-count","articles-published-count"].forEach(id=>$("#"+id)&&($("#"+id).textContent=count("published")));
    ["other-count","articles-other-count"].forEach(id=>$("#"+id)&&($("#"+id).textContent=count("draft")+count("rejected")));
    $("#nav-pending-count").textContent=count("pending");
    renderArticles();
  }
  function renderArticles(){
    const q=($("#article-search")?.value||"").trim().toLowerCase(),cat=$("#category-filter")?.value||"";
    const list=rows.filter(a=>(activeStatus==="all"||a.status===activeStatus)&&(!cat||a.category===cat)&&(!q||[a.title,a.source_name,a.author].some(v=>String(v||"").toLowerCase().includes(q))));
    if(!list.length){$("#admin-list").innerHTML='<div class="empty-admin">لا توجد أخبار مطابقة.</div>';return;}
    $("#admin-list").innerHTML=list.map(a=>'<article class="admin-item"><img src="'+esc(a.image_url||"")+'" alt=""><div><h3>'+esc(a.title)+'</h3><p>'+esc(a.category)+' · '+esc(a.source_name||a.author||"فريق التحرير")+' · '+new Date(a.created_at).toLocaleString("ar-SA")+'</p><span class="status-pill">'+esc(a.status)+'</span></div><div class="item-actions"><button data-action="edit" data-id="'+a.id+'">تعديل</button>'+(role==="admin"&&a.status!=="published"?'<button class="approve" data-action="publish" data-id="'+a.id+'">نشر</button>':"")+(role==="admin"&&a.status!=="rejected"?'<button class="reject" data-action="reject" data-id="'+a.id+'">رفض</button>':"")+(role==="admin"?'<button data-action="delete" data-id="'+a.id+'">حذف</button>':"")+'</div></article>').join("");
  }
  function editArticle(a){
    $("#article-id").value=a?.id||"";$("#article-title").value=a?.title||"";$("#article-category").value=a?.category||"السعودية";$("#article-author").value=a?.author||"فريق التحرير";$("#article-image").value=a?.image_url||"";$("#article-excerpt").value=a?.excerpt||"";$("#article-body").value=a?.body||"";$("#article-featured").checked=!!a?.featured;$("#form-heading").textContent=a?"تعديل الخبر":"إضافة خبر";editorNote("");$("#edit-dialog").showModal();
  }
  async function saveArticle(status){
    if(role!=="admin"){editorNote("المحرر يحفظ كمسودة أو يرسل للمراجعة فقط.");return;}
    const id=$("#article-id").value;
    const payload={title:$("#article-title").value.trim(),category:$("#article-category").value,author:$("#article-author").value.trim()||"فريق التحرير",image_url:$("#article-image").value.trim()||null,excerpt:$("#article-excerpt").value.trim(),body:$("#article-body").value.trim(),featured:status==="published"?$("#article-featured").checked:false,status,published_at:status==="published"?new Date().toISOString():null};
    if(!payload.title||!payload.body){editorNote("العنوان ونص الخبر مطلوبان.");return;}
    editorNote("جارٍ الحفظ…");
    const result=id?await client.from("articles").update(payload).eq("id",id):await client.from("articles").insert({...payload,status:"pending",featured:false,published_at:null});
    if(result.error){editorNote("تعذر الحفظ: "+result.error.message);return;}
    $("#edit-dialog").close();await refreshArticles();editorNote("تم الحفظ.");
  }
  document.addEventListener("DOMContentLoaded",async()=>{
    hideDashboard();
    if(!client){note("إعداد Supabase غير مكتمل. تحقق من config.js.",true);return;}
    $("#login-form").addEventListener("submit",async e=>{e.preventDefault();note("جارٍ تسجيل الدخول…");try{const {error}=await client.auth.signInWithPassword({email:$("#login-email").value.trim(),password:$("#login-password").value});$("#login-password").value="";if(error)throw error;await verifyRole();await requireAAL2();}catch(err){await signOut(err.message||"تعذّر الدخول.");}});
    $("#verify-enroll").addEventListener("click",()=>verifyCode("#mfa-enroll-code",true).catch(e=>note(e.message,true)));
    $("#verify-login").addEventListener("click",()=>verifyCode("#mfa-login-code",false).catch(e=>note(e.message,true)));
    $("#logout-button").addEventListener("click",()=>signOut("تم تسجيل الخروج."));
    document.querySelectorAll(".sidebar-link").forEach(b=>b.addEventListener("click",()=>switchTo(b.dataset.view)));
    document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>switchTo(b.dataset.go)));
    document.querySelectorAll(".admin-tabs button[data-status]").forEach(b=>b.addEventListener("click",()=>{activeStatus=b.dataset.status;document.querySelectorAll(".admin-tabs button[data-status]").forEach(x=>x.classList.toggle("active",x===b));renderArticles();}));
    $("#article-search")?.addEventListener("input",renderArticles);$("#category-filter")?.addEventListener("change",renderArticles);
    $("#new-article")?.addEventListener("click",()=>editArticle(null));$("#new-article-secondary")?.addEventListener("click",()=>editArticle(null));$("#close-editor")?.addEventListener("click",()=>$("#edit-dialog").close());
    $("#article-form")?.addEventListener("submit",e=>{e.preventDefault();saveArticle("pending");});
    $("#save-draft")?.addEventListener("click",()=>saveArticle("draft"));
    $("#admin-list")?.addEventListener("click",async e=>{
      const b=e.target.closest("[data-action]");if(!b)return;const a=rows.find(x=>x.id===b.dataset.id);if(!a)return;
      try{
        if(b.dataset.action==="edit"){editArticle(a);return;}
        if(b.dataset.action==="delete"){if(!confirm("تأكيد الحذف النهائي؟"))return;const {error}=await client.from("articles").delete().eq("id",a.id);if(error)throw error;}
        if(b.dataset.action==="publish"){const {error}=await client.from("articles").update({status:"published",published_at:new Date().toISOString()}).eq("id",a.id);if(error)throw error;}
        if(b.dataset.action==="reject"){const {error}=await client.from("articles").update({status:"rejected"}).eq("id",a.id);if(error)throw error;}
        await refreshArticles();
      }catch(err){alert("تعذر تنفيذ العملية: "+err.message);}
    });
    const {data:{session}}=await client.auth.getSession();
    if(session){try{await verifyRole();await requireAAL2();}catch(err){await signOut(err.message||"انتهت الجلسة.");}}
  });
})();