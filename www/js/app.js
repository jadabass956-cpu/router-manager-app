// Stage 2 — إعداد واختبار الاتصال بالراوتر
const STORAGE_KEY = 'router_config';

function log(msg) {
  const el = document.getElementById('log');
  const t = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  el.textContent += '\n[' + t + '] ' + msg;
  el.scrollTop = el.scrollHeight;
  console.log(msg);
}

function showOutput(text) {
  const el = document.getElementById('output');
  el.classList.remove('hidden');
  el.textContent = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
  console.log('[output]', text);
}

function setStatus(type, text) {
  const el = document.getElementById('connection-status');
  el.className = 'status ' + type;
  el.innerHTML = '<span class="dot"></span><span>' + text + '</span>';
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

function showSetup() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('main-screen').classList.add('hidden');
}

function showMain(cfg) {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-screen').classList.remove('hidden');
  log('الراوتر: ' + cfg.host + ' | المستخدم: ' + cfg.username);
}

async function saveAndTest() {
  const host = document.getElementById('host').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!host || !username || !password) {
    alert('كل الحقول مطلوبة');
    return;
  }

  log('حفظ البيانات…');
  saveConfig({ host, username, password });
  showMain({ host, username });
  await testConnection();
}

async function testConnection() {
  const cfg = loadConfig();
  if (!cfg) { showSetup(); return; }

  setStatus('info', 'جاري الاتصال…');
  log('محاولة الاتصال بـ ' + cfg.host);

  try {
    const router = new window.TPLinkRouter(cfg);
    await router.login();
    log('✅ تم تسجيل الدخول بنجاح');
    setStatus('ok', 'متصل بـ ' + cfg.host);

    // قراءة سريعة — عنوان الصفحة
    const res = await window.http.get('http://' + cfg.host.replace(/^https?:\/\//, '') + '/index.htm');
    const titleM = res.body.match(/<title>([^<]+)/i);
    showOutput('الاتصال ناجح ✅\n\n' +
      'الراوتر: ' + cfg.host + '\n' +
      'المستخدم: ' + cfg.username + '\n' +
      'العنوان: ' + (titleM ? titleM[1] : '?') + '\n' +
      'حجم الصفحة: ' + res.body.length + ' حرف');

    await router.logout();
    log('تم إنهاء الجلسة');
  } catch (e) {
    log('❌ فشل: ' + e.message);
    setStatus('err', e.message);
    showOutput('خطأ:\n' + e.message + '\n\n' +
      'تحقق من:\n- اتصال الواي فاي\n- عنوان الراوتر\n- بيانات الدخول');
  }
}

async function testMacFilter() {
  const cfg = loadConfig();
  if (!cfg) return;

  setStatus('info', 'قراءة فلترة MAC…');
  log('قراءة قائمة MAC…');

  try {
    const router = new window.TPLinkRouter(cfg);
    await router.login();
    const data = await router.getMacFilter();
    await router.logout();

    setStatus('ok', 'تم — الوضع: ' + data.mode);
    showOutput('فلترة MAC:\n' +
      'الوضع: ' + data.mode + '\n' +
      'عدد العناوين: ' + data.macs.length + '\n' +
      (data.macs.length > 0 ? '\n' + data.macs.join('\n') : ''));
    log('الوضع: ' + data.mode + ' | عدد: ' + data.macs.length);
  } catch (e) {
    log('❌ فشل: ' + e.message);
    setStatus('err', e.message);
  }
}

function testMd5() {
  log('اختبار MD5:');
  const tests = ['admin', '1234', 'password', 'Admin'];
  let out = 'MD5 tests:\n\n';
  for (const t of tests) {
    const h = window.MD5(t);
    out += 'MD5("' + t + '") = ' + h + '\n';
    log('  MD5("' + t + '") = ' + h);
  }
  out += '\nالتوقع: MD5("admin") = 21232f297a57a5a743894a0e4a801fc3\n';
  out += 'التوقع: MD5("1234") = 81dc9bdb52d04dc20036dbd8313ed055\n';
  showOutput(out);
}

async function testDirectLogin() {
  const cfg = loadConfig();
  if (!cfg) { showSetup(); return; }
  setStatus('info', 'اختبار دخول مباشر…');
  log('اختبار POST /login.cgi مباشرة');
  const u = window.MD5(cfg.username);
  const p = window.MD5(cfg.password);
  const body = 'usernameEncrypt=' + u + '&passwordEncrypt=' + p + '&submit.htm%3Flogin.htm=Send';
  log('MD5(username) = ' + u);
  log('MD5(password) = ' + p);
  log('POST body: ' + body);
  try {
    const res = await window.http.post('http://' + cfg.host + '/login.cgi', body);
    log('login.cgi status: ' + res.status);
    log('login.cgi headers: ' + JSON.stringify(res.headers));
    log('login.cgi body (500): ' + (res.body || '').slice(0, 500));
    const check = await window.http.get('http://' + cfg.host + '/index.htm');
    log('index.htm status: ' + check.status);
    log('index.htm body (300): ' + (check.body || '').slice(0, 300));
    showOutput(
      'اختبار دخول مباشر\n\n' +
      '=== POST /login.cgi ===\n' +
      'Status: ' + res.status + '\n' +
      'Headers: ' + JSON.stringify(res.headers, null, 2) + '\n\n' +
      '=== Body (500 chars) ===\n' +
      (res.body || '').slice(0, 500) + '\n\n' +
      '=== GET /index.htm ===\n' +
      'Status: ' + check.status + '\n' +
      'Body (300 chars):\n' +
      (check.body || '').slice(0, 300)
    );
  } catch (e) {
    log('❌ ' + e.message);
    showOutput('فشل:\n' + e.message);
    setStatus('err', e.message);
  }
}

function resetConfig() {
  if (!confirm('حذف بيانات الراوتر والعودة لشاشة الإعداد؟')) return;
  clearConfig();
  window.http.clearCookies();
  log('تم حذف الإعدادات');
  showSetup();
}

// ═══ startup ═══
document.addEventListener('DOMContentLoaded', () => {
  log('التطبيق بدأ — native: ' + (window.http && window.http.isNative));
  const cfg = loadConfig();
  if (cfg) {
    showMain(cfg);
    // اختبار تلقائي بعد فتح
    setTimeout(() => testConnection(), 500);
  } else {
    showSetup();
  }
});
