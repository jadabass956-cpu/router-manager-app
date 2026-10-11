// ═══════════════════════════════════════════════════════════
// Connection Identity — هوية الاتصال (IP + ISP + DNS advice)
// ═══════════════════════════════════════════════════════════
(function() {
  'use strict';

  // دول عربية (طبيعية للمستخدم السوري)
  const ARAB_COUNTRIES = ['SY', 'LB', 'JO', 'IQ', 'SA', 'AE', 'EG', 'TR'];

  async function fetchJson(url, timeout = 6000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  async function detectIdentity() {
    const result = { ok: false, errors: [] };

    // 1) IP + Country (من 1.1.1.1/cdn-cgi/trace - نص، ليس JSON)
    try {
      const ctrl = new AbortController();
      const t1 = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch('https://1.1.1.1/cdn-cgi/trace', { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(t1);
      const text = await r.text();
      const map = {};
      text.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) map[line.slice(0, idx)] = line.slice(idx + 1);
      });
      result.ip = map.ip || null;
      result.country = map.loc || null;
      result.colo = map.colo || null;
      result.tls = map.tls || null;
      result.warp = map.warp || null;
    } catch (e) {
      result.errors.push('cloudflare-trace: ' + e.message);
    }

    // 2) ISP + ASN (من ipleak.net)
    try {
      const data = await fetchJson('https://ipleak.net/json/');
      result.isp = data.isp_name || null;
      result.asn = data.as_number || null;
      result.asNetwork = data.as_network || null;
      result.city = data.city || null;
      result.countryName = data.country_name || null;
      if (data.ip && !result.ip) result.ip = data.ip;
    } catch (e) {
      result.errors.push('ipleak: ' + e.message);
    }

    // 3) DoH Test — هل الإنترنت يعمل بدون مشاكل؟
    try {
      const dns = await fetchJson('https://cloudflare-dns.com/dns-query?name=google.com&type=A', 5000);
      result.dohWorks = !!(dns && dns.Answer && dns.Answer.length > 0);
      result.dohIp = (dns.Answer && dns.Answer[0] && dns.Answer[0].data) || null;
    } catch (e) {
      result.dohWorks = false;
      result.errors.push('doh: ' + e.message);
    }

    // 4) التقييم
    const evalResult = evaluate(result);
    result.evaluation = evalResult;
    result.ok = !!result.ip;
    return result;
  }

  function evaluate(r) {
    const warnings = [];

    // فحص الدولة
    if (r.country && !ARAB_COUNTRIES.includes(r.country)) {
      if (r.country === 'US' || r.country === 'RU' || r.country === 'CN' || r.country === 'IR') {
        warnings.push({
          severity: 'high',
          text: 'اتصالك يمر عبر ' + r.country + ' — قد تكون VPN/proxy.',
        });
      } else {
        warnings.push({
          severity: 'medium',
          text: 'دولتك ' + r.country + ' — تحقق من أنها مقصودة.',
        });
      }
    }

    // فحص ISP
    if (r.isp && !/syri/i.test(r.isp) && !/bitakat/i.test(r.isp) && !/telecom/i.test(r.isp)) {
      warnings.push({
        severity: 'low',
        text: 'المزود: ' + r.isp + ' (ليس سوريا).',
      });
    }

    // WARP مفعّل؟
    if (r.warp === 'on') {
      warnings.push({
        severity: 'low',
        text: 'Cloudflare WARP مفعّل — اتصالك مُشفّر عبر VPN.',
      });
    }

    // DoH فشل؟
    if (r.dohWorks === false) {
      warnings.push({
        severity: 'medium',
        text: 'DoH لا يعمل — قد يكون محجوباً من الشبكة.',
      });
    }

    if (warnings.length === 0) {
      return { severity: 'ok', label: 'الاتصال طبيعي ✅', warnings: [] };
    }

    const maxSev = warnings.some(w => w.severity === 'high') ? 'high'
                  : warnings.some(w => w.severity === 'medium') ? 'medium' : 'low';
    return { severity: maxSev, label: 'يحتاج مراجعة', warnings };
  }

  window.dnsCheck = { detectIdentity, evaluate };
  console.log('[dns] ready');
})();
