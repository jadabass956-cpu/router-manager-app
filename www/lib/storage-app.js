// localStorage wrapper — بديل ملفات data/ في السيرفر
(function() {
  'use strict';
  const PREFIX = 'rm_';

  function get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function remove(key) {
    localStorage.removeItem(PREFIX + key);
  }

  function list(prefix = '') {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length));
    }
    return out;
  }

  window.appStore = {
    get, set, remove, list,
    // مساعدات
    getNames: () => get('names', {}),
    setNames: (n) => set('names', n),
    getTraffic: () => get('traffic', {}),
    setTraffic: (t) => set('traffic', t),
    getRules: () => get('rules', {}),
    setRules: (r) => set('rules', r),
    getBlockState: () => get('blockstate', { prevMode: null, activeBlocks: [] }),
    setBlockState: (s) => set('blockstate', s),
    getCalibration: () => get('calibration', { packetSize: 800, samples: [], source: 'default' }),
    setCalibration: (c) => set('calibration', c),
    getHistory: () => get('history', []),
    setHistory: (h) => set('history', h),
    getCredentials: () => get('credentials', null),
    setCredentials: (c) => set('credentials', c),
    clearCredentials: () => remove('credentials'),
    getUpdateCache: () => get('update-cache', null),
    setUpdateCache: (u) => set('update-cache', u),
  };
  console.log('[storage-app] ready');
})();
