// ═══════════════════════════════════════════════════════════
// Security Service — فحص ثغرات وأمان راوتر TP-Link
// ═══════════════════════════════════════════════════════════
(function() {
  'use strict';

  const SEV = {
    CRITICAL: 'critical',  // خطر فوري — أحمر
    HIGH: 'high',          // مهم — برتقالي
    MEDIUM: 'medium',      // تحذير — أصفر
    LOW: 'low',            // معلومة — رمادي
    OK: 'ok',              // آمن — أخضر
  };

  const SEV_LABEL = {
    critical: '🔴 خطر حرج',
    high: '🟠 خطر',
    medium: '🟡 تحذير',
    low: '⚪ معلومة',
    ok: '🟢 آمن',
  };

  const SEV_COLOR = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    low: '#64748b',
    ok: '#16a34a',
  };

  // ═══════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════
  function findInput(html, name) {
    const re = new RegExp('<input[^>]*name\\s*=\\s*["\']?' + name + '["\']?[^>]*>', 'i');
    const m = html.match(re);
    return m ? m[0] : null;
  }

  function isChecked(inputHtml) {
    return inputHtml && /\schecked/i.test(inputHtml);
  }

  function getCheckedValue(html, name) {
    // يرجع قيمة الـ radio/checkbox المفحوص
    const re = new RegExp('<input[^>]*type\\s*=\\s*["\']?(radio|checkbox)["\']?[^>]*name\\s*=\\s*["\']?' + name + '["\']?[^>]*>', 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
      if (/\schecked/i.test(m[0])) {
        const vm = m[0].match(/value\s*=\s*["\']?([^"\'\s>]*)/i);
        return vm ? vm[1] : '';
      }
    }
    return null;
  }

  function isEnabledByValue(html, name, enabledValues) {
    // مفعّل فقط إذا كانت القيمة المفحوصة في قائمة القيم المفعّلة
    const v = getCheckedValue(html, name);
    if (v === null) return false;
    return enabledValues.includes(v.toLowerCase());
  }

  function isSelectEnabled(html, name) {
    // للـ backward compat — لكن يجب استخدام isEnabledByValue
    return getCheckedValue(html, name) !== null;
  }

  function getInputValue(html, name) {
    const re = new RegExp('<input[^>]*name\\s*=\\s*["\']?' + name + '["\']?[^>]*value\\s*=\\s*["\']?([^"\'>]*)', 'i');
    const m = html.match(re);
    return m ? m[1].trim() : '';
  }

  function getSelectedRadio(html, name) {
    const re = new RegExp('<input[^>]*type\\s*=\\s*["\']?radio["\']?[^>]*name\\s*=\\s*["\']?' + name + '["\']?[^>]*value\\s*=\\s*["\']?([^"\'\s>]+)["\']?[^>]*>', 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
      if (/\schecked/i.test(m[0])) return m[1];
    }
    return null;
  }

  // ═══════════════════════════════════════════
  // Individual Checks
  // ═══════════════════════════════════════════
  async function checkWPS(router) {
    try {
      const r = await _reqWithRetry(router, '/wlwps.htm');
      const html = r.body;

      // disableWPS checkbox: ON = WPS معطّل
      const disableInput = findInput(html, 'disableWPS');
      const disabled = isChecked(disableInput);

      if (disabled) {
        return {
          id: 'wps',
          severity: SEV.OK,
          title: 'WPS معطّل',
          description: 'خاصية WPS مغلقة — لن يتمكن أحد من استخدام ثغراتها المعروفة.',
          fixable: false,
        };
      }

      return {
        id: 'wps',
        severity: SEV.CRITICAL,
        title: '⚠️ WPS مفعّل — خطر اختراق',
        description: 'WPS يحتوي على ثغرات معروفة (PixieDust, PIN Brute Force) تسمح باختراق الشبكة في دقائق. يجب إغلاقه فوراً.',
        fixable: true,
        fixLabel: 'إغلاق WPS الآن',
        fixAction: { url: '/api/security/fix/wps' },
      };
    } catch (e) {
      return { id: 'wps', severity: SEV.LOW, title: 'تعذر فحص WPS', description: e.message };
    }
  }

  async function checkUPnP(router) {
    try {
      const r = await router._req('/upnp.htm');
      const html = r.body;

      // 🔍 LOG: نطبع HTML الفعلي
      const form = html.match(/<form[^>]*name=["']?upnp["']?[^>]*>([\s\S]*?)<\/form>/i);
      if (form) {
        const daemons = [...form[1].matchAll(/<input[^>]*name=["']?daemon["']?[^>]*>/gi)].map(m => m[0]);
        console.log('[checkUPnP] daemon inputs:', JSON.stringify(daemons));
      }

      const enabled = isEnabledByValue(html, 'daemon', ['1', 'on', 'enable', 'enabled']);
      console.log('[checkUPnP] enabled:', enabled, '| checkedValue:', getCheckedValue(html, 'daemon'));

      if (!enabled) {
        return {
          id: 'upnp',
          severity: SEV.OK,
          title: 'UPnP معطّل',
          description: 'الراوتر لا يفتح منافذ تلقائياً.',
        };
      }

      return {
        id: 'upnp',
        severity: SEV.HIGH,
        title: 'UPnP مفعّل — خطر',
        description: 'UPnP يسمح لأي تطبيق على الشبكة (بما فيها برامج خبيثة) بفتح منافذ في الراوتر تلقائياً بدون علمك.',
        fixable: true,
        fixLabel: 'إغلاق UPnP',
        fixAction: { url: '/api/security/fix/upnp' },
      };
    } catch (e) {
      return { id: 'upnp', severity: SEV.LOW, title: 'تعذر فحص UPnP', description: e.message };
    }
  }



  async function checkTR069(router) {
    try {
      const r = await _reqWithRetry(router, '/tr069.htm');
      const html = r.body;

      const enabled = isEnabledByValue(html, 'cwmpserverenable', ['1', 'on', 'enable', 'enabled']);
      const url = getInputValue(html, 'cwmpserverurl');
      const user = getInputValue(html, 'cwmpserveruser');
      const port = getInputValue(html, 'cwmpconreqport');

      if (!enabled) {
        return {
          id: 'tr069',
          severity: SEV.OK,
          title: 'TR-069 معطّل',
          description: 'بروتوكول التحكم عن بعد مغلق — الراوتر غير معرض للتحكم الخارجي.',
        };
      }

      // مفعّل + URL موجود = خطر
      if (url && url.length > 5) {
        return {
          id: 'tr069',
          severity: SEV.CRITICAL,
          title: '🚨 TR-069 مفعّل بعنوان خارجي!',
          description: 'الراوتر متصل بسيرفر تحكم عن بعد:\n' + url + '\n\nهذا مؤشر اختراق محتمل. أغلق TR-069 فوراً.',
          fixable: true,
          fixLabel: 'إغلاق TR-069',
          fixAction: { url: '/api/security/fix/tr069' },
        };
      }

      // مفعّل + URL فاضي = خامل
      return {
        id: 'tr069',
        severity: SEV.MEDIUM,
        title: 'TR-069 مفعّل (خامل)',
        description: 'TR-069 مفعّل لكن بدون عنوان — الراوتر في انتظار أوامر. أغلق هذا البروتوكول للأمان.',
        fixable: true,
        fixLabel: 'إغلاق TR-069',
        fixAction: { url: '/api/security/fix/tr069' },
      };
    } catch (e) {
      return { id: 'tr069', severity: SEV.LOW, title: 'تعذر فحص TR-069', description: e.message };
    }
  }

  async function checkSNMP(router) {
    try {
      const r = await router._req('/snmp.htm');
      const html = r.body;
      const enabled = isEnabledByValue(html, 'snmpEnabled', ['1', 'on', 'enable', 'enabled']);
      const communityRO = getInputValue(html, 'snmpCommunityRO');
      const communityRW = getInputValue(html, 'snmpCommunityRW');
      const weakCommunities = ['public', 'private', 'admin', 'cisco', 'manager'];

      if (!enabled) {
        const hasWeakCommunity = weakCommunities.includes(communityRO.toLowerCase())
                              || weakCommunities.includes(communityRW.toLowerCase());
        if (hasWeakCommunity) {
          return {
            id: 'snmp',
            severity: SEV.LOW,
            title: 'SNMP معطّل — كلمة مجتمع افتراضية',
            description: 'SNMP مغلق حالياً (آمن). كلمة المجتمع "' + communityRO + '" افتراضية — تغييرها إجراء وقائي.',
            fixable: true,
            fixLabel: 'تغيير كلمات المجتمع',
            fixAction: { url: '/api/security/fix/snmp' },
          };
        }
        return { id: 'snmp', severity: SEV.OK, title: 'SNMP معطّل', description: 'البروتوكول مغلق — لا خطر.' };
      }

      const weak = weakCommunities.includes(communityRO.toLowerCase())
                || weakCommunities.includes(communityRW.toLowerCase());
      if (weak) {
        return {
          id: 'snmp',
          severity: SEV.CRITICAL,
          title: '🚨 SNMP مفعّل بكلمة مرور افتراضية!',
          description: 'كلمة المجتمع: "' + communityRO + '" / "' + communityRW + '"\nأي شخص على الشبكة يمكنه قراءة إعدادات الراوتر أو تعديلها.',
        };
      }

      return {
        id: 'snmp',
        severity: SEV.HIGH,
        title: 'SNMP مفعّل',
        description: 'بروتوكول إدارة الشبكة مفتوح — يُنصح بإغلاقه إذا لم تستخدمه.',
      };
    } catch (e) {
      return { id: 'snmp', severity: SEV.LOW, title: 'تعذر فحص SNMP', description: e.message };
    }
  }

  async function checkDDNS(router) {
    try {
      const r = await router._req('/ddns.htm');
      const html = r.body;

      // اقرأ hostname + username
      const hnM = html.match(/<input[^>]*name=["\x27]?hostname["\x27]?[^>]*value\s*=\s*["\x27]?([^"\x27\s>]*)/i);
      const unM = html.match(/<input[^>]*name=["\x27]?username["\x27]?[^>]*value\s*=\s*["\x27]?([^"\x27\s>]*)/i);
      const hostname = hnM ? hnM[1] : '';
      const username = unM ? unM[1] : '';

      // اقرأ الجدول — هل فيه صفوف؟
      const tbodyMatch = html.match(/<table[^>]*Dynamic DDNS Table[^>]*>([\s\S]*?)<\/table>/i)
        || html.match(/Dynamic DDNS Table[\s\S]{0,5000}?<\/table>/i);
      const tableHasRows = tbodyMatch
        ? /<tr[^>]*>[\s\S]{0,500}(?:pppoe|DynDNS|dyndns|hostname)/i.test(tbodyMatch[1])
        : false;

      // التقييم الواقعي
      const actuallyActive = hostname && hostname.length > 0 && username && username.length > 0;

      if (!actuallyActive) {
        return {
          id: 'ddns',
          severity: SEV.OK,
          title: 'DDNS معطّل فعلياً',
          description: 'الراوتر يعرض خيار "تفعيل" لكن لا يوجد hostname أو حساب مربوط.\nهذا يعني أن IP منزلك لا يُكشف للإنترنت.',
        };
      }

      return {
        id: 'ddns',
        severity: SEV.MEDIUM,
        title: 'DDNS مفعّل فعلياً',
        description: 'هناك حساب DDNS مربوط:\n• المضيف: ' + hostname + '\n• المستخدم: ' + username + '\n\nيكشف IP منزلك للإنترنت عبر اسم نطاق. استخدمه فقط إذا كنت تحتاجه.',
        fixable: true,
        fixLabel: 'إزالة الحساب',
        fixAction: { url: '/api/security/fix/ddns' },
      };
    } catch (e) {
      return { id: 'ddns', severity: SEV.LOW, title: 'تعذر فحص DDNS', description: e.message };
    }
  }



  async function checkWiFiEncryption(router) {
    try {
      const wifi = await router.getWifiSettings();
      const enc = wifi.encryption || 'None';

      if (enc === 'None') {
        return {
          id: 'wifi-enc',
          severity: SEV.CRITICAL,
          title: '🚨 الشبكة بدون تشفير!',
          description: 'أي شخص قريب من المنزل يمكنه الدخول لشبكتك واستخدام الإنترنت. فعّل WPA2/WPA3 فوراً.',
          fixable: true,
          fixLabel: 'الانتقال إلى الإعدادات',
          fixAction: { navigate: 'wifi' },
        };
      }

      if (enc === 'WEP') {
        return {
          id: 'wifi-enc',
          severity: SEV.CRITICAL,
          title: '🚨 تشفير WEP مكسور!',
          description: 'WEP يمكن كسره في أقل من دقيقة بأدوات مجانية. غيّر إلى WPA2/WPA3 فوراً.',
          fixable: true,
          fixLabel: 'الانتقال إلى الإعدادات',
          fixAction: { navigate: 'wifi' },
        };
      }

      if (enc.startsWith('WPA-')) {
        return {
          id: 'wifi-enc',
          severity: SEV.HIGH,
          title: 'WPA (TKIP) قديم',
          description: 'WPA الأصلي قديم وضعيف. يُنصح بالترقية إلى WPA2-AES أو WPA3.',
          fixable: true,
          fixLabel: 'الانتقال إلى الإعدادات',
          fixAction: { navigate: 'wifi' },
        };
      }

      return {
        id: 'wifi-enc',
        severity: SEV.OK,
        title: 'تشفير قوي: ' + enc,
        description: 'شبكة WiFi محمية بتشفير حديث.',
      };
    } catch (e) {
      return { id: 'wifi-enc', severity: SEV.LOW, title: 'تعذر فحص التشفير', description: e.message };
    }
  }

  async function checkMacFilter(router) {
    try {
      const filter = await router.getMacFilter();
      if (filter.mode === 'disabled') {
        return {
          id: 'mac-filter',
          severity: SEV.LOW,
          title: 'فلترة MAC معطّلة',
          description: 'أي جهاز يعرف كلمة المرور يمكنه الاتصال. لطبقة حماية إضافية، فعّل "سماح فقط" مع إضافة أجهزتك.',
        };
      }
      return {
        id: 'mac-filter',
        severity: SEV.OK,
        title: 'فلترة MAC مفعّلة (' + filter.mode + ')',
        description: 'عدد الأجهزة المسموح/المحظور: ' + filter.macs.length,
      };
    } catch (e) {
      return { id: 'mac-filter', severity: SEV.LOW, title: 'تعذر فحص فلترة MAC', description: e.message };
    }
  }

  async function checkRemoteAdmin(router) {
    try {
      // محاولة فحص HTTP Remote Management على منفذ 80/8080 من الخارج
      // هنا نكتفي بفحص صفحة /sysadmin أو ما يشابهها
      // في TD-W8961N، الوصول عن بعد عبر TR-069 أو قواعد port forwarding
      // سنعتبر هذا الفحص مكتملاً عبر TR-069 + firewall
      return null;
    } catch (e) { return null; }
  }

  // ═══════════════════════════════════════════
  // Smart Form Builder — يقرأ كل حقول الفورم
  // ═══════════════════════════════════════════
  function buildFormBody(html, formName, overrides) {
    overrides = overrides || {};
    var formRe = new RegExp('<form[^>]*name\\s*=\\s*["\x27]?' + formName + '["\x27]?[^>]*>([\\s\\S]*?)<\\/form>', 'i');
    var fm = html.match(formRe);
    if (!fm) return null;

    var fields = {};
    var inner = fm[1];

    // inputs
    var inputRe = /<input([^>]*)>/gi;
    var mi;
    while ((mi = inputRe.exec(inner)) !== null) {
      var attrs = mi[1];
      var typeM = attrs.match(/type\s*=\s*["\x27]?([^"\x27\s>]+)/i);
      var type = typeM ? typeM[1].toLowerCase() : 'text';
      var nameM = attrs.match(/name\s*=\s*["\x27]?([^"\x27\s>]+)/i);
      if (!nameM) continue;
      var name = nameM[1];
      var valueM = attrs.match(/value\s*=\s*["\x27]?([^"\x27>]*)/i);
      var value = valueM ? valueM[1] : '';
      var isChecked = /\schecked/i.test(attrs);

      if (type === 'checkbox' || type === 'radio') {
        if (isChecked) fields[name] = value;
      } else if (type === 'submit') {
        if (/apply|send|save/i.test(value)) fields[name] = value;
      } else if (type === 'reset' || type === 'button') {
        // skip
      } else {
        fields[name] = value;
      }
    }

    // selects
    var selectRe = /<select([^>]*)>([\s\S]*?)<\/select>/gi;
    var ms;
    while ((ms = selectRe.exec(inner)) !== null) {
      var sAttrs = ms[1];
      var sBody = ms[2];
      var sNameM = sAttrs.match(/name\s*=\s*["\x27]?([^"\x27\s>]+)/i);
      if (!sNameM) continue;
      var sName = sNameM[1];
      var selOpt = sBody.match(/<option[^>]*value\s*=\s*["\x27]?([^"\x27\s>]*)["\x27]?[^>]*selected/i);
      if (selOpt) fields[sName] = selOpt[1];
      else {
        var firstOpt = sBody.match(/<option[^>]*value\s*=\s*["\x27]?([^"\x27\s>]*)["\x27]?/i);
        if (firstOpt) fields[sName] = firstOpt[1];
      }
    }

    // overrides
    Object.keys(overrides).forEach(function(k) {
      var v = overrides[k];
      if (v === null || v === undefined || v === false) {
        delete fields[k];
      } else if (v === true) {
        fields[k] = fields[k] || 'ON';
      } else {
        fields[k] = v;
      }
    });

    return Object.keys(fields)
      .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(fields[k]); })
      .join('&');
  }

  // ═══════════════════════════════════════════
  // Retry helpers (بعد إعادة تشغيل HTTP في الراوتر)
  // ═══════════════════════════════════════════
  async function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function _reqWithRetry(router, path, opts, retries = 3) {
    let lastErr = null;
    for (let i = 0; i < retries; i++) {
      try {
        return await router._req(path, opts);
      } catch (e) {
        lastErr = e;
        console.log('[security] retry ' + (i+1) + '/' + retries + ' for ' + path + ': ' + e.message);
        await _sleep(3000);
        // جرب login مرة أخرى لو الجلسة انتهت
        try { await router.login(); } catch (le) {}
      }
    }
    throw lastErr;
  }

  // ═══════════════════════════════════════════
  // Main Scan
  // ═══════════════════════════════════════════
  async function runFullScan() {
    const results = [];
    const creds = window.appStore.getCredentials();
    if (!creds) throw new Error('بيانات الراوتر غير محفوظة');

    const router = new window.TPLinkRouter(creds);
    await router.login();

    try {
      // الفحوصات — بالتسلسل (لأن الراوتر لا يقبل متوازي)
      const checks = [
        checkWiFiEncryption,
        checkWPS,
        checkUPnP,
        checkTR069,
        checkSNMP,
        checkDDNS,
        checkMacFilter,
      ];

      for (const check of checks) {
        try {
          const r = await check(router);
          if (r) results.push(r);
          // تأخير صغير
          await new Promise(res => setTimeout(res, 200));
        } catch (e) {
          console.warn('[security] check failed:', e.message);
        }
      }
    } finally {
      try { await router.logout(); } catch (e) {}
    }

    // ترتيب حسب الخطورة
    const order = { critical: 0, high: 1, medium: 2, low: 3, ok: 4 };
    results.sort((a, b) => order[a.severity] - order[b.severity]);

    // ملخص
    const summary = {
      critical: results.filter(r => r.severity === 'critical').length,
      high: results.filter(r => r.severity === 'high').length,
      medium: results.filter(r => r.severity === 'medium').length,
      low: results.filter(r => r.severity === 'low').length,
      ok: results.filter(r => r.severity === 'ok').length,
      score: calculateScore(results),
      at: Date.now(),
    };

    // حفظ بصمة
    window.appStore.set('security-last-scan', { results, summary });

    return { results, summary, SEV, SEV_LABEL, SEV_COLOR };
  }

  function calculateScore(results) {
    // نقاط من 100
    let score = 100;
    for (const r of results) {
      if (r.severity === 'critical') score -= 30;
      else if (r.severity === 'high') score -= 20;
      else if (r.severity === 'medium') score -= 10;
      else if (r.severity === 'low') score -= 2;
    }
    return Math.max(0, score);
  }

  // ═══════════════════════════════════════════
  // Fix Actions
  // ═══════════════════════════════════════════
  async function fixWPS(router) {
    var page = await _reqWithRetry(router, '/wlwps.htm');
    var body = buildFormBody(page.body, 'formWsc', { 'disableWPS': 'ON' });
    if (!body) throw new Error('تعذر بناء نموذج WPS');
    console.log('[security] fixWPS POST:', body);
    await router._req('/form2Wsc.cgi', { method: 'POST', body });
    await _sleep(7000);

    var after = await _reqWithRetry(router, '/wlwps.htm');
    var chk = findInput(after.body, 'disableWPS');
    var ok = isChecked(chk);
    console.log('[security] WPS disabled:', ok);
    return { ok: ok, verified: true };
  }

  async function fixUPnP(router) {
    var page = await _reqWithRetry(router, '/upnp.htm');
    var body = buildFormBody(page.body, 'upnp', { 'daemon': '0' });
    if (!body) throw new Error('تعذر بناء نموذج UPnP');
    console.log('[security] fixUPnP POST:', body);
    await router._req('/form2Upnp.cgi', { method: 'POST', body });
    await _sleep(7000);

    var after = await _reqWithRetry(router, '/upnp.htm');
    var enabled = isSelectEnabled(after.body, 'daemon');
    var ok = !enabled;
    console.log('[security] UPnP disabled:', ok);
    return { ok: ok, verified: true };
  }

  async function fixTR069(router) {
    // ⚠️ TR-069 مفعّل غالباً من المزود — لا نعطّله تلقائياً
    // هذا لتجنب قطع الاتصال مع ISP
    throw new Error('TR-069 يُدار عادةً من مزود الخدمة. اتصل بالمزود قبل إغلاقه.');
  }

  async function applyFix(fixName) {
    const creds = window.appStore.getCredentials();
    if (!creds) throw new Error('بيانات الراوتر غير محفوظة');
    const router = new window.TPLinkRouter(creds);
    await router.login();
    try {
      if (fixName === 'wps') return await fixWPS(router);
      if (fixName === 'upnp') return await fixUPnP(router);
      if (fixName === 'tr069') return await fixTR069(router);
      throw new Error('إصلاح غير معروف: ' + fixName);
    } finally {
      try { await router.logout(); } catch (e) {}
    }
  }

  // ═══════════════════════════════════════════
  // Export
  // ═══════════════════════════════════════════
  async function applyAllFixes(fixNames) {
    var creds = window.appStore.getCredentials();
    if (!creds) throw new Error('بيانات الراوتر غير محفوظة');

    var router = new window.TPLinkRouter(creds);
    await router.login();

    var results = [];
    var succeeded = [];
    var failed = [];

    for (var i = 0; i < fixNames.length; i++) {
      var name = fixNames[i];
      try {
        var r;
        if (name === 'wps') r = await fixWPS(router);
        else if (name === 'upnp') r = await fixUPnP(router);
        else if (name === 'tr069') {
          // نتخطى TR-069 — يدار من المزود
          failed.push({ name: name, error: 'TR-069 يُدار من المزود — تجاهلناه' });
          continue;
        }
        else { failed.push({ name: name, error: 'غير معروف' }); continue; }

        if (r && r.ok) succeeded.push(name);
        else failed.push({ name: name, error: 'الراوتر لم يؤكد التطبيق' });
        results.push({ name: name, result: r });

        // انتظار بين الإصلاحات
        if (i < fixNames.length - 1) await _sleep(3000);
      } catch (e) {
        failed.push({ name: name, error: e.message });
      }
    }

    try { await router.logout(); } catch (e) {}

    return { succeeded: succeeded, failed: failed, results: results };
  }

  window.security = {
    runFullScan,
    applyFix,
    applyAllFixes,
    SEV,
    SEV_LABEL,
    SEV_COLOR,
  };
  console.log('[security] ready');
})();
