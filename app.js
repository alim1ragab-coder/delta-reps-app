const KEYS = {
  session: "delta_session_v4",
  accounts: "delta_accounts_v4",
  trips: "delta_trips_records_v4",
  allowance: "delta_default_allowance_v4"
};

const SHEET_SYNC_URL = "https://script.google.com/macros/s/AKfycbzS2D9ENbdxUVwDoe-FkdtLl2paeSSxn3Lhm3M2hVz0J1fPnjm6-NiQgdOYUXBZRJ7u/exec";

// ضع رقم تليفونك (ورقم أي مشرف أساسي آخر) هنا بالأرقام فقط
const ADMIN_PHONES = [
  "01276341407"
];

const DEFAULT_REPS = [
  { id: "rep_1", name: "رضا ماضي", phone: "01011111111", role: "rep", password: "", avatar: "" },
  { id: "rep_2", name: "محمد حاتم", phone: "01022222222", role: "rep", password: "", avatar: "" },
  { id: "rep_3", name: "محمد السيد", phone: "01033333333", role: "rep", password: "", avatar: "" }
];

function normalizePhone(phone) {
  return (phone || "").toString().replace(/\D/g, "").trim();
}

function isConfiguredAdminPhone(phone) {
  const clean = normalizePhone(phone);
  return ADMIN_PHONES.map(normalizePhone).includes(clean);
}

function isAccountAdmin(account) {
  if (!account) return false;
  return account.role === "admin" || isConfiguredAdminPhone(account.phone);
}

function updateConnectionStatusBadge() {
  const badge = document.getElementById("connectionStatusBadge");
  if (!badge) return;
  const online = navigator.onLine;
  badge.textContent = online ? "متصل بالشبكة" : "النت فاصل";
  badge.classList.toggle("status-online", online);
  badge.classList.toggle("status-offline", !online);
}

function initPasswordToggles() {
  document.querySelectorAll(".password-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      btn.textContent = isHidden ? "إخفاء" : "إظهار";
    });
  });
}

function getAccounts() {
  const saved = JSON.parse(localStorage.getItem(KEYS.accounts) || "null");
  if (Array.isArray(saved) && saved.length > 0) {
    return saved.map((acc) => ({
      ...acc,
      phone: normalizePhone(acc.phone),
      role: isConfiguredAdminPhone(acc.phone) ? "admin" : (acc.role === "admin" ? "admin" : "rep"),
      password: String(acc.password ?? ""),
      avatar: acc.avatar || ""
    }));
  }

  const initialAdmins = ADMIN_PHONES.map((p, idx) => ({
    id: `admin_${idx + 1}`,
    name: idx === 0 ? "علي رجب" : `مشرف ${idx + 1}`,
    phone: normalizePhone(p),
    role: "admin",
    password: "",
    avatar: ""
  }));

  const all = [...initialAdmins, ...DEFAULT_REPS];
  localStorage.setItem(KEYS.accounts, JSON.stringify(all));
  return all;
}

function setAccounts(list) {
  const normalized = (Array.isArray(list) ? list : []).map((acc) => ({
    ...acc,
    phone: normalizePhone(acc.phone),
    role: isConfiguredAdminPhone(acc.phone) ? "admin" : (acc.role === "admin" ? "admin" : "rep"),
    password: String(acc.password ?? ""),
    avatar: acc.avatar || ""
  }));
  localStorage.setItem(KEYS.accounts, JSON.stringify(normalized));
}

function findAccountByPhone(phone) {
  const clean = normalizePhone(phone);
  return getAccounts().find((acc) => normalizePhone(acc.phone) === clean) || null;
}

function ensureAdminOrApprovedAccount(phone) {
  const clean = normalizePhone(phone);
  const isAdminPhone = isConfiguredAdminPhone(clean);
  let account = findAccountByPhone(clean);

  if (!account && isAdminPhone) {
    account = {
      id: `admin_${Date.now()}`,
      name: "علي رجب",
      phone: clean,
      role: "admin",
      password: "",
      avatar: ""
    };
    const list = getAccounts();
    list.unshift(account);
    setAccounts(list);
  } else if (account && isAdminPhone && account.role !== "admin") {
    account = updateAccount(account.id, { role: "admin" });
  }

  return account;
}

function updateAccount(accountId, patch) {
  const updated = getAccounts().map((acc) => {
    if (acc.id !== accountId) return acc;
    const merged = { ...acc, ...patch };
    const cleanPhone = normalizePhone(merged.phone);
    return {
      ...merged,
      phone: cleanPhone,
      role: isConfiguredAdminPhone(cleanPhone) ? "admin" : (merged.role === "admin" ? "admin" : "rep"),
      password: merged.password !== undefined ? String(merged.password ?? "") : String(acc.password ?? "")
    };
  });
  setAccounts(updated);
  return updated.find((acc) => acc.id === accountId) || null;
}

function getSessionPhone() {
  return localStorage.getItem(KEYS.session) || "";
}

function getCurrentUser() {
  const phone = getSessionPhone();
  if (!phone) return null;
  return ensureAdminOrApprovedAccount(phone);
}

function readImageAsDataUrl(fileInput) {
  return new Promise((resolve) => {
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function getAllowance() {
  return parseFloat(localStorage.getItem(KEYS.allowance) || "150") || 150;
}

function setAllowance(val) {
  localStorage.setItem(KEYS.allowance, String(parseFloat(val) || 0));
}

function getTrips() {
  return JSON.parse(localStorage.getItem(KEYS.trips) || "[]");
}

function setTrips(list) {
  localStorage.setItem(KEYS.trips, JSON.stringify(list));
}

// --- دوال المزامنة مع Google Sheets (صفوف وأعمدة) ---
function mergeTripsData(localTrips, remoteTrips) {
  const map = new Map();
  (Array.isArray(remoteTrips) ? remoteTrips : []).forEach((t) => {
    if (t && t.id) {
      map.set(String(t.id), {
        ...t,
        ownerPhone: normalizePhone(t.ownerPhone),
        allowance: parseFloat(t.allowance) || 0
      });
    }
  });
  (Array.isArray(localTrips) ? localTrips : []).forEach((t) => {
    if (t && t.id && !map.has(String(t.id))) {
      map.set(String(t.id), {
        ...t,
        ownerPhone: normalizePhone(t.ownerPhone),
        allowance: parseFloat(t.allowance) || 0
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    const idA = Number(String(a.id || "").replace(/\D/g, "")) || 0;
    const idB = Number(String(b.id || "").replace(/\D/g, "")) || 0;
    return idB - idA;
  });
}

function mergeAccountsData(localAccounts, remoteAccounts) {
  const localList = Array.isArray(localAccounts) ? localAccounts : [];
  const remoteList = Array.isArray(remoteAccounts) ? remoteAccounts : [];
  if (remoteList.length === 0) return localList;

  const map = new Map();
  localList.forEach((acc) => {
    map.set(normalizePhone(acc.phone) || String(acc.id), acc);
  });

  remoteList.forEach((acc) => {
    const cleanPhone = normalizePhone(acc.phone);
    const key = cleanPhone || String(acc.id);
    const prev = map.get(key);
    const resolvedRole = isConfiguredAdminPhone(cleanPhone)
      ? "admin"
      : (acc && acc.role === "admin") || (prev && prev.role === "admin")
        ? "admin"
        : "rep";

    const remotePass = acc && acc.password !== undefined && acc.password !== null ? String(acc.password) : "";
    const localPass = prev && prev.password !== undefined && prev.password !== null ? String(prev.password) : "";

    map.set(key, {
      ...(prev || {}),
      ...acc,
      phone: cleanPhone || (prev && prev.phone) || "",
      role: resolvedRole,
      password: remotePass || localPass || "",
      avatar: (acc && acc.avatar) || (prev && prev.avatar) || ""
    });
  });

  return Array.from(map.values());
}

function pushToSheetBackground() {
  if (!SHEET_SYNC_URL || !navigator.onLine) return;
  try {
    const payload = {
      action: "sync_all",
      data: {
        trips: getTrips(),
        accounts: getAccounts().map((acc) => ({
          id: acc.id,
          name: acc.name,
          phone: normalizePhone(acc.phone),
          role: isAccountAdmin(acc) ? "admin" : "rep",
          password: String(acc.password ?? ""),
          avatar: acc.avatar || ""
        })),
        allowance: getAllowance()
      }
    };

    fetch(SHEET_SYNC_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (_) {}
}

async function pullFromSheetBackground() {
  if (!SHEET_SYNC_URL || !navigator.onLine) return false;
  try {
    const res = await fetch(SHEET_SYNC_URL, { method: "GET", cache: "no-store" });
    if (!res.ok) return false;
    const json = await res.json();
    if (!json || !json.ok || !json.data) return false;

    setTrips(mergeTripsData(getTrips(), json.data.trips));
    setAccounts(mergeAccountsData(getAccounts(), json.data.accounts));
    if (typeof json.data.allowance === "number" && !Number.isNaN(json.data.allowance)) {
      localStorage.setItem(KEYS.allowance, String(json.data.allowance));
    }

    const user = getCurrentUser();
    if (user) {
      const adminFlag = isAccountAdmin(user);
      refreshRepSelect(user, adminFlag);
      document.getElementById("tripAllowance").value = getAllowance().toFixed(2);
      document.getElementById("defaultAllowanceInput").value = getAllowance();
      renderRepsList();
      renderTripsTable();
    }
    return true;
  } catch (_) {
    return false;
  }
}
// ------------------------------------------------

let pendingPhone = "";
let pendingMode = "lookup";

function preparePhoneStep() {
  const phone = normalizePhone(document.getElementById("loginPhoneInput").value);
  if (!phone) {
    alert("من فضلك أدخل رقم التليفون.");
    return;
  }

  const account = ensureAdminOrApprovedAccount(phone);
  if (!account) {
    alert("هذا الرقم غير مسجل في قائمة المناديب أو المشرفين. تواصل مع المشرف لإضافتك.");
    return;
  }

  pendingPhone = phone;

  if (!account.password) {
    pendingMode = "register_password";
    document.getElementById("existingPassBox").classList.add("hidden");
    document.getElementById("newPassBox").classList.remove("hidden");
    document.getElementById("confirmPassBox").classList.remove("hidden");
    document.getElementById("avatarSetupBox").classList.remove("hidden");
    document.getElementById("phoneAuthBtn").textContent = "حفظ كلمة السر والدخول";
  } else {
    pendingMode = "login_password";
    document.getElementById("newPassBox").classList.add("hidden");
    document.getElementById("confirmPassBox").classList.add("hidden");
    document.getElementById("avatarSetupBox").classList.add("hidden");
    document.getElementById("existingPassBox").classList.remove("hidden");
    document.getElementById("phoneAuthBtn").textContent = "تسجيل الدخول";
  }
}

async function handlePhoneAuthSubmit() {
  if (pendingMode === "lookup") {
    await pullFromSheetBackground();
    preparePhoneStep();
    return;
  }

  const account = ensureAdminOrApprovedAccount(pendingPhone);
  if (!account) {
    alert("تعذر العثور على الحساب.");
    return;
  }

  if (pendingMode === "register_password") {
    const pass1 = document.getElementById("createPasswordInput").value;
    const pass2 = document.getElementById("confirmPasswordInput").value;

    if (pass1.length < 4) {
      alert("اختر كلمة سر من 4 خانات أو أكثر.");
      return;
    }
    if (pass1 !== pass2) {
      alert("كلمتا السر غير متطابقتين.");
      return;
    }

    const avatarData = await readImageAsDataUrl(document.getElementById("loginAvatarInput"));
    const updatedAcc = updateAccount(account.id, {
      password: pass1,
      avatar: avatarData || account.avatar || ""
    });

    localStorage.setItem(KEYS.session, updatedAcc.phone);
    applyRoleUI(updatedAcc);
    pushToSheetBackground();
    return;
  }

  if (pendingMode === "login_password") {
    const enteredPass = document.getElementById("loginPasswordInput").value;
    if (enteredPass !== account.password) {
      alert("كلمة السر غير صحيحة.");
      return;
    }

    localStorage.setItem(KEYS.session, account.phone);
    applyRoleUI(account);
    pullFromSheetBackground();
  }
}

function applyRoleUI(user) {
  const isAdmin = isAccountAdmin(user);
  document.getElementById("authSection").classList.add("hidden");
  document.getElementById("profileModalSection").classList.add("hidden");
  document.getElementById("appSection").classList.remove("hidden");
  document.getElementById("logoutBtn").classList.remove("hidden");
  document.getElementById("openChangePassBtn").classList.remove("hidden");

  const backBtn = document.getElementById("backToLoginBtn");
  if (backBtn) {
    backBtn.classList.add("hidden");
  }

  document.querySelectorAll(".tab-btn").forEach((el) => {
    el.classList.remove("hidden");
    if (el.classList.contains("admin-only")) {
      el.classList.toggle("hidden", !isAdmin);
    }
  });

  const exportBtn = document.getElementById("exportExcelBtn");
  if (exportBtn) {
    exportBtn.classList.toggle("hidden", !isAdmin);
  }

  const avatarEl = document.getElementById("headerAvatar");
  if (user.avatar) {
    avatarEl.src = user.avatar;
    avatarEl.classList.remove("hidden");
  } else {
    avatarEl.classList.add("hidden");
  }

  document.getElementById("userBadge").classList.remove("hidden");
  document.getElementById("userBadge").textContent =
    `${user.name} (${user.phone}) - ${isAdmin ? "مشرف" : "مندوب"}`;

  if (!isAdmin) {
    const activeTab = document.querySelector(".tab-btn.active");
    if (activeTab && activeTab.classList.contains("admin-only")) {
      switchTab("newTripTab");
    }
  }

  refreshRepSelect(user, isAdmin);
  document.getElementById("tripAllowance").value = getAllowance().toFixed(2);
  document.getElementById("defaultAllowanceInput").value = getAllowance();
  renderRepsList();
  renderTripsTable();
  if (typeof renderSavedLabAnalyses === "function") {
    renderSavedLabAnalyses();
  }
}

function refreshRepSelect(user, isAdmin) {
  const select = document.getElementById("tripRepSelect");
  const allAccounts = getAccounts();
  const repsOnly = allAccounts.filter((a) => !isAccountAdmin(a));
  const selectableList = isAdmin ? allAccounts : repsOnly;
  select.innerHTML = "";

  if (!isAdmin) {
    const opt = document.createElement("option");
    opt.value = user.name;
    opt.textContent = user.name;
    select.appendChild(opt);
    select.disabled = true;
  } else {
    select.disabled = false;
    selectableList.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.name;
      opt.textContent = isAccountAdmin(r) ? `${r.name} (مشرف)` : r.name;
      select.appendChild(opt);
    });
  }
}

function ensureRoleSelectInAddRepForm() {
  const form = document.getElementById("addRepForm");
  if (!form || document.getElementById("newRepRole")) return;

  const select = document.createElement("select");
  select.id = "newRepRole";
  select.innerHTML = `
    <option value="rep">مندوب</option>
    <option value="admin">مشرف</option>
  `;

  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) {
    form.insertBefore(select, submitBtn);
  } else {
    form.appendChild(select);
  }
}

function renderRepsList() {
  const ul = document.getElementById("repsList");
  const currentUser = getCurrentUser();
  const currentPhone = currentUser ? normalizePhone(currentUser.phone) : "";
  const members = getAccounts();
  ul.innerHTML = "";

  members.forEach((member) => {
    const memberIsAdmin = isAccountAdmin(member);
    const roleLabel = memberIsAdmin ? "مشرف" : "مندوب";
    const statusText = member.password ? "تم تعيين كلمة السر" : "بانتظار الدخول لأول مرة";
    const isSelf = normalizePhone(member.phone) === currentPhone;

    const li = document.createElement("li");
    li.innerHTML = `
      <div class="rep-row-info">
        ${member.avatar ? `<img src="${member.avatar}" class="rep-avatar-mini" alt="${member.name}" />` : ""}
        <div>
          <strong>${escapeHtml(member.name)}</strong> - <span>${escapeHtml(member.phone)}</span> <span>(${roleLabel})</span>
          <div class="hint">${statusText}</div>
        </div>
      </div>
      <button type="button" class="btn btn-danger" data-id="${member.id}" ${isSelf ? "disabled" : ""}>${isSelf ? "حسابك" : "حذف"}</button>
    `;
    const delBtn = li.querySelector("button");
    if (!isSelf) {
      delBtn.addEventListener("click", () => {
        const confirmed = confirm(`هل أنت متأكد من حذف الحساب الخاص بـ "${member.name}" (${member.phone})؟`);
        if (!confirmed) return;

        const remaining = getAccounts().filter((x) => x.id !== member.id);
        setAccounts(remaining);
        const user = getCurrentUser();
        if (user) refreshRepSelect(user, isAccountAdmin(user));
        renderRepsList();
        pushToSheetBackground();
      });
    }
    ul.appendChild(li);
  });
}

function getVisibleTripsForUser(user) {
  const allTrips = getTrips();
  if (isAccountAdmin(user)) {
    return allTrips;
  }
  const userPhone = normalizePhone(user.phone);
  const userName = (user.name || "").trim();

  return allTrips.filter((t) => {
    const samePhone = t.ownerPhone && normalizePhone(t.ownerPhone) === userPhone;
    const sameName = userName && (t.repName || "").trim() === userName;
    return samePhone || sameName;
  });
}

function getFilteredTrips() {
  const user = getCurrentUser();
  if (!user) return [];
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;
  const searchQuery = (document.getElementById("tripSearchInput")?.value || "").trim().toLowerCase();

  return getVisibleTripsForUser(user).filter((t) => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (searchQuery) {
      const hay = `${t.repName || ""} ${t.client || ""} ${t.place || ""}`.toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });
}

function renderTripsTable() {
  const rows = getFilteredTrips();
  const tbody = document.getElementById("recordsBody");
  tbody.innerHTML = "";

  let totalAllowance = 0;
  rows.forEach((t) => {
    totalAllowance += parseFloat(t.allowance) || 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(t.timestamp)}</td>
      <td>${escapeHtml(t.date)}</td>
      <td>${escapeHtml(t.repName)}</td>
      <td>${escapeHtml(t.place)}</td>
      <td>${escapeHtml(t.client)}</td>
      <td>${(parseFloat(t.allowance) || 0).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("recordsSummary").textContent =
    `عدد الرحلات: ${rows.length} | إجمالي بدل السفر: ${totalAllowance.toFixed(2)} جنيه`;
}

function escapeHtml(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellStyle(bgHex, textHex = "0F172A", bold = false, align = "center") {
  return {
    font: { name: "Calibri", sz: 11, bold, color: { rgb: textHex } },
    fill: { patternType: "solid", fgColor: { rgb: bgHex } },
    alignment: { horizontal: align, vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "64748B" } },
      bottom: { style: "thin", color: { rgb: "64748B" } },
      left: { style: "thin", color: { rgb: "64748B" } },
      right: { style: "thin", color: { rgb: "64748B" } }
    }
  };
}

function exportTripsToExcel() {
  const user = getCurrentUser();
  if (!user || !isAccountAdmin(user)) {
    alert("تصدير ملف Excel متاح للمشرفين فقط.");
    return;
  }

  if (typeof XLSX === "undefined") {
    alert("تعذر تحميل مكتبة تصدير XLSX. تأكد من الاتصال بالإنترنت ثم أعد المحاولة.");
    return;
  }

  const rows = getFilteredTrips();

  const repNamesSet = new Set(
    getAccounts()
      .filter((a) => !isAccountAdmin(a))
      .map((a) => a.name)
  );
  rows.forEach((r) => {
    if (r.repName) repNamesSet.add(r.repName);
  });
  const repNames = Array.from(repNamesSet);

  const ws = {};
  ws["!views"] = [{ RTL: true }];

  const headers = ["طابع زمني", "التاريخ", "اسم المندوب", "المكان", "اسم العميل", "بدل السفر"];
  headers.forEach((h, colIdx) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    ws[ref] = { t: "s", v: h, s: cellStyle("1E293B", "FFFFFF", true, "center") };
  });

  rows.forEach((r, idx) => {
    const excelRowNum = idx + 2;
    const allowanceNum = Number(parseFloat(r.allowance) || 0);
    const bg = idx % 2 === 0 ? "FFFFFF" : "F8FAFC";

    ws[`A${excelRowNum}`] = { t: "s", v: String(r.timestamp || ""), s: cellStyle(bg, "0F172A", false, "right") };
    ws[`B${excelRowNum}`] = { t: "s", v: String(r.date || ""), s: cellStyle(bg, "0F172A", false, "center") };
    ws[`C${excelRowNum}`] = { t: "s", v: String(r.repName || ""), s: cellStyle(bg, "0F172A", false, "right") };
    ws[`D${excelRowNum}`] = { t: "s", v: String(r.place || ""), s: cellStyle(bg, "0F172A", false, "right") };
    ws[`E${excelRowNum}`] = { t: "s", v: String(r.client || ""), s: cellStyle(bg, "0F172A", false, "right") };
    ws[`F${excelRowNum}`] = {
      t: "n",
      v: allowanceNum,
      z: "#,##0.00",
      s: cellStyle(bg, "0F172A", false, "center")
    };
  });

  const lastDataRow = Math.max(rows.length + 1, 2);
  const summaryHeaderRow = Math.max(rows.length + 5, 14);
  const summaryStartRow = summaryHeaderRow + 1;

  ws[`G${summaryHeaderRow}`] = { t: "s", v: "المندوب", s: cellStyle("0F172A", "FFFFFF", true, "right") };
  ws[`H${summaryHeaderRow}`] = { t: "s", v: "عدد الأيام", s: cellStyle("0F172A", "FFFFFF", true, "center") };
  ws[`I${summaryHeaderRow}`] = { t: "s", v: "إجمالي البدل", s: cellStyle("0F172A", "FFFFFF", true, "center") };

  repNames.forEach((repName, i) => {
    const rowNum = summaryStartRow + i;
    ws[`G${rowNum}`] = {
      t: "s",
      v: repName,
      s: cellStyle("FFEDD5", "7C2D12", true, "right")
    };
    ws[`H${rowNum}`] = {
      t: "n",
      f: `COUNTIF($C$2:$C$${lastDataRow},G${rowNum})`,
      z: "0",
      s: cellStyle("FEE2E2", "991B1B", true, "center")
    };
    ws[`I${rowNum}`] = {
      t: "n",
      f: `SUMIF($C$2:$C$${lastDataRow},G${rowNum},$F$2:$F$${lastDataRow})`,
      z: "#,##0",
      s: cellStyle("E2E8F0", "0F172A", true, "center")
    };
  });

  const summaryEndRow = summaryStartRow + Math.max(repNames.length - 1, 0);
  const totalRowNum = summaryEndRow + 1;

  ws[`G${totalRowNum}`] = { t: "s", v: "TOTAL", s: cellStyle("1E293B", "FFFFFF", true, "right") };
  ws[`H${totalRowNum}`] = {
    t: "n",
    f: `SUM(H${summaryStartRow}:H${summaryEndRow})`,
    z: "0",
    s: cellStyle("DBEAFE", "1E3A8A", true, "center")
  };
  ws[`I${totalRowNum}`] = {
    t: "n",
    f: `SUM(I${summaryStartRow}:I${summaryEndRow})`,
    z: "#,##0",
    s: cellStyle("DCFCE7", "14532D", true, "center")
  };

  ws["!ref"] = `A1:I${totalRowNum}`;
  ws["!cols"] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 13 },
    { wch: 15 }
  ];

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "سجلات_مناديب_الدلتا");

  const wbout = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true
  });

  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `سجلات_مناديب_الدلتا_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === tabId);
  });
  if (tabId === "analysisTab" && typeof renderSavedLabAnalyses === "function") {
    renderSavedLabAnalyses();
  }
  if (tabId === "recordsTab") {
    pullFromSheetBackground();
  }
}

function hideSplashImmediately() {
  const splash = document.getElementById("splashScreen");
  if (!splash) return;
  splash.style.transition = "opacity 0.25s ease";
  splash.style.opacity = "0";
  splash.style.pointerEvents = "none";
  setTimeout(() => {
    splash.style.display = "none";
  }, 260);
}

function initSplashScreen() {
  const skipBtn = document.getElementById("skipSplashBtn");
  if (skipBtn) {
    skipBtn.addEventListener("click", hideSplashImmediately);
  }
  setTimeout(hideSplashImmediately, 2000);
}

document.addEventListener("DOMContentLoaded", () => {
  initSplashScreen();
  initPasswordToggles();
  updateConnectionStatusBadge();
  window.addEventListener("online", () => {
    updateConnectionStatusBadge();
    pullFromSheetBackground();
    pushToSheetBackground();
  });
  window.addEventListener("offline", updateConnectionStatusBadge);

  ensureRoleSelectInAddRepForm();
  getAccounts();
  document.getElementById("tripDate").value = new Date().toISOString().slice(0, 10);

  document.getElementById("loginPhoneInput").addEventListener("input", () => {
    pendingMode = "lookup";
    pendingPhone = "";
    document.getElementById("existingPassBox").classList.add("hidden");
    document.getElementById("newPassBox").classList.add("hidden");
    document.getElementById("confirmPassBox").classList.add("hidden");
    document.getElementById("avatarSetupBox").classList.add("hidden");
    document.getElementById("phoneAuthBtn").textContent = "متابعة";
  });

  document.getElementById("phoneAuthBtn").addEventListener("click", handlePhoneAuthSubmit);

  document.getElementById("openChangePassBtn").addEventListener("click", () => {
    document.getElementById("appSection").classList.add("hidden");
    document.getElementById("profileModalSection").classList.remove("hidden");
  });

  document.getElementById("closeProfileModalBtn").addEventListener("click", () => {
    document.getElementById("profileModalSection").classList.add("hidden");
    document.getElementById("appSection").classList.remove("hidden");
  });

  document.getElementById("saveProfileChangesBtn").addEventListener("click", async () => {
    const user = getCurrentUser();
    if (!user) return;

    const oldPhone = normalizePhone(user.phone);
    const newPhone = normalizePhone(document.getElementById("updatePhoneInput").value);
    const currentPass = document.getElementById("currentPassInput").value;
    const newPass = document.getElementById("updatedPassInput").value;
    const newAvatar = await readImageAsDataUrl(document.getElementById("updateAvatarInput"));

    const patch = {};

    if (newPhone && newPhone !== oldPhone) {
      if (newPhone.length < 10) {
        alert("من فضلك أدخل رقم تليفون صحيح.");
        return;
      }
      const existingWithPhone = findAccountByPhone(newPhone);
      if (existingWithPhone && existingWithPhone.id !== user.id) {
        alert("رقم التليفون الجديد مسجل بالفعل لحساب آخر.");
        return;
      }
      patch.phone = newPhone;
    }

    if (newPass) {
      if (currentPass !== user.password) {
        alert("كلمة السر الحالية غير صحيحة.");
        return;
      }
      if (newPass.length < 4) {
        alert("كلمة السر الجديدة يجب أن تكون 4 خانات أو أكثر.");
        return;
      }
      patch.password = newPass;
    }

    if (newAvatar) {
      patch.avatar = newAvatar;
    }

    if (!patch.phone && !patch.password && !patch.avatar) {
      alert("أدخل رقم تليفون جديد، أو كلمة سر جديدة، أو اختر صورة لتحديثها.");
      return;
    }

    const updated = updateAccount(user.id, patch);

    if (patch.phone) {
      localStorage.setItem(KEYS.session, patch.phone);
      const updatedTrips = getTrips().map((t) =>
        normalizePhone(t.ownerPhone) === oldPhone ? { ...t, ownerPhone: patch.phone } : t
      );
      setTrips(updatedTrips);
    }

    document.getElementById("updatePhoneInput").value = "";
    document.getElementById("currentPassInput").value = "";
    document.getElementById("updatedPassInput").value = "";
    document.getElementById("updateAvatarInput").value = "";
    applyRoleUI(updated);
    pushToSheetBackground();
    alert("تم حفظ التعديلات بنجاح.");
  });

  document.getElementById("openOfflineAnalysisBtn").addEventListener("click", () => {
    document.getElementById("authSection").classList.add("hidden");
    document.getElementById("appSection").classList.remove("hidden");
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.toggle("hidden", b.dataset.tab !== "analysisTab");
    });
    switchTab("analysisTab");
    document.getElementById("userBadge").classList.remove("hidden");
    document.getElementById("userBadge").textContent = "وضع التحاليل (بدون نت)";
    const backBtn = document.getElementById("backToLoginBtn");
    if (backBtn) backBtn.classList.remove("hidden");
  });

  const backToLoginBtn = document.getElementById("backToLoginBtn");
  if (backToLoginBtn) {
    backToLoginBtn.addEventListener("click", () => {
      document.getElementById("appSection").classList.add("hidden");
      document.getElementById("userBadge").classList.add("hidden");
      backToLoginBtn.classList.add("hidden");
      document.getElementById("authSection").classList.remove("hidden");
    });
  }

  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(KEYS.session);
    location.reload();
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("tripForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!navigator.onLine) {
      alert("النت فاصل يا برنس متقدرش تسجل الرحله دلوقتي حاول تاني لمى النت يرجع");
      return;
    }

    const user = getCurrentUser();
    if (!user) return;

    const newTrip = {
      id: `trip_${Date.now()}`,
      ownerPhone: user.phone,
      timestamp: new Date().toLocaleString("ar-EG"),
      date: document.getElementById("tripDate").value,
      repName: document.getElementById("tripRepSelect").value,
      place: document.getElementById("tripPlace").value.trim(),
      client: document.getElementById("tripClient").value.trim(),
      allowance: parseFloat(document.getElementById("tripAllowance").value) || 0
    };

    const trips = getTrips();
    trips.unshift(newTrip);
    setTrips(trips);

    document.getElementById("tripPlace").value = "";
    document.getElementById("tripClient").value = "";
    renderTripsTable();
    pushToSheetBackground();
    alert("تم حفظ الرحلة وبدل السفر بنجاح.");
  });

  document.getElementById("addRepForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("newRepName").value.trim();
    const phone = normalizePhone(document.getElementById("newRepPhone").value);
    const roleSelect = document.getElementById("newRepRole");
    const selectedRole = roleSelect && roleSelect.value === "admin" ? "admin" : "rep";

    if (!name || !phone) {
      alert("من فضلك أدخل الاسم ورقم التليفون.");
      return;
    }

    const existing = findAccountByPhone(phone);
    if (existing) {
      alert("رقم التليفون ده مسجل بالفعل.");
      return;
    }

    const list = getAccounts();
    list.push({
      id: `${selectedRole}_${Date.now()}`,
      name,
      phone,
      role: selectedRole,
      password: "",
      avatar: ""
    });
    setAccounts(list);

    document.getElementById("newRepName").value = "";
    document.getElementById("newRepPhone").value = "";
    if (roleSelect) roleSelect.value = "rep";

    const user = getCurrentUser();
    if (user) refreshRepSelect(user, isAccountAdmin(user));
    renderRepsList();
    pushToSheetBackground();
  });

  document.getElementById("saveAllowanceBtn").addEventListener("click", () => {
    const val = document.getElementById("defaultAllowanceInput").value;
    setAllowance(val);
    document.getElementById("tripAllowance").value = getAllowance().toFixed(2);
    renderTripsTable();
    pushToSheetBackground();
    alert("تم تحديث قيمة بدل السفر الافتراضية.");
  });

  document.getElementById("fromDate").addEventListener("change", renderTripsTable);
  document.getElementById("toDate").addEventListener("change", renderTripsTable);
  document.getElementById("tripSearchInput")?.addEventListener("input", renderTripsTable);
  document.getElementById("exportExcelBtn").addEventListener("click", exportTripsToExcel);

  const existingUser = getCurrentUser();
  if (existingUser) {
    applyRoleUI(existingUser);
    pullFromSheetBackground();
  }
});