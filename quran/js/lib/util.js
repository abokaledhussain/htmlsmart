/* أدوات مشتركة: الأرقام العربية، والتحقق من الأرقام، وعناصر الواجهة */
(function () {
  var AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  function digits(n) {
    return String(n).replace(/[0-9]/g, function (d) { return AR[+d]; });
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function pad3(n) {
    var s = String(n);
    while (s.length < 3) s = '0' + s;
    return s;
  }

  window.Util = { digits: digits, clamp: clamp, el: el, pad3: pad3 };
})();
