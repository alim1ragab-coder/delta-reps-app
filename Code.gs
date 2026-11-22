/**
 * TAGADDOD - Google Sheets backend.
 * Bind this Apps Script project to the destination spreadsheet, then deploy it as a Web App.
 * Execute as: Me. Access: Anyone (the app uses server-issued session tokens and per-action role checks).
 */
const CONFIG = {
  SPREADSHEET_ID: '', // Leave empty when this script is bound to the Google Sheet.
  ADMIN_PHONES: ['01276341407'],
  DEFAULT_ALLOWANCE: 150,
  SESSION_DAYS: 30,
  RESULT_CACHE_SECONDS: 90,
  ACCOUNTS_SHEET: 'Accounts',
  TRIPS_SHEET: 'Trips',
  SETTINGS_SHEET: 'Settings'
};

const ACCOUNT_HEADERS = ['id', 'name', 'phone', 'role', 'passwordSalt', 'passwordHash', 'avatar', 'createdAt'];
const TRIP_HEADERS = ['id', 'ownerPhone', 'repName', 'timestamp', 'date', 'place', 'client', 'allowance', 'createdAt'];
const SETTING_HEADERS = ['key', 'value'];
const INITIAL_REPS = [
  { id: 'rep_1', name: 'رضا ماضي', phone: '01011111111', role: 'rep' },
  { id: 'rep_2', name: 'محمد حاتم', phone: '01022222222', role: 'rep' },
  { id: 'rep_3', name: 'محمد السيد', phone: '01033333333', role: 'rep' }
];

function doGet(e) {
  const p = (e && e.parameter) || {};
  let result;
  try {
    if (p.action === 'result') {
      result = readCachedResult_(p.requestId);
    } else {
      result = { ok: false, error: 'طلب غير معروف.' };
    }
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return output_(result, p.callback);
}

function doPost(e) {
  let request = {};
  try {
    request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    ensureSheets_();
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let result;
    try { result = handleAction_(request); } finally { lock.releaseLock(); }
    if (request.requestId) writeCachedResult_(request.requestId, result);
  } catch (err) {
    const failure = { ok: false, error: String(err && err.message ? err.message : err) };
    if (request.requestId) writeCachedResult_(request.requestId, failure);
  }
  // The browser retrieves the result through the JSONP result endpoint.
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function handleAction_(request) {
  const action = String(request.action || '');
  const payload = request.payload || {};
  if (action === 'login') return login_(payload);

  const session = getSession_(request.sessionToken);
  if (!session) throw new Error('انتهت الجلسة. سجل الدخول مرة أخرى.');
  if (action === 'logout') { PropertiesService.getScriptProperties().deleteProperty(session.key); return { ok: true }; }
  if (action === 'get_state') return { ok: true, data: getState_(session.phone) };
  const actor = findAccountByPhone_(session.phone);
  if (!actor) throw new Error('الحساب غير موجود.');
  const admin = isAdmin_(actor);

  switch (action) {
    case 'add_trip': {
      const owner = admin ? findAccountByPhone_(payload.repPhone) : actor;
      if (!owner) throw new Error('المندوب المحدد غير موجود.');
      const date = String(payload.date || '');
      const place = String(payload.place || '').trim();
      const client = String(payload.client || '').trim();
      const allowance = Number(payload.allowance);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !place || !client || !Number.isFinite(allowance) || allowance < 0) {
        throw new Error('بيانات الرحلة غير مكتملة أو غير صحيحة.');
      }
      const trip = {
        id: 'trip_' + Utilities.getUuid(), ownerPhone: owner.phone, repName: owner.name,
        timestamp: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
        date: date, place: place, client: client, allowance: allowance, createdAt: new Date().toISOString()
      };
      const sh = getSheet_(CONFIG.TRIPS_SHEET, TRIP_HEADERS);
      sh.appendRow(TRIP_HEADERS.map(k => trip[k] === undefined ? '' : trip[k]));
      return { ok: true, tripId: trip.id };
    }
    case 'delete_trip': {
      requireAdmin_(admin);
      const sh = getSheet_(CONFIG.TRIPS_SHEET, TRIP_HEADERS);
      const rows = sh.getDataRange().getValues();
      const index = rows.findIndex((row, i) => i > 0 && String(row[0]) === String(payload.id));
      if (index < 1) throw new Error('الرحلة غير موجودة.');
      sh.deleteRow(index + 1);
      return { ok: true };
    }
    case 'add_account': {
      requireAdmin_(admin);
      const name = String(payload.name || '').trim();
      const phone = normalizePhone_(payload.phone);
      const role = payload.role === 'admin' ? 'admin' : 'rep';
      if (!name || phone.length < 10) throw new Error('الاسم أو رقم الهاتف غير صحيح.');
      if (findAccountByPhone_(phone)) throw new Error('رقم الهاتف مسجل بالفعل.');
      const account = { id: (role === 'admin' ? 'admin_' : 'rep_') + Utilities.getUuid(), name, phone, role, passwordSalt: '', passwordHash: '', avatar: '', createdAt: new Date().toISOString() };
      getSheet_(CONFIG.ACCOUNTS_SHEET, ACCOUNT_HEADERS).appendRow(ACCOUNT_HEADERS.map(k => account[k] || ''));
      return { ok: true };
    }
    case 'delete_account': {
      requireAdmin_(admin);
      const phone = normalizePhone_(payload.phone);
      const target = findAccountByPhone_(phone);
      if (!phone || phone === actor.phone || isConfiguredAdmin_(phone) || (target && isAdmin_(target))) throw new Error('لا يمكن حذف حسابك أو حساب مشرف.');
      const sh = getSheet_(CONFIG.ACCOUNTS_SHEET, ACCOUNT_HEADERS);
      const rows = sh.getDataRange().getValues();
      const index = rows.findIndex((row, i) => i > 0 && normalizePhone_(row[2]) === phone);
      if (index < 1) throw new Error('الحساب غير موجود.');
      sh.deleteRow(index + 1);
      return { ok: true };
    }
    case 'set_allowance': {
      requireAdmin_(admin);
      const allowance = Number(payload.allowance);
      if (!Number.isFinite(allowance) || allowance < 0) throw new Error('قيمة البدل غير صحيحة.');
      setSetting_('defaultAllowance', allowance);
      return { ok: true };
    }
    case 'update_profile': {
      const sh = getSheet_(CONFIG.ACCOUNTS_SHEET, ACCOUNT_HEADERS);
      const account = findAccountByPhone_(actor.phone);
      const newPhone = normalizePhone_(payload.phone);
      const newPassword = String(payload.newPassword || '');
      const avatar = String(payload.avatar || '');
      if (newPhone && newPhone !== actor.phone) {
        if (newPhone.length < 10) throw new Error('رقم الهاتف الجديد غير صحيح.');
        if (findAccountByPhone_(newPhone)) throw new Error('رقم الهاتف الجديد مسجل بالفعل.');
      }
      let salt = account.passwordSalt;
      let hash = account.passwordHash;
      if (newPassword) {
        if (!verifyPassword_(String(payload.currentPassword || ''), salt, hash)) throw new Error('كلمة السر الحالية غير صحيحة.');
        if (newPassword.length < 4) throw new Error('كلمة السر الجديدة يجب أن تكون 4 خانات على الأقل.');
        salt = Utilities.getUuid() + Utilities.getUuid();
        hash = hashPassword_(newPassword, salt);
      }
      if (avatar && avatar.length > 45000) throw new Error('الصورة كبيرة جدًا. اختر صورة أصغر.');
      const row = account._row;
      const updatedPhone = newPhone || actor.phone;
      sh.getRange(row, 3).setValue(updatedPhone);
      if (isAdmin_(actor)) sh.getRange(row, 4).setValue('admin');
      sh.getRange(row, 5).setValue(salt);
      sh.getRange(row, 6).setValue(hash);
      if (avatar) sh.getRange(row, 7).setValue(avatar);
      if (updatedPhone !== actor.phone) {
        const tripsSheet = getSheet_(CONFIG.TRIPS_SHEET, TRIP_HEADERS);
        if (tripsSheet.getLastRow() > 1) {
          const ownerCells = tripsSheet.getRange(2, 2, tripsSheet.getLastRow() - 1, 1);
          const ownerValues = ownerCells.getValues();
          ownerValues.forEach(row => { if (normalizePhone_(row[0]) === actor.phone) row[0] = updatedPhone; });
          ownerCells.setValues(ownerValues);
        }
        updateSessionPhone_(request.sessionToken, updatedPhone);
      }
      return { ok: true };
    }
    default:
      throw new Error('عملية غير مدعومة.');
  }
}

function login_(payload) {
  const phone = normalizePhone_(payload.phone);
  if (phone.length < 10) throw new Error('رقم الهاتف غير صحيح.');
  const account = findAccountByPhone_(phone);
  if (!account) throw new Error('هذا الرقم غير مسجل. تواصل مع المشرف لإضافتك.');
  let salt = account.passwordSalt;
  let hash = account.passwordHash;
  if (!hash) {
    const newPassword = String(payload.newPassword || '');
    if (!newPassword) return { ok: false, code: 'FIRST_LOGIN', firstLogin: true, error: 'هذا أول دخول للحساب. عيّن كلمة سر جديدة.' };
    if (newPassword.length < 4) throw new Error('كلمة السر يجب أن تكون 4 خانات على الأقل.');
    salt = Utilities.getUuid() + Utilities.getUuid();
    hash = hashPassword_(newPassword, salt);
    getSheet_(CONFIG.ACCOUNTS_SHEET, ACCOUNT_HEADERS).getRange(account._row, 5, 1, 2).setValues([[salt, hash]]);
  } else if (!verifyPassword_(String(payload.password || ''), salt, hash)) {
    if (!payload.password && payload.newPassword) return { ok: false, code: 'PASSWORD_REQUIRED', error: 'تم تعيين كلمة سر لهذا الحساب بالفعل. أدخل كلمة السر الحالية.' };
    throw new Error('كلمة السر غير صحيحة.');
  }
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const expiresAt = Date.now() + CONFIG.SESSION_DAYS * 24 * 60 * 60 * 1000;
  PropertiesService.getScriptProperties().setProperty('SESSION_' + token, JSON.stringify({ phone: account.phone, expiresAt }));
  return { ok: true, sessionToken: token };
}

function getState_(phone) {
  const user = findAccountByPhone_(phone);
  if (!user) throw new Error('الحساب غير موجود.');
  const admin = isAdmin_(user);
  const accounts = admin ? getAccounts_() : [user];
  const trips = getTrips_().filter(t => admin || normalizePhone_(t.ownerPhone) === user.phone);
  return {
    user: publicAccount_(user),
    accounts: accounts.map(publicAccount_),
    trips: trips,
    allowance: Number(getSetting_('defaultAllowance', CONFIG.DEFAULT_ALLOWANCE))
  };
}

function ensureSheets_() {
  const ss = getSpreadsheet_();
  const accounts = getSheet_(CONFIG.ACCOUNTS_SHEET, ACCOUNT_HEADERS);
  migrateAccountsSheet_(accounts);
  const trips = getSheet_(CONFIG.TRIPS_SHEET, TRIP_HEADERS);
  const settings = getSheet_(CONFIG.SETTINGS_SHEET, SETTING_HEADERS);
  migrateSettingsSheet_(settings);
  if (accounts.getLastRow() < 2) {
    const rows = [];
    CONFIG.ADMIN_PHONES.forEach((phone, i) => rows.push([
      'admin_' + (i + 1), i === 0 ? 'علي رجب' : 'مشرف ' + (i + 1), normalizePhone_(phone), 'admin', '', '', '', new Date().toISOString()
    ]));
    INITIAL_REPS.forEach(rep => rows.push([rep.id, rep.name, normalizePhone_(rep.phone), rep.role, '', '', '', new Date().toISOString()]));
    if (rows.length) accounts.getRange(2, 1, rows.length, ACCOUNT_HEADERS.length).setValues(rows);
  } else {
    const existingPhones = getAccounts_().map(a => a.phone);
    CONFIG.ADMIN_PHONES.forEach((phone, i) => {
      const clean = normalizePhone_(phone);
      if (!existingPhones.includes(clean)) accounts.appendRow(['admin_' + (i + 1), i === 0 ? 'علي رجب' : 'مشرف ' + (i + 1), clean, 'admin', '', '', '', new Date().toISOString()]);
    });
  }
  if (settings.getLastRow() < 2) settings.appendRow(['defaultAllowance', CONFIG.DEFAULT_ALLOWANCE]);
  migrateJourneysSheet_(ss, trips);
  return ss;
}

function migrateAccountsSheet_(sh) {
  const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(v => String(v).trim().toLowerCase());
  if (header[0] === 'id' && header.includes('created') && !header.includes('passwordsalt')) {
    const oldRows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(5, sh.getLastColumn())).getValues() : [];
    const converted = oldRows.filter(r => r[2]).map(r => [r[0], r[1], normalizePhone_(r[2]), r[3] || 'rep', '', '', '', r[4] || '']);
    sh.clearContents();
    sh.getRange(1, 1, 1, ACCOUNT_HEADERS.length).setValues([ACCOUNT_HEADERS]);
    if (converted.length) sh.getRange(2, 1, converted.length, ACCOUNT_HEADERS.length).setValues(converted);
    sh.setFrozenRows(1);
  }
}

function migrateSettingsSheet_(sh) {
  const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(v => String(v).trim().toLowerCase());
  if (header[0] === 'default allowance') {
    const oldValue = sh.getLastRow() > 1 ? Number(sh.getRange(2, 1).getValue()) : CONFIG.DEFAULT_ALLOWANCE;
    sh.clearContents();
    sh.getRange(1, 1, 1, SETTING_HEADERS.length).setValues([SETTING_HEADERS]);
    sh.getRange(2, 1, 1, 2).setValues([['defaultAllowance', Number.isFinite(oldValue) ? oldValue : CONFIG.DEFAULT_ALLOWANCE]]);
    sh.setFrozenRows(1);
  }
}

function migrateJourneysSheet_(ss, tripsSheet) {
  if (tripsSheet.getLastRow() > 1) return;
  const oldSheet = ss.getSheetByName('Journeys');
  if (!oldSheet || oldSheet.getLastRow() < 2) return;
  const accountRows = getAccounts_();
  const byId = {};
  accountRows.forEach(a => { byId[String(a.id)] = a; });
  const oldRows = oldSheet.getDataRange().getValues().slice(1);
  const converted = oldRows.filter(r => r[0]).map(r => {
    const owner = byId[String(r[1])] || accountRows.find(a => a.name === String(r[2] || ''));
    const ownerPhone = owner ? owner.phone : normalizePhone_(r[1]);
    return [String(r[0]), ownerPhone, String(r[2] || ''), String(r[9] || ''), formatDate_(r[3]), String(r[5] || ''), String(r[4] || ''), Number(r[7]) || 0, String(r[9] || '')];
  });
  if (converted.length) tripsSheet.getRange(2, 1, converted.length, TRIP_HEADERS.length).setValues(converted);
}

function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('اربط Apps Script بملف Google Sheets أو ضع SPREADSHEET_ID في الإعدادات.');
  return active;
}

function getSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#123b35').setFontColor('#ffffff');
  }
  sh.setRightToLeft(true);
  if (name === CONFIG.ACCOUNTS_SHEET) sh.getRange('C:C').setNumberFormat('@');
  if (name === CONFIG.TRIPS_SHEET) sh.getRange('B:B').setNumberFormat('@');
  return sh;
}

function getAccounts_() {
  const sh = getSheet_(CONFIG.ACCOUNTS_SHEET, ACCOUNT_HEADERS);
  const values = sh.getDataRange().getValues();
  return values.slice(1).filter(row => row[2]).map((row, i) => accountFromRow_(row, i + 2));
}

function accountFromRow_(row, rowNumber) {
  return { id: String(row[0]), name: String(row[1]), phone: normalizePhone_(row[2]), role: isConfiguredAdmin_(row[2]) ? 'admin' : String(row[3] || 'rep'), passwordSalt: String(row[4] || ''), passwordHash: String(row[5] || ''), avatar: String(row[6] || ''), createdAt: String(row[7] || ''), _row: rowNumber };
}

function findAccountByPhone_(phone) {
  const clean = normalizePhone_(phone);
  return getAccounts_().find(account => account.phone === clean) || null;
}

function getTrips_() {
  const sh = getSheet_(CONFIG.TRIPS_SHEET, TRIP_HEADERS);
  const values = sh.getDataRange().getValues();
  return values.slice(1).filter(row => row[0]).map(row => ({
    id: String(row[0]), ownerPhone: normalizePhone_(row[1]), repName: String(row[2] || ''),
    timestamp: String(row[3] || ''), date: formatDate_(row[4]), place: String(row[5] || ''),
    client: String(row[6] || ''), allowance: Number(row[7]) || 0, createdAt: String(row[8] || '')
  }));
}

function formatDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(value || '').slice(0, 10);
}

function publicAccount_(account) {
  return { id: account.id, name: account.name, phone: account.phone, role: isAdmin_(account) ? 'admin' : 'rep', avatar: account.avatar || '', firstLogin: !account.passwordHash };
}

function isAdmin_(account) { return Boolean(account && (account.role === 'admin' || isConfiguredAdmin_(account.phone))); }
function isConfiguredAdmin_(phone) { return CONFIG.ADMIN_PHONES.map(normalizePhone_).includes(normalizePhone_(phone)); }
function normalizePhone_(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10 && /^(10|11|12|15)/.test(digits)) digits = '0' + digits;
  return digits;
}
function requireAdmin_(allowed) { if (!allowed) throw new Error('هذه العملية متاحة للمشرف فقط.'); }
function safeId_(value) { return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100); }

function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + String(password), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes);
}
function verifyPassword_(password, salt, expected) {
  if (!salt || !expected) return false;
  return hashPassword_(password, salt) === expected;
}

function getSession_(token) {
  if (!token) return null;
  const key = 'SESSION_' + safeId_(token);
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session.expiresAt || session.expiresAt < Date.now()) {
      PropertiesService.getScriptProperties().deleteProperty(key);
      return null;
    }
    return { phone: normalizePhone_(session.phone), key: key };
  } catch (_) { return null; }
}

function updateSessionPhone_(token, phone) {
  const session = getSession_(token);
  if (!session) throw new Error('انتهت الجلسة.');
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(session.key);
  const data = JSON.parse(raw);
  data.phone = normalizePhone_(phone);
  props.setProperty(session.key, JSON.stringify(data));
}

function getSetting_(key, fallback) {
  const sh = getSheet_(CONFIG.SETTINGS_SHEET, SETTING_HEADERS);
  const values = sh.getDataRange().getValues();
  const row = values.find((item, index) => index > 0 && String(item[0]) === key);
  return row ? row[1] : fallback;
}
function setSetting_(key, value) {
  const sh = getSheet_(CONFIG.SETTINGS_SHEET, SETTING_HEADERS);
  const values = sh.getDataRange().getValues();
  const index = values.findIndex((row, i) => i > 0 && String(row[0]) === key);
  if (index > 0) sh.getRange(index + 1, 2).setValue(value);
  else sh.appendRow([key, value]);
}


function writeCachedResult_(requestId, result) {
  const cache = CacheService.getScriptCache();
  const key = 'req_' + safeId_(requestId);
  const serialized = JSON.stringify(result);
  const chunkSize = 20000;
  if (serialized.length <= chunkSize) {
    cache.put(key, serialized, CONFIG.RESULT_CACHE_SECONDS);
    return;
  }
  const chunks = [];
  for (let i = 0; i < serialized.length; i += chunkSize) chunks.push(serialized.slice(i, i + chunkSize));
  if (chunks.length > 10) {
    cache.put(key, JSON.stringify({ ok: false, error: 'حجم البيانات كبير جدًا للتحميل دفعة واحدة. قلّل عدد السجلات أو اطلب تقسيمها.' }), CONFIG.RESULT_CACHE_SECONDS);
    return;
  }
  chunks.forEach((chunk, index) => cache.put(key + '_' + index, chunk, CONFIG.RESULT_CACHE_SECONDS));
  cache.put(key, JSON.stringify({ chunkCount: chunks.length }), CONFIG.RESULT_CACHE_SECONDS);
}

function readCachedResult_(requestId) {
  const cache = CacheService.getScriptCache();
  const key = 'req_' + safeId_(requestId);
  const value = cache.get(key);
  if (!value) return { pending: true };
  const meta = JSON.parse(value);
  if (!meta || !meta.chunkCount) return meta;
  let serialized = '';
  for (let i = 0; i < meta.chunkCount; i++) {
    const chunk = cache.get(key + '_' + i);
    if (chunk === null) return { pending: true };
    serialized += chunk;
  }
  return JSON.parse(serialized);
}

function output_(data, callback) {
  const json = JSON.stringify(data);
  if (callback && /^__delta_cb_[A-Za-z0-9_]+$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
