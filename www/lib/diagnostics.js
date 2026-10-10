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
    const div = document.createElement('div');
    div.id = 'diag-panel';
    div.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#0a0f1c;color:#e2e8f0;font-family:monospace;font-size:10px;border-top:1px solid #334155;z-index:99999;max-height:40vh;overflow:hidden;display:flex;flex-direction:column;';
    div.innerHTML = `
      <div style="padding:6px 10px;background:#1e293b;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:bold;">🔍 التشخيص</span>
        <div>
          <button onclick="document.getElementById('diag-panel').style.maxHeight = document.getElementById('diag-panel').style.maxHeight === '40vh' ? '60px' : '40vh'" style="background:#334155;color:#e2e8f0;border:none;padding:4px 8px;border-radius:4px;font-size:10px;cursor:pointer;">طي/فتح</button>
          <button onclick="window.diag.clear()" style="background:#dc2626;color:white;border:none;padding:4px 8px;border-radius:4px;font-size:10px;cursor:pointer;margin-left:4px;">مسح</button>
        </div>
      </div>
      <div class="diag-logs" style="padding:6px 10px;overflow-y:auto;flex:1;line-height:1.5;"></div>
    `;
    document.body.appendChild(div);
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
    logs: () => logs.slice(),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
