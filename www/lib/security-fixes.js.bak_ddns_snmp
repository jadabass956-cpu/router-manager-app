// ═══════════════════════════════════════════════════════════
// إصلاحات أمنية — ترتيب صحيح للحقول
// ═══════════════════════════════════════════════════════════
(function() {
  'use strict';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // encoder بسيط (بدون ترتيب أبجدي)
  function enc(k, v) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(v);
  }

  async function login(h_or_router, host) {
    if (typeof h_or_router === 'string') {
      // legacy path
    }
    // ...
  }

  // ═══ WPS ═══
  async function fixWPS(router) {
    const page = await router._req('/wlwps.htm');
    let localPin = '12345670';
    const m = page.body.match(/name=["']?localPin["']?[^>]*value=["']?([^"'\s>]+)/i);
    if (m) localPin = m[1];

    // ⚠️ ترتيب مهم: disableWPS أولاً
    const body = [
      enc('disableWPS', 'ON'),
      enc('wlanDisabled', 'OFF'),
      enc('config', '1'),
      enc('localPin', localPin),
      enc('peerPin', ''),
      enc('save', 'Apply Changes'),
      enc('submit.htm?wlwps.htm', 'Send'),
    ].join('&');

    console.log('[fix-wps] POST:', body);
    await router._req('/form2Wsc.cgi', { method: 'POST', body });

    console.log('[fix-wps] waiting 10s...');
    await sleep(10000);

    // تحقق
    for (let i = 0; i < 3; i++) {
      try { await router.login(); } catch (e) {}
      try {
        const after = await router._req('/wlwps.htm');
        const chk = after.body.match(/<input[^>]*name=["']?disableWPS["']?[^>]*>/i);
        const isDisabled = chk && /\schecked/i.test(chk[0]);
        console.log('[fix-wps] attempt ' + (i+1) + ':', isDisabled);
        if (isDisabled) return { ok: true };
      } catch (e) {
        console.log('[fix-wps] err:', e.message);
      }
      await sleep(3000);
    }
    return { ok: false, reason: 'الراوتر لم يؤكد التعطيل' };
  }

  // ═══ UPnP ═══
  async function fixUPnP(router) {
    let extIf = 'pppoe1';
    try {
      const wan = await router._req('/wan.htm');
      const p = wan.body.match(/(pppoe\d)/i);
      if (p) extIf = p[1];
    } catch (e) {}

    // الترتيب: daemon أولاً ثم ext_if
    const body = [
      enc('daemon', '0'),
      enc('ext_if', extIf),
      enc('submit.htm?upnp.htm', 'Send'),
    ].join('&');

    console.log('[fix-upnp] POST:', body);
    await router._req('/form2Upnp.cgi', { method: 'POST', body });

    console.log('[fix-upnp] waiting 10s...');
    await sleep(10000);

    for (let i = 0; i < 3; i++) {
      try { await router.login(); } catch (e) {}
      try {
        const after = await router._req('/upnp.htm');
        const re0 = /<input[^>]*name\s*=\s*["']?daemon["']?[^>]*value\s*=\s*["']?0["']?[^>]*>/i;
        const re1 = /<input[^>]*name\s*=\s*["']?daemon["']?[^>]*value\s*=\s*["']?1["']?[^>]*>/i;
        const m0 = after.body.match(re0);
        const m1 = after.body.match(re1);
        const isZero = m0 && /\schecked/i.test(m0[0]);
        const isOne = m1 && /\schecked/i.test(m1[0]);
        console.log('[fix-upnp] attempt ' + (i+1) + ': daemon=0:', isZero, 'daemon=1:', isOne);
        if (isZero && !isOne) return { ok: true };
      } catch (e) {
        console.log('[fix-upnp] err:', e.message);
      }
      await sleep(3000);
    }
    return { ok: false, reason: 'الراوتر لم يؤكد التعطيل' };
  }

  async function applyAllFixes(fixNames) {
    const creds = window.appStore.getCredentials();
    if (!creds) throw new Error('بيانات الراوتر غير محفوظة');

    const router = new window.TPLinkRouter(creds);
    await router.login();

    const succeeded = [];
    const failed = [];

    for (let i = 0; i < fixNames.length; i++) {
      const name = fixNames[i];
      try {
        let r;
        if (name === 'wps') r = await fixWPS(router);
        else if (name === 'upnp') r = await fixUPnP(router);
        else if (name === 'tr069') {
          failed.push({ name: name, error: 'TR-069 يُدار من المزود' });
          continue;
        } else {
          failed.push({ name: name, error: 'غير معروف' });
          continue;
        }
        if (r && r.ok) succeeded.push(name);
        else failed.push({ name: name, error: r && r.reason || 'لم يتم التأكيد' });
        await sleep(2000);
      } catch (e) {
        failed.push({ name: name, error: e.message });
      }
    }

    try { await router.logout(); } catch (e) {}
    return { succeeded, failed };
  }

  window.securityFixes = { fixWPS, fixUPnP, applyAllFixes };
  console.log('[security-fixes] ready');
})();
