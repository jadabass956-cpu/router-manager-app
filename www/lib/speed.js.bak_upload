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

  // ═══════════ Measure ═══════════
  async function measure({ sizeMb = 2, samples = 1 } = {}) {
    const downBytes = sizeMb * 1024 * 1024;
    const downResults = [];

    for (let i = 0; i < samples; i++) {
      try {
        const { bytes, ms } = await download(
          'https://speed.cloudflare.com/__down?bytes=' + downBytes, downBytes
        );
        if (bytes > 0 && ms > 0) {
          downResults.push({ mbps: (bytes * 8) / (ms / 1000) / 1e6, seconds: ms / 1000, bytes });
        }
      } catch (e) {}
    }

    if (!downResults.length) return { ok: false, error: 'فشل قياس السرعة' };
    const avg = downResults.reduce((s, r) => s + r.mbps, 0) / downResults.length;
    const avgKbps = Math.round(avg * 125);

    return {
      ok: true,
      download: { mbps: Number(avg.toFixed(2)), kbps: avgKbps, samples: downResults },
      upload: { mbps: 0, kbps: 0, samples: [] },
      mbps: Number(avg.toFixed(2)),
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
