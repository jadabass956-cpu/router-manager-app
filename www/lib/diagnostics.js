// نظام تشخيص — يعرض الأخطاء على الشاشة (بدون حلقة لا نهائية)
(function() {
  'use strict';

  const logs = [];

  // نحتفظ بنسخ أصلية قبل أي استبدال
  const nativeLog = console.log.bind(console);
  const nativeErr = console.error.bind(console);
  const nativeWarn = console.warn.bind(console);

  function timestamp() {
    return new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function format(args) {
    return args.map(a => {
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return String(a); } }
      return String(a);
    }).join(' ');
  }

  // ⚠️ لا يستخدم console.* — فقط nativeLog لتجنب الحلقة
  function push(level, msg) {
    logs.push({ level, msg, at: Date.now() });
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    updatePanel();
  }

  function updatePanel() {
    const panel = document.getElementById('diag-panel');
    if (!panel) return;
    const box = panel.querySelector('.diag-logs');
    if (!box) return;
    const last = logs.slice(-100);
    box.innerHTML = last.map(l => {
      const color = l.level === 'error' ? '#ef4444' : l.level === 'warn' ? '#f59e0b' : '#94a3b8';
      const esc = String(l.msg).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      return '<div style="color:' + color + '">' + esc + '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function createPanel() {
    if (document.getElementById('diag-panel')) return;

    const btn = document.createElement('div');
    btn.id = 'diag-btn';
    btn.style.cssText = 'position:fixed;top:80px;left:12px;width:44px;height:44px;border-radius:50%;background:#1e293b;border:1px solid #334155;color:#e2e8f0;z-index:99998;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    btn.innerHTML = '🔍';
    btn.onclick = togglePanel;
    document.body.appendChild(btn);

    const div = document.createElement('div');
    div.id = 'diag-panel';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,15,28,0.98);color:#e2e8f0;font-family:monospace;font-size:11px;z-index:99999;display:none;flex-direction:column;';
    div.innerHTML = '<div style="padding:10px 14px;background:#1e293b;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;">' +
      '<span style="font-weight:bold;font-size:13px;">🔍 التشخيص</span>' +
      '<div>' +
      '<button onclick="window.diag.clear()" style="background:#dc2626;color:white;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;margin-left:6px;">مسح</button>' +
      '<button onclick="window.diag.close()" style="background:#334155;color:#e2e8f0;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">إغلاق ✕</button>' +
      '</div></div>' +
      '<div class="diag-logs" style="padding:10px 14px;overflow-y:auto;flex:1;line-height:1.7;white-space:pre-wrap;word-break:break-all;"></div>';
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
    push('info', 'Diagnostics ready — native: ' + (window.http ? window.http.isNative : '?'));
    push('info', 'Credentials: ' + (window.appStore && window.appStore.getCredentials() ? 'YES' : 'NO'));

    // اعتراض الأخطاء — لا نستخدم console.* داخليًا
    window.addEventListener('error', (e) => {
      push('error', 'JS ERROR: ' + e.message + ' @ ' + (e.filename || '?') + ':' + (e.lineno || '?'));
    });

    window.addEventListener('unhandledrejection', (e) => {
      push('error', 'PROMISE: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
    });

    // اعتراض console (مع تجنب الحلقة)
    console.error = function(...args) {
      push('error', format(args));
      nativeErr(...args);
    };
    console.warn = function(...args) {
      push('warn', format(args));
      nativeWarn(...args);
    };
    console.log = function(...args) {
      push('info', format(args));
      nativeLog(...args);
    };

    // اعتراض fetch (لاحقًا، بعد api.js)
    setTimeout(() => {
      if (window.fetch && !window.__fetchWrapped) {
        const origFetch = window.fetch.bind(window);
        window.fetch = async function(url, opts) {
          const str = String(url);
          const t0 = performance.now();
          try {
            const res = await origFetch(url, opts);
            const dt = Math.round(performance.now() - t0);
            push('info', 'FETCH ' + str + ' → ' + res.status + ' (' + dt + 'ms)');
            return res;
          } catch (e) {
            const dt = Math.round(performance.now() - t0);
            push('error', 'FETCH FAIL ' + str + ' (' + dt + 'ms): ' + e.message);
            throw e;
          }
        };
        window.__fetchWrapped = true;
      }
    }, 100);
  }

  window.diag = {
    log: (msg) => push('info', msg),
    error: (msg) => push('error', msg),
    warn: (msg) => push('warn', msg),
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
