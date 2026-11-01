/* نقطة البداية: تطبيق المظهر، ثم تشغيل المصحف، وربط الأزرار العلوية */
(function () {
  document.getElementById('open-index').addEventListener('click', function () { Index.open(); });
  document.getElementById('open-settings').addEventListener('click', function () { Settings.open(); });
  document.getElementById('open-search').addEventListener('click', function () { SearchDialog.open(); });

  /* ملء الشاشة: يعمل عبر Fullscreen API، ويُخفى الزر إن كان المتصفح أو WebView لا يدعمه */
  var fsButton = document.getElementById('toggle-fullscreen');
  var root = document.documentElement;

  function request() {
    return root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen && root.webkitRequestFullscreen();
  }

  function exit() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function updateFullscreenButton() {
    var on = isFullscreen();
    fsButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    fsButton.title = on ? 'الخروج من ملء الشاشة' : 'ملء الشاشة';
    fsButton.setAttribute('aria-label', fsButton.title);
  }

  var supported = !!(root.requestFullscreen || root.webkitRequestFullscreen) &&
                  !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  if (supported) {
    fsButton.hidden = false;
    fsButton.addEventListener('click', function () {
      try {
        var result = isFullscreen() ? exit() : request();
        if (result && result.catch) result.catch(function () {});
      } catch (e) { /* المتصفح رفض الطلب */ }
    });
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
    updateFullscreenButton();
  }

  Reader.init(Settings.apply());
  window.CurrentPalette = Settings.apply();
})();
