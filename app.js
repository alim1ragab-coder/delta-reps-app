/* TAGADDOD Delta Reps - client application. Google Sheets is the source of truth. */
(() => {
  "use strict";

  const CONFIG = {
    appVersion: "1.0.0",
    updateCheckUrl: "https://raw.githubusercontent.com/aliragab-coder/delta-reps/main/version.json",
    sheetUrl: "https://script.google.com/macros/s/AKfycbytRDyjemkJ88LkmPKncEMqAQ3TWEWgy0YvH9MnFJQi-OsfbATeq3HNFD4a6fuaNrSv/exec",
    sessionKey: "delta_session_token_v5",
    cacheKey: "delta_state_cache_v5",
    pageSize: 10
  };

  const $ = (id) => document.getElementById(id);
  let state = { user: null, accounts: [], trips: [], extraDays: [], allowance: 150 };
  let currentTripPage = 1;
  let currentExtraPage = 1;
  let busy = false;
  let firstLoginMode = false;
  let lastLoginPhone = "";
  let toastTimer = null;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const normalizePhone = (value) => {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10 && /^(10|11|12|15)/.test(digits)) digits = `0${digits}`;
    return digits;
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));

  const safeImageUrl = (raw) => {
    const val = String(raw || "").trim();
    if (!val) return "";
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(val)) return val;
    if (/^https?:\/\//i.test(val)) return val;
    return "";
  };

  const formatTimestamp = (raw) => {
    const fallbackNow = new Date();
    const d = raw ? new Date(raw) : fallbackNow;
    if (Number.isNaN(d.getTime())) return String(raw || "");
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hours24 = d.getHours();
    const period = hours24 >= 12 ? "م" : "ص";
    const hours12 = String(hours24 % 12 || 12).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    const secs = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} - ${hours12}:${mins}:${secs} ${period}`;
  };

  const isAdmin = () => state.user?.role === "admin";
  const sessionToken = () => localStorage.getItem(CONFIG.sessionKey) || "";

  function showToast(message, kind = "info", duration = 4200) {
    let el = $("appToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "appToast";
      el.className = "app-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    clearTimeout(toastTimer);
    el.className = `app-toast ${kind} visible`;
    el.textContent = message;
    if (kind !== "loading") toastTimer = setTimeout(() => el.classList.remove("visible"), duration);
  }
  window.showAppToast = showToast;

  function setStatus(message, kind = "info") {
    const el = $("syncStatus");
    if (el) {
      el.textContent = message;
      el.className = `notice ${kind}`;
    }
    showToast(message, kind);
  }

  function setConnectionBadge() {
    const badge = $("connectionStatusBadge");
    if (!badge) return;
    const online = navigator.onLine;
    badge.textContent = online ? "متصل بالإنترنت" : "غير متصل";
    badge.classList.toggle("status-online", online);
    badge.classList.toggle("status-offline", !online);
  }

  function apiGet(params = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (!CONFIG.sheetUrl) return reject(new Error("لم يتم ضبط رابط Google Apps Script."));
      const callback = `__delta_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const query = new URLSearchParams({ ...params, callback });
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        delete window[callback];
        script.remove();
        fn(value);
      };
      window[callback] = (data) => finish(resolve, data);
      script.onerror = () => finish(reject, new Error("تعذر الاتصال بخدمة Google Sheets."));
      const timer = setTimeout(() => finish(reject, new Error("انتهت مهلة الاتصال بخدمة Google Sheets.")), timeoutMs);
      script.src = `${CONFIG.sheetUrl}?${query.toString()}`;
      document.head.appendChild(script);
    });
  }

  async function apiPost(action, payload = {}) {
    if (!navigator.onLine) throw new Error("الإنترنت فاصل. افتح الإنترنت الأول وبعد كده سجل.");
    if (!CONFIG.sheetUrl) throw new Error("رابط Google Sheets غير مضبوط.");
    const requestId = (crypto.randomUUID?.() || `req_${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, "");
    const body = { requestId, action, payload, sessionToken: sessionToken() };
    const controller = new AbortController();
    const sendTimer = setTimeout(() => controller.abort(), 18000);
    try {
      await fetch(CONFIG.sheetUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (!navigator.onLine) throw new Error("الإنترنت فاصل. افتح الإنترنت الأول وبعد كده سجل.");
      throw new Error("تعذر تأكيد الاتصال بخدمة التسجيل. راجع السجل قبل إعادة المحاولة حتى لا يتكرر التسجيل.");
    } finally {
      clearTimeout(sendTimer);
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (!navigator.onLine) throw new Error("انقطع الإنترنت قبل تأكيد التسجيل. راجع السجل قبل إعادة المحاولة.");
      const result = await apiGet({ action: "result", requestId }, 5000);
      if (result && result.pending !== true) {
        if (!result.ok) {
          const error = new Error(result.error || "تعذر تنفيذ العملية.");
          error.code = result.code || "";
          throw error;
        }
        return result;
      }
      await sleep(450);
    }
    throw new Error("التسجيل أُرسل لكن لم يصل تأكيد Google Sheets. راجع السجل قبل إعادة المحاولة حتى لا يتكرر التسجيل.");
  }

  function cacheState() {
    try { localStorage.setItem(CONFIG.cacheKey, JSON.stringify(state)); } catch (_) {}
  }

  function readCachedState() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.cacheKey) || "null");
      if (saved && typeof saved === "object") state = { ...state, ...saved };
    } catch (_) {}
  }

  const sortByDateDesc = (arr) => [...arr].sort(
    (a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.id || "").localeCompare(String(a.id || ""))
  );

  function applyServerState(data) {
    if (!data || !data.user) throw new Error("استجابة غير مكتملة من الخادم.");
    const rawExtra = Array.isArray(data.extraDays)
      ? data.extraDays
      : (Array.isArray(data.extra_days) ? data.extra_days : []);
    state = {
      user: data.user,
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      trips: sortByDateDesc(Array.isArray(data.trips) ? data.trips : []),
      extraDays: sortByDateDesc(rawExtra),
      allowance: Number.isFinite(Number(data.allowance)) ? Number(data.allowance) : 150
    };
    cacheState();
    renderAll();
  }

  async function pullState(showMessage = false) {
    if (!sessionToken()) return false;
    if (!navigator.onLine) {
      if (showMessage) setStatus("أنت غير متصل. يتم عرض آخر بيانات محفوظة على هذا الجهاز.", "warning");
      return false;
    }
    try {
      if (showMessage) setStatus("جاري تحديث البيانات من Google Sheets...", "loading");
      const response = await apiPost("get_state", {});
      if (!response?.ok) throw new Error(response?.error || "تعذر تحميل البيانات.");
      applyServerState(response.data);
      if (showMessage) setStatus("تم تحديث البيانات من Google Sheets.", "success");
      return true;
    } catch (error) {
      if (showMessage) setStatus(error.message, "error");
      return false;
    }
  }

  async function runMutation(action, payload, successMessage, loadingMessage = "جاري تنفيذ العملية...") {
    if (busy) return false;
    if (!navigator.onLine) {
      showToast("النت فاصل. افتح النت الأول وبعد كده سجل.", "error", 6000);
      return false;
    }
    busy = true;
    showToast(loadingMessage, "loading");
    try {
      await apiPost(action, payload);
      await pullState(false);
      if (successMessage) setStatus(successMessage, "success");
      return true;
    } catch (error) {
      setStatus(error.message, "error");
      return false;
    } finally {
      busy = false;
    }
  }

  async function checkForAppUpdate(manual = false) {
    if (!CONFIG.updateCheckUrl) {
      if (manual) showToast("لم يتم تحديد رابط ملف التحديثات بعد.", "warning");
      return;
    }
    if (!navigator.onLine) {
      if (manual) showToast("اتصل بالإنترنت أولاً للبحث عن تحديثات.", "warning");
      return;
    }
    if (manual) showToast("جاري البحث عن إصدار جديد...", "loading");
    try {
      const sep = CONFIG.updateCheckUrl.includes("?") ? "&" : "?";
      const res = await fetch(`${CONFIG.updateCheckUrl}${sep}t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("تعذر الوصول لملف التحديثات.");
      const data = await res.json();
      const latestVersion = String(data.version || "").trim();
      const apkUrl = String(data.apkUrl || "").trim();
      const notes = String(data.notes || "").trim();

      if (latestVersion && latestVersion !== CONFIG.appVersion) {
        const msg = `يتوفر إصدار جديد (${latestVersion}) — الإصدار الحالي (${CONFIG.appVersion})${notes ? `\n\nالتحديثات:\n${notes}` : ""}\n\nهل تريد تحميل النسخة الجديدة الآن؟`;
        if (confirm(msg) && apkUrl) {
          window.open(apkUrl, "_blank");
        }
      } else if (manual) {
        showToast(`أنت على أحدث إصدار بالفعل (v${CONFIG.appVersion}).`, "success");
      }
    } catch (_) {
      if (manual) showToast("تعذر التحقق من وجود تحديثات حالياً.", "error");
    }
  }

  function setView(view) {
    ["authSection", "profileModalSection", "appSection"].forEach((id) => $(id)?.classList.add("hidden"));
    if (view === "auth") $("authSection")?.classList.remove("hidden");
    else if (view === "profile") $("profileModalSection")?.classList.remove("hidden");
    else $("appSection")?.classList.remove("hidden");
    $("openLoginFromSamplesBtn")?.classList.toggle("hidden", view !== "app" || Boolean(state.user));
    $("backToSamplesBtn")?.classList.toggle("hidden", view !== "auth");
  }

  function switchTab(tabId) {
    if (["newTripTab", "extraDayTab", "adminTab"].includes(tabId) && !state.user) {
      openLogin();
      return;
    }
    if (tabId === "adminTab" && !isAdmin()) {
      alert("هذه الصفحة متاحة للمشرف فقط.");
      return;
    }
    document.querySelectorAll(".tab-btn").forEach((button) => button.classList.toggle("active", button.dataset.tab === tabId));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
    if (tabId === "newTripTab") {
      currentTripPage = 1;
      renderTrips();
      pullState(false);
    }
    if (tabId === "extraDayTab") {
      currentExtraPage = 1;
      renderExtraDays();
      pullState(false);
    }
    if (tabId === "analysisTab" && typeof renderSavedLabAnalyses === "function") renderSavedLabAnalyses();
  }

  function renderHeader() {
    const badge = $("userBadge");
    if (badge) {
      badge.textContent = state.user ? `${state.user.name} · ${state.user.phone} · ${isAdmin() ? "مشرف" : "مندوب"}` : "زائر";
      badge.classList.toggle("hidden", !state.user);
    }
    const avatar = $("headerAvatar");
    if (avatar) {
      const safeAv = safeImageUrl(state.user?.avatar);
      avatar.src = safeAv;
      avatar.classList.toggle("hidden", !safeAv);
    }
    $("logoutBtn")?.classList.toggle("hidden", !state.user);
    $("openChangePassBtn")?.classList.toggle("hidden", !state.user);
    document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !isAdmin()));
    setConnectionBadge();
  }

  function renderRepSelects() {
    if (!state.user) return;
    const reps = isAdmin() ? state.accounts : [state.user];
    const optionsHtml = reps
      .map((account) => `<option value="${escapeHtml(account.phone)}">${escapeHtml(account.name)}${account.role === "admin" ? " (مشرف)" : ""}</option>`)
      .join("");

    ["tripRepSelect", "extraDayRepSelect"].forEach((id) => {
      const select = $(id);
      if (!select) return;
      select.innerHTML = optionsHtml;
      select.disabled = !isAdmin();
    });
  }

  function renderReps() {
    const list = $("repsList");
    if (!list) return;
    list.innerHTML = "";
    state.accounts.forEach((account) => {
      const li = document.createElement("li");
      const info = document.createElement("div");
      info.className = "rep-row-info";
      const safeAv = safeImageUrl(account.avatar);
      if (safeAv) {
        const img = document.createElement("img");
        img.src = safeAv;
        img.alt = "";
        img.className = "rep-avatar-mini";
        info.appendChild(img);
      }
      const text = document.createElement("div");
      text.innerHTML = `<strong>${escapeHtml(account.name)}</strong><div class="hint">${escapeHtml(account.phone)} · ${account.role === "admin" ? "مشرف" : "مندوب"}</div>`;
      info.appendChild(text);
      li.appendChild(info);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-danger";
      remove.textContent = "حذف";
      remove.disabled = account.phone === state.user?.phone || account.role === "admin";
      remove.title = remove.disabled ? "لا يمكن حذف حسابك أو حساب مشرف من هذه القائمة" : "حذف الحساب";
      remove.addEventListener("click", async () => {
        if (!confirm(`تأكيد حذف حساب ${account.name}؟`)) return;
        await runMutation("delete_account", { phone: account.phone }, "تم حذف الحساب بنجاح.", "جاري حذف الحساب...");
      });
      li.appendChild(remove);
      list.appendChild(li);
    });
  }

  function filterByUserAndRange(items, { fromId, toId, searchId, buildSearchText }) {
    const from = isAdmin() ? ($(fromId)?.value || "") : "";
    const to = isAdmin() ? ($(toId)?.value || "") : "";
    const query = isAdmin() ? (($(searchId)?.value || "").trim().toLocaleLowerCase("ar-EG")) : "";
    const currentPhone = normalizePhone(state.user?.phone);
    const currentName = (state.user?.name || "").trim();

    return items.filter((item) => {
      if (!isAdmin()) {
        const matchPhone = item.repPhone && normalizePhone(item.repPhone) === currentPhone;
        const matchOwner = item.ownerPhone && normalizePhone(item.ownerPhone) === currentPhone;
        const matchName = currentName && (item.repName || "").trim() === currentName;
        if (!matchPhone && !matchOwner && !matchName) return false;
      }
      if (from && item.date < from) return false;
      if (to && item.date > to) return false;
      const text = buildSearchText(item).toLocaleLowerCase("ar-EG");
      return !query || text.includes(query);
    });
  }

  function getVisibleTrips() {
    return filterByUserAndRange(state.trips, {
      fromId: "fromDate",
      toId: "toDate",
      searchId: "tripSearchInput",
      buildSearchText: (t) => `${t.repName || ""} ${t.place || ""} ${t.client || ""}`
    });
  }

  function getVisibleExtraDays() {
    return filterByUserAndRange(state.extraDays, {
      fromId: "extraFromDate",
      toId: "extraToDate",
      searchId: "extraSearchInput",
      buildSearchText: (d) => `${d.repName || ""} ${d.reason || d.notes || ""}`
    });
  }

  function renderTrips() {
    const tbody = $("recordsBody");
    if (!tbody) return;
    const rows = getVisibleTrips();
    const pages = Math.max(1, Math.ceil(rows.length / CONFIG.pageSize));
    currentTripPage = Math.min(Math.max(1, currentTripPage), pages);
    const visible = rows.slice((currentTripPage - 1) * CONFIG.pageSize, currentTripPage * CONFIG.pageSize);
    tbody.innerHTML = "";
    visible.forEach((trip) => {
      const tr = document.createElement("tr");
      const tripCells = [
        { label: "الطابع الزمني", value: formatTimestamp(trip.timestamp) },
        { label: "التاريخ", value: trip.date || "" },
        { label: "المندوب", value: trip.repName || "" },
        { label: "المكان", value: trip.place || "" },
        { label: "العميل", value: trip.client || "" },
        { label: "بدل السفر", value: `${Number(trip.allowance || 0).toFixed(2)} ج.م` }
      ];
      tr.innerHTML = tripCells.map((cell) => `<td data-label="${cell.label}">${escapeHtml(cell.value)}</td>`).join("");

      const cell = document.createElement("td");
      cell.setAttribute("data-label", "إجراء");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-danger btn-sm";
      button.textContent = "حذف";
      button.addEventListener("click", async () => {
        if (busy) return;
        if (confirm("هل تريد حذف هذا السجل نهائيًا؟")) {
          button.disabled = true;
          await runMutation("delete_trip", { id: trip.id }, "تم حذف السجل بنجاح.", "جاري حذف السجل...");
          button.disabled = false;
        }
      });
      cell.appendChild(button);
      tr.appendChild(cell);
      tbody.appendChild(tr);
    });
    if ($("recordsSummary")) {
      $("recordsSummary").textContent = `إجمالي الرحلات: ${rows.length} | إجمالي بدل السفر: ${rows.reduce((sum, t) => sum + Number(t.allowance || 0), 0).toFixed(2)} جنيه`;
    }
    if ($("tripsPageInfo")) $("tripsPageInfo").textContent = `صفحة ${currentTripPage} من ${pages}`;
    if ($("prevTripsPageBtn")) $("prevTripsPageBtn").disabled = currentTripPage <= 1 || busy;
    if ($("nextTripsPageBtn")) $("nextTripsPageBtn").disabled = currentTripPage >= pages || busy;
    $("tripsPaginationBar")?.classList.toggle("hidden", rows.length <= CONFIG.pageSize);
  }

  function renderExtraDays() {
    const tbody = $("extraRecordsBody");
    if (!tbody) return;
    const rows = getVisibleExtraDays();
    const pages = Math.max(1, Math.ceil(rows.length / CONFIG.pageSize));
    currentExtraPage = Math.min(Math.max(1, currentExtraPage), pages);
    const visible = rows.slice((currentExtraPage - 1) * CONFIG.pageSize, currentExtraPage * CONFIG.pageSize);
    tbody.innerHTML = "";

    visible.forEach((item) => {
      const tr = document.createElement("tr");
      const reasonText = item.reason || item.notes || "يوم عمل إضافي";
      const baseCells = [
        { label: "الطابع الزمني", value: formatTimestamp(item.timestamp) },
        { label: "التاريخ", value: item.date || "" },
        { label: "المندوب", value: item.repName || "" },
        { label: "السبب / الملاحظات", value: reasonText }
      ];
      tr.innerHTML = baseCells.map((c) => `<td data-label="${c.label}">${escapeHtml(c.value)}</td>`).join("");

      const proofTd = document.createElement("td");
      proofTd.setAttribute("data-label", "صورة الإثبات");
      const proofSrc = safeImageUrl(item.proofImage || item.proof || item.image || "");
      if (proofSrc) {
        const link = document.createElement("a");
        link.href = proofSrc;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "proof-link";
        const img = document.createElement("img");
        img.src = proofSrc;
        img.alt = "إثبات اليوم الإضافي";
        img.className = "proof-thumb";
        link.appendChild(img);
        proofTd.appendChild(link);
      } else {
        proofTd.textContent = "لا يوجد";
      }
      tr.appendChild(proofTd);

      const actionTd = document.createElement("td");
      actionTd.setAttribute("data-label", "إجراء");
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-danger btn-sm";
      delBtn.textContent = "حذف";
      delBtn.addEventListener("click", async () => {
        if (busy) return;
        if (confirm("هل تريد حذف سجل اليوم الإضافي نهائيًا؟")) {
          delBtn.disabled = true;
          await runMutation("delete_extra_day", { id: item.id }, "تم حذف سجل اليوم الإضافي.", "جاري حذف السجل...");
          delBtn.disabled = false;
        }
      });
      actionTd.appendChild(delBtn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });

    if ($("extraRecordsSummary")) {
      const proofsCount = rows.filter((r) => Boolean(safeImageUrl(r.proofImage || r.proof || r.image || ""))).length;
      $("extraRecordsSummary").textContent = `إجمالي أيام العمل الإضافية: ${rows.length} | إثباتات مرفقة: ${proofsCount}`;
    }
    if ($("extraPageInfo")) $("extraPageInfo").textContent = `صفحة ${currentExtraPage} من ${pages}`;
    if ($("prevExtraPageBtn")) $("prevExtraPageBtn").disabled = currentExtraPage <= 1 || busy;
    if ($("nextExtraPageBtn")) $("nextExtraPageBtn").disabled = currentExtraPage >= pages || busy;
    $("extraPaginationBar")?.classList.toggle("hidden", rows.length <= CONFIG.pageSize);
  }

  function renderAll() {
    renderHeader();
    renderRepSelects();
    renderReps();
    renderTrips();
    renderExtraDays();
    if ($("tripAllowance")) $("tripAllowance").value = Number(state.allowance).toFixed(2);
    if ($("defaultAllowanceInput")) $("defaultAllowanceInput").value = Number(state.allowance).toFixed(2);
  }

  function syncAuthFields() {
    const phone = normalizePhone($("loginPhoneInput")?.value);
    if (phone !== lastLoginPhone) { firstLoginMode = false; lastLoginPhone = phone; }
    const account = state.accounts.find((item) => normalizePhone(item.phone) === phone);
    const firstTime = firstLoginMode || Boolean(account && account.firstLogin);
    $("existingPasswordBox")?.classList.toggle("hidden", firstTime);
    $("firstTimeSetupBox")?.classList.toggle("hidden", !firstTime);
    $("authTitle").textContent = firstTime ? "تعيين كلمة سر لأول مرة" : "تسجيل الدخول";
    $("authHint").textContent = firstTime ? "اكتب كلمة سر جديدة لحسابك." : "أدخل رقم التليفون وكلمة السر المسجلة.";
    $("phoneAuthBtn").textContent = firstTime ? "حفظ كلمة السر والدخول" : "تسجيل الدخول";
  }

  async function login() {
    if (busy) return;
    if (!navigator.onLine) {
      showToast("النت فاصل. افتح النت الأول وبعد كده سجل الدخول.", "error", 6000);
      return;
    }
    const phone = normalizePhone($("loginPhoneInput").value);
    const password = $("loginPasswordInput").value;
    const newPassword = $("setupPasswordInput").value;
    const confirmPassword = $("confirmPasswordInput").value;
    if (phone.length < 10) return alert("من فضلك أدخل رقم تليفون صحيح.");
    const account = state.accounts.find((item) => normalizePhone(item.phone) === phone);
    const firstTime = firstLoginMode || Boolean(account?.firstLogin);
    if (firstTime && (newPassword.length < 4 || newPassword !== confirmPassword)) return alert("اكتب كلمة سر من 4 خانات على الأقل وتأكد من تطابقها.");
    busy = true;
    $("phoneAuthBtn").disabled = true;
    showToast("جاري الدخول للحساب... برجاء الانتظار", "loading");
    try {
      const result = await apiPost("login", { phone, password: firstTime ? "" : password, newPassword: firstTime ? newPassword : "" });
      localStorage.setItem(CONFIG.sessionKey, result.sessionToken);
      $("loginPasswordInput").value = "";
      $("setupPasswordInput").value = "";
      $("confirmPasswordInput").value = "";
      const loaded = await pullState(false);
      if (!loaded) throw new Error("تم تسجيل الدخول لكن تعذر تحميل بيانات الحساب. حاول تحديث الصفحة.");
      setView("app");
      switchTab("analysisTab");
      setStatus("تم تسجيل الدخول ومزامنة البيانات.", "success");
    } catch (error) {
      if (error.code === "FIRST_LOGIN") {
        firstLoginMode = true;
        syncAuthFields();
        showToast("هذا أول دخول للحساب. عيّن كلمة سر جديدة ثم حاول الدخول.", "warning", 6500);
      } else if (error.code === "PASSWORD_REQUIRED") {
        firstLoginMode = false;
        syncAuthFields();
        showToast(error.message, "error", 6000);
      } else {
        showToast(error.message, "error", 6000);
      }
    } finally {
      busy = false;
      $("phoneAuthBtn").disabled = false;
    }
  }

  function openLogin() {
    setView("auth");
    syncAuthFields();
  }

  async function compressImageFile(file, maxDim = 900, quality = 0.65) {
    if (!file) return "";
    if (!file.type.startsWith("image/")) throw new Error("الملف المختار ليس صورة.");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }

  async function saveProfile() {
    if (!navigator.onLine) return showToast("النت فاصل. افتح النت الأول وبعد كده احفظ التعديلات.", "error", 6000);
    try {
      showToast("جاري تجهيز البيانات...", "loading");
      const payload = {
        phone: normalizePhone($("updatePhoneInput").value),
        currentPassword: $("currentPassInput").value,
        newPassword: $("updatedPassInput").value,
        avatar: await compressImageFile($("updateAvatarInput").files?.[0], 180, 0.55)
      };
      if (!payload.phone && !payload.newPassword && !payload.avatar) return showToast("أدخل تعديلًا واحدًا على الأقل.", "warning");
      if (payload.newPassword && payload.newPassword.length < 4) return showToast("كلمة السر الجديدة يجب أن تكون 4 خانات على الأقل.", "warning");
      const ok = await runMutation("update_profile", payload, "تم تحديث بيانات الحساب بنجاح.", "جاري حفظ بيانات الحساب...");
      if (ok) {
        ["updatePhoneInput", "currentPassInput", "updatedPassInput", "updateAvatarInput"].forEach((id) => { $(id).value = ""; });
        setView("app");
      }
    } catch (error) {
      showToast(error.message || "تعذر تجهيز التعديلات.", "error", 6000);
    }
  }

  function styleStyledWorkbook(ws, aoa, mainColsCount, summaryTitleRow, summaryHeaderRow, grandTotalRow, moneyColIndex) {
    ws["!views"] = [{ RTL: true }];
    ws["!rows"] = aoa.map((_, index) => ({
      hpt: index === 0 || index + 1 === summaryTitleRow || index + 1 === summaryHeaderRow ? 26 : 22
    }));
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: mainColsCount - 1 } },
      { s: { r: summaryTitleRow - 1, c: 0 }, e: { r: summaryTitleRow - 1, c: 2 } }
    ];

    const border = {
      top: { style: "thin", color: { rgb: "9CA3AF" } },
      bottom: { style: "thin", color: { rgb: "9CA3AF" } },
      left: { style: "thin", color: { rgb: "9CA3AF" } },
      right: { style: "thin", color: { rgb: "9CA3AF" } }
    };
    const setStyle = (r, c, style) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) {
        cell.s = {
          ...style,
          border,
          alignment: { vertical: "center", horizontal: "center", wrapText: true, ...(style.alignment || {}) }
        };
      }
    };
    const titleStyle = { font: { name: "Arial", sz: 15, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "991B1B" } } };
    const headerStyle = { font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F2937" } } };
    const totalStyle = { font: { name: "Arial", sz: 11, bold: true, color: { rgb: "991B1B" } }, fill: { fgColor: { rgb: "FEE2E2" } } };
    const bodyStyle = { font: { name: "Arial", sz: 10, color: { rgb: "111827" } }, fill: { fgColor: { rgb: "FFFFFF" } } };

    for (let c = 0; c < mainColsCount; c += 1) setStyle(0, c, titleStyle);
    for (let c = 0; c < mainColsCount; c += 1) setStyle(1, c, headerStyle);
    const dataEndRow = summaryTitleRow - 3;
    for (let r = 2; r <= dataEndRow; r += 1) {
      for (let c = 0; c < mainColsCount; c += 1) {
        const style = { ...bodyStyle, fill: { fgColor: { rgb: r % 2 === 0 ? "F3F4F6" : "FFFFFF" } } };
        if (typeof moneyColIndex === "number" && c === moneyColIndex) style.numFmt = "#,##0.00";
        setStyle(r, c, style);
      }
    }
    for (let c = 0; c < 3; c += 1) setStyle(summaryTitleRow - 1, c, titleStyle);
    for (let c = 0; c < 3; c += 1) setStyle(summaryHeaderRow - 1, c, headerStyle);
    for (let r = summaryHeaderRow; r < grandTotalRow - 1; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const style = { ...bodyStyle, fill: { fgColor: { rgb: r % 2 === 0 ? "F3F4F6" : "FFFFFF" } } };
        if (typeof moneyColIndex === "number" && c === 2) style.numFmt = "#,##0.00";
        setStyle(r, c, style);
      }
    }
    for (let c = 0; c < 3; c += 1) {
      const style = { ...totalStyle };
      if (typeof moneyColIndex === "number" && c === 2) style.numFmt = "#,##0.00";
      setStyle(grandTotalRow - 1, c, style);
    }
  }

  function exportExcel() {
    if (!isAdmin()) return showToast("تصدير Excel متاح للمشرف فقط.", "error");
    if (typeof XLSX === "undefined") return showToast("مكتبة Excel لم تُحمّل. تأكد من الإنترنت ثم حاول مرة أخرى.", "error", 6000);
    const from = $("fromDate").value;
    const to = $("toDate").value;
    if (!from || !to) return showToast("حدد تاريخ البداية والنهاية قبل التصدير.", "warning");
    if (from > to) return showToast("تاريخ البداية يجب ألا يكون بعد تاريخ النهاية.", "warning");

    showToast("جاري تجهيز ملف Excel وتنسيق الجداول...", "loading");
    try {
      const rows = getVisibleTrips();
      const repNames = [...new Set(rows.map((trip) => trip.repName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
      const totalAllowance = rows.reduce((sum, trip) => sum + Number(trip.allowance || 0), 0);
      const aoa = [
        ["تقرير رحلات مناديب الدلتا - TAGADDOD", "", "", "", "", ""],
        ["الطابع الزمني", "تاريخ الرحلة", "اسم المندوب", "المكان / المحافظة", "اسم العميل", "بدل السفر (ج.م)"],
        ...rows.map((trip) => [
          formatTimestamp(trip.timestamp),
          trip.date || "",
          trip.repName || "",
          trip.place || "",
          trip.client || "",
          Number(trip.allowance || 0)
        ])
      ];
      const summaryTitleRow = aoa.length + 2;
      aoa.push([], ["ملخص بدل السفر حسب المندوب", "", ""]);
      const summaryHeaderRow = aoa.length + 1;
      aoa.push(["اسم المندوب", "عدد الرحلات", "إجمالي بدل السفر (ج.م)"]);
      repNames.forEach((name) => {
        const own = rows.filter((trip) => trip.repName === name);
        aoa.push([name, own.length, own.reduce((sum, trip) => sum + Number(trip.allowance || 0), 0)]);
      });
      const grandTotalRow = aoa.length + 1;
      aoa.push(["الإجمالي العام", rows.length, totalAllowance]);

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 24 }, { wch: 15 }, { wch: 23 }, { wch: 23 }, { wch: 27 }, { wch: 19 }];
      styleStyledWorkbook(ws, aoa, 6, summaryTitleRow, summaryHeaderRow, grandTotalRow, 5);
      ws["!autofilter"] = { ref: `A2:F${Math.max(2, rows.length + 2)}` };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "تقرير الرحلات");
      XLSX.writeFile(wb, `تقرير_رحلات_المناديب_${from}_${to}.xlsx`);
      showToast(`تم تصدير ${rows.length} رحلة بنجاح.`, "success");
    } catch (error) {
      showToast(`تعذر تصدير الملف: ${error.message || "خطأ غير معروف"}`, "error", 6000);
    }
  }

  function exportExtraDaysExcel() {
    if (!isAdmin()) return showToast("تصدير Excel متاح للمشرف فقط.", "error");
    if (typeof XLSX === "undefined") return showToast("مكتبة Excel لم تُحمّل. تأكد من الإنترنت ثم حاول مرة أخرى.", "error", 6000);
    const from = $("extraFromDate")?.value || "";
    const to = $("extraToDate")?.value || "";
    if (!from || !to) return showToast("حدد تاريخ البداية والنهاية قبل التصدير.", "warning");
    if (from > to) return showToast("تاريخ البداية يجب ألا يكون بعد تاريخ النهاية.", "warning");

    showToast("جاري تجهيز ملف Excel لأيام العمل الإضافية...", "loading");
    try {
      const rows = getVisibleExtraDays();
      const repNames = [...new Set(rows.map((item) => item.repName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
      const aoa = [
        ["تقرير أيام العمل الإضافية - TAGADDOD", "", "", "", ""],
        ["الطابع الزمني", "التاريخ", "اسم المندوب", "السبب / الملاحظات", "حالة الإثبات"],
        ...rows.map((item) => [
          formatTimestamp(item.timestamp),
          item.date || "",
          item.repName || "",
          item.reason || item.notes || "يوم عمل إضافي",
          safeImageUrl(item.proofImage || item.proof || item.image || "") ? "مرفق صورة" : "بدون صورة"
        ])
      ];
      const summaryTitleRow = aoa.length + 2;
      aoa.push([], ["ملخص أيام العمل الإضافية حسب المندوب", "", ""]);
      const summaryHeaderRow = aoa.length + 1;
      aoa.push(["اسم المندوب", "عدد الأيام الإضافية", "عدد الإثباتات المرفقة"]);
      repNames.forEach((name) => {
        const own = rows.filter((item) => item.repName === name);
        const ownProofs = own.filter((item) => Boolean(safeImageUrl(item.proofImage || item.proof || item.image || ""))).length;
        aoa.push([name, own.length, ownProofs]);
      });
      const grandTotalRow = aoa.length + 1;
      const totalProofs = rows.filter((item) => Boolean(safeImageUrl(item.proofImage || item.proof || item.image || ""))).length;
      aoa.push(["الإجمالي العام", rows.length, totalProofs]);

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 24 }, { wch: 15 }, { wch: 23 }, { wch: 30 }, { wch: 18 }];
      styleStyledWorkbook(ws, aoa, 5, summaryTitleRow, summaryHeaderRow, grandTotalRow, null);
      ws["!autofilter"] = { ref: `A2:E${Math.max(2, rows.length + 2)}` };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "أيام العمل الإضافية");
      XLSX.writeFile(wb, `تقرير_أيام_العمل_الإضافية_${from}_${to}.xlsx`);
      showToast(`تم تصدير ${rows.length} سجل يوم إضافي بنجاح.`, "success");
    } catch (error) {
      showToast(`تعذر تصدير الملف: ${error.message || "خطأ غير معروف"}`, "error", 6000);
    }
  }

  function bindEvents() {
    $("checkUpdateBtn")?.addEventListener("click", () => checkForAppUpdate(true));
    $("loginPhoneInput").addEventListener("input", syncAuthFields);
    $("loginPhoneInput").addEventListener("change", syncAuthFields);
    $("loginForm").addEventListener("submit", (event) => { event.preventDefault(); login(); });
    $("openLoginFromSamplesBtn").addEventListener("click", openLogin);
    ["backToSamplesBtn", "cancelLoginBtn"].forEach((id) => $(id).addEventListener("click", () => { setView("app"); switchTab("analysisTab"); }));
    $("openChangePassBtn").addEventListener("click", () => { $("updatePhoneInput").value = ""; $("updatePhoneInput").placeholder = state.user?.phone || "اتركه فارغًا دون تغيير"; setView("profile"); });
    $("closeProfileModalBtn").addEventListener("click", () => setView("app"));
    $("saveProfileChangesBtn").addEventListener("click", saveProfile);
    $("logoutBtn").addEventListener("click", () => {
      if (navigator.onLine && sessionToken()) apiPost("logout", {}).catch(() => {});
      localStorage.removeItem(CONFIG.sessionKey);
      firstLoginMode = false;
      state.user = null;
      state.accounts = [];
      state.trips = [];
      state.extraDays = [];
      cacheState();
      renderHeader();
      setView("app");
      switchTab("analysisTab");
      showToast("تم تسجيل الخروج.", "success");
    });
    document.querySelectorAll(".tab-btn").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));

    $("tripForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      if (!navigator.onLine) return showToast("النت فاصل. افتح النت الأول وبعد كده سجل الرحلة.", "error", 6500);
      if (!state.user) return openLogin();
      const date = $("tripDate").value;
      const place = $("tripPlace").value.trim();
      const client = $("tripClient").value.trim();
      const allowance = Number($("tripAllowance").value);
      if (!date || !place || !client || !Number.isFinite(allowance) || allowance < 0) {
        return showToast("راجع بيانات الرحلة والبدل قبل التسجيل.", "warning");
      }
      const submitBtn = event.submitter || $("tripForm")?.querySelector('button[type="submit"]');
      const repPhone = isAdmin() ? $("tripRepSelect").value : state.user.phone;
      if (submitBtn) submitBtn.disabled = true;
      const ok = await runMutation(
        "add_trip",
        { date, place, client, allowance, repPhone, timestamp: formatTimestamp(new Date()) },
        "تم تسجيل رحلة جديدة بنجاح.",
        "جاري تسجيل الرحلة على النظام..."
      );
      if (submitBtn) submitBtn.disabled = false;
      if (ok) {
        $("tripPlace").value = "";
        $("tripClient").value = "";
      }
    });

    $("extraDayForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      if (!navigator.onLine) return showToast("النت فاصل. افتح النت الأول وبعد كده سجل اليوم الإضافي.", "error", 6500);
      if (!state.user) return openLogin();
      const date = $("extraDayDate").value;
      const reason = $("extraDayReason").value.trim();
      if (!date || !reason) return showToast("أدخل تاريخ اليوم الإضافي وسبب التكليف.", "warning");

      const submitBtn = event.submitter || $("extraDayForm")?.querySelector('button[type="submit"]');
      const repPhone = isAdmin() ? $("extraDayRepSelect").value : state.user.phone;
      if (submitBtn) submitBtn.disabled = true;
      try {
        showToast("جاري تجهيز بيانات اليوم الإضافي...", "loading");
        const proofImage = await compressImageFile($("extraDayProofInput")?.files?.[0], 900, 0.62);
        busy = false;
        const ok = await runMutation(
          "add_extra_day",
          { date, reason, proofImage, repPhone, timestamp: formatTimestamp(new Date()) },
          "تم تسجيل يوم العمل الإضافي بنجاح.",
          "جاري حفظ اليوم الإضافي على النظام..."
        );
        if (ok) {
          $("extraDayReason").value = "";
          if ($("extraDayProofInput")) $("extraDayProofInput").value = "";
        }
      } catch (error) {
        showToast(error.message || "تعذر تجهيز صورة الإثبات.", "error", 6000);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    $("addRepForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!isAdmin()) return alert("غير مصرح.");
      const name = $("newRepName").value.trim();
      const phone = normalizePhone($("newRepPhone").value);
      const role = $("newRepRole").value;
      if (!name || phone.length < 10) return showToast("أدخل اسمًا ورقم تليفون صحيحًا.", "warning");
      const ok = await runMutation("add_account", { name, phone, role }, "تم إضافة الحساب بنجاح.", "جاري إضافة الحساب...");
      if (ok) { $("newRepName").value = ""; $("newRepPhone").value = ""; }
    });
    $("saveAllowanceBtn").addEventListener("click", async () => {
      const allowance = Number($("defaultAllowanceInput").value);
      if (!Number.isFinite(allowance) || allowance < 0) return showToast("أدخل قيمة بدل صحيحة.", "warning");
      await runMutation("set_allowance", { allowance }, "تم حفظ بدل السفر الافتراضي بنجاح.", "جاري حفظ بدل السفر...");
    });
    ["fromDate", "toDate"].forEach((id) => $(id).addEventListener("change", () => { currentTripPage = 1; renderTrips(); }));
    $("tripSearchInput").addEventListener("input", () => { currentTripPage = 1; renderTrips(); });
    $("prevTripsPageBtn").addEventListener("click", () => { currentTripPage -= 1; renderTrips(); });
    $("nextTripsPageBtn").addEventListener("click", () => { currentTripPage += 1; renderTrips(); });
    $("exportExcelBtn").addEventListener("click", exportExcel);

    ["extraFromDate", "extraToDate"].forEach((id) => $(id)?.addEventListener("change", () => { currentExtraPage = 1; renderExtraDays(); }));
    $("extraSearchInput")?.addEventListener("input", () => { currentExtraPage = 1; renderExtraDays(); });
    $("prevExtraPageBtn")?.addEventListener("click", () => { currentExtraPage -= 1; renderExtraDays(); });
    $("nextExtraPageBtn")?.addEventListener("click", () => { currentExtraPage += 1; renderExtraDays(); });
    $("exportExtraExcelBtn")?.addEventListener("click", exportExtraDaysExcel);
    $("syncExtraNowBtn")?.addEventListener("click", () => pullState(true));

    $("syncNowBtn").addEventListener("click", () => pullState(true));
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    $("tripDate").value = todayIso;
    if ($("extraDayDate")) $("extraDayDate").value = todayIso;
    window.addEventListener("online", () => { setConnectionBadge(); pullState(true); });
    window.addEventListener("offline", () => {
      setConnectionBadge();
      showToast("الاتصال بالإنترنت انقطع. لن يتم تسجيل أي رحلة أو تعديل قبل رجوع النت.", "error", 7000);
    });
  }

  async function init() {
    readCachedState();
    bindEvents();
    renderHeader();
    setView("app");
    switchTab("analysisTab");
    if (sessionToken()) {
      const loaded = await pullState(false);
      if (loaded) {
        setView("app");
        switchTab("analysisTab");
      } else if (!navigator.onLine) {
        setStatus("غير متصل. لا يمكن تأكيد الجلسة أو تسجيل رحلات الآن.", "warning");
      } else {
        localStorage.removeItem(CONFIG.sessionKey);
        state.user = null;
        state.accounts = [];
        state.trips = [];
        state.extraDays = [];
        cacheState();
        renderHeader();
      }
    } else {
      state.user = null;
      state.accounts = [];
      state.trips = [];
      state.extraDays = [];
      renderHeader();
    }
    setConnectionBadge();
    checkForAppUpdate(false);
  }

  document.addEventListener("DOMContentLoaded", init);
})();