// ═══════════════════════════════════════════════════════════
// Rules Service — إدارة الحظر + الحد اليومي (client-side)
// ═══════════════════════════════════════════════════════════
(function() {
  'use strict';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ═══════ Storage helpers ═══════
  function getRules() { return window.appStore.getRules() || {}; }
  function setRules(r) { window.appStore.setRules(r); }

  function getState() {
    return window.appStore.getBlockState() || { prevMode: null, activeBlocks: [] };
  }
  function setState(s) { window.appStore.setBlockState(s); }

  // ═══════ Block ═══════
  async function blockDevice(mac) {
    const m = String(mac || '').toLowerCase();
    const creds = window.appStore.getCredentials();
    if (!creds) throw new Error('بيانات الراوتر غير محفوظة');
    const router = new window.TPLinkRouter(creds);
    await router.login();
    try {
      const state = getState();

      // احفظ الوضع السابق (أول حظر فقط)
      if (!state.activeBlocks || state.activeBlocks.length === 0) {
        const current = await router.getMacFilter();
        state.prevMode = current.mode;
        setState(state);
      }

      // تأكد أن الوضع = deny
      const current = await router.getMacFilter();
      if (current.mode !== 'deny') {
        // نتأكد أن MAC جهازنا ليس في القائمة (حماية)
        const backendMac = (creds.backendMac || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
        const backendFmt = backendMac.length === 12
          ? backendMac.match(/.{2}/g).join(':')
          : null;
        if (backendFmt && current.macs.includes(backendFmt)) {
          // احذفه قبل deny
          await router.removeMac(backendFmt);
        }
        await router.setMacFilterMode('deny');
        await sleep(2000);
      }

      // أضف MAC للقائمة
      const after = await router.getMacFilter();
      if (!after.macs.includes(m)) {
        await router.addMac(m);
        await sleep(1500);
      }

      // سجل
      state.activeBlocks = state.activeBlocks || [];
      if (!state.activeBlocks.includes(m)) state.activeBlocks.push(m);
      setState(state);
      return { ok: true, mac: m };
    } finally {
      try { await router.logout(); } catch (e) {}
    }
  }

  // ═══════ Unblock ═══════
  async function unblockDevice(mac) {
    const m = String(mac || '').toLowerCase();
    const creds = window.appStore.getCredentials();
    if (!creds) throw new Error('بيانات الراوتر غير محفوظة');
    const router = new window.TPLinkRouter(creds);
    await router.login();
    try {
      const state = getState();

      // احذف من قائمة الفلتر
      const current = await router.getMacFilter();
      if (current.macs.includes(m)) {
        await router.removeMac(m);
        await sleep(1500);
      }

      // حدث الحالة
      state.activeBlocks = (state.activeBlocks || []).filter(x => x !== m);

      // لو ما بقي حظر نشط → استعد الوضع السابق
      if (state.activeBlocks.length === 0 && state.prevMode) {
        try {
          await router.setMacFilterMode(state.prevMode);
        } catch (e) {
          await router.setMacFilterMode('disabled');
        }
        state.prevMode = null;
      }
      setState(state);
      return { ok: true, mac: m };
    } finally {
      try { await router.logout(); } catch (e) {}
    }
  }

  // ═══════ Temp Block ═══════
  async function setTempBlock(mac, minutes) {
    const m = String(mac || '').toLowerCase();
    if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(m)) throw new Error('صيغة MAC غير صحيحة');
    const rules = getRules();
    if (!rules[m]) rules[m] = {};
    rules[m].blocked = true;
    rules[m].unblockAt = minutes > 0 ? Date.now() + minutes * 60 * 1000 : null;
    rules[m].autoBlocked = false;
    setRules(rules);
    await blockDevice(m);
    return { mac: m, blocked: true, unblockAt: rules[m].unblockAt };
  }

  // ═══════ Clear Block ═══════
  async function clearBlock(mac) {
    const m = String(mac || '').toLowerCase();
    const rules = getRules();
    if (rules[m]) {
      rules[m].blocked = false;
      delete rules[m].unblockAt;
      delete rules[m].autoBlocked;
      delete rules[m].autoBlockedAt;
      setRules(rules);
    }
    await unblockDevice(m);
    return { mac: m, blocked: false };
  }

  // ═══════ Daily Limit ═══════
  async function setDailyLimit(mac, mb) {
    const m = String(mac || '').toLowerCase();
    const rules = getRules();
    if (!rules[m]) rules[m] = {};
    const bytes = Math.max(0, Math.floor((Number(mb) || 0) * 1024 * 1024));
    if (bytes === 0) delete rules[m].dailyLimitBytes;
    else rules[m].dailyLimitBytes = bytes;
    setRules(rules);

    // إذا كان محظوراً تلقائياً والحد الجديد أعلى → ارفع الحظر
    if (rules[m].autoBlocked && bytes > 0) {
      try {
        const traffic = window.appStore.getTraffic() || {};
        const e = traffic[m];
        if (e) {
          const today = new Date().toISOString().slice(0, 10);
          const td = (e.days && e.days[today]) || { rx: 0, tx: 0 };
          const used = (td.rx || 0) + (td.tx || 0);
          if (used < bytes) {
            rules[m].blocked = false;
            rules[m].autoBlocked = false;
            delete rules[m].unblockAt;
            setRules(rules);
            await unblockDevice(m);
          }
        }
      } catch (e) {}
    }

    return { mac: m, dailyLimitBytes: rules[m].dailyLimitBytes || 0 };
  }

  // ═══════ Enforce (يُشغّل دورياً) ═══════
  async function enforce() {
    const rules = getRules();
    const t = Date.now();
    let changed = false;

    for (const mac of Object.keys(rules)) {
      const rule = rules[mac];

      // 1) انتهى الحظر المؤقت؟
      if (rule.blocked && rule.unblockAt && t > rule.unblockAt) {
        try { await clearBlock(mac); } catch (e) {}
        changed = true;
        continue;
      }

      // 2) تجاوز الحد اليومي؟
      if (rule.dailyLimitBytes > 0 && !rule.blocked) {
        try {
          const traffic = window.appStore.getTraffic() || {};
          const e = traffic[mac];
          if (e) {
            const today = new Date().toISOString().slice(0, 10);
            const td = (e.days && e.days[today]) || { rx: 0, tx: 0 };
            const used = (td.rx || 0) + (td.tx || 0);
            if (used >= rule.dailyLimitBytes) {
              await setTempBlock(mac, 0); // دائم حتى يدوي
              rule.autoBlocked = true;
              rule.autoBlockedAt = t;
              changed = true;
            }
          }
        } catch (e) {}
      }
    }
    if (changed) setRules(rules);
  }

  // ═══════ GET all ═══════
  function getAll() {
    return { rules: getRules(), state: getState() };
  }

  window.rulesService = { setTempBlock, clearBlock, setDailyLimit, getAll, enforce, blockDevice, unblockDevice };
  console.log('[rules] ready');
})();
