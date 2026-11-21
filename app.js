const KEYS = {
  session: "delta_session_v4",
  accounts: "delta_accounts_v4",
  trips: "delta_trips_records_v4",
  allowance: "delta_default_allowance_v4"
};

// ضع رقم تليفونك (ورقم أي مشرف آخر) هنا بالأرقام فقط
const ADMIN_PHONES = [
  "01000000000"
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

  const avatarEl = document.getElementById("headerAvatar");
  if (user.avatar) {
    avatarEl.src = user.avatar;
    avatarEl.classList.remove("hidden");
  } else {
    avatarEl.classList.add("hidden");
  }

  document.getElementById("userBadge").textContent =
    `${user.name} (${user.phone}) - ${isAdmin ? "مشرف" : "مندوب"}`;

  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", !isAdmin);
  });

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
      <button class="btn btn-danger" data-id="${rep.id}">حذف</button>
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
  return allTrips.filter((t) => normalizePhone(t.ownerPhone) === normalizePhone(user.phone));
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
      <td>${t.timestamp}</td>
      <td>${t.date}</td>
      <td>${t.repName}</td>
      <td>${t.place}</td>
      <td>${t.client}</td>
      <td>${(parseFloat(t.allowance) || 0).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("recordsSummary").textContent =
    `عدد الرحلات: ${rows.length} | إجمالي بدل السفر: ${totalAllowance.toFixed(2)} جنيه`;
}

function buildRepSummaryRows(rows) {
  const map = new Map();

  getAccounts()
    .filter((a) => a.role === "rep")
    .forEach((rep) => {
      map.set(rep.name, {
        repName: rep.name,
        daysSet: new Set(),
        totalMoney: 0
      });
    });

  rows.forEach((r) => {
    const name = r.repName || "غير محدد";
    if (!map.has(name)) {
      map.set(name, {
        repName: name,
        daysSet: new Set(),
        totalMoney: 0
      });
    }
    const entry = map.get(name);
    if (r.date) entry.daysSet.add(r.date);
    entry.totalMoney += parseFloat(r.allowance) || 0;
  });

  const summaryList = Array.from(map.values()).map((item) => ({
    repName: item.repName,
    daysCount: item.daysSet.size,
    totalMoney: item.totalMoney
  }));

  const grandDays = summaryList.reduce((acc, s) => acc + s.daysCount, 0);
  const grandMoney = summaryList.reduce((acc, s) => acc + s.totalMoney, 0);

  return { summaryList, grandDays, grandMoney };
}

function escapeHtml(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function exportTripsToExcel() {
  const rows = getFilteredTrips();
  const { summaryList, grandDays, grandMoney } = buildRepSummaryRows(rows);

  const mainRowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.timestamp)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.repName)}</td>
        <td>${escapeHtml(r.place)}</td>
        <td>${escapeHtml(r.client)}</td>
      </tr>`
    )
    .join("");

  const summaryStartRow = Math.max(rows.length + 6, 12);
  const summaryRowsHtml = summaryList
    .map(
      (s) => `
      <tr>
        <td colspan="5"></td>
        <td></td>
        <td style="background:#ed7d31;color:#000;font-weight:bold;border:1px solid #808080;text-align:right;">${escapeHtml(s.repName)}</td>
        <td style="background:#ff0000;color:#000;font-weight:bold;border:1px solid #808080;text-align:center;">${s.daysCount}</td>
        <td style="background:#bfbfbf;color:#000;font-weight:bold;border:1px solid #808080;text-align:center;">${Math.round(s.totalMoney)}</td>
      </tr>`
    )
    .join("");

  const spacerRowsCount = Math.max(summaryStartRow - rows.length - 1, 2);
  const spacerRowsHtml = Array.from({ length: spacerRowsCount })
    .map(() => `<tr><td colspan="9"></td></tr>`)
    .join("");

  const htmlContent = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8" />
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Sheet1</x:Name>
              <x:WorksheetOptions>
                <x:DisplayRightToLeft/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
    </head>
    <body dir="rtl">
      <table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;">
        <thead>
          <tr style="background:#3b236b;color:#ffffff;font-weight:bold;">
            <th style="border:1px solid #2b1852;">طابع زمني</th>
            <th style="border:1px solid #2b1852;">التاريخ</th>
            <th style="border:1px solid #2b1852;">اسم المندوب</th>
            <th style="border:1px solid #2b1852;">المكان</th>
            <th style="border:1px solid #2b1852;">اسم العميل</th>
            <th colspan="4" style="border:1px solid #2b1852;"></th>
          </tr>
        </thead>
        <tbody>
          ${mainRowsHtml}
          ${spacerRowsHtml}
          ${summaryRowsHtml}
          <tr>
            <td colspan="5"></td>
            <td></td>
            <td style="background:#d9d9d9;color:#000;font-weight:bold;border:1px solid #808080;text-align:right;">TOTAL</td>
            <td style="background:#d9eef8;color:#000;font-weight:bold;border:1px solid #808080;text-align:center;">${grandDays}</td>
            <td style="background:#d9d9d9;color:#000;font-weight:bold;border:1px solid #808080;text-align:center;">${Math.round(grandMoney)}</td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob(["\uFEFF" + htmlContent], {
    type: "application/vnd.ms-excel;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `سجلات_مناديب_الدلتا_${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === tabId);
  });
}

function initSplashScreen() {
  const splash = document.getElementById("splashScreen");
  if (!splash) return;

  setTimeout(() => {
    splash.style.transition = "opacity 0.4s ease";
    splash.style.opacity = "0";
    splash.style.pointerEvents = "none";
    setTimeout(() => {
      splash.style.display = "none";
    }, 420);
  }, 5000);
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

    const currentPass = document.getElementById("currentPassInput").value;
    const newPass = document.getElementById("updatedPassInput").value;
    const newAvatar = await readImageAsDataUrl(document.getElementById("updateAvatarInput"));

    const patch = {};

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

    if (!patch.password && !patch.avatar) {
      alert("أدخل كلمة سر جديدة أو اختر صورة لتحديثها.");
      return;
    }

    const updated = updateAccount(user.id, patch);
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
    document.getElementById("userBadge").textContent = "وضع التحاليل (بدون نت)";
  });

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