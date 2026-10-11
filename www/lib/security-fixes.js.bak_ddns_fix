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

  // ═══ DDNS ═══
  async function fixDDNS(router) {
    // نرسل delacc لحذف الحساب (يعطل DDNS)
    const page = await router._req('/ddns.htm');
    const html = page.body;

    // استخرج قيم الفورم الحالية
    const hostname = (html.match(/name=["']?hostname["']?[^>]*value=["']?([^"'\s>]*)/i) || [])[1] || '';
    const ddnsProv = (html.match(/<select[^>]*name=["']?ddnsProv["']?[^>]*>([\s\S]*?)<\/select>/i) || [])[1];
    let provValue = '0';
    if (ddnsProv) {
      const sel = ddnsProv.match(/<option[^>]*value=["']?([^"'\s>]*)["']?[^>]*selected/i);
      if (sel) provValue = sel[1];
    }

    const iface = (html.match(/<select[^>]*name=["']?interface["']?[^>]*>([\s\S]*?)<\/select>/i) || [])[1];
    let ifaceValue = '13';
    if (iface) {
      const sel = iface.match(/<option[^>]*value=["']?([^"'\s>]*)["']?[^>]*selected/i);
      if (sel) ifaceValue = sel[1];
    }

    // POST بحذف الحساب
    const body = [
      enc('ddnsProv', provValue),
      enc('interface', ifaceValue),
      enc('hostname', hostname),
      enc('username', ''),
      enc('password', ''),
      enc('email', ''),
      enc('key', ''),
      enc('delacc', 'Remove'),
      enc('submit.htm?ddns.htm', 'Send'),
    ].join('&');

    console.log('[fix-ddns] POST:', body);
    await router._req('/form2Ddns.cgi', { method: 'POST', body });
    await sleep(10000);

    // تحقق
    for (let i = 0; i < 3; i++) {
      try { await router.login(); } catch (e) {}
      try {
        const after = await router._req('/ddns.htm');
        const m = after.body.match(/<input[^>]*name=["']?enable["']?[^>]*>/i);
        const isEnabled = m && /\schecked/i.test(m[0]);
        console.log('[fix-ddns] attempt ' + (i+1) + ': enabled =', isEnabled);
        if (!isEnabled) return { ok: true };
      } catch (e) {
        console.log('[fix-ddns] err:', e.message);
      }
      await sleep(3000);
    }
    return { ok: false, reason: 'DDNS لم يُغلق' };
  }

  // ═══ SNMP (تغيير كلمات المجتمع) ═══
  async function fixSNMP(router) {
    const page = await router._req('/snmp.htm');
    const html = page.body;

    // استخرج الحقول الحالية
    const sysName = (html.match(/name=["']?snmpSysName["']?[^>]*value=["']?([^"'\s>]*)/i) || [])[1] || 'Router';

    // كلمات مجتمع قوية عشوائية
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    function randStr(n) {
      let s = '';
      for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    }
    const newRO = 'ro_' + randStr(10);
    const newRW = 'rw_' + randStr(10);

    // نسجل القيم الجديدة في localStorage للمستخدم
    window.appStore.set('snmp-communities', { ro: newRO, rw: newRW, at: Date.now() });

    // لا نرسل snmpEnabled (يعني معطّل)
    const body = [
      enc('snmpSysName', sysName),
      enc('snmpSysContact', ''),
      enc('snmpSysLocation', ''),
      enc('snmpTrapIpAddr', ''),
      enc('snmpCommunityRO', newRO),
      enc('snmpCommunityRW', newRW),
      enc('save', 'Apply Changes'),
      enc('submit.htm?snmp.htm', 'Send'),
    ].join('&');

    console.log('[fix-snmp] POST:', body);
    await router._req('/form2Snmp.cgi', { method: 'POST', body });
    await sleep(8000);

    // تحقق — كلمة المجتمع الجديدة موجودة؟
    for (let i = 0; i < 3; i++) {
      try { await router.login(); } catch (e) {}
      try {
        const after = await router._req('/snmp.htm');
        const roMatch = after.body.match(/name=["']?snmpCommunityRO["']?[^>]*value=["']?([^"'\s>]*)/i);
        const currentRO = roMatch ? roMatch[1] : '';
        console.log('[fix-snmp] attempt ' + (i+1) + ': currentRO =', currentRO);
        if (currentRO === newRO) return { ok: true, ro: newRO, rw: newRW };
      } catch (e) {
        console.log('[fix-snmp] err:', e.message);
      }
      await sleep(3000);
    }
    return { ok: false, reason: 'SNMP لم يحفظ' };
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
        else if (name === 'ddns') r = await fixDDNS(router);
        else if (name === 'snmp') r = await fixSNMP(router);
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

  window.securityFixes = { fixWPS, fixUPnP, fixDDNS, fixSNMP, applyAllFixes };
  console.log('[security-fixes] ready');
})();
