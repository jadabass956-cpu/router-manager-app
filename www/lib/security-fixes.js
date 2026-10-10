// ═══════════════════════════════════════════════════════════
// إصلاحات أمنية محسّنة — مستقلة عن security.js
// ═══════════════════════════════════════════════════════════
(function() {
  'use strict';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ═══ WPS ═══
  async function fixWPS(router) {
    const page = await router._req('/wlwps.htm');

    // استخرج localPin الحالي
    let localPin = '12345670';
    const pinMatch = page.body.match(/name=["']?localPin["']?[^>]*value=["']?([^"'\s>]+)/i);
    if (pinMatch) localPin = pinMatch[1];

    // ابني POST كامل
    const body = [
      'wlanDisabled=OFF',
      'config=1',
      'localPin=' + localPin,
      'peerPin=',
      'save=Apply+Changes',
      'submit.htm?wlwps.htm=Send',
      'disableWPS=ON',
    ].join('&');

    console.log('[fix-wps] POST:', body);
    await router._req('/form2Wsc.cgi', { method: 'POST', body });

    // انتظر 12 ثانية كاملة
    console.log('[fix-wps] waiting 12s for router restart...');
    await sleep(12000);

    // تحقق بمحاولة retry
    for (let i = 0; i < 3; i++) {
      try {
        const after = await router._req('/wlwps.htm');
        const m = after.body.match(/<input[^>]*name=["']?disableWPS["']?[^>]*>/i);
        const isDisabled = m && /\schecked/i.test(m[0]);
        console.log('[fix-wps] attempt ' + (i+1) + ': disabled =', isDisabled);
        if (isDisabled) return { ok: true, verified: true };
      } catch (e) {
        console.log('[fix-wps] verify attempt ' + (i+1) + ' failed:', e.message);
      }
      await sleep(3000);
    }
    return { ok: false, verified: true, reason: 'الراوتر لم يؤكد التعطيل' };
  }

  // ═══ UPnP ═══
  async function fixUPnP(router) {
    // اقرأ ext_if الحالي — الـ select فارغ في الـ HTML لكن قيمته معروفة
    let extIf = 'pppoe1';
    try {
      const page = await router._req('/upnp.htm');
      // ابحث عن option محدد
      const sel = page.body.match(/<select[^>]*name=["']?ext_if["']?[^>]*>([\s\S]*?)<\/select>/i);
      if (sel) {
        const selOpt = sel[1].match(/<option[^>]*value=["']?([^"'\s>]+)["']?[^>]*selected/i);
        if (selOpt && selOpt[1]) extIf = selOpt[1];
      }
      // جرّب من wan.htm إذا فاضي
      if (!extIf || extIf === '') {
        try {
          const wan = await router._req('/wan.htm');
          const m = wan.body.match(/postVC\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*['"]?([^'"]+)/);
          // ابحث عن "pppoe" في الصفحة
          const pppoe = wan.body.match(/(pppoe\d)/i);
          if (pppoe) extIf = pppoe[1];
        } catch (e) {}
      }
    } catch (e) {
      console.log('[fix-upnp] read error:', e.message);
    }

    if (!extIf) extIf = 'pppoe1';
    console.log('[fix-upnp] using ext_if =', extIf);

    const body = [
      'daemon=0',
      'ext_if=' + extIf,
      'submit.htm?upnp.htm=Send',
    ].join('&');

    console.log('[fix-upnp] POST:', body);
    await router._req('/form2Upnp.cgi', { method: 'POST', body });

    console.log('[fix-upnp] waiting 12s...');
    await sleep(12000);

    // تحقق
    for (let i = 0; i < 3; i++) {
      try {
        const after = await router._req('/upnp.htm');
        // نبحث عن daemon=0 محدد
        const re = /<input[^>]*type\s*=\s*["']?radio["']?[^>]*name\s*=\s*["']?daemon["']?[^>]*value\s*=\s*["']?0["']?[^>]*>/i;
        const m = after.body.match(re);
        const isZero = m && /\schecked/i.test(m[0]);
        const re1 = /<input[^>]*type\s*=\s*["']?radio["']?[^>]*name\s*=\s*["']?daemon["']?[^>]*value\s*=\s*["']?1["']?[^>]*>/i;
        const m1 = after.body.match(re1);
        const isOne = m1 && /\schecked/i.test(m1[0]);
        console.log('[fix-upnp] attempt ' + (i+1) + ': daemon=0 checked:', isZero, '| daemon=1 checked:', isOne);
        if (isZero && !isOne) return { ok: true, verified: true };
      } catch (e) {
        console.log('[fix-upnp] verify attempt ' + (i+1) + ' failed:', e.message);
      }
      await sleep(3000);
    }
    return { ok: false, verified: true, reason: 'الراوتر لم يؤكد التعطيل' };
  }

  // ═══ الإصلاح الجماعي — بدون انتظار داخل الـ queue ═══
  async function applyAllFixes(fixNames, onProgress) {
    const creds = window.appStore.getCredentials();
    if (!creds) throw new Error('بيانات الراوتر غير محفوظة');

    const router = new window.TPLinkRouter(creds);
    await router.login();

    const succeeded = [];
    const failed = [];

    for (let i = 0; i < fixNames.length; i++) {
      const name = fixNames[i];
      if (onProgress) onProgress(i, fixNames.length, name);
      try {
        let r;
        if (name === 'wps') r = await fixWPS(router);
        else if (name === 'upnp') r = await fixUPnP(router);
        else if (name === 'tr069') {
          failed.push({ name: name, error: 'TR-069 يُدار من المزود' });
          continue;
        } else {
          failed.push({ name: name, error: 'إصلاح غير معروف' });
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
