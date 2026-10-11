// Interceptor: يعترض fetch('/api/*') ويوجهه لدوال JS محلية
(function() {
  'use strict';

  const originalFetch = window.fetch.bind(window);

  // ═══════════ Session Helper (Queue + Session Cache) ═══════════
  // الراوتر TD-W8961N لا يتحمل طلبات متعددة. الحل:
  //   1) queue لكل الطلبات (طلب واحد في نفس الوقت)
  //   2) جلسة مشتركة تعيش 5 دقائق (بدل login/logout لكل طلب)
  let _queue = Promise.resolve();
  let _session = null;
  let _sessionTimer = null;
  const SESSION_TTL = 5 * 60 * 1000; // 5 دقائق

  async function _openSession() {
    const creds = window.appStore.getCredentials();
    if (!creds) throw new Error('بيانات الراوتر غير محفوظة');
    const router = new window.TPLinkRouter(creds);
    await router.login();
    _session = { router, creds, at: Date.now() };
    if (_sessionTimer) clearTimeout(_sessionTimer);
    _sessionTimer = setTimeout(_closeSession, SESSION_TTL);
    console.log('[session] opened for', creds.host);
    return _session;
  }

  async function _closeSession() {
    if (_sessionTimer) { clearTimeout(_sessionTimer); _sessionTimer = null; }
    if (!_session) return;
    try { await _session.router.logout(); } catch (e) {}
    console.log('[session] closed');
    _session = null;
  }

  async function _getRouter() {
    const creds = window.appStore.getCredentials();
    if (!creds) throw new Error('بيانات الراوتر غير محفوظة');
    if (_session && _session.creds.host === creds.host && _session.creds.username === creds.username) {
      return _session.router;
    }
    if (_session) await _closeSession();
    const s = await _openSession();
    return s.router;
  }

  function withRouter(fn) {
    const run = async () => {
      const router = await _getRouter();
      return await fn(router);
    };
    const result = _queue.then(run);
    _queue = result.catch(() => {});
    return result;
  }

  function resetSession() { return _closeSession(); }

  // إغلاق الجلسة عند إغلاق التطبيق
  window.addEventListener('beforeunload', () => { _closeSession(); });

  // ═══════════ Errors ═══════════
  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function errorResponse(code, message, status = 400) {
    return jsonResponse({ error: { code, message } }, status);
  }

  // ═══════════ Traffic Service (محلي) ═══════════
  const PACKET_SIZE = () => (window.appStore.getCalibration().packetSize || 800);

  function toNum(v) {
    if (v == null) return 0;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : 0;
  }

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function pruneDays(days, keep) {
    const keys = Object.keys(days).sort();
    if (keys.length <= keep) return days;
    for (const k of keys.slice(0, keys.length - keep)) delete days[k];
    return days;
  }

  async function trafficPoll() {
    try {
      const devices = await withRouter((d) => d.getDevices());
      const data = window.appStore.getTraffic();
      const now = Date.now();
      const today = todayKey();
      const PS = PACKET_SIZE();

      for (const dev of devices) {
        if (!dev.mac || !dev.wifi) continue;
        const rx = toNum(dev.wifi.rx);
        const tx = toNum(dev.wifi.tx);
        const mac = dev.mac.toLowerCase();
        const e = data[mac] || { totalRx: 0, totalTx: 0, lastRx: null, lastTx: null, lastSeen: 0, days: {} };

        let dRx = 0, dTx = 0;
        if (e.lastRx != null && rx >= e.lastRx) dRx = (rx - e.lastRx) * PS;
        if (e.lastTx != null && tx >= e.lastTx) dTx = (tx - e.lastTx) * PS;

        e.totalRx = (e.totalRx || 0) + dRx;
        e.totalTx = (e.totalTx || 0) + dTx;
        if (!e.days) e.days = {};
        if (!e.days[today]) e.days[today] = { rx: 0, tx: 0 };
        e.days[today].rx += dRx;
        e.days[today].tx += dTx;
        e.days = pruneDays(e.days, 31);
        e.lastRx = rx; e.lastTx = tx; e.lastSeen = now;
        data[mac] = e;
      }
      window.appStore.setTraffic(data);
    } catch (e) {
      console.warn('[traffic] poll failed:', e.message);
    }
  }

  function trafficStats() {
    const data = window.appStore.getTraffic();
    let totalRx = 0, totalTx = 0;
    const perDevice = {};
    for (const [mac, e] of Object.entries(data)) {
      totalRx += e.totalRx || 0;
      totalTx += e.totalTx || 0;
      perDevice[mac] = {
        totalRx: e.totalRx || 0,
        totalTx: e.totalTx || 0,
        lastRx: e.lastRx || 0,
        lastTx: e.lastTx || 0,
        lastSeen: e.lastSeen || 0,
        days: e.days || {},
      };
    }
    return { totalRx, totalTx, perDevice, updatedAt: Date.now() };
  }

  function sumDays(days, n) {
    const keys = Object.keys(days).sort().slice(-n);
    let rx = 0, tx = 0;
    for (const k of keys) { rx += days[k].rx || 0; tx += days[k].tx || 0; }
    return { rx, tx };
  }

  function getDeviceUsage(mac) {
    const m = String(mac || '').toLowerCase();
    const data = window.appStore.getTraffic();
    const e = data[m];
    if (!e) return null;
    const days = e.days || {};
    return {
      mac: m,
      today: sumDays(days, 1),
      week: sumDays(days, 7),
      month: sumDays(days, 30),
      total: { rx: e.totalRx || 0, tx: e.totalTx || 0 },
      days: Object.entries(days).sort((a, b) => b[0].localeCompare(a[0])).map(([date, v]) => ({ date, rx: v.rx || 0, tx: v.tx || 0 })),
    };
  }

  // ═══════════ Handlers ═══════════
  const handlers = {
    // ── Health ──
    'GET /api/health': async () => jsonResponse({ ok: true }),
    'GET /api/router/health': async () => {
      try {
        const r = await withRouter((d) => d.getMacFilter());
        return jsonResponse({ ok: true, mode: r.mode });
      } catch (e) {
        return jsonResponse({ ok: false, code: 'UNREACHABLE', message: e.message }, 502);
      }
    },

    // ── Devices ──
    'GET /api/devices': async () => {
      try {
        const liveDevices = await withRouter((d) => d.getDevices());
        const names = window.appStore.getNames();
        const trafficData = window.appStore.getTraffic();
        const rulesData = window.appStore.getRules();
        const stats = trafficStats();

        const knownMacs = new Set();
        Object.keys(trafficData).forEach(m => knownMacs.add(m.toLowerCase()));
        Object.keys(names).forEach(m => knownMacs.add(m.toLowerCase()));
        Object.keys(rulesData).forEach(m => knownMacs.add(m.toLowerCase()));

        const result = new Map();
        for (const x of liveDevices) {
          const m = (x.mac || '').toLowerCase();
          if (!m) continue;
          const st = stats.perDevice[m] || {};
          const r = rulesData[m] || {};
          result.set(m, {
            mac: x.mac, ip: x.ip || null, expires: x.expires || null, wifi: x.wifi || null,
            online: !!x.wifi,
            name: names[m] || null,
            totalRx: st.totalRx || 0, totalTx: st.totalTx || 0,
            blocked: !!r.blocked, autoBlocked: !!r.autoBlocked,
            unblockAt: r.unblockAt || null, dailyLimitBytes: r.dailyLimitBytes || 0,
          });
          knownMacs.delete(m);
        }
        for (const m of knownMacs) {
          const st = stats.perDevice[m] || {};
          const r = rulesData[m] || {};
          result.set(m, {
            mac: m, ip: null, expires: null, wifi: null, online: false,
            name: names[m] || null,
            totalRx: st.totalRx || 0, totalTx: st.totalTx || 0,
            blocked: !!r.blocked, autoBlocked: !!r.autoBlocked,
            unblockAt: r.unblockAt || null, dailyLimitBytes: r.dailyLimitBytes || 0,
          });
        }
        return jsonResponse({
          devices: [...result.values()],
          traffic: { totalRx: stats.totalRx, totalTx: stats.totalTx, updatedAt: stats.updatedAt },
        });
      } catch (e) {
        return errorResponse('ROUTER_UNREACHABLE', e.message, 502);
      }
    },
    'GET /api/devices/:mac/usage': async (params) => {
      const usage = getDeviceUsage(params.mac);
      if (!usage) return errorResponse('NOT_FOUND', 'لا توجد بيانات بعد', 404);
      return jsonResponse(usage);
    },
    'PUT /api/devices/:mac/name': async (params, body) => {
      console.log('[api-name] params.mac=', params.mac, '| body=', JSON.stringify(body));
      const mac = String(params.mac || '').toLowerCase();
      if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac)) {
        console.log('[api-name] INVALID_MAC:', mac);
        return errorResponse('INVALID_MAC', 'صيغة MAC غير صحيحة');
      }
      const raw = String((body && body.name) || '').trim().slice(0, 40);
      console.log('[api-name] raw=', JSON.stringify(raw));
      const names = window.appStore.getNames();
      console.log('[api-name] before:', JSON.stringify(names));
      if (raw) names[mac] = raw; else delete names[mac];
      window.appStore.setNames(names);
      console.log('[api-name] after:', JSON.stringify(names));
      return jsonResponse({ mac: mac, name: names[mac] || null });
    },
    'DELETE /api/devices/:mac/known': async (params) => {
      const mac = String(params.mac || '').toLowerCase();
      const names = window.appStore.getNames(); delete names[mac]; window.appStore.setNames(names);
      const traffic = window.appStore.getTraffic(); delete traffic[mac]; window.appStore.setTraffic(traffic);
      const rules = window.appStore.getRules(); delete rules[mac]; window.appStore.setRules(rules);
      return jsonResponse({ ok: true, mac });
    },

    // ── MAC Filter ──
    'GET /api/mac-filter': async () => {
      try {
        const r = await withRouter((d) => d.getMacFilter());
        const creds = window.appStore.getCredentials();
        const backendMac = (creds && creds.backendMac) || null;
        return jsonResponse({ ...r, backendMac });
      } catch (e) { return errorResponse('ROUTER_UNREACHABLE', e.message, 502); }
    },
    'POST /api/mac-filter': async (params, body) => {
      try {
        const r = await withRouter((d) => d.addMac(body.mac));
        return jsonResponse(r);
      } catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },
    'DELETE /api/mac-filter/:mac': async (params) => {
      try {
        const r = await withRouter((d) => d.removeMac(params.mac));
        return jsonResponse(r);
      } catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },
    'PUT /api/mac-filter/mode': async (params, body) => {
      try {
        const r = await withRouter((d) => d.setMacFilterMode(body.mode));
        return jsonResponse(r);
      } catch (e) {
        const msg = e.message || '';
        if (msg === 'MAC_LIST_EMPTY') {
          return errorResponse('MAC_LIST_EMPTY', 'لا يمكن تفعيل السماح/الحظر بدون إضافة MAC للقائمة أولاً. أضف MAC جهازك ثم أعد المحاولة.', 400);
        }
        if (msg === 'BACKEND_MAC_UNKNOWN') {
          return errorResponse('BACKEND_MAC_UNKNOWN', 'لم يُحدّد MAC جهازك. اذهب للإعدادات → MAC جهازي، وأدخله لتفعيل الحماية.', 400);
        }
        if (msg === 'WOULD_LOCK_OUT') {
          return errorResponse('WOULD_LOCK_OUT', 'هذه العملية ستحظر جهازك من الاتصال!', 409);
        }
        return errorResponse('APPLY_FAILED', msg);
      }
    },
    'POST /api/mac-filter/emergency-reset': async () => {
      try {
        const r = await withRouter((d) => d.emergencyReset());
        return jsonResponse({ ok: true, ...r });
      } catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },

    // ── WiFi ──
    'GET /api/wifi': async () => {
      try { return jsonResponse(await withRouter((d) => d.getWifiSettings())); }
      catch (e) { return errorResponse('ROUTER_UNREACHABLE', e.message, 502); }
    },
    'PUT /api/wifi/security': async (params, body) => {
      try {
        const encryption = String(body.encryption || '').trim();
        const password = String(body.password || '');
        if (!encryption) return errorResponse('BAD_REQUEST', 'نوع التشفير مطلوب');
        if (password.length < 8 || password.length > 63) {
          return errorResponse('BAD_REQUEST', 'كلمة المرور 8-63 حرف');
        }
        const r = await withRouter((d) => d.setSecurity({
          encryption: encryption,
          password: password,
        }));
        return jsonResponse({ ok: true, ...r });
      } catch (e) {
        return errorResponse('APPLY_FAILED', e.message);
      }
    },
    'PUT /api/wifi/ssid': async (params, body) => {
      try { return jsonResponse(await withRouter((d) => d.setSSID(body.ssid))); }
      catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },
    'PUT /api/wifi/encryption': async (params, body) => {
      try { return jsonResponse(await withRouter((d) => d.setEncryption(body.type))); }
      catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },
    'PUT /api/wifi/password': async (params, body) => {
      try { return jsonResponse(await withRouter((d) => d.setWifiPassword(body.password))); }
      catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },

    // ── Reboot ──
    'POST /api/reboot': async () => {
      try {
        const r = await withRouter((d) => d.reboot());
        return jsonResponse(r);
      } catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },

    // ── WAN / PPPoE ──
    'GET /api/wan': async () => {
      try { return jsonResponse(await withRouter((d) => d.getWanStatus())); }
      catch (e) { return errorResponse('ROUTER_UNREACHABLE', e.message, 502); }
    },
    'GET /api/wan/pppoe': async () => {
      try { return jsonResponse(await withRouter((d) => d.getPppoeDetails())); }
      catch (e) { return errorResponse('ROUTER_UNREACHABLE', e.message, 502); }
    },
    'PUT /api/wan/pppoe': async (params, body) => {
      try {
        const before = await withRouter((d) => d.getPppoeDetails());
        window.appStore.set('snapshot-pppoe-before', { at: Date.now(), data: before });
        const after = await withRouter((d) => d.setPppoeCredentials(body));
        window.appStore.set('snapshot-pppoe-after', { at: Date.now(), data: after });
        return jsonResponse({ ok: true, ...after });
      } catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },

    // ── Time / NTP ──
    'GET /api/time': async () => {
      try { return jsonResponse(await withRouter((d) => d.getTimeSettings())); }
      catch (e) { return errorResponse('ROUTER_UNREACHABLE', e.message, 502); }
    },
    'PUT /api/time/manual': async (params, body) => {
      try { return jsonResponse(await withRouter((d) => d.setManualTime(body))); }
      catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },
    'PUT /api/time/ntp': async (params, body) => {
      try { return jsonResponse(await withRouter((d) => d.setNtp(body))); }
      catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },
    'POST /api/time/ntp/sync': async () => {
      try { return jsonResponse(await withRouter((d) => d.syncNtp())); }
      catch (e) { return errorResponse('APPLY_FAILED', e.message); }
    },
    'GET /api/time/timezones': async () => {
      const tz = window.appStore.get('timezones', null);
      if (!tz) return jsonResponse({ items: [], total: 0 });
      return jsonResponse(tz);
    },

    // ── Speed ──
    'GET /api/speed': async (params) => {
      const size = Number((new URL('http://x' + params._url)).searchParams.get('size')) || 5;
      try {
        const r = await window.speedMeasure({ sizeMb: size, samples: 1 });
        return jsonResponse(r);
      } catch (e) { return errorResponse('INTERNAL', e.message, 500); }
    },
    'GET /api/speed/calibration': async () => jsonResponse(window.appStore.getCalibration()),
    'PUT /api/speed/calibration': async (params, body) => {
      const c = window.appStore.getCalibration();
      const n = Math.round(Number(body.packetSize));
      if (!Number.isFinite(n) || n < 200 || n > 2000) return errorResponse('BAD_REQUEST', 'قيمة غير صالحة');
      c.packetSize = n; c.updatedAt = Date.now(); c.source = 'manual';
      window.appStore.setCalibration(c);
      return jsonResponse({ ok: true, packetSize: n });
    },
    'DELETE /api/speed/calibration': async () => {
      const c = { packetSize: 800, samples: [], updatedAt: Date.now(), source: 'reset' };
      window.appStore.setCalibration(c);
      return jsonResponse(c);
    },
    'POST /api/speed/calibrate': async () => {
      try {
        const r = await window.speedCalibrate();
        return jsonResponse(r);
      } catch (e) { return errorResponse('INTERNAL', e.message, 500); }
    },

    // ── Security ──
    'GET /api/security/scan': async () => {
      try {
        const r = await window.security.runFullScan();
        return jsonResponse(r);
      } catch (e) {
        return errorResponse('SECURITY_SCAN_FAILED', e.message, 500);
      }
    },
    'GET /api/security/last-scan': async () => {
      const cached = window.appStore.get('security-last-scan', null);
      return jsonResponse(cached || { results: [], summary: null });
    },
    'POST /api/security/fix-all': async (params, body) => {
      try {
        const names = Array.isArray(body.names) ? body.names : [];
        if (!names.length) return errorResponse('BAD_REQUEST', 'قائمة الإصلاحات فارغة');
        const mod = window.securityFixes || window.security;
        if (!mod || !mod.applyAllFixes) return errorResponse('NOT_READY', 'وحدة الإصلاح غير محملة', 500);
        const r = await mod.applyAllFixes(names);
        return jsonResponse({ ok: r.succeeded.length > 0, ...r });
      } catch (e) {
        return errorResponse('FIX_ALL_FAILED', e.message, 500);
      }
    },
    'POST /api/security/fix/:name': async (params) => {
      try {
        const name = params.name;
        const creds = window.appStore.getCredentials();
        if (!creds) throw new Error('بيانات الراوتر غير محفوظة');
        const router = new window.TPLinkRouter(creds);
        await router.login();
        let r;
        try {
          if (name === 'wps' && window.securityFixes) r = await window.securityFixes.fixWPS(router);
          else if (name === 'upnp' && window.securityFixes) r = await window.securityFixes.fixUPnP(router);
          else if (name === 'ddns' && window.securityFixes) r = await window.securityFixes.fixDDNS(router);
          else if (name === 'snmp' && window.securityFixes) r = await window.securityFixes.fixSNMP(router);
          else if (window.security && window.security.applyFix) r = await window.security.applyFix(name);
          else throw new Error('إصلاح غير مدعوم: ' + name);
        } finally {
          try { await router.logout(); } catch (e) {}
        }
        return jsonResponse({ ok: !!(r && r.ok), ...(r || {}) });
      } catch (e) {
        return errorResponse('FIX_FAILED', e.message, 500);
      }
    },

    // ── Rules ──
    'GET /api/rules': async () => jsonResponse(window.rulesService.getAll()),
    'POST /api/rules/:mac/block': async (params, body) => {
      try {
        const minutes = Number(body && body.minutes) || 0;
        const r = await window.rulesService.setTempBlock(params.mac, minutes);
        return jsonResponse(r);
      } catch (e) { return errorResponse('BLOCK_FAILED', e.message, 500); }
    },
    'DELETE /api/rules/:mac/block': async (params) => {
      try {
        const r = await window.rulesService.clearBlock(params.mac);
        return jsonResponse(r);
      } catch (e) { return errorResponse('UNBLOCK_FAILED', e.message, 500); }
    },
    'PUT /api/rules/:mac/limit': async (params, body) => {
      try {
        const mb = Number(body && body.mb) || 0;
        const r = await window.rulesService.setDailyLimit(params.mac, mb);
        return jsonResponse(r);
      } catch (e) { return errorResponse('LIMIT_FAILED', e.message, 500); }
    },

    // ── Credentials ──
    'GET /api/settings/credentials': async () => {
      const c = window.appStore.getCredentials();
      if (!c) return jsonResponse({ host: '', username: '', password: '', hasPassword: false, source: 'none' });
      return jsonResponse({
        host: c.host, username: c.username,
        password: '••••••••', hasPassword: !!c.password, source: 'file'
      });
    },
    'PUT /api/settings/credentials': async (params, body) => {
      if (!body.host || !body.username || !body.password) return errorResponse('BAD_REQUEST', 'كل الحقول مطلوبة');
      // اختبار
      try {
        const router = new window.TPLinkRouter({ host: body.host, username: body.username, password: body.password });
        await router.login();
        await router.logout();
      } catch (e) {
        return errorResponse('INVALID_CREDENTIALS', e.message, 401);
      }
      window.appStore.setCredentials({
        host: body.host, username: body.username, password: body.password,
        backendMac: (window.appStore.getCredentials() || {}).backendMac || null,
      });
      return jsonResponse({ ok: true, host: body.host, username: body.username, password: '••••••••', hasPassword: true, source: 'file' });
    },
    'POST /api/settings/credentials/test': async (params, body) => {
      try {
        const router = new window.TPLinkRouter({ host: body.host, username: body.username, password: body.password });
        await router.login();
        await router.logout();
        return jsonResponse({ ok: true, message: 'الاتصال ناجح' });
      } catch (e) {
        return jsonResponse({ ok: false, message: e.message, code: 'INVALID_CREDENTIALS' });
      }
    },
    'DELETE /api/settings/credentials': async () => {
      window.appStore.clearCredentials();
      return jsonResponse({ ok: true });
    },

    // ── Update ──
    'GET /api/update/version': async () => {
      const c = window.appStore.getUpdateCache();
      return jsonResponse({ current: (c && c.current) || '1.0.0' });
    },
    'GET /api/update/check': async () => {
      try {
        const url = 'https://router-manager-jasoft-default-rtdb.asia-southeast1.firebasedatabase.app/update.json';
        const res = await originalFetch(url);
        const remote = await res.json();
        const CURRENT = '1.0.0';
        const cmp = (a, b) => {
          const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
          for (let i = 0; i < 3; i++) { if ((pa[i]||0) < (pb[i]||0)) return -1; if ((pa[i]||0) > (pb[i]||0)) return 1; }
          return 0;
        };
        const result = {
          current: CURRENT,
          latest: remote.latest || CURRENT,
          minRequired: remote.minRequired || '0.0.0',
          forceUpdate: !!remote.forceUpdate,
          killSwitch: !!remote.killSwitch,
          message: remote.message || '',
          announcement: remote.announcement || '',
          updateAvailable: cmp(CURRENT, remote.latest) < 0,
          blocked: cmp(CURRENT, remote.minRequired) < 0 || !!remote.forceUpdate,
          checkedAt: Date.now(),
          ok: true,
        };
        window.appStore.setUpdateCache(result);
        return jsonResponse(result);
      } catch (e) {
        const cached = window.appStore.getUpdateCache();
        if (cached) return jsonResponse({ ...cached, ok: false, error: e.message, cached: true });
        return jsonResponse({ current: '1.0.0', latest: '1.0.0', minRequired: '0.0.0', ok: false, error: e.message });
      }
    },
  };

  // ═══════════ URL Matching ═══════════
  function matchRoute(method, pathname) {
    const key = method + ' ' + pathname;
    if (handlers[key]) return { handler: handlers[key], params: {} };

    // dynamic: /api/devices/:mac/usage
    for (const route in handlers) {
      if (!route.startsWith(method + ' ')) continue;
      const pattern = route.slice(method.length + 1);
      const regexPattern = pattern.replace(/:[^/]+/g, '([^/]+)').replace(/\//g, '\\/');
      const re = new RegExp('^' + regexPattern + '$');
      const m = pathname.match(re);
      if (m) {
        const names = [...pattern.matchAll(/:([^/]+)/g)].map(x => x[1]);
        const params = {};
        names.forEach((n, i) => params[n] = decodeURIComponent(m[i + 1]));
        return { handler: handlers[route], params };
      }
    }
    return null;
  }

  // ═══════════ Interceptor ═══════════
  window.fetch = async function(url, options = {}) {
    const str = String(url);
    if (!str.startsWith('/api/')) {
      return originalFetch(url, options);
    }

    const urlObj = new URL('http://x' + str);
    const pathname = urlObj.pathname;
    const method = (options.method || 'GET').toUpperCase();

    let body = {};
    if (options.body) {
      try { body = JSON.parse(options.body); } catch (e) { body = {}; }
    }

    const match = matchRoute(method, pathname);
    if (!match) {
      return errorResponse('NOT_FOUND', 'Endpoint غير موجود: ' + method + ' ' + pathname, 404);
    }

    try {
      const result = await match.handler(match.params, body);
      return result;
    } catch (e) {
      console.error('[api]', method, pathname, e);
      return errorResponse('INTERNAL', e.message || 'خطأ داخلي', 500);
    }
  };

  // ═══════════ Traffic Polling ═══════════
  let pollTimer = null;
  function startTrafficPoll() {
    if (pollTimer) return;
    // ننتظر 10 ثواني قبل أول poll (نخلي الصفحة تحمّل أولاً)
    setTimeout(trafficPoll, 10000);
    pollTimer = setInterval(trafficPoll, 120000); // كل دقيقتين
  }
  function stopTrafficPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  window.apiHelpers = {
    trafficPoll,
    startTrafficPoll,
    stopTrafficPoll,
    withRouter,
    resetSession,
  };

  console.log('[api] interceptor ready');
})();
