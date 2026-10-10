// Stage 1 — طبقة Capacitor الأساسية
console.log('[Router Manager] Starting...');

function testNative() {
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      alert('✅ يعمل داخل APK\n\nالإصدار: ' + (window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : 'android'));
    } else {
      alert('⚠️ يعمل في المتصفح — ليس APK');
    }
  } catch (e) {
    alert('خطأ: ' + e.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Router Manager] Ready');
  document.body.dataset.ready = '1';
});
