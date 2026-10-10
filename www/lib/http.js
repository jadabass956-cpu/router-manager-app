// طبقة HTTP — تعمل داخل APK (CapacitorHttp) أو في المتصفح (fetch)
(function() {
  const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const BASE_TIMEOUT = 30000;

  // مخزن cookies داخل التطبيق
  const cookieJar = new Map();

  function parseCookies(headers) {
    const setCookie = headers['Set-Cookie'] || headers['set-cookie'];
    if (!setCookie) return;
    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const raw of list) {
      const first = raw.split(';')[0];
      const idx = first.indexOf('=');
      if (idx > 0) {
        const k = first.slice(0, idx).trim();
        const v = first.slice(idx + 1).trim();
        cookieJar.set(k, v);
      }
    }
  }

  function getCookieHeader() {
    if (cookieJar.size === 0) return '';
    return [...cookieJar.entries()].map(([k, v]) => k + '=' + v).join('; ');
  }

  async function request(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { ...(options.headers || {}) };

    const cookie = getCookieHeader();
    if (cookie) headers['Cookie'] = cookie;

    const body = options.body;

    if (IS_NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
      const http = window.Capacitor.Plugins.CapacitorHttp;
      const res = await http.request({
        url,
        method,
        headers,
        data: body,
        connectTimeout: BASE_TIMEOUT,
        readTimeout: BASE_TIMEOUT,
      });
      if (res.headers) parseCookies(res.headers);
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        statusText: '',
        headers: res.headers || {},
        body: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
        text: () => Promise.resolve(typeof res.data === 'string' ? res.data : JSON.stringify(res.data)),
      };
    }

    // fallback: fetch (للمتصفح/التطوير)
    const res = await fetch(url, {
      method,
      headers,
      body,
      credentials: 'include',
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: text,
      text: () => Promise.resolve(text),
    };
  }

  window.http = {
    get: (url, headers) => request(url, { method: 'GET', headers }),
    post: (url, body, headers) => request(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers } }),
    put: (url, body, headers) => request(url, { method: 'PUT', body, headers }),
    request,
    clearCookies: () => cookieJar.clear(),
    isNative: IS_NATIVE,
  };
  console.log('[http] ready, native =', IS_NATIVE);
})();
