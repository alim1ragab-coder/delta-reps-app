const KEYS = {
  session: "delta_session_v4",
  accounts: "delta_accounts_v4",
  trips: "delta_trips_records_v4",
  allowance: "delta_default_allowance_v4"
};

// ضع رقم تليفونك (ورقم أي مشرف آخر) هنا بالأرقام فقط
const ADMIN_PHONES = [
  "01276341407"
];

const DEFAULT_REPS = [
  { id: "rep_1", name: "رضا ماضي", phone: "01011111111", role: "rep", password: "", avatar: "" },
  { id: "rep_2", name: "محمد حاتم", phone: "01022222222", role: "rep", password: "", avatar: "" },
  { id: "rep_3", name: "محمد السيد", phone: "01033333333", role: "rep", password: "", avatar: "" }
];

function normalizePhone(phone) {
  return (phone || "").replace(/\D/g, "").trim();
}

function getAccounts() {
  const saved = JSON.parse(localStorage.getItem(KEYS.accounts) || "null");
  if (Array.isArray(saved) && saved.length > 0) return saved;

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
  localStorage.setItem(KEYS.accounts, JSON.stringify(list));
}

function findAccountByPhone(phone) {
  const clean = normalizePhone(phone);
  return getAccounts().find((acc) => normalizePhone(acc.phone) === clean) || null;
}

function ensureAdminOrApprovedAccount(phone) {
  const clean = normalizePhone(phone);
  const isAdminPhone = ADMIN_PHONES.map(normalizePhone).includes(clean);
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
  const updated = getAccounts().map((acc) =>
    acc.id === accountId ? { ...acc, ...patch } : acc
  );
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
  }
}

function applyRoleUI(user) {
  const isAdmin = user.role === "admin";
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
  const reps = getAccounts().filter((a) => a.role === "rep");
  select.innerHTML = "";

  if (!isAdmin) {
    const opt = document.createElement("option");
    opt.value = user.name;
    opt.textContent = user.name;
    select.appendChild(opt);
    select.disabled = true;
  } else {
    select.disabled = false;
    reps.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.name;
      opt.textContent = r.name;
      select.appendChild(opt);
    });
  }
}

function renderRepsList() {
  const ul = document.getElementById("repsList");
  const reps = getAccounts().filter((a) => a.role === "rep");
  ul.innerHTML = "";

  reps.forEach((rep) => {
    const statusText = rep.password ? "تم تعيين كلمة السر" : "بانتظار الدخول لأول مرة";
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="rep-row-info">
        ${rep.avatar ? `<img src="${rep.avatar}" class="rep-avatar-mini" alt="${rep.name}" />` : ""}
        <div>
          <strong>${rep.name}</strong> - <span>${rep.phone}</span>
          <div class="hint">${statusText}</div>
        </div>
      </div>
      <button type="button" class="btn btn-danger" data-id="${rep.id}">حذف</button>
    `;
    li.querySelector("button").addEventListener("click", () => {
      const remaining = getAccounts().filter((x) => x.id !== rep.id);
      setAccounts(remaining);
      const user = getCurrentUser();
      if (user) refreshRepSelect(user, user.role === "admin");
      renderRepsList();
    });
    ul.appendChild(li);
  });
}

function getVisibleTripsForUser(user) {
  const allTrips = getTrips();
  if (user.role === "admin") {
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

  return getVisibleTripsForUser(user).filter((t) => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
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
  if (!user || user.role !== "admin") {
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
      .filter((a) => a.role === "rep")
      .map((a) => a.name)
  );
  rows.forEach((r) => {
    if (r.repName) repNamesSet.add(r.repName);
  });
  const repNames = Array.from(repNamesSet);

  const ws = {};
  ws["!views"] = [{ RTL: true }];

  // عناوين الجدول الرئيسي (الصف 1: A إلى F)
  const headers = ["طابع زمني", "التاريخ", "اسم المندوب", "المكان", "اسم العميل", "بدل السفر"];
  headers.forEach((h, colIdx) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    ws[ref] = { t: "s", v: h, s: cellStyle("1E293B", "FFFFFF", true, "center") };
  });

  // بيانات الرحلات (من الصف 2)
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

  // رأس جدول الملخص السفلي (أعمدة G و H و I)
  ws[`G${summaryHeaderRow}`] = { t: "s", v: "المندوب", s: cellStyle("0F172A", "FFFFFF", true, "right") };
  ws[`H${summaryHeaderRow}`] = { t: "s", v: "عدد الأيام", s: cellStyle("0F172A", "FFFFFF", true, "center") };
  ws[`I${summaryHeaderRow}`] = { t: "s", v: "إجمالي البدل", s: cellStyle("0F172A", "FFFFFF", true, "center") };

  // صفوف كل مندوب بمعادلات COUNTIF و SUMIF وألوان متناسقة
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

  // صف الإجمالي الكلي TOTAL
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
    alert("تم حفظ الرحلة وبدل السفر بنجاح.");
  });

  document.getElementById("addRepForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("newRepName").value.trim();
    const phone = normalizePhone(document.getElementById("newRepPhone").value);
    if (!name || !phone) {
      alert("من فضلك أدخل اسم المندوب ورقم تليفونه.");
      return;
    }

    if (findAccountByPhone(phone)) {
      alert("رقم التليفون ده مسجل بالفعل.");
      return;
    }

    const list = getAccounts();
    list.push({
      id: `rep_${Date.now()}`,
      name,
      phone,
      role: "rep",
      password: "",
      avatar: ""
    });
    setAccounts(list);

    document.getElementById("newRepName").value = "";
    document.getElementById("newRepPhone").value = "";
    const user = getCurrentUser();
    if (user) refreshRepSelect(user, user.role === "admin");
    renderRepsList();
  });

  document.getElementById("saveAllowanceBtn").addEventListener("click", () => {
    const val = document.getElementById("defaultAllowanceInput").value;
    setAllowance(val);
    document.getElementById("tripAllowance").value = getAllowance().toFixed(2);
    renderTripsTable();
    alert("تم تحديث قيمة بدل السفر الافتراضية.");
  });

  document.getElementById("fromDate").addEventListener("change", renderTripsTable);
  document.getElementById("toDate").addEventListener("change", renderTripsTable);
  document.getElementById("exportExcelBtn").addEventListener("click", exportTripsToExcel);

  const existingUser = getCurrentUser();
  if (existingUser) {
    applyRoleUI(existingUser);
  }
});
