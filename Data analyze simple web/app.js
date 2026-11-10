'use strict';

/* ==================== STORAGE KEYS ==================== */
const LS = {
  users:  'payroll.users.v1',
  data:   'payroll.data.v1',
  checks: 'payroll.checks.v1',
};
const SS = { session: 'payroll.session.v1' };

const DEFAULT_ADMIN = { username: 'admin', password: 'admin123', displayName: 'المدير', role: 'admin' };
const DEFAULT_PASSWORDS = ['admin123', '1234'];

/* ==================== COLUMN ALIASES ==================== */
const COLUMN_ALIASES = {
  name: ['name', 'اسم', 'الاسم', 'اسم الموظف', 'الموظف', 'employee', 'employee name', 'full name', 'الاسم الكامل'],
  abcen: ['abcen', 'absent', 'absence', 'غياب', 'الغياب', 'أيام الغياب', 'ايام الغياب', 'absence days', 'absent days'],
  minus: ['minus', 'deduction', 'deductions', 'خصم', 'الخصم', 'الخصومات', 'خصومات'],
  salary: ['salary', 'basic', 'basic salary', 'راتب', 'الراتب', 'الراتب الأساسي', 'راتب اساسي', 'الراتب الاساسي'],
  natSalary: ['natsalary', 'net salary', 'netsalary', 'net', 'صافي', 'الصافي', 'صافي الراتب', 'الراتب الصافي', 'net pay'],
};

/* ==================== HELPERS ==================== */
function norm(s) {
  return String(s ?? '')
    .toString()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\s\-_./\\]+/g, '')
    .trim();
}

const ALIAS_MAP = (() => {
  const m = new Map();
  for (const [field, list] of Object.entries(COLUMN_ALIASES))
    for (const a of list) m.set(norm(a), field);
  return m;
})();

const NF = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = n => NF.format(Number(n) || 0);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v)
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[^\d.-]/g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function mapHeaders(keys) {
  const out = {};
  for (const k of keys) {
    const f = ALIAS_MAP.get(norm(k));
    if (f && out[f] === undefined) out[f] = k;
  }
  return out;
}

function safeJSON(v) { try { return v ? JSON.parse(v) : null; } catch { return null; } }

/* ==================== STATE ==================== */
const state = { users: [], data: null, checks: {}, session: null };

function loadState() {
  const users = safeJSON(localStorage.getItem(LS.users));
  state.users = Array.isArray(users) ? users : [];
  if (!state.users.some(u => u.username === 'admin' && u.role === 'admin'))
    state.users.push({ ...DEFAULT_ADMIN });

  const data = safeJSON(localStorage.getItem(LS.data));
  state.data = data && Array.isArray(data.rows) ? data : null;

  const checks = safeJSON(localStorage.getItem(LS.checks));
  state.checks = checks && typeof checks === 'object' ? checks : {};

  state.session = safeJSON(sessionStorage.getItem(SS.session));
  saveUsers();
}
function saveUsers()  { localStorage.setItem(LS.users, JSON.stringify(state.users)); }
function saveData()   { localStorage.setItem(LS.data, JSON.stringify(state.data)); }
function saveChecks() { localStorage.setItem(LS.checks, JSON.stringify(state.checks)); }
function saveAll()    { saveUsers(); saveData(); saveChecks(); }

function currentUser() {
  if (!state.session?.username) return null;
  return state.users.find(u => u.username === state.session.username) || null;
}

/* ==================== AUTH ==================== */
function doLogin(username, password) {
  const u = state.users.find(x => x.username.toLowerCase() === username.toLowerCase());
  if (!u) return { ok: false, msg: 'اسم المستخدم غير موجود' };
  if (u.password !== password) return { ok: false, msg: 'كلمة المرور غير صحيحة' };
  state.session = { username: u.username };
  sessionStorage.setItem(SS.session, JSON.stringify(state.session));
  return { ok: true, user: u };
}

function doLogout() {
  state.session = null;
  sessionStorage.removeItem(SS.session);
  render();
}

/* ==================== RENDER ==================== */
function render() {
  const user = currentUser();
  const login = document.getElementById('loginView');
  const app = document.getElementById('appView');

  if (!user) {
    login.classList.remove('hidden');
    app.classList.add('hidden');
    return;
  }

  login.classList.add('hidden');
  app.classList.remove('hidden');

  document.getElementById('whoami').textContent = `${user.displayName} • ${user.username}`;
  document.getElementById('pwBanner').classList.toggle('hidden', !DEFAULT_PASSWORDS.includes(user.password));

  const isAdmin = user.role === 'admin';
  document.getElementById('adminPanel').classList.toggle('hidden', !isAdmin);
  document.getElementById('userPanel').classList.toggle('hidden', isAdmin);

  if (isAdmin) renderAdmin();
  else renderUser(user);
}

function renderAdmin() {
  const d = state.data;
  const rows = d?.rows || [];

  /* ---- stats ---- */
  const totalSalary = rows.reduce((s, r) => s + (r.salary || 0), 0);
  const totalMinus = rows.reduce((s, r) => s + (r.minus || 0), 0);
  const totalNet   = rows.reduce((s, r) => s + (r.natSalary || 0), 0);
  const totalAbs   = rows.reduce((s, r) => s + (r.abcen || 0), 0);
  const mismatch   = rows.filter(r => Math.abs((r.salary || 0) - (r.minus || 0) - (r.natSalary || 0)) > 0.5).length;
  const okCount    = rows.filter(r => state.checks[norm(r.name)]?.status === 'ok').length;
  const objCount   = rows.filter(r => state.checks[norm(r.name)]?.status === 'objection').length;

  document.getElementById('stats').innerHTML = `
    <div class="stat"><span>عدد الموظفين</span><strong>${rows.length}</strong></div>
    <div class="stat"><span>إجمالي الرواتب</span><strong>${fmt(totalSalary)}</strong></div>
    <div class="stat"><span>إجمالي الخصومات</span><strong>${fmt(totalMinus)}</strong></div>
    <div class="stat"><span>إجمالي الصافي</span><strong>${fmt(totalNet)}</strong></div>
    <div class="stat"><span>إجمالي أيام الغياب</span><strong>${totalAbs}</strong></div>
    <div class="stat warn"><span>فروقات في الصافي</span><strong>${mismatch}</strong></div>
    <div class="stat ok"><span>تم التأكيد</span><strong>${okCount}</strong></div>
    <div class="stat bad"><span>اعتراضات</span><strong>${objCount}</strong></div>
  `;

  document.getElementById('metaInfo').textContent = d
    ? `الشهر: ${d.month || '—'} • عدد الصفوف: ${d.rows.length} • الاستيراد: ${new Date(d.importedAt).toLocaleString('ar-EG')}`
    : 'لم يتم استيراد أي ملف بعد.';

  /* ---- data table ---- */
  const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  const filtered = rows.filter(r => {
    if (!q) return true;
    const u = state.users.find(u => norm(u.displayName) === norm(r.name));
    return r.name.toLowerCase().includes(q) || (u && u.username.toLowerCase().includes(q));
  });

  const tbody = document.querySelector('#dataTable tbody');
  tbody.innerHTML = filtered.map((r, i) => {
    const user = state.users.find(u => norm(u.displayName) === norm(r.name));
    const chk  = state.checks[norm(r.name)];
    const net  = (r.salary || 0) - (r.minus || 0);
    const bad  = Math.abs(net - (r.natSalary || 0)) > 0.5;
    const status = chk
      ? (chk.status === 'ok'
          ? '<span class="badge ok">✔️ مؤكد</span>'
          : `<span class="badge bad" title="${escapeHtml(chk.note || '')}">✖️ اعتراض</span>`)
      : '<span class="badge">— بانتظار</span>';
    return `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${r.abcen ?? 0}</td>
      <td>${fmt(r.minus)}</td>
      <td>${fmt(r.salary)}</td>
      <td>${fmt(r.natSalary)}</td>
      <td class="${bad ? 'mismatch' : ''}">${fmt(net)} ${bad ? '⚠️' : ''}</td>
      <td><code>${user ? escapeHtml(user.username) : '—'}</code></td>
      <td>${status}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="9" class="empty">لا توجد بيانات</td></tr>`;

  document.querySelector('#dataTable tfoot').innerHTML = `<tr>
    <th colspan="2">الإجمالي (${filtered.length})</th>
    <th>${filtered.reduce((s, r) => s + (r.abcen || 0), 0)}</th>
    <th>${fmt(filtered.reduce((s, r) => s + (r.minus || 0), 0))}</th>
    <th>${fmt(filtered.reduce((s, r) => s + (r.salary || 0), 0))}</th>
    <th>${fmt(filtered.reduce((s, r) => s + (r.natSalary || 0), 0))}</th>
    <th>${fmt(filtered.reduce((s, r) => s + ((r.salary || 0) - (r.minus || 0)), 0))}</th>
    <th colspan="2"></th>
  </tr>`;

  /* ---- users table ---- */
  const me = currentUser();
  document.querySelector('#usersTable tbody').innerHTML = state.users.map(u => `
    <tr>
      <td><code>${escapeHtml(u.username)}</code></td>
      <td>${escapeHtml(u.displayName)}</td>
      <td>${u.role === 'admin' ? 'مدير' : 'موظف'}</td>
      <td><code>${escapeHtml(u.password)}</code></td>
      <td>${u.username === me?.username
          ? '<span class="muted">—</span>'
          : `<button class="btn sm danger" data-action="delete-user" data-username="${escapeHtml(u.username)}">حذف</button>`}
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="empty">لا يوجد مستخدمون</td></tr>`;
}

function renderUser(user) {
  const meta   = document.getElementById('userMeta');
  const card   = document.getElementById('userCard');
  const status = document.getElementById('checkStatus');
  const note   = document.getElementById('noteInput');
  const btnOk  = document.getElementById('btnOk');
  const btnObj = document.getElementById('btnObjection');

  if (!state.data) {
    meta.textContent = 'لم يتم استيراد أي بيانات بعد. يُرجى الانتظار حتى يقوم المدير برفع الملف.';
    card.innerHTML = '';
    status.textContent = '';
    btnOk.disabled = btnObj.disabled = true;
    return;
  }

  meta.textContent = `الشهر: ${state.data.month || '—'} • تاريخ الاستيراد: ${new Date(state.data.importedAt).toLocaleString('ar-EG')}`;

  const rows = state.data.rows.filter(r => norm(r.name) === norm(user.displayName));
  if (!rows.length) {
    card.innerHTML = `<div class="empty">لم يتم العثور على بيانات مطابقة لاسمك (<strong>${escapeHtml(user.displayName)}</strong>). تواصل مع المدير.</div>`;
    status.textContent = '';
    btnOk.disabled = btnObj.disabled = true;
    return;
  }

  card.innerHTML = rows.map(r => {
    const net = (r.salary || 0) - (r.minus || 0);
    const bad = Math.abs(net - (r.natSalary || 0)) > 0.5;
    return `<div class="salary-card">
      <div class="salary-head">
        <strong>${escapeHtml(r.name)}</strong>
        ${bad ? '<span class="badge warn">⚠️ فرق في الصافي</span>' : '<span class="badge ok">✔️ مطابق</span>'}
      </div>
      <div class="grid">
        <div><span class="k">الراتب</span><span class="v">${fmt(r.salary)}</span></div>
        <div><span class="k">أيام الغياب</span><span class="v">${r.abcen ?? 0}</span></div>
        <div><span class="k">الخصم</span><span class="v">${fmt(r.minus)}</span></div>
        <div><span class="k">صافي (الملف)</span><span class="v">${fmt(r.natSalary)}</span></div>
        <div><span class="k">الصافي المحسوب</span><span class="v">${fmt(net)}</span></div>
      </div>
    </div>`;
  }).join('');

  const key = norm(user.displayName);
  const chk = state.checks[key];
  if (chk) {
    status.className = 'msg ' + (chk.status === 'ok' ? 'success' : 'error');
    status.textContent = chk.status === 'ok'
      ? '✅ تم تأكيد صحة بياناتك.'
      : `✖️ تم إرسال اعتراض: ${chk.note || '(بدون ملاحظة)'}`;
    note.value = chk.note || '';
  } else {
    status.className = 'msg';
    status.textContent = '';
    note.value = '';
  }
  btnOk.disabled = btnObj.disabled = false;
}

/* ==================== IMPORT ==================== */
async function handleFile(file) {
  const msg = document.getElementById('importMsg');
  msg.className = 'msg';
  msg.textContent = 'جارٍ قراءة الملف...';

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!json.length) throw new Error('الملف لا يحتوي على بيانات');

    const headerMap = mapHeaders(Object.keys(json[0]));
    if (!headerMap.name) throw new Error('لم يتم العثور على عمود الاسم');
    if (!headerMap.salary) throw new Error('لم يتم العثور على عمود الراتب');

    const month = document.getElementById('monthInput').value.trim() || currentMonth();

    const rows = json.map((r, i) => ({
      id: 'r' + i,
      name: String(r[headerMap.name] ?? '').trim(),
      abcen: toNum(r[headerMap.abcen]),
      minus: toNum(r[headerMap.minus]),
      salary: toNum(r[headerMap.salary]),
      natSalary: toNum(r[headerMap.natSalary]),
    })).filter(r => r.name);

    if (!rows.length) throw new Error('لا توجد أسماء صالحة في الملف');

    const oldMonth = state.data?.month;
    state.data = { month, importedAt: Date.now(), rows };
    if (oldMonth && oldMonth !== month) state.checks = {};

    /* regenerate employee accounts, keep admins */
    const admins = state.users.filter(u => u.role === 'admin');
    const used = new Set(admins.map(a => a.username.toLowerCase()));
    const next = [...admins];
    let counter = 1;
    for (const r of rows) {
      let uname;
      do { uname = 'emp' + counter++; } while (used.has(uname.toLowerCase()));
      used.add(uname.toLowerCase());
      next.push({ username: uname, password: '1234', displayName: r.name, role: 'user' });
    }
    state.users = next;

    saveAll();
    msg.className = 'msg success';
    msg.textContent = `✅ تم استيراد ${rows.length} صف بنجاح، وتم إنشاء ${rows.length} حساب مستخدم.`;
    renderAdmin();
  } catch (e) {
    msg.className = 'msg error';
    msg.textContent = '❌ ' + (e.message || 'خطأ في قراءة الملف');
  }
}

/* ==================== EXPORT ==================== */
function exportExcel() {
  if (!state.data?.rows?.length) return toast('لا توجد بيانات للتصدير');

  const out = state.data.rows.map(r => {
    const net = (r.salary || 0) - (r.minus || 0);
    const chk = state.checks[norm(r.name)];
    const usr = state.users.find(u => norm(u.displayName) === norm(r.name));
    return {
      'الاسم': r.name,
      'الغياب': r.abcen,
      'الخصم': r.minus,
      'الراتب': r.salary,
      'صافي الراتب': r.natSalary,
      'الصافي المحسوب': net,
      'المستخدم': usr?.username || '',
      'الحالة': chk ? (chk.status === 'ok' ? 'مؤكد' : 'اعتراض') : 'بانتظار',
      'ملاحظة': chk?.note || '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(out);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الرواتب');
  XLSX.writeFile(wb, `الرواتب-${state.data.month || 'export'}.xlsx`);
}

/* ==================== USER MANAGEMENT ==================== */
function addUser() {
  const dn = document.getElementById('newUserDisplay').value.trim();
  const un = document.getElementById('newUserUsername').value.trim();
  const pw = document.getElementById('newUserPass').value;
  const role = document.getElementById('newUserRole').value;
  const msg = document.getElementById('addUserMsg');

  if (!dn || !un || !pw) {
    msg.className = 'msg error';
    msg.textContent = 'جميع الحقول مطلوبة';
    return;
  }
  if (state.users.some(u => u.username.toLowerCase() === un.toLowerCase())) {
    msg.className = 'msg error';
    msg.textContent = 'اسم المستخدم موجود بالفعل';
    return;
  }

  state.users.push({ username: un, password: pw, displayName: dn, role });
  saveUsers();

  msg.className = 'msg success';
  msg.textContent = '✅ تمت إضافة الحساب';
  document.getElementById('newUserDisplay').value = '';
  document.getElementById('newUserUsername').value = '';
  document.getElementById('newUserPass').value = '';
  renderAdmin();
}

function deleteUser(username) {
  const u = state.users.find(x => x.username === username);
  if (!u) return;
  if (u.username === currentUser()?.username) return toast('لا يمكنك حذف حسابك');
  if (u.role === 'admin' && state.users.filter(x => x.role === 'admin').length <= 1)
    return toast('لا يمكن حذف آخر مدير');
  if (!confirm(`حذف المستخدم ${u.username}؟`)) return;

  state.users = state.users.filter(x => x.username !== username);
  saveUsers();
  renderAdmin();
}

/* ==================== USER VERIFICATION ==================== */
function markUser(status) {
  const user = currentUser();
  if (!user) return;

  const key = norm(user.displayName);
  const note = document.getElementById('noteInput').value.trim();

  if (status === 'objection' && !note && !confirm('لم تكتب ملاحظة. إرسال الاعتراض بدون ملاحظة؟'))
    return;

  state.checks[key] = { status, note, at: Date.now() };
  saveChecks();
  renderUser(user);
  toast(status === 'ok' ? 'تم تأكيد البيانات ✅' : 'تم إرسال الاعتراض ✖️');
}

/* ==================== PASSWORD ==================== */
function openPassDialog() {
  document.getElementById('oldPass').value = '';
  document.getElementById('newPass').value = '';
  document.getElementById('newPass2').value = '';
  document.getElementById('passMsg').textContent = '';
  document.getElementById('passDialog').showModal();
}

function savePass() {
  const user = currentUser();
  if (!user) return;
  const msg = document.getElementById('passMsg');
  const oldP = document.getElementById('oldPass').value;
  const np  = document.getElementById('newPass').value;
  const np2 = document.getElementById('newPass2').value;

  if (oldP !== user.password) { msg.textContent = 'كلمة المرور الحالية غير صحيحة'; return; }
  if (np.length < 4)          { msg.textContent = 'كلمة المرور الجديدة قصيرة جداً (4 أحرف على الأقل)'; return; }
  if (np !== np2)             { msg.textContent = 'تأكيد كلمة المرور غير مطابق'; return; }

  user.password = np;
  saveUsers();
  document.getElementById('passDialog').close();
  toast('تم تغيير كلمة المرور');
  render();
}

/* ==================== TOAST ==================== */
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

/* ==================== EVENTS ==================== */
function bindEvents() {
  /* login */
  document.getElementById('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value;
    const res = doLogin(u, p);
    const msg = document.getElementById('loginMsg');
    if (!res.ok) { msg.className = 'msg error'; msg.textContent = res.msg; return; }
    msg.textContent = '';
    document.getElementById('loginPass').value = '';
    render();
  });

  /* logout */
  document.getElementById('btnLogout').addEventListener('click', doLogout);

  /* change password */
  document.getElementById('btnChangePass').addEventListener('click', openPassDialog);
  document.getElementById('btnChangePass2').addEventListener('click', openPassDialog);
  document.getElementById('passCancel').addEventListener('click', () => document.getElementById('passDialog').close());
  document.getElementById('passSave').addEventListener('click', savePass);

  /* file input */
  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) handleFile(f);
    fileInput.value = '';
  });

  /* drag & drop */
  const drop = document.getElementById('dropZone');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault();
    drop.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault();
    drop.classList.remove('drag');
  }));
  drop.addEventListener('drop', e => {
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  /* search */
  document.getElementById('searchInput').addEventListener('input', () => {
    if (currentUser()?.role === 'admin') renderAdmin();
  });

  /* export / clear */
  document.getElementById('btnExport').addEventListener('click', exportExcel);
  document.getElementById('btnClear').addEventListener('click', () => {
    if (!state.data) return toast('لا توجد بيانات');
    if (!confirm('حذف جميع البيانات المستوردة؟ (لن تُحذف الحسابات)')) return;
    state.data = null;
    state.checks = {};
    saveAll();
    renderAdmin();
  });

  /* add user */
  document.getElementById('btnAddUser').addEventListener('click', addUser);

  /* user verification buttons */
  document.getElementById('btnOk').addEventListener('click', () => markUser('ok'));
  document.getElementById('btnObjection').addEventListener('click', () => markUser('objection'));

  /* delegated: delete user */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action="delete-user"]');
    if (el) deleteUser(el.dataset.username);
  });
}

/* ==================== INIT ==================== */
function init() {
  loadState();
  bindEvents();

  const monthInput = document.getElementById('monthInput');
  monthInput.value = state.data?.month || currentMonth();

  if (state.session?.username && !state.users.find(u => u.username === state.session.username)) {
    state.session = null;
    sessionStorage.removeItem(SS.session);
  }
  render();
}

document.addEventListener('DOMContentLoaded', init);