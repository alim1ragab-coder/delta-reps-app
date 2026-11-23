/* TAGADDOD Delta Reps - client application. Google Sheets is the source of truth. */
(() => {
  "use strict";

  const CONFIG = {
    sheetUrl: "https://script.google.com/macros/s/AKfycbyvS1rBt0LLWheSWSH0Uk9dwKmeWF5i_T5Rr7iWSUaeS-X8dqVhHOu5rj8chF8E2Bk/exec",
    sessionKey: "delta_session_token_v5",
    cacheKey: "delta_state_cache_v5",
    pageSize: 15
  };

  const $ = (id) => document.getElementById(id);
  let state = { user: null, accounts: [], trips: [], allowance: 150 };
  let currentPage = 1;
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
      throw new Error("تعذر تأكيد الاتصال بخدمة التسجيل. راجع سجل الرحلات قبل إعادة المحاولة حتى لا يتكرر التسجيل.");
    } finally {
      clearTimeout(sendTimer);
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (!navigator.onLine) throw new Error("انقطع الإنترنت قبل تأكيد التسجيل. راجع سجل الرحلات قبل إعادة المحاولة.");
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
    throw new Error("التسجيل أُرسل لكن لم يصل تأكيد Google Sheets. راجع سجل الرحلات قبل إعادة المحاولة حتى لا يتكرر التسجيل.");
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

  function applyServerState(data) {
    if (!data || !data.user) throw new Error("استجابة غير مكتملة من الخادم.");
    state = {
      user: data.user,
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      trips: (Array.isArray(data.trips) ? data.trips : []).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.id || "").localeCompare(String(a.id || ""))),
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

  function setView(view) {
    ["authSection", "profileModalSection", "appSection"].forEach((id) => $(id)?.classList.add("hidden"));
    if (view === "auth") $("authSection")?.classList.remove("hidden");
    else if (view === "profile") $("profileModalSection")?.classList.remove("hidden");
    else $("appSection")?.classList.remove("hidden");
    $("openLoginFromSamplesBtn")?.classList.toggle("hidden", view !== "app" || Boolean(state.user));
    $("backToSamplesBtn")?.classList.toggle("hidden", view !== "auth");
  }

  function switchTab(tabId) {
    if (["newTripTab", "recordsTab", "adminTab"].includes(tabId) && !state.user) {
      openLogin();
      return;
    }
    if (tabId === "adminTab" && !isAdmin()) {
      alert("هذه الصفحة متاحة للمشرف فقط.");
      return;
    }
    document.querySelectorAll(".tab-btn").forEach((button) => button.classList.toggle("active", button.dataset.tab === tabId));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
    if (tabId === "recordsTab") {
      currentPage = 1;
      renderTrips();
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
      avatar.src = state.user?.avatar || "";
      avatar.classList.toggle("hidden", !state.user?.avatar);
    }
    $("logoutBtn")?.classList.toggle("hidden", !state.user);
    $("openChangePassBtn")?.classList.toggle("hidden", !state.user);
    document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !isAdmin()));
    setConnectionBadge();
  }

  function renderRepSelect() {
    const select = $("tripRepSelect");
    if (!select || !state.user) return;
    const reps = isAdmin() ? state.accounts : [state.user];
    select.innerHTML = reps.map((account) => `<option value="${escapeHtml(account.phone)}">${escapeHtml(account.name)}${account.role === "admin" ? " (مشرف)" : ""}</option>`).join("");
    select.disabled = !isAdmin();
  }

  function renderReps() {
    const list = $("repsList");
    if (!list) return;
    list.innerHTML = "";
    state.accounts.forEach((account) => {
      const li = document.createElement("li");
      const info = document.createElement("div");
      info.className = "rep-row-info";
      if (account.avatar) {
        const img = document.createElement("img");
        img.src = account.avatar;
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

  function getVisibleTrips() {
    const from = isAdmin() ? ($("fromDate")?.value || "") : "";
    const to = isAdmin() ? ($("toDate")?.value || "") : "";
    const query = isAdmin() ? (($("tripSearchInput")?.value || "").trim().toLocaleLowerCase("ar-EG")) : "";
    const currentPhone = normalizePhone(state.user?.phone);
    const currentName = (state.user?.name || "").trim();

    return state.trips.filter((trip) => {
      if (!isAdmin()) {
        const matchPhone = trip.repPhone && normalizePhone(trip.repPhone) === currentPhone;
        const matchOwner = trip.ownerPhone && normalizePhone(trip.ownerPhone) === currentPhone;
        const matchName = currentName && (trip.repName || "").trim() === currentName;
        if (!matchPhone && !matchOwner && !matchName) return false;
      }
      if (from && trip.date < from) return false;
      if (to && trip.date > to) return false;
      const text = `${trip.repName || ""} ${trip.place || ""} ${trip.client || ""}`.toLocaleLowerCase("ar-EG");
      return !query || text.includes(query);
    });
  }

  function renderTrips() {
    const tbody = $("recordsBody");
    if (!tbody) return;
    const rows = getVisibleTrips();
    const pages = Math.max(1, Math.ceil(rows.length / CONFIG.pageSize));
    currentPage = Math.min(Math.max(1, currentPage), pages);
    const visible = rows.slice((currentPage - 1) * CONFIG.pageSize, currentPage * CONFIG.pageSize);
    tbody.innerHTML = "";
    visible.forEach((trip) => {
      const tr = document.createElement("tr");
      const formattedTs = formatTimestamp(trip.timestamp);
      const tripCells = [
        { label: "الطابع الزمني", value: formattedTs },
        { label: "التاريخ", value: trip.date || "" },
        { label: "المندوب", value: trip.repName || "" },
        { label: "المكان", value: trip.place || "" },
        { label: "العميل", value: trip.client || "" },
        { label: "بدل السفر", value: `${Number(trip.allowance || 0).toFixed(2)} ج.م` }
      ];
      tr.innerHTML = tripCells.map((cell) => `<td data-label="${cell.label}">${escapeHtml(cell.value)}</td>`).join("");
      if (isAdmin()) {
        const cell = document.createElement("td");
        cell.setAttribute("data-label", "إجراء");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-danger btn-sm";
        button.textContent = "حذف";
        button.addEventListener("click", async () => {
          if (confirm("هل تريد حذف هذه الرحلة نهائيًا؟")) await runMutation("delete_trip", { id: trip.id }, "تم حذف الرحلة بنجاح.", "جاري حذف الرحلة...");
        });
        cell.appendChild(button);
        tr.appendChild(cell);
      }
      tbody.appendChild(tr);
    });
    $("recordsSummary").textContent = `إجمالي الرحلات: ${rows.length} | إجمالي بدل السفر: ${rows.reduce((sum, t) => sum + Number(t.allowance || 0), 0).toFixed(2)} جنيه`;
    $("tripsPageInfo").textContent = `صفحة ${currentPage} من ${pages}`;
    $("prevTripsPageBtn").disabled = currentPage <= 1;
    $("nextTripsPageBtn").disabled = currentPage >= pages;
    $("tripsPaginationBar").classList.toggle("hidden", rows.length <= CONFIG.pageSize);
  }

  function renderAll() {
    renderHeader();
    renderRepSelect();
    renderReps();
    renderTrips();
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

  async function readCompressedAvatar(file) {
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
    const scale = Math.min(1, 180 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.55);
  }

  async function saveProfile() {
    if (!navigator.onLine) return showToast("النت فاصل. افتح النت الأول وبعد كده احفظ التعديلات.", "error", 6000);
    try {
      showToast("جاري تجهيز البيانات...", "loading");
      const payload = {
        phone: normalizePhone($("updatePhoneInput").value),
        currentPassword: $("currentPassInput").value,
        newPassword: $("updatedPassInput").value,
        avatar: await readCompressedAvatar($("updateAvatarInput").files?.[0])
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
        ...rows.map((trip) => [formatTimestamp(trip.timestamp), trip.date || "", trip.repName || "", trip.place || "", trip.client || "", Number(trip.allowance || 0)])
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
      ws["!views"] = [{ RTL: true }];
      ws["!cols"] = [{ wch: 24 }, { wch: 15 }, { wch: 23 }, { wch: 23 }, { wch: 27 }, { wch: 19 }];
      ws["!rows"] = aoa.map((_, index) => ({ hpt: index === 0 || index + 1 === summaryTitleRow || index + 1 === summaryHeaderRow ? 26 : 22 }));
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
        { s: { r: summaryTitleRow - 1, c: 0 }, e: { r: summaryTitleRow - 1, c: 2 } }
      ];

      const border = {
        top: { style: "thin", color: { rgb: "235861" } },
        bottom: { style: "thin", color: { rgb: "235861" } },
        left: { style: "thin", color: { rgb: "235861" } },
        right: { style: "thin", color: { rgb: "235861" } }
      };
      const setStyle = (r, c, style) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.s = { ...style, border, alignment: { vertical: "center", horizontal: "center", wrapText: true, ...(style.alignment || {}) } };
      };
      const titleStyle = { font: { name: "Arial", sz: 15, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "0C2226" } } };
      const headerStyle = { font: { name: "Arial", sz: 11, bold: true, color: { rgb: "5EEAD4" } }, fill: { fgColor: { rgb: "102C31" } } };
      const totalStyle = { font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "14353B" } } };
      const bodyStyle = { font: { name: "Arial", sz: 10, color: { rgb: "172824" } }, fill: { fgColor: { rgb: "FFFFFF" } } };
      for (let c = 0; c < 6; c += 1) setStyle(0, c, titleStyle);
      for (let c = 0; c < 6; c += 1) setStyle(1, c, headerStyle);
      for (let r = 2; r < rows.length + 2; r += 1) {
        for (let c = 0; c < 6; c += 1) {
          const style = { ...bodyStyle, fill: { fgColor: { rgb: r % 2 === 0 ? "F2F8F8" : "FFFFFF" } } };
          if (c === 5) style.numFmt = "#,##0.00";
          setStyle(r, c, style);
        }
      }
      for (let c = 0; c < 3; c += 1) setStyle(summaryTitleRow - 1, c, titleStyle);
      for (let c = 0; c < 3; c += 1) setStyle(summaryHeaderRow - 1, c, headerStyle);
      const summaryStart = summaryHeaderRow;
      for (let r = summaryStart; r < grandTotalRow - 1; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          const style = { ...bodyStyle, fill: { fgColor: { rgb: r % 2 === 0 ? "F2F8F8" : "FFFFFF" } } };
          if (c === 2) style.numFmt = "#,##0.00";
          setStyle(r, c, style);
        }
      }
      for (let c = 0; c < 3; c += 1) {
        const style = { ...totalStyle };
        if (c === 2) style.numFmt = "#,##0.00";
        setStyle(grandTotalRow - 1, c, style);
      }
      ws["!autofilter"] = { ref: `A2:F${Math.max(2, rows.length + 2)}` };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "تقرير الرحلات");
      XLSX.writeFile(wb, `تقرير_رحلات_المناديب_${from}_${to}.xlsx`);
      showToast(`تم تصدير ${rows.length} رحلة بنجاح.`, "success");
    } catch (error) {
      showToast(`تعذر تصدير الملف: ${error.message || "خطأ غير معروف"}`, "error", 6000);
    }
  }

  function bindEvents() {
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
      cacheState();
      renderHeader();
      setView("app");
      switchTab("analysisTab");
      showToast("تم تسجيل الخروج.", "success");
    });
    document.querySelectorAll(".tab-btn").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
    $("tripForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!navigator.onLine) return showToast("النت فاصل. افتح النت الأول وبعد كده سجل الرحلة.", "error", 6500);
      if (!state.user) return openLogin();
      const date = $("tripDate").value;
      const place = $("tripPlace").value.trim();
      const client = $("tripClient").value.trim();
      const allowance = Number($("tripAllowance").value);
      if (!date || !place || !client || !Number.isFinite(allowance) || allowance < 0) return showToast("راجع بيانات الرحلة والبدل قبل التسجيل.", "warning");
      const repPhone = isAdmin() ? $("tripRepSelect").value : state.user.phone;
      const ok = await runMutation("add_trip", { date, place, client, allowance, repPhone, timestamp: formatTimestamp(new Date()) }, "تم تسجيل رحلة جديدة بنجاح.", "جاري تسجيل الرحلة على النظام...");
      if (ok) { $("tripPlace").value = ""; $("tripClient").value = ""; }
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
    ["fromDate", "toDate"].forEach((id) => $(id).addEventListener("change", () => { currentPage = 1; renderTrips(); }));
    $("tripSearchInput").addEventListener("input", () => { currentPage = 1; renderTrips(); });
    $("prevTripsPageBtn").addEventListener("click", () => { currentPage -= 1; renderTrips(); });
    $("nextTripsPageBtn").addEventListener("click", () => { currentPage += 1; renderTrips(); });
    $("exportExcelBtn").addEventListener("click", exportExcel);
    $("syncNowBtn").addEventListener("click", () => pullState(true));
    const today = new Date();
    $("tripDate").value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
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
      } else if (navigator.onLine) {
        localStorage.removeItem(CONFIG.sessionKey);
        state.user = null;
        state.accounts = [];
        state.trips = [];
        cacheState();
        renderHeader();
      }
    } else {
      state.user = null;
      state.accounts = [];
      state.trips = [];
      renderHeader();
    }
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
    setConnectionBadge();
  }

  document.addEventListener("DOMContentLoaded", init);
})();