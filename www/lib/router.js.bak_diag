// منطق الاتصال بالراوتر TP-Link TD-W8961N (يعتمد على window.MD5)
(function() {
  'use strict';

  function md5safe(str) {
    if (typeof window.MD5 !== 'function') throw new Error('MD5 library missing');
    return window.MD5(str);
  }

  function urlenc(obj) {
    return Object.entries(obj)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&');
  }

  class TPLinkRouter {
    constructor({ host, username, password }) {
      this.host = String(host || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      this.username = String(username || '');
      this.password = String(password || '');
      this.base = 'http://' + this.host;
    }

    async login() {
      const u = md5safe(this.username);
      const p = md5safe(this.password);
      const body = urlenc({
        usernameEncrypt: u,
        passwordEncrypt: p,
        'submit.htm?login.htm': 'Send'
      });
      const res = await window.http.post(this.base + '/login.cgi', body);
      if (!res.ok) throw new Error('فشل الاتصال بالراوتر (' + res.status + ')');
      const check = await window.http.get(this.base + '/index.htm');
      if (/login\.htm/i.test(check.body) && check.body.length < 400) {
        throw new Error('بيانات الدخول غير صحيحة');
      }
      return true;
    }

    async logout() {
      try {
        await window.http.post(this.base + '/logout.cgi', urlenc({ 'submit.htm?index.htm': 'Send' }));
      } catch (e) {}
      window.http.clearCookies();
    }

    async getMacFilter() {
      const res = await window.http.get(this.base + '/wlactrl.htm');
      const html = res.body || '';
      const macs = [...html.matchAll(/<input[^>]*type=["']radio["'][^>]*name=["']select["'][^>]*value=["']([0-9a-fA-F]{12})["']/gi)]
        .map(m => m[1].toLowerCase().match(/.{2}/g).join(':'));
      const idxMatch = html.match(/wlanAcEnabled\.selectedIndex\s*=\s*(\d+)/);
      const idx = idxMatch ? Number(idxMatch[1]) : 0;
      const mode = ['disabled', 'allow', 'deny'][idx] || 'disabled';
      return { mode, macs };
    }
  }

  window.TPLinkRouter = TPLinkRouter;
  console.log('[router] TPLinkRouter ready');
})();
