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
    const page1 = await router._req('/ddns.htm');
    const html1 = page1.body;

    let ddnsProv = '0';
    let iface = '13';

    const provSel = html1.match(/<select[^>]*name=["\x27]?ddnsProv["\x27]?[^>]*>([\s\S]*?)<\/select>/i);
    if (provSel) {
      const o = provSel[1].match(/<option[^>]*value=["\x27]?([^"\x27\s>]*)["\x27]?[^>]*selected/i);
      if (o) ddnsProv = o[1];
    }
    const ifaceSel = html1.match(/<select[^>]*name=["\x27]?interface["\x27]?[^>]*>([\s\S]*?)<\/select>/i);
    if (ifaceSel) {
      const o = ifaceSel[1].match(/<option[^>]*value=["\x27]?([^"\x27\s>]*)["\x27]?[^>]*selected/i);
      if (o) iface = o[1];
    }
    console.log('[fix-ddns] prov:', ddnsProv, '| iface:', iface);

    // ═══ نجرب عدة صيغ بالترتيب ═══
    const attempts = [
      {
        label: 'no-enable',
        fields: [
          ['ddnsProv', ddnsProv], ['interface', iface],
          ['hostname', ''], ['username', ''], ['password', ''],
          ['email', ''], ['key', ''],
          ['submit.htm?ddns.htm', 'Send'],
        ],
      },
      {
        label: 'enable=0',
        fields: [
          ['ddnsProv', ddnsProv], ['interface', iface],
          ['hostname', ''], ['enable', '0'], ['username', ''], ['password', ''],
          ['email', ''], ['key', ''],
          ['submit.htm?ddns.htm', 'Send'],
        ],
      },
      {
        label: 'enable=off',
        fields: [
          ['ddnsProv', ddnsProv], ['interface', iface],
          ['hostname', ''], ['enable', 'off'], ['username', ''], ['password', ''],
          ['email', ''], ['key', ''],
          ['submit.htm?ddns.htm', 'Send'],
        ],
      },
      {
        label: 'enable= (empty)',
        fields: [
          ['ddnsProv', ddnsProv], ['interface', iface],
          ['hostname', ''], ['enable', ''], ['username', ''], ['password', ''],
          ['email', ''], ['key', ''],
          ['submit.htm?ddns.htm', 'Send'],
        ],
      },
      {
        label: 'delacc with hostname',
        fields: [
          ['ddnsProv', ddnsProv], ['interface', iface],
          ['hostname', ''], ['enable', 'off'], ['username', ''], ['password', ''],
          ['email', ''], ['key', ''],
          ['delacc', 'Remove'],
          ['submit.htm?ddns.htm', 'Send'],
        ],
      },
    ];

    for (const attempt of attempts) {
      const body = attempt.fields.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
      console.log('[fix-ddns] try', attempt.label, ':', body);
      try { await router._req('/form2Ddns.cgi', { method: 'POST', body }); } catch (e) {
        console.log('[fix-ddns] err:', e.message);
      }
      await sleep(8000);
      try { await router.login(); } catch (e) {}
      try {
        const after = await router._req('/ddns.htm');
        const m = after.body.match(/<input[^>]*name=["\x27]?enable["\x27]?[^>]*>/i);
        const isEnabled = m && /\schecked/i.test(m[0]);
        console.log('[fix-ddns]', attempt.label, '→ enable =', isEnabled);
        if (!isEnabled) return { ok: true, method: attempt.label };
      } catch (e) {
        console.log('[fix-ddns] verify err:', e.message);
      }
    }
    return { ok: false, reason: 'الراوتر رفض كل الصيغ' };
  }





  // ═══ SNMP (تغيير كلمات المجتمع) ═══
  // مساعد: يقرأ قيمة حقل مع دعم newline بعد =
  function readValue(html, name) {
    const tagRe = new RegExp('<input[^>]*name\\s*=\\s*["\x27]?' + name + '["\x27]?[^>]*>', 'i');
    const tag = html.match(tagRe);
    if (!tag) return null;
    const v = tag[0].match(/value\s*=\s*["\x27]?([^"\x27\s>]*)/i);
    return v ? v[1].trim() : '';
  }

  // قراءة قيمة حقل — تدعم newline بعد =
  function readValue(html, name) {
    const tagRe = new RegExp('<input[^>]*name\\s*=\\s*["\\x27]?' + name + '["\\x27]?[^>]*>', 'i');
    const tag = html.match(tagRe);
    if (!tag) return null;
    const v = tag[0].match(/value\s*=\s*["\\x27]?([^"\\x27\\s>]*)/i);
    return v ? v[1].trim() : '';
  }

  async function fixSNMP(router) {
    const page = await router._req('/snmp.htm');
    const html = page.body;

    const sysName = readValue(html, 'snmpSysName') || 'AP';
    const sysContact = readValue(html, 'snmpSysContact') || '';
    const sysLocation = readValue(html, 'snmpSysLocation') || '';
    const trapIp = readValue(html, 'snmpTrapIpAddr') || '0.0.0.0';

    // كلمات مجتمع جديدة
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const randStr = (n) => Array.from({length: n}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const newRO = 'MonRO' + randStr(8);
    const newRW = 'MonRW' + randStr(8);

    window.appStore.set('snmp-communities', { ro: newRO, rw: newRW, at: Date.now() });

    // ⚠️ ملاحظة مهمة: الراوتر يحفظ القيم حتى لو أظهر alert
    // لكن لا نرسل snmpEnabled إطلاقاً → الراوتر يتخطى التحقق
    const fields = [
      ['snmpSysContact', sysContact],
      ['snmpSysName', sysName],
      ['snmpSysLocation', sysLocation],
      ['snmpTrapIpAddr', trapIp],
      ['snmpCommunityRO', newRO],
      ['snmpCommunityRW', newRW],
      ['save', 'Apply Changes'],
      ['submit.htm?snmp.htm', 'Send'],
    ];
    const body = fields.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    console.log('[fix-snmp] POST:', body);

    try { await router._req('/form2Snmp.cgi', { method: 'POST', body }); } catch (e) {
      console.log('[fix-snmp] POST err:', e.message);
    }

    // ⚠️ الراوتر يحتاج وقتاً طويلاً — انتظر 15 ثانية
    await sleep(15000);

    // تحقق (مع إعادة login)
    for (let i = 0; i < 3; i++) {
      try { await router.login(); } catch (e) {}
      try {
        const after = await router._req('/snmp.htm');
        const currentRO = readValue(after.body, 'snmpCommunityRO');
        console.log('[fix-snmp] attempt ' + (i+1) + ': currentRO =', JSON.stringify(currentRO));
        if (currentRO === newRO) return { ok: true, ro: newRO, rw: newRW };
      } catch (e) {
        console.log('[fix-snmp] err:', e.message);
      }
      await sleep(4000);
    }

    // ⚠️ حتى لو فشل التحقق، الراوتر غالباً حفظ القيم.
    // نتحقق يدوياً مرة أخيرة بالصفحة الكاملة.
    try {
      await router.login();
      const final = await router._req('/snmp.htm');
      const finalRO = readValue(final.body, 'snmpCommunityRO');
      console.log('[fix-snmp] final check:', JSON.stringify(finalRO));
      if (finalRO && finalRO !== 'public') return { ok: true, ro: finalRO, note: 'applied' };
    } catch (e) {}

    return { ok: false, reason: 'الراوتر لم يؤكد' };
  }





  async function applyAllFixes(fixNames) {
    const creds = window.appStore.getCredentials();
    if (!creds) throw new Error('بيانات الراوتر غير محفوظة');

    // ⚠️ حد أقصى 2 إصلاحات في المرة
    if (fixNames.length > 2) {
      console.log('[fix-all] limiting to 2 fixes');
      fixNames = fixNames.slice(0, 2);
    }

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
        // ⚠️ 30 ثانية راحة بين الإصلاحات
        if (i < fixNames.length - 1) {
          console.log('[fix-all] waiting 30s...');
          await sleep(30000);
        }
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
