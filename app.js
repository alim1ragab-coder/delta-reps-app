const KEYS = {
  session: "delta_session_v4",
  accounts: "delta_accounts_v4",
  trips: "delta_trips_records_v4",
  allowance: "delta_default_allowance_v4"
};

const SYNC_URL = "https://script.google.com/macros/s/AKfycbws30RGljgQNG-RajyhwM4SfTX0VtOLv38MQEsw8iSGrl1EVHrplrfyxfYvI0Ed2c9A/exec";

// ضع رقم تليفونك (ورقم أي مشرف آخر) هنا بالأرقام فقط
const ADMIN_PHONES = [
  "01276341407"
];

const DEFAULT_REPS = [
  { id: "rep_1", name: "رضا ماضي", phone: "01011111111", role: "rep", password: "", avatar: "" },
  { id: "rep_2", name: "محمد حاتم", phone: "01022222222", role: "rep", password: "", avatar: "" },
  { id: "rep_3", name: "محمد السيد", phone: "01033333333", role: "rep", password: "", avatar: "" }
];

let isSyncing = false;

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

function mergeTripsById(localTrips, remoteTrips) {
  const map = new Map();
  (Array.isArray(remoteTrips) ? remoteTrips : []).forEach((t) => {
    if (t && t.id) map.set(String(t.id), t);
  });
  (Array.isArray(localTrips) ? localTrips : []).forEach((t) => {
    if (t && t.id && !map.has(String(t.id))) {
      map.set(String(t.id), t);
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    const idA = Number(String(a.id || "").replace(/\D/g, "")) || 0;
    const idB = Number(String(b.id || "").replace(/\D/g, "")) || 0;
    return idB - idA;
  });
}

function mergeAccounts(localAccs, remoteAccs) {
  const localList = Array.isArray(localAccs) ? localAccs : [];
  const remoteList = Array.isArray(remoteAccs) ? remoteAccs : [];
  if (remoteList.length === 0) return localList;

  const map = new Map();
  localList.forEach((acc) => {
    const key = normalizePhone(acc.phone) || String(acc.id);
    map.set(key, acc);
  });

  remoteList.forEach((rAcc) => {
    const key = normalizePhone(rAcc.phone) || String(rAcc.id);
    const lAcc = map.get(key);
    if (!lAcc) {
      map.set(key, rAcc);
    } else {
      map.set(key, {
        ...lAcc,
        ...rAcc,
        password: rAcc.password || lAcc.password || "",
        avatar: rAcc.avatar || lAcc.avatar || ""
      });
    }
  });

  return Array.from(map.values());
}

async function pullCloudData() {
  if (!SYNC_URL || !navigator.onLine) return null;
  try {
    const res = await fetch(SYNC_URL, { method: "GET", cache: "no-store" });
    const json = await res.json();
    if (!json || !json.ok || !json.data) return null;

    const mergedTrips = mergeTripsById(getTrips(), json.data.trips);
    const mergedAccounts = mergeAccounts(getAccounts(), json.data.accounts);

    setTrips(mergedTrips);
    setAccounts(mergedAccounts);

    if (typeof json.data.allowance === "number" && !Number.isNaN(json.data.allowance)) {
      localStorage.setItem(KEYS.allowance, String(json.data.allowance));
    }

    const currentUser = getCurrentUser();
    if (currentUser) {
      const isAdmin = currentUser.role === "admin";
      refreshRepSelect(currentUser, isAdmin);
      document.getElementById("tripAllowance").value = getAllowance().toFixed(2);
      document.getElementById("defaultAllowanceInput").value = getAllowance();
      renderRepsList();
      renderTripsTable();
    }

    return json.data;
  } catch (err) {
    console.warn("تعذر السحب من السحابة حالياً:", err);
    return null;
  }
}

async function pushCloudData(showAlertOnFail = false) {
  if (!SYNC_URL || !navigator.onLine || isSyncing) return false;
  isSyncing = true;
  try {
    const bodyData = {
      action: "sync_all",
      data: {
        trips: getTrips(),
        accounts: getAccounts(),
        allowance: getAllowance()
      }
    };

    const res = await fetch(SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(bodyData)
    });

    const json = await res.json();
    if (json && json.ok && json.data) {
      const mergedTrips = mergeTripsById(getTrips(), json.data.trips);
      const mergedAccounts = mergeAccounts(getAccounts(), json.data.accounts);
      setTrips(mergedTrips);
      setAccounts(mergedAccounts);
      if (typeof json.data.allowance === "number" && !Number.isNaN(json.data.allowance)) {
        localStorage.setItem(KEYS.allowance, String(json.data.allowance));
      }
    }
    return true;
  } catch (err) {
    console.warn("تعذر الرفع للسحابة حالياً:", err);
    if (showAlertOnFail) {
      alert("تم الحفظ محلياً، وسيتم المزامنة تلقائياً عند توفر الإنترنت.");
    }
    return false;
  } finally {
    isSyncing = false;
  }
}

let pendingPhone = "";
let pendingMode = "lookup";

async function preparePhoneStep() {
  const phone = normalizePhone(document.getElementById("loginPhoneInput").value);
  if (!phone) {
    alert
