// نظام تشخيص — يعرض الأخطاء على الشاشة
(function() {
  'use strict';

  const logs = [];

  function timestamp() {
    return new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function log(level, ...args) {
    const msg = '[' + timestamp() + '] ' + args.map(a => {
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return String(a); } }
      return String(a);
    }).join(' ');
    logs.push({ level, msg, at: Date.now() });
    if (level === 'error') console.error(msg);
    else console.log(msg);
    updatePanel();
  }

  function updatePanel() {
    const panel = document.getElementById('diag-panel');
    if (!panel) return;
    const last = logs.slice(-20);
    panel.querySelector('.diag-logs').innerHTML = last.map(l => {
      const color = l.level === 'error' ? '#ef4444' : l.level === 'warn' ? '#f59e0b' : '#94a3b8';
      return '<div style="color:' + color + '">' + escapeHtml(l.msg) + '</div>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function createPanel() {
    if (document.getElementById('diag-panel')) return;

    // زر عائم صغير
    const btn = document.createElement('div');
    btn.id = 'diag-btn';
    btn.style.cssText = 'position:fixed;bottom:80px;left:12px;width:44px;height:44px;border-radius:50%;background:#1e293b;border:1px solid #334155;color:#e2e8f0;z-index:99998;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    btn.innerHTML = '🔍';
    btn.onclick = togglePanel;
    document.body.appendChild(btn);

    // اللوحة (مخفية افتراضيًا)
    const div = document.createElement('div');
    div.id = 'diag-panel';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,15,28,0.98);color:#e2e8f0;font-family:monospace;font-size:11px;z-index:99999;display:none;flex-direction:column;';
    div.innerHTML = `
      <div style="padding:10px 14px;background:#1e293b;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;">
        <span style="font-weight:bold;font-size:13px;">🔍 التشخيص</span>
        <div>
          <button onclick="window.diag.clear()" style="background:#dc2626;color:white;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;margin-left:6px;">مسح</button>
          <button onclick="window.diag.close()" style="background:#334155;color:#e2e8f0;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">إغلاق ✕</button>
        </div>
      </div>
      <div class="diag-logs" style="padding:10px 14px;overflow-y:auto;flex:1;line-height:1.7;font-size:11px;white-space:pre-wrap;word-break:break-all;"></div>
    `;
    document.body.appendChild(div);
  }

  function togglePanel() {
    const panel = document.getElementById('diag-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    updatePanel();
  }

  function init() {
    createPanel();
    log('info', 'Diagnostics ready');
    log('info', 'Native: ' + (window.http ? window.http.isNative : '?'));
    log('info', 'Credentials: ' + (window.appStore && window.appStore.getCredentials() ? 'YES' : 'NO'));

    // اعتراض الأخطاء
    window.addEventListener('error', (e) => {
      log('error', 'JS ERROR: ' + e.message + ' @ ' + (e.filename || '?') + ':' + (e.lineno || '?'));
    });

    window.addEventListener('unhandledrejection', (e) => {
      log('error', 'PROMISE: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
    });

    // اعتراض console
    const origErr = console.error.bind(console);
    console.error = function(...args) {
      log('error', ...args);
      origErr(...args);
    };

    const origWarn = console.warn.bind(console);
    console.warn = function(...args) {
      log('warn', ...args);
      origWarn(...args);
    };
  }

  window.diag = {
    log: (msg) => log('info', msg),
    error: (msg) => log('error', msg),
    warn: (msg) => log('warn', msg),
    clear: () => { logs.length = 0; updatePanel(); },
    close: () => { const p = document.getElementById('diag-panel'); if (p) p.style.display = 'none'; },
    open: () => togglePanel(),
    logs: () => logs.slice(),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
