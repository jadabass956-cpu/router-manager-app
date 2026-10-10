// منطق الاتصال بالراوتر TP-Link TD-W8961N
(function() {
  async function md5(str) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('MD5', enc.encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // MD5 قد لا يكون مدعومًا في WebView — fallback
  async function md5safe(str) {
    try { return await md5(str); }
    catch (e) { return md5js(str); }
  }

  // MD5 بسيط في JS (بديل موثوق)
  function md5js(s) {
    function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
    function au(x, y) { const l = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xFFFF); }
    function cmn(q, a, b, x, s, t) { return au(rl(au(au(a, q), au(x, t)), s), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
    function sb(str) {
      const bytes = new TextEncoder().encode(str);
      const len = bytes.length;
      const nblk = ((len + 8) >> 6) + 1;
      const blks = new Array(nblk * 16).fill(0);
      for (let i = 0; i < len; i++) blks[i >> 2] |= bytes[i] << ((i % 4) * 8);
      blks[len >> 2] |= 0x80 << ((len % 4) * 8);
      blks[nblk * 16 - 2] = len * 8;
      return blks;
    }
    function hex(n) { let s = ''; for (let i = 0; i < 4; i++) s += ((n >> (i * 8)) & 0xFF).toString(16).padStart(2, '0'); return s; }
    const x = sb(s);
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < x.length; i += 16) {
      const oa = a, ob = b, oc = c, od = d;
      a = ff(a, b, c, d, x[i+ 0], 7, -680876936); d = ff(d, a, b, c, x[i+ 1],12, -389564586);
      c = ff(c, d, a, b, x[i+ 2],17,  606105819); b = ff(b, c, d, a, x[i+ 3],22,-1044525330);
      a = ff(a, b, c, d, x[i+ 4], 7, -176418897); d = ff(d, a, b, c, x[i+ 5],12, 1200080426);
      c = ff(c, d, a, b, x[i+ 6],17,-1473231341); b = ff(b, c, d, a, x[i+ 7],22,  -45705983);
      a = ff(a, b, c, d, x[i+ 8], 7, 1770035416); d = ff(d, a, b, c, x[i+ 9],12,-1958414417);
      c = ff(c, d, a, b, x[i+10],17,     -42063); b = ff(b, c, d, a, x[i+11],22,-1990404162);
      a = ff(a, b, c, d, x[i+12], 7, 1804603682); d = ff(d, a, b, c, x[i+13],12,  -40341101);
      c = ff(c, d, a, b, x[i+14],17,-1502002290); b = ff(b, c, d, a, x[i+15],22, 1236535329);
      a = gg(a, b, c, d, x[i+ 1], 5, -165796510); d = gg(d, a, b, c, x[i+ 6], 9,-1069501632);
      c = gg(c, d, a, b, x[i+11],14,  643717713); b = gg(b, c, d, a, x[i+ 0],20, -373897302);
      a = gg(a, b, c, d, x[i+ 5], 5, -701558691); d = gg(d, a, b, c, x[i+10], 9,   38016083);
      c = gg(c, d, a, b, x[i+15],14, -660478335); b = gg(b, c, d, a, x[i+ 4],20, -405537848);
      a = gg(a, b, c, d, x[i+ 9], 5,  568446438); d = gg(d, a, b, c, x[i+14], 9,-1019803690);
      c = gg(c, d, a, b, x[i+ 3],14, -187363961); b = gg(b, c, d, a, x[i+ 8],20, 1163531501);
      a = gg(a, b, c, d, x[i+13], 5,-1444681467); d = gg(d, a, b, c, x[i+ 2], 9,  -51403784);
      c = gg(c, d, a, b, x[i+ 7],14, 1735328473); b = gg(b, c, d, a, x[i+12],20,-1926607734);
      a = hh(a, b, c, d, x[i+ 5], 4,    -378558); d = hh(d, a, b, c, x[i+ 8],11,-2022574463);
      c = hh(c, d, a, b, x[i+11],16, 1839030562); b = hh(b, c, d, a, x[i+14],23,  -35309556);
      a = hh(a, b, c, d, x[i+ 1], 4,-1530992060); d = hh(d, a, b, c, x[i+ 4],11, 1272893353);
      c = hh(c, d, a, b, x[i+ 7],16,-1554976320); b = hh(b, c, d, a, x[i+10],23, -1094730640);
      a = hh(a, b, c, d, x[i+13], 4,  681279174); d = hh(d, a, b, c, x[i+ 0],11,  -358537222);
      c = hh(c, d, a, b, x[i+ 3],16, -722521979); b = hh(b, c, d, a, x[i+ 6],23,    76029189);
      a = hh(a, b, c, d, x[i+ 9], 4, -640364487); d = hh(d, a, b, c, x[i+12],11,  -421815835);
      c = hh(c, d, a, b, x[i+15],16,  530742520); b = hh(b, c, d, a, x[i+ 2],23,  -995338651);
      a = ii(a, b, c, d, x[i+ 0], 6, -198630844); d = ii(d, a, b, c, x[i+ 7],10, 1126891415);
      c = ii(c, d, a, b, x[i+14],15,-1416354905); b = ii(b, c, d, a, x[i+ 5],21,  -57434055);
      a = ii(a, b, c, d, x[i+12], 6, 1700485571); d = ii(d, a, b, c, x[i+ 3],10,-1894986606);
      c = ii(c, d, a, b, x[i+10],15,   -1051523); b = ii(b, c, d, a, x[i+ 1],21,-2054922799);
      a = ii(a, b, c, d, x[i+ 8], 6, 1873313359); d = ii(d, a, b, c, x[i+15],10,  -30611744);
      c = ii(c, d, a, b, x[i+ 6],15,-1560198380); b = ii(b, c, d, a, x[i+13],21, 1309151649);
      a = ii(a, b, c, d, x[i+ 4], 6, -145523070); d = ii(d, a, b, c, x[i+11],10,-1120210379);
      c = ii(c, d, a, b, x[i+ 2],15,  718787259); b = ii(b, c, d, a, x[i+ 9],21, -343485551);
      a = au(a, oa); b = au(b, ob); c = au(c, oc); d = au(d, od);
    }
    return hex(a) + hex(b) + hex(c) + hex(d);
  }

  function urlenc(obj) {
    return Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  }

  class TPLinkRouter {
    constructor({ host, username, password }) {
      this.host = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
      this.username = username;
      this.password = password;
      this.base = 'http://' + this.host;
    }

    async login() {
      const u = await md5safe(this.username);
      const p = await md5safe(this.password);
      const body = urlenc({
        usernameEncrypt: u,
        passwordEncrypt: p,
        'submit.htm?login.htm': 'Send',
      });
      const res = await window.http.post(this.base + '/login.cgi', body);
      if (!res.ok) throw new Error('فشل الاتصال بالراوتر (' + res.status + ')');
      // تحقق
      const check = await window.http.get(this.base + '/index.htm');
      if (/login\.htm/.test(check.body) && check.body.length < 400) {
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
      const html = res.body;
      const macs = [...html.matchAll(/<input[^>]*type=["']radio["'][^>]*name=["']select["'][^>]*value=["']([0-9a-fA-F]{12})["']/gi)]
        .map(m => m[1].toLowerCase().match(/.{2}/g).join(':'));
      const idxMatch = html.match(/wlanAcEnabled\.selectedIndex\s*=\s*(\d+)/);
      const idx = idxMatch ? Number(idxMatch[1]) : 0;
      const mode = ['disabled', 'allow', 'deny'][idx] || 'disabled';
      return { mode, macs };
    }
  }

  window.TPLinkRouter = TPLinkRouter;
  window._md5 = md5safe;
  console.log('[router] TPLinkRouter ready');
})();
