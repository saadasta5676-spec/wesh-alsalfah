// Safe preview mode: no Supabase client, authentication, or database operations are enabled.
// Editorial actions remain disabled until role-based access control is reviewed and deployed.
document.addEventListener("DOMContentLoaded",()=>{
  const notice=document.querySelector('[role="status"]');
  document.querySelectorAll("#dashboard button, #dashboard input, #dashboard select, #dashboard textarea").forEach(el=>{
    if(el.classList.contains("sidebar-link") || el.hasAttribute("data-go")) return;
    el.disabled=true;
    el.setAttribute("aria-disabled","true");
    el.title="سيتم تفعيل هذه الوظيفة بعد إكمال أمان الأدوار";
  });
  document.querySelectorAll(".sidebar-link").forEach(button=>{
    button.addEventListener("click",()=>{
      const view=button.dataset.view;
      document.querySelectorAll(".sidebar-link").forEach(item=>item.classList.toggle("active",item===button));
      document.querySelectorAll(".admin-view").forEach(section=>section.classList.toggle("active",section.id==="view-"+view));
    });
  });
  document.querySelectorAll("[data-go]").forEach(button=>{
    button.addEventListener("click",()=>{
      const view=button.dataset.go;
      document.querySelectorAll(".sidebar-link").forEach(item=>item.classList.toggle("active",item.dataset.view===view));
      document.querySelectorAll(".admin-view").forEach(section=>section.classList.toggle("active",section.id==="view-"+view));
    });
  });
  const list=document.querySelector("#admin-list");
  if(list) list.innerHTML='<div class="empty-admin">إدارة الأخبار ستُفعّل بعد تأمين صلاحيات المدير والمحررين.</div>';
  const recent=document.querySelector("#recent-list");
  if(recent) recent.innerHTML='<div class="empty-admin">البيانات الحقيقية غير متصلة في وضع المعاينة الآمن.</div>';
  document.querySelectorAll("#pending-count,#published-count,#other-count,#articles-pending-count,#articles-published-count,#articles-other-count,#nav-pending-count").forEach(el=>el.textContent="—");
  const newArticle=document.querySelector("#new-article");
  if(newArticle) newArticle.disabled=true;
});
