/* التفاسير السبعة: كل سورة في ملف مستقل يُحمَّل عند الطلب، ويُفكّ ضغطه gzip في المتصفح */
(function () {
  var SOURCES = [
    { id: 'muyassar', name: 'التفسير الميسر' },
    { id: 'jalalayn', name: 'تفسير الجلالين' },
    { id: 'saddi', name: 'تفسير السعدي' },
    { id: 'baghawi', name: 'تفسير البغوي' },
    { id: 'qurtubi', name: 'تفسير القرطبي' },
    { id: 'waseet', name: 'التفسير الوسيط' },
    { id: 'tanweer', name: 'التحرير والتنوير' }
  ];
  var raw = {};      /* النص المشفر (base64) بعد تحميل ملف السورة */
  var cache = {};    /* المصفوفة بعد فك الضغط */
  var pending = {};  /* طلبات جارية حتى لا نحمّل الملف مرتين */

  /* يستدعيها ملف السورة نفسه عند تحميله */
  window.TAFSIR_LOAD = function (folder, surah, b64) {
    raw[folder + ':' + surah] = b64;
  };

  function decode(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('المتصفح لا يدعم فك الضغط (DecompressionStream)'));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text().then(function (text) { return JSON.parse(text); });
  }

  function loadSurah(folder, surah) {
    var key = folder + ':' + surah;
    if (cache[key]) return Promise.resolve(cache[key]);
    if (pending[key]) return pending[key];
    pending[key] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'data/tafsir/' + folder + '/' + surah + '.js';
      s.onload = function () {
        var b64 = raw[key];
        if (!b64) { reject(new Error('ملف التفسير فارغ')); return; }
        decode(b64).then(function (arr) {
          cache[key] = arr;
          delete raw[key];
          resolve(arr);
        }, reject);
      };
      s.onerror = function () { reject(new Error('تعذّر تحميل ملف التفسير')); };
      document.head.appendChild(s);
    }).then(function (arr) { delete pending[key]; return arr; },
            function (e) { delete pending[key]; throw e; });
    return pending[key];
  }

  /* نص تفسير آية، أو null إن لم يتوفر */
  function ayahText(sourceId, surah, ayah) {
    return loadSurah(sourceId, surah).then(function (arr) {
      if (ayah < 1 || ayah > arr.length) return null;
      var t = arr[ayah - 1];
      return t && String(t).trim() ? String(t) : null;
    });
  }

  window.Tafsir = { SOURCES: SOURCES, ayahText: ayahText };
})();
