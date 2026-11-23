/* TAGADDOD Delta Reps - client application. Google Sheets is the source of truth. */
(() => {
  "use strict";

  const CONFIG = {
    appVersion: "2.0.0",
    sheetUrl: "https://script.google.com/macros/s/AKfycbyzs3njqM7MnqMvH4vp1jh9pOUPIZDjUWoxGb6HIu9P0HtEVLfIxy40JcRXfKWGpMZ2ew/exec",
    sessionKey: "delta_session_token_v6",
    cacheKey: "delta_state_cache_v6",
    pageSize: 15
  };

  const $ = (id) => document.getElementById(id);
  let state = { user:null, accounts:[], trips:[], tripCount:0, extraDays:[], extraCount:0, allowance:50 };
  let currentTripPage = 1, currentExtraPage = 1, busy = false, firstLoginMode = false, lastLoginPhone = "", toastTimer = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const normalizePhone = (v) => {
    let d = String(v||"").replace(/\D/g,"");
    if (d.length===10 && /^(10|11|12|15)/.test(d)) d = "0"+d;
    return d;
  };
  const escapeHtml = (v) => String(v??"").replace(/[&<>"']/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const formatTimestamp = (raw) => {
    const d = raw ? new Date(raw) : new Date();
    if (Number.isNaN(d.getTime())) return String(raw||"");
    const p = d.getHours()>=12?"م":"ص";
    const h = String(d.getHours()%12||12).padStart(2,"0");
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} - ${h}:${String(d.getMinutes()).padStart(2,"0")} ${p}`;
  };
  const isAdmin = () => state.user?.role === "admin";
  const isSuper = () => Boolean(state.user?.isSuper);
  const sessionToken = () => localStorage.getItem(CONFIG.sessionKey) || "";

  function showToast(msg, kind="info", duration=4200) {
    let el = $("appToast");
    if (!el) { el = document.createElement("div"); el.id="appToast"; el.className="app-toast"; el.setAttribute("role","status"); document.body.appendChild(el); }
    clearTimeout(toastTimer);
    el.className = `app-toast ${kind} visible`; el.textContent = msg;
    if (kind !== "loading") toastTimer = setTimeout(()=>el.classList.remove("visible"), duration);
  }
  window.showAppToast = showToast;

  function setStatus(msg, kind="info") {
    const el = $("syncStatus"); if (el) { el.textContent = msg; el.className = `notice ${kind}`; }
    showToast(msg, kind);
  }

  function setConnectionBadge() {
    const b = $("connectionStatusBadge"); if (!b) return;
    const on = navigator.onLine;
    b.textContent = on ? "متصل بالإنترنت" : "غير متصل";
    b.classList.toggle("status-online", on); b.classList.toggle("status-offline", !on);
  }

  function apiGet(params={}, timeoutMs=12000) {
    return new Promise((resolve, reject) => {
      const cb = `__delta_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const q = new URLSearchParams({ ...params, callback: cb });
      let done = false;
      const finish = (fn,v) => { if (done) return; done = true; clearTimeout(t); delete window[cb]; script.remove(); fn(v); };
      window[cb] = (data)=>finish(resolve, data);
      script.onerror = () => finish(reject, new Error("تعذر الاتصال بخدمة Google Sheets."));
      const t = setTimeout(()=>finish(reject, new Error("انتهت مهلة الاتصال.")), timeoutMs);
      script.src = `${CONFIG.sheetUrl}?${q.toString()}`;
      document.head.appendChild(script);
    });
  }

  async function apiPost(action, payload={}) {
    if (!navigator.onLine) throw new Error("الإنترنت فاصل. افتح الإنترنت الأول.");
    if (!CONFIG.sheetUrl) throw new Error("رابط Google Sheets غير مضبوط.");
    const requestId = (crypto.randomUUID?.()||`req_${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g,"");
    const body = { requestId, action, payload, sessionToken: sessionToken() };
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 20000);
    try {
      await fetch(CONFIG.sheetUrl, { method:"POST", mode:"no-cors", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(body), signal:ctrl.signal });
    } catch (e) {
      if (!navigator.onLine) throw new Error("الإنترنت فاصل.");
      throw new Error("تعذر تأكيد الاتصال. راجع السجل قبل إعادة المحاولة.");
    } finally { clearTimeout(timer); }
    for (let i=0;i<20;i++) {
      if (!navigator.onLine) throw new Error("انقطع الإنترنت قبل تأكيد العملية.");
      const r = await apiGet({ action:"result", requestId }, 6000);
      if (r && r.pending !== true) {
        if (!r.ok) { const e = new Error(r.error||"تعذر تنفيذ العملية."); e.code = r.code||""; throw e; }
        return r;
      }
      await sleep(450);
    }
    throw new Error("لم يصل تأكيد العملية. راجع السجل قبل إعادة المحاولة.");
  }
  window.deltaPost = apiPost;

  function cacheState() { try { localStorage.setItem(CONFIG.cacheKey, JSON.stringify(state)); } catch(_){} }
  function readCachedState() { try { const s = JSON.parse(localStorage.getItem(CONFIG.cacheKey)||"null"); if (s) state = {...state,...s}; } catch(_){} }
  function applyServerState(d) {
    if (!d || !d.user) throw new Error("استجابة غير مكتملة.");
    state = {
      user:d.user,
      accounts: Array.isArray(d.accounts)?d.accounts:[],
      trips: Array.isArray(d.trips)?d.trips:[],
      tripCount: Number(d.tripCount)||0,
      extraDays: Array.isArray(d.extraDays)?d.extraDays:[],
      extraCount: Number(d.extraCount)||0,
      allowance: Number.isFinite(Number(d.allowance))?Number(d.allowance):50
    };
    cacheState(); renderAll();
  }

  async function pullState(showMsg=false, opts={}) {
    if (!sessionToken()) return false;
    if (!navigator.onLine) { if (showMsg) setStatus("غير متصل. يتم عرض آخر بيانات محفوظة.", "warning"); return false; }
    try {
      if (showMsg) setStatus("جاري تحديث البيانات...", "loading");
      const tripPage = opts.tripPage ?? currentTripPage;
      const extraPage = opts.extraPage ?? currentExtraPage;
      const r = await apiPost("get_state", { tripPage, extraPage });
      if (!r?.ok) throw new Error(r?.error||"تعذر تحميل البيانات.");
      applyServerState(r.data);
      if (showMsg) setStatus("تم التحديث.", "success");
      return true;
    } catch (e) { if (showMsg) setStatus(e.message, "error"); return false; }
  }

  async function runMutation(action, payload, okMsg, loadingMsg="جاري التنفيذ...") {
    if (busy) return false;
    if (!navigator.onLine) { showToast("النت فاصل. افتح النت الأول.", "error", 6000); return false; }
    busy = true; showToast(loadingMsg, "loading");
    try {
      const r = await apiPost(action, payload);
      await pullState(false);
      if (okMsg) setStatus(okMsg, "success");
      return r;
    } catch (e) { setStatus(e.message, "error"); return false; }
    finally { busy = false; }
  }

  function setView(view) {
    ["authSection","profileModalSection","appSection"].forEach((id)=>$(id)?.classList.add("hidden"));
    if (view==="auth") $("authSection")?.classList.remove("hidden");
    else if (view==="profile") $("profileModalSection")?.classList.remove("hidden");
    else $("appSection")?.classList.remove("hidden");
    $("openLoginFromSamplesBtn")?.classList.toggle("hidden", view!=="app" || Boolean(state.user));
    $("backToSamplesBtn")?.classList.toggle("hidden", view!=="auth");
  }

  function switchTab(tabId) {
    if (["newTripTab","extraDayTab","adminTab"].includes(tabId) && !state.user) { openLogin(); return; }
    if (tabId==="adminTab" && !isAdmin()) { alert("للمشرف فقط."); return; }
    document.querySelectorAll(".tab-btn").forEach((b)=>b.classList.toggle("active", b.dataset.tab===tabId));
    document.querySelectorAll(".tab-panel").forEach((p)=>p.classList.toggle("active", p.id===tabId));
    if (tabId==="newTripTab") { currentTripPage = 1; pullState(false,{tripPage:1}); }
    if (tabId==="extraDayTab") { currentExtraPage = 1; pullState(false,{extraPage:1}); }
    if (tabId==="analysisTab" && typeof renderSavedLabAnalyses === "function") renderSavedLabAnalyses();
  }

  function renderHeader() {
    const b = $("userBadge");
    if (b) { b.textContent = state.user?`${state.user.name} · ${state.user.phone} · ${isAdmin()?"مشرف":"مندوب"}`:"زائر"; b.classList.toggle("hidden", !state.user); }
    const av = $("headerAvatar");
    if (av) { av.src = state.user?.avatar || ""; av.classList.toggle("hidden", !state.user?.avatar); }
    $("logoutBtn")?.classList.toggle("hidden", !state.user);
    $("openChangePassBtn")?.classList.toggle("hidden", !state.user);
    document.querySelectorAll(".admin-only").forEach((el)=>el.classList.toggle("hidden", !isAdmin()));
    setConnectionBadge();
  }

  function renderRepSelect() {
    const s = $("tripRepSelect"); if (!s || !state.user) return;
    const reps = isAdmin() ? state.accounts : [state.user];
    const html = reps.map((a)=>`<option value="${escapeHtml(a.phone)}">${escapeHtml(a.name)}${a.role==="admin"?" (مشرف)":""}</option>`).join("");
    s.innerHTML = html; s.disabled = !isAdmin();
    const es = $("extraDayRepSelect"); if (es) { es.innerHTML = html; es.disabled = !isAdmin(); }
  }

  function renderReps() {
    const list = $("repsList"); if (!list) return;
    list.innerHTML = "";
    state.accounts.forEach((a) => {
      const li = document.createElement("li");
      const info = document.createElement("div"); info.className = "rep-row-info";
      const txt = document.createElement("div");
      txt.innerHTML = `<strong>${escapeHtml(a.name)}</strong><div class="hint">${escapeHtml(a.phone)} · ${a.role==="admin"?"مشرف":"مندوب"}${a.isSuper?" · رئيسي":""}${a.firstLogin?" · لم يعيّن باسورد":""}</div>`;
      info.appendChild(txt); li.appendChild(info);
      const btns = document.createElement("div"); btns.className = "actions-row";
      if (a.firstLogin && isAdmin()) {
        const gen = document.createElement("button"); gen.type="button"; gen.className="btn btn-sm secondary"; gen.textContent="كود تفعيل";
        gen.addEventListener("click", async () => {
          const r = await runMutation("reset_password", { phone:a.phone }, "تم توليد كود التفعيل.", "جاري التوليد...");
          if (r && r.activationCode) showToast(`كود ${a.name}: ${r.activationCode}`, "success", 12000);
        });
        btns.appendChild(gen);
      }
      const del = document.createElement("button");
      del.type="button"; del.className="btn btn-danger btn-sm"; del.textContent="حذف";
      del.disabled = a.phone===state.user?.phone || a.phone==="01276341407" || (a.role==="admin" && !isSuper());
      del.addEventListener("click", async () => {
        if (!confirm(`تأكيد حذف ${a.name}؟`)) return;
        await runMutation("delete_account", { phone:a.phone }, "تم الحذف.", "جاري الحذف...");
      });
      btns.appendChild(del); li.appendChild(btns); list.appendChild(li);
    });
  }

  function renderTrips() {
    const tb = $("recordsBody"); if (!tb) return;
    tb.innerHTML = "";
    state.trips.forEach((t) => {
      const tr = document.createElement("tr");
      const cells = [
        {l:"الطابع الزمني", v:formatTimestamp(t.timestamp)},
        {l:"التاريخ", v:t.date||""},
        {l:"المندوب", v:t.repName||""},
        {l:"المكان", v:t.place||""},
        {l:"العميل", v:t.client||""},
        {l:"بدل السفر", v:`${Number(t.allowance||0).toFixed(2)} ج.م`}
      ];
      tr.innerHTML = cells.map((c)=>`<td data-label="${c.l}">${escapeHtml(c.v)}</td>`).join("");
      const td = document.createElement("td"); td.setAttribute("data-label","إجراء");
      const btn = document.createElement("button"); btn.type="button"; btn.className="btn btn-danger btn-sm"; btn.textContent="حذف";
      btn.addEventListener("click", async () => {
        if (!confirm("حذف الرحلة؟")) return;
        await runMutation("delete_trip", { id:t.id }, "تم الحذف.", "جاري الحذف...");
      });
      td.appendChild(btn); tr.appendChild(td); tb.appendChild(tr);
    });
    const pages = Math.max(1, Math.ceil(state.tripCount / CONFIG.pageSize));
    $("recordsSummary").textContent = `إجمالي الرحلات: ${state.tripCount} | إجمالي بدل السفر: ${state.trips.reduce((s,t)=>s+Number(t.allowance||0),0).toFixed(2)} ج.م`;
    $("tripsPageInfo").textContent = `صفحة ${currentTripPage} من ${pages}`;
    $("prevTripsPageBtn").disabled = currentTripPage<=1;
    $("nextTripsPageBtn").disabled = currentTripPage>=pages;
    $("tripsPaginationBar").classList.toggle("hidden", state.tripCount<=CONFIG.pageSize);
  }

  function statusBadge(s) {
    const map = { pending:"قيد المراجعة", approved:"مقبول", rejected:"مرفوض" };
    return `<span class="badge badge-${s}">${map[s]||s}</span>`;
  }

  function renderExtraDays() {
    const tb = $("extraRecordsBody"); if (!tb) return;
    tb.innerHTML = "";
    state.extraDays.forEach((x) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="الطابع الزمني">${escapeHtml(formatTimestamp(x.timestamp))}</td>
        <td data-label="التاريخ">${escapeHtml(x.date||"")}</td>
        <td data-label="المندوب">${escapeHtml(x.repName||"")}</td>
        <td data-label="السبب">${escapeHtml(x.reason||"")}</td>
        <td data-label="الإثبات">${x.proofUrl?`<a href="${escapeHtml(x.proofUrl)}" target="_blank" rel="noopener" class="proof-link">عرض</a>`:"—"}</td>
        <td data-label="الحالة">${statusBadge(x.status)}</td>
        <td data-label="إجراء"></td>`;
      const td = tr.querySelector("td[data-label='إجراء']");
      if (isAdmin()) {
        const sel = document.createElement("select");
        sel.innerHTML = `<option value="pending">قيد المراجعة</option><option value="approved">مقبول</option><option value="rejected">مرفوض</option>`;
        sel.value = x.status || "pending";
        sel.addEventListener("change", async () => { await runMutation("set_extra_status", { id:x.id, status:sel.value }, "تم التحديث.", "جاري التحديث..."); });
        td.appendChild(sel);
      }
      const del = document.createElement("button"); del.type="button"; del.className="btn btn-danger btn-sm"; del.textContent="حذف"; del.style.marginInlineStart="6px";
      del.addEventListener("click", async () => { if (!confirm("حذف السجل؟")) return; await runMutation("delete_extra_day", { id:x.id }, "تم الحذف.", "جاري الحذف..."); });
      td.appendChild(del); tb.appendChild(tr);
    });
    const pages = Math.max(1, Math.ceil(state.extraCount / CONFIG.pageSize));
    $("extraRecordsSummary").textContent = `إجمالي أيام العمل الإضافية: ${state.extraCount}`;
    $("extraPageInfo").textContent = `صفحة ${currentExtraPage} من ${pages}`;
    $("prevExtraPageBtn").disabled = currentExtraPage<=1;
    $("nextExtraPageBtn").disabled = currentExtraPage>=pages;
    $("extraPaginationBar").classList.toggle("hidden", state.extraCount<=CONFIG.pageSize);
  }

  function renderAll() {
    renderHeader(); renderRepSelect(); renderReps(); renderTrips(); renderExtraDays();
    if ($("tripAllowance")) $("tripAllowance").value = Number(state.allowance).toFixed(2);
    if ($("defaultAllowanceInput")) $("defaultAllowanceInput").value = Number(state.allowance).toFixed(2);
  }

  function syncAuthFields() {
    const phone = normalizePhone($("loginPhoneInput")?.value);
    if (phone !== lastLoginPhone) { firstLoginMode = false; lastLoginPhone = phone; }
    const acc = state.accounts.find((a)=>normalizePhone(a.phone)===phone);
    const firstTime = firstLoginMode || Boolean(acc && acc.firstLogin);
    $("existingPasswordBox")?.classList.toggle("hidden", firstTime);
    $("firstTimeSetupBox")?.classList.toggle("hidden", !firstTime);
    $("activationCodeBox")?.classList.toggle("hidden", !firstTime);
    $("authTitle").textContent = firstTime ? "التفعيل وتعيين كلمة السر" : "تسجيل الدخول";
    $("authHint").textContent = firstTime ? "أدخل كود التفعيل من المشرف ثم عيّن الباسورد." : "أدخل رقم التليفون وكلمة السر.";
    $("phoneAuthBtn").textContent = firstTime ? "تفعيل وحفظ الباسورد" : "تسجيل الدخول";
  }

  async function login() {
    if (busy) return;
    if (!navigator.onLine) { showToast("النت فاصل.", "error", 6000); return; }
    const phone = normalizePhone($("loginPhoneInput").value);
    const password = $("loginPasswordInput").value;
    const newPassword = $("setupPasswordInput").value;
    const confirmPassword = $("confirmPasswordInput").value;
    const code = $("activationCodeInput")?.value.trim().toUpperCase();
    if (phone.length<10) return alert("أدخل رقم صحيح.");
    const acc = state.accounts.find((a)=>normalizePhone(a.phone)===phone);
    const firstTime = firstLoginMode || Boolean(acc?.firstLogin);
    if (firstTime) {
      if (!code) return alert("أدخل كود التفعيل من المشرف.");
      if (newPassword.length<6 || newPassword!==confirmPassword) return alert("الباسورد 6 خانات على الأقل ومتطابق.");
    }
    busy = true; $("phoneAuthBtn").disabled = true;
    showToast("جاري الدخول...", "loading");
    try {
      if (firstTime) {
        const r1 = await apiPost("set_password_with_code", { phone, activationCode:code, newPassword });
        if (!r1.ok) throw new Error(r1.error||"تعذر التفعيل.");
        const r2 = await apiPost("login", { phone, password:newPassword });
        if (!r2.ok) throw new Error(r2.error||"تعذر الدخول.");
        localStorage.setItem(CONFIG.sessionKey, r2.sessionToken);
      } else {
        const r = await apiPost("login", { phone, password });
        if (!r.ok) { const e = new Error(r.error||"تعذر الدخول."); e.code = r.code||""; throw e; }
        localStorage.setItem(CONFIG.sessionKey, r.sessionToken);
      }
      ["loginPasswordInput","setupPasswordInput","confirmPasswordInput","activationCodeInput"].forEach((id)=>{ if ($(id)) $(id).value = ""; });
      const loaded = await pullState(false);
      if (!loaded) throw new Error("تعذر تحميل البيانات.");
      setView("app"); switchTab("analysisTab");
      setStatus("تم تسجيل الدخول.", "success");
    } catch (e) {
      if (e.code==="FIRST_LOGIN") { firstLoginMode = true; syncAuthFields(); showToast("أول دخول. أدخل كود التفعيل.", "warning", 6500); }
      else showToast(e.message, "error", 6000);
    } finally { busy = false; $("phoneAuthBtn").disabled = false; }
  }

  function openLogin() { setView("auth"); syncAuthFields(); }
  async function readCompressedAvatar(file) {
    if (!file) return "";
    if (!file.type.startsWith("image/")) throw new Error("الملف ليس صورة.");
    const dataUrl = await new Promise((res,rej)=>{ const r = new FileReader(); r.onload = ()=>res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
    const img = new Image(); img.src = dataUrl; await img.decode();
    const scale = Math.min(1, 180/Math.max(img.width,img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width*scale); cv.height = Math.round(img.height*scale);
    cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
    return cv.toDataURL("image/jpeg",0.55);
  }

  async function saveProfile() {
    if (!navigator.onLine) return showToast("النت فاصل.", "error", 6000);
    try {
      showToast("جاري التجهيز...", "loading");
      const payload = {
        phone: normalizePhone($("updatePhoneInput").value),
        currentPassword: $("currentPassInput").value,
        newPassword: $("updatedPassInput").value,
        avatar: await readCompressedAvatar($("updateAvatarInput").files?.[0])
      };
      if (!payload.phone && !payload.newPassword && !payload.avatar) return showToast("أدخل تعديلًا واحدًا على الأقل.", "warning");
      if (payload.newPassword && payload.newPassword.length<6) return showToast("الباسورد 6 خانات على الأقل.", "warning");
      const ok = await runMutation("update_profile", payload, "تم تحديث الحساب.", "جاري الحفظ...");
      if (ok) { ["updatePhoneInput","currentPassInput","updatedPassInput","updateAvatarInput"].forEach((id)=>{ $(id).value = ""; }); setView("app"); }
    } catch (e) { showToast(e.message, "error", 6000); }
  }

  function exportExcel() {
    if (!isAdmin()) return showToast("للمشرف فقط.", "error");
    if (typeof XLSX==="undefined") return showToast("مكتبة Excel لم تُحمّل.", "error", 6000);
    const from = $("fromDate").value, to = $("toDate").value;
    if (!from || !to) return showToast("حدد تاريخ البداية والنهاية.", "warning");
    if (from > to) return showToast("تاريخ البداية بعد النهاية.", "warning");
    showToast("جاري تجهيز الملف...", "loading");
    try {
      const rows = state.trips.filter((t)=>(!from||t.date>=from) && (!to||t.date<=to));
      const repNames = [...new Set(rows.map((t)=>t.repName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ar"));
      const total = rows.reduce((s,t)=>s+Number(t.allowance||0),0);
      const aoa = [
        ["تقرير رحلات مناديب الدلتا - TAGADDOD","","","","",""],
        ["الطابع الزمني","تاريخ الرحلة","اسم المندوب","المكان / المحافظة","اسم العميل","بدل السفر (ج.م)"],
        ...rows.map((t)=>[formatTimestamp(t.timestamp), t.date||"", t.repName||"", t.place||"", t.client||"", Number(t.allowance||0)]),
        [], ["ملخص بدل السفر حسب المندوب","",""],
        ["اسم المندوب","عدد الرحلات","إجمالي بدل السفر (ج.م)"]
      ];
      repNames.forEach((n)=>{ const own = rows.filter((t)=>t.repName===n); aoa.push([n, own.length, own.reduce((s,t)=>s+Number(t.allowance||0),0)]); });
      aoa.push(["الإجمالي العام", rows.length, total]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!views"] = [{ RTL:true }];
      ws["!cols"] = [{wch:24},{wch:15},{wch:23},{wch:23},{wch:27},{wch:19}];
      const border = { top:{style:"thin",color:{rgb:"9CA3AF"}}, bottom:{style:"thin",color:{rgb:"9CA3AF"}}, left:{style:"thin",color:{rgb:"9CA3AF"}}, right:{style:"thin",color:{rgb:"9CA3AF"}} };
      const setStyle = (r,c,s)=>{ const cell = ws[XLSX.utils.encode_cell({r,c})]; if (cell) cell.s = {...s, border, alignment:{vertical:"center",horizontal:"center",wrapText:true}}; };
      for (let c=0;c<6;c++) setStyle(0,c,{font:{name:"Arial",sz:15,bold:true,color:{rgb:"FFFFFF"}}, fill:{fgColor:{rgb:"991B1B"}}});
      for (let c=0;c<6;c++) setStyle(1,c,{font:{name:"Arial",sz:11,bold:true,color:{rgb:"FFFFFF"}}, fill:{fgColor:{rgb:"1F2937"}}});
      for (let r=2;r<rows.length+2;r++) for (let c=0;c<6;c++) setStyle(r,c,{font:{name:"Arial",sz:10}, fill:{fgColor:{rgb:r%2===0?"F3F4F6":"FFFFFF"}}});
      ws["!autofilter"] = { ref:`A2:F${Math.max(2,rows.length+2)}` };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "تقرير الرحلات");
      XLSX.writeFile(wb, `تقرير_المناديب_${from}_${to}.xlsx`);
      showToast(`تم تصدير ${rows.length} رحلة.`, "success");
    } catch (e) { showToast(`تعذر التصدير: ${e.message}`, "error", 6000); }
  }

  function bindEvents() {
    $("loginPhoneInput").addEventListener("input", syncAuthFields);
    $("loginForm").addEventListener("submit", (e)=>{ e.preventDefault(); login(); });
    $("openLoginFromSamplesBtn").addEventListener("click", openLogin);
    ["backToSamplesBtn","cancelLoginBtn"].forEach((id)=>$(id).addEventListener("click", ()=>{ setView("app"); switchTab("analysisTab"); }));
    $("openChangePassBtn").addEventListener("click", ()=>{ $("updatePhoneInput").value = ""; setView("profile"); });
    $("closeProfileModalBtn").addEventListener("click", ()=>setView("app"));
    $("saveProfileChangesBtn").addEventListener("click", saveProfile);
    $("logoutBtn").addEventListener("click", ()=>{
      if (navigator.onLine && sessionToken()) apiPost("logout", {}).catch(()=>{});
      localStorage.removeItem(CONFIG.sessionKey);
      firstLoginMode = false;
      state = { user:null, accounts:[], trips:[], tripCount:0, extraDays:[], extraCount:0, allowance:50 };
      cacheState(); renderHeader(); setView("app"); switchTab("analysisTab");
      showToast("تم تسجيل الخروج.", "success");
    });
    document.querySelectorAll(".tab-btn").forEach((b)=>b.addEventListener("click", ()=>switchTab(b.dataset.tab)));

    $("tripForm").addEventListener("submit", async (e)=>{
      e.preventDefault();
      if (!navigator.onLine) return showToast("النت فاصل.", "error", 6500);
      if (!state.user) return openLogin();
      const date = $("tripDate").value;
      const place = $("tripPlace").value.trim();
      const client = $("tripClient").value.trim();
      const allowance = Number($("tripAllowance").value);
      if (!date||!place||!client||!Number.isFinite(allowance)) return showToast("راجع البيانات.", "warning");
      const repPhone = isAdmin() ? $("tripRepSelect").value : state.user.phone;
      const ok = await runMutation("add_trip", { date, place, client, allowance, repPhone }, "تم تسجيل الرحلة.", "جاري التسجيل...");
      if (ok) { $("tripPlace").value = ""; $("tripClient").value = ""; }
    });

    $("extraDayForm").addEventListener("submit", async (e)=>{
      e.preventDefault();
      if (!navigator.onLine) return showToast("النت فاصل.", "error", 6500);
      if (!state.user) return openLogin();
      const date = $("extraDayDate").value;
      const reason = $("extraDayReason").value.trim();
      const repPhone = isAdmin() ? $("extraDayRepSelect").value : state.user.phone;
      if (!date||!reason) return showToast("أدخل التاريخ والسبب.", "warning");
      let proofData = "", proofName = "", proofType = "";
      const f = $("extraDayProofInput").files?.[0];
      if (f) {
        if (f.size > 4.5*1024*1024) return showToast("الصورة كبيرة (أقصى 4.5 ميجا).", "warning");
        proofData = await new Promise((res)=>{ const r = new FileReader(); r.onload = ()=>res(String(r.result)); r.readAsDataURL(f); });
        proofName = f.name; proofType = f.type;
      }
      const ok = await runMutation("add_extra_day", { date, reason, repPhone, proofData, proofName, proofType }, "تم حفظ اليوم الإضافي.", "جاري الحفظ...");
      if (ok) { $("extraDayReason").value = ""; $("extraDayProofInput").value = ""; }
    });

    $("addRepForm").addEventListener("submit", async (e)=>{
      e.preventDefault();
      if (!isAdmin()) return alert("غير مصرح.");
      const name = $("newRepName").value.trim();
      const phone = normalizePhone($("newRepPhone").value);
      const role = $("newRepRole").value;
      if (!name||phone.length<10) return showToast("أدخل اسم ورقم صحيح.", "warning");
      const r = await runMutation("add_account", { name, phone, role }, "تم إضافة الحساب.", "جاري الإضافة...");
      if (r && r.activationCode) showToast(`كود التفعيل: ${r.activationCode}`, "success", 15000);
      if (r) { $("newRepName").value = ""; $("newRepPhone").value = ""; }
    });

    $("saveAllowanceBtn").addEventListener("click", async ()=>{
      const allowance = Number($("defaultAllowanceInput").value);
      if (!Number.isFinite(allowance)||allowance<0) return showToast("قيمة البدل غير صحيحة.", "warning");
      await runMutation("set_allowance", { allowance }, "تم حفظ البدل.", "جاري الحفظ...");
    });

    ["fromDate","toDate"].forEach((id)=>$(id).addEventListener("change", ()=>{ currentTripPage = 1; renderTrips(); }));
    $("prevTripsPageBtn").addEventListener("click", async ()=>{ currentTripPage -= 1; await pullState(false,{tripPage:currentTripPage}); });
    $("nextTripsPageBtn").addEventListener("click", async ()=>{ currentTripPage += 1; await pullState(false,{tripPage:currentTripPage}); });
    $("prevExtraPageBtn").addEventListener("click", async ()=>{ currentExtraPage -= 1; await pullState(false,{extraPage:currentExtraPage}); });
    $("nextExtraPageBtn").addEventListener("click", async ()=>{ currentExtraPage += 1; await pullState(false,{extraPage:currentExtraPage}); });
    $("exportExcelBtn").addEventListener("click", exportExcel);
    $("syncNowBtn").addEventListener("click", ()=>pullState(true));
    $("syncExtraNowBtn").addEventListener("click", ()=>pullState(true));
    const today = new Date();
    $("tripDate").value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    $("extraDayDate").value = $("tripDate").value;
    window.addEventListener("online", ()=>{ setConnectionBadge(); pullState(true); });
    window.addEventListener("offline", ()=>{ setConnectionBadge(); showToast("الاتصال انقطع. لن يمكن تسجيل أي رحلة أو يوم إضافي.", "error", 7000); });
  }
  async function init() {
    readCachedState();
    bindEvents();
    renderHeader();
    setView("app");
    switchTab("analysisTab");
    if (sessionToken()) {
      const loaded = await pullState(false);
      if (loaded) { setView("app"); switchTab("analysisTab"); }
      else if (!navigator.onLine) setStatus("غير متصل. سجل الدخول لما النت يرجع.", "warning");
      else {
        localStorage.removeItem(CONFIG.sessionKey);
        state = { user:null, accounts:[], trips:[], tripCount:0, extraDays:[], extraCount:0, allowance:50 };
        cacheState(); renderHeader();
      }
    } else {
      state = { user:null, accounts:[], trips:[], tripCount:0, extraDays:[], extraCount:0, allowance:50 };
      renderHeader();
    }
    setConnectionBadge();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
