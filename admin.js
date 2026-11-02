(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const config = window.WESH_CONFIG;
  const message = (text, error = false) => {
    const el = $("#auth-message");
    if (el) { el.textContent = text; el.dataset.type = error ? "error" : "info"; }
  };
  const show = (el, yes) => el?.classList.toggle("hidden", !yes);
  const client = config?.SUPABASE_URL && config?.SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  let factorId = null;
  let pendingRole = null;

  function hideAdmin() {
    show($("#dashboard"), false);
    show($("#login-panel"), true);
    document.querySelectorAll(".admin-view").forEach((v) => v.classList.add("hidden"));
  }
  function showAdmin() {
    show($("#login-panel"), false);
    show($("#dashboard"), true);
    document.querySelectorAll(".admin-view").forEach((v) => v.classList.remove("hidden"));
    document.querySelectorAll("#dashboard button, #dashboard input, #dashboard select, #dashboard textarea").forEach((el) => {
      if (el.classList.contains("sidebar-link") || el.hasAttribute("data-go")) return;
      el.disabled = true;
      el.setAttribute("aria-disabled", "true");
      el.title = "وظائف المحتوى ستُفعّل بعد ربط عمليات الإدارة الآمنة";
    });
    const notice = document.querySelector('#dashboard [role="status"]');
    if (notice) {
      notice.innerHTML = "<h2>تم التحقق من حسابك</h2><p>الدخول الإداري محمي بالمصادقة الثنائية. عمليات المحتوى ما زالت معطلة إلى أن تُربط بواجهات الإدارة وتُختبر.</p>";
    }
  }
  function switchTo(section) {
    document.querySelectorAll(".sidebar-link").forEach((item) => item.classList.toggle("active", item.dataset.view === section));
    document.querySelectorAll(".admin-view").forEach((item) => item.classList.toggle("active", item.id === "view-" + section));
  }
  async function signOut(messageText) {
    await client?.auth.signOut();
    factorId = null;
    pendingRole = null;
    showAdmin();
    hideAdmin();
    show($("#mfa-enroll"), false);
    show($("#mfa-challenge"), false);
    show($("#logout-button"), false);
    if (messageText) message(messageText, true);
  }
  async function checkStaff(user) {
    const { data, error } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (error) throw new Error("تعذّر التحقق من صلاحية الحساب. " + error.message);
    if (!data || !["admin", "editor"].includes(data.role)) throw new Error("هذا الحساب غير مخوّل لدخول لوحة الإدارة.");
    pendingRole = data.role;
    return data.role;
  }
  async function factorsForUser() {
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    const verified = (data.totp || []).filter((f) => f.status === "verified");
    const unverified = (data.totp || []).filter((f) => f.status !== "verified");
    return { verified, unverified };
  }
  async function finishAAL2() {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    if (data.currentLevel !== "aal2") throw new Error("لم يكتمل التحقق الثنائي. أعد إدخال الرمز.");
    show($("#mfa-enroll"), false);
    show($("#mfa-challenge"), false);
    show($("#logout-button"), true);
    message("تم التحقق من المصادقة الثنائية بنجاح.");
    showAdmin();
  }
  async function beginEnrollment() {
    const { verified, unverified } = await factorsForUser();
    if (verified.length) return beginChallenge(verified[0]);
    // Remove abandoned, unverified setup attempts before issuing a fresh QR.
    for (const f of unverified) {
      const { error } = await client.auth.mfa.unenroll({ factorId: f.id });
      if (error) throw error;
    }
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Wesh Admin Authenticator" });
    if (error) throw error;
    factorId = data.id;
    const qr = $("#mfa-qr");
    qr.src = data.totp.qr_code;
    $("#mfa-secret").value = data.totp.secret;
    show($("#mfa-enroll"), true);
    show($("#mfa-challenge"), false);
    message("امسح QR الآن بتطبيق المصادقة، ثم أدخل الرمز الحالي. لا تشارك QR أو المفتاح مع أي شخص.");
  }
  async function beginChallenge(factor) {
    const { data, error } = await client.auth.mfa.challenge({ factorId: factor.id });
    if (error) throw error;
    factorId = factor.id;
    show($("#mfa-enroll"), false);
    show($("#mfa-challenge"), true);
    $("#mfa-login-code").focus();
    message("أدخل رمز تطبيق المصادقة لإكمال الدخول.");
  }
  async function afterPasswordLogin() {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) throw new Error("تعذّر تأكيد جلسة الدخول.");
    await checkStaff(userData.user);
    const { data: aal, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    const { verified } = await factorsForUser();
    if (!verified.length) return beginEnrollment();
    if (aal.currentLevel === "aal2") return finishAAL2();
    return beginChallenge(verified[0]);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    hideAdmin();
    if (!client) {
      message("إعداد Supabase غير مكتمل. تحقق من config.js وتحميل مكتبة Supabase.", true);
      return;
    }
    $("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = $("#login-email").value.trim();
      const password = $("#login-password").value;
      message("جارٍ التحقق من بيانات الدخول…");
      try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        $("#login-password").value = "";
        if (error) throw error;
        await afterPasswordLogin();
      } catch (error) {
        await signOut(error.message || "تعذّر تسجيل الدخول.");
      }
    });
    $("#verify-enroll").addEventListener("click", async () => {
      const code = $("#mfa-enroll-code").value.replace(/\D/g, "");
      if (!factorId || !/^\d{6}$/.test(code)) return message("أدخل رمزًا صحيحًا من 6 أرقام.", true);
      try {
        message("جارٍ التحقق من الرمز…");
        const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
        if (challengeError) throw challengeError;
        const { error } = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
        if (error) throw error;
        $("#mfa-enroll-code").value = "";
        await finishAAL2();
      } catch (error) { message(error.message || "فشل التحقق من العامل.", true); }
    });
    $("#verify-login").addEventListener("click", async () => {
      const code = $("#mfa-login-code").value.replace(/\D/g, "");
      if (!factorId || !/^\d{6}$/.test(code)) return message("أدخل رمزًا صحيحًا من 6 أرقام.", true);
      try {
        const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
        if (challengeError) throw challengeError;
        const { error } = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
        if (error) throw error;
        $("#mfa-login-code").value = "";
        await finishAAL2();
      } catch (error) { message(error.message || "رمز التحقق غير صحيح.", true); }
    });
    $("#logout-button").addEventListener("click", () => signOut("تم تسجيل الخروج."));
    document.querySelectorAll(".sidebar-link").forEach((button) => button.addEventListener("click", () => switchTo(button.dataset.view)));
    document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => switchTo(button.dataset.go)));

    const { data: sessionData } = await client.auth.getSession();
    if (sessionData.session) {
      try { await afterPasswordLogin(); }
      catch (error) { await signOut(error.message || "انتهت الجلسة أو لا توجد صلاحية."); }
    }
  });
})();
