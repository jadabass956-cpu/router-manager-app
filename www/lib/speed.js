// قياس السرعة + المعايرة — لا يحتاج خادم
(function() {
  'use strict';

  const BASE_TIMEOUT = 60000;

  // ═══════════ Download ═══════════
  function download(url, maxBytes, timeout = BASE_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const started = performance.now();
      let received = 0;
      let finished = false;
      const finish = (err) => {
        if (finished) return;
        finished = true;
        if (err) return reject(err);
        resolve({ bytes: received, ms: performance.now() - started });
      };
      fetch(url)
        .then((res) => {
          const reader = res.body.getReader();
          const read = () => {
            reader.read().then(({ done, value }) => {
              if (done) return finish();
              received += value.length;
              if (received >= maxBytes) {
                reader.cancel().catch(() => {});
                return finish();
              }
              read();
            }).catch(finish);
          };
          read();
        })
        .catch(finish);
    });
  }

  // ═══════════ Upload ═══════════
  function upload(url, totalBytes, timeout = BASE_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const started = performance.now();
      let sent = 0;
      let finished = false;

      const finish = (err) => {
        if (finished) return;
        finished = true;
        if (err) return reject(err);
        const ms = performance.now() - started;
        console.log('[speed] upload done: ' + totalBytes + ' bytes in ' + Math.round(ms) + ' ms');
        resolve({ bytes: totalBytes, ms });
      };

      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); finish(new Error('TIMEOUT')); }, timeout);

      // ═══ ReadableStream يرسل البيانات تدريجياً ═══
      let stream;
      try {
        stream = new ReadableStream({
          async pull(c) {
            if (sent >= totalBytes) { c.close(); return; }
            const size = Math.min(64 * 1024, totalBytes - sent);
            const arr = new Uint8Array(size);
            // بيانات عشوائية (غير قابلة للضغط)
            crypto.getRandomValues(arr);
            c.enqueue(arr);
            sent += size;
          }
        });
      } catch (e) {
        clearTimeout(timer);
        finish(new Error('STREAM_NOT_SUPPORTED'));
        return;
      }

      fetch(url, {
        method: 'POST',
        body: stream,
        headers: { 'Content-Type': 'application/octet-stream' },
        signal: controller.signal,
        duplex: 'half',
      })
        .then(() => { clearTimeout(timer); finish(); })
        .catch((e) => { clearTimeout(timer); finish(e); });
    });
  }

  // ═══════════ Measure ═══════════
  async function measure({ sizeMb = 2, samples = 1 } = {}) {
    const downBytes = sizeMb * 1024 * 1024;
    const upBytes = Math.max(1, Math.floor(sizeMb / 4)) * 1024 * 1024;

    const downResults = [];
    const upResults = [];

    // تحميل
    for (let i = 0; i < samples; i++) {
      try {
        const { bytes, ms } = await download(
          'https://speed.cloudflare.com/__down?bytes=' + downBytes, downBytes
        );
        if (bytes > 0 && ms > 0) {
          downResults.push({ mbps: (bytes * 8) / (ms / 1000) / 1e6, seconds: ms / 1000, bytes });
        }
      } catch (e) { console.warn('[speed] download failed:', e.message); }
    }

    // رفع
    for (let i = 0; i < samples; i++) {
      try {
        const { bytes, ms } = await upload('https://speed.cloudflare.com/__up', upBytes);
        if (bytes > 0 && ms > 0) {
          upResults.push({ mbps: (bytes * 8) / (ms / 1000) / 1e6, seconds: ms / 1000, bytes });
        }
      } catch (e) { console.warn('[speed] upload failed:', e.message); }
    }

    if (!downResults.length && !upResults.length) {
      return { ok: false, error: 'فشل قياس السرعة' };
    }

    const dlAvg = downResults.length ? downResults.reduce((s, r) => s + r.mbps, 0) / downResults.length : 0;
    const ulAvg = upResults.length ? upResults.reduce((s, r) => s + r.mbps, 0) / upResults.length : 0;

    return {
      ok: true,
      download: { mbps: Number(dlAvg.toFixed(2)), kbps: Math.round(dlAvg * 125), samples: downResults },
      upload: { mbps: Number(ulAvg.toFixed(2)), kbps: Math.round(ulAvg * 125), samples: upResults },
      mbps: Number(dlAvg.toFixed(2)),
      samples: downResults,
      testedAt: new Date().toISOString(),
    };
  }

  // ═══════════ Calibrate ═══════════
  async function calibrate({ sizeMb = 2 } = {}) {
    const { withRouter } = window.apiHelpers;
    const calibrator = window.appStore.getCalibration();

    let before;
    try { before = await withRouter((d) => d.getDevices()); }
    catch (e) { return { ok: false, reason: 'ROUTER_UNAVAILABLE', message: e.message }; }

    const beforeMap = {};
    for (const d of before) {
      if (d.mac && d.wifi) {
        beforeMap[d.mac.toLowerCase()] = { tx: Number(d.wifi.tx) || 0, rx: Number(d.wifi.rx) || 0 };
      }
    }

    const bytes = sizeMb * 1024 * 1024;
    let got = 0, ms = 0;
    try {
      const r = await download('https://speed.cloudflare.com/__down?bytes=' + bytes, bytes);
      got = r.bytes; ms = r.ms;
    } catch (e) { return { ok: false, reason: 'DOWNLOAD_FAILED', message: e.message }; }

    let after;
    try { after = await withRouter((d) => d.getDevices()); }
    catch (e) { return { ok: false, reason: 'ROUTER_UNAVAILABLE_AFTER', message: e.message }; }

    let bestMac = null, bestDelta = 0;
    for (const d of after) {
      const m = (d.mac || '').toLowerCase();
      const b = beforeMap[m];
      if (!b || !d.wifi) continue;
      const delta = (Number(d.wifi.rx) || 0) - b.rx;
      if (delta > bestDelta) { bestDelta = delta; bestMac = m; }
    }

    if (!bestMac || bestDelta < 10) {
      return { ok: false, reason: 'NO_TRAFFIC_DETECTED', bytes: got, delta: bestDelta };
    }

    const packetSize = Math.round(got / bestDelta);
    if (packetSize < 200 || packetSize > 2000) {
      return { ok: false, reason: 'OUT_OF_RANGE', packetSize };
    }

    const samples = (calibrator.samples || []).slice(-4);
    samples.push({ size: packetSize, at: Date.now(), mac: bestMac, bytes: got, packets: bestDelta });

    // متوسط مرجّح
    let sumW = 0, sum = 0;
    samples.forEach((s, i) => { const w = i + 1; sum += s.size * w; sumW += w; });
    const avg = Math.round(sum / sumW);

    window.appStore.setCalibration({
      packetSize: avg, samples, updatedAt: Date.now(), source: 'calibrated',
    });

    const mbps = Number(((got * 8) / (ms / 1000) / 1e6).toFixed(2));

    return {
      ok: true, packetSize: avg, samples: samples.length,
      device: bestMac, bytes: got, packets: bestDelta, mbps, ms: Math.round(ms),
    };
  }

  window.speedMeasure = measure;
  window.speedCalibrate = calibrate;
  console.log('[speed] ready');
})();
