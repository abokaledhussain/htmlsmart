/* البحث في المصحف، مطابق لـ Search.kt في الأندرويد:
   رقم واحد صفحة، ورقمان سورة وآية، واسم سورة، أو كلمة أو عبارة من النص (كل ظهور نتيجة، مع جزء من الآية حوله) */
(function () {
  var MAX_RESULTS = 100;
  var SNIPPET_WORDS = 6;
  var DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g;
  var ALEF = /[أإآٱ]/g;
  var PAIR = /^(\d{1,3})\s+(\d{1,3})$/;
  var SINGLE = /^\d{1,3}$/;

  var wordIndex = null;   /* كل كلمة في المصحف بترتيبها مع صفحتها وآيتها ونصها المطبّع، تُبنى عند أول بحث بالكلمة */
  var pageFirst = null;   /* أول موضع في الفهرس لكل صفحة، لربط كلمات الصفحة بمواضعها */
  var highlight = {};     /* مواضع الكلمات المطابقة للنتيجة المختارة فقط (مفاتيحها مواضع الفهرس) */

  /* تطبيع للمقارنة: بدون تشكيل وتطويل، وتوحيد الألف والياء والتاء المربوطة */
  function normalize(s) {
    return s.replace(DIACRITICS, '')
      .replace(ALEF, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .trim();
  }

  /* تحديد الكلمات المطابقة للنتيجة المختارة، وتُلوَّن هذه المواضع فقط */
  function setHighlight(ids) {
    highlight = {};
    (ids || []).forEach(function (i) { highlight[i] = true; });
  }

  function isHit(gi) {
    return highlight[gi] === true;
  }

  /* الأرقام الهندية إلى غربية، حتى تُفهم الأرقام المكتوبة بأي لوحة مفاتيح */
  function toWestern(s) {
    return s.replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); });
  }

  function index() {
    if (wordIndex) return wordIndex;
    wordIndex = [];
    pageFirst = [];
    for (var n = 1; n <= QuranData.LAST_PAGE; n++) {
      pageFirst[n] = wordIndex.length;
      QuranData.pages[n].lines.forEach(function (line) {
        line.forEach(function (t) {
          if (t.type === 'w') {
            wordIndex.push({ page: n, surah: t.surah, ayah: t.ayah, text: t.text, norm: normalize(t.text) });
          }
        });
      });
    }
    pageFirst[QuranData.LAST_PAGE + 1] = wordIndex.length;
    return wordIndex;
  }

  /* موضع أول كلمة من الصفحة n في الفهرس العام */
  function firstWordOfPage(n) {
    index();
    return pageFirst[n];
  }

  function sameAyah(a, b) {
    return a.surah === b.surah && a.ayah === b.ayah;
  }

  /* جزء من الآية حول العبارة (من الكلمة i إلى الكلمة last): ست كلمات قبلها وست بعدها، مع موضع العبارة فيه */
  function snippetAt(list, i, last) {
    var w = list[i];
    var s = i, e = last;
    while (s > 0 && sameAyah(list[s - 1], w)) s--;
    while (e < list.length - 1 && sameAyah(list[e + 1], w)) e++;
    var from = Math.max(s, i - SNIPPET_WORDS);
    var to = Math.min(e, last + SNIPPET_WORDS);
    var text = from > s ? '… ' : '';
    var start = -1, end = -1;
    for (var j = from; j <= to; j++) {
      if (j > from) text += ' ';
      if (j === i) start = text.length;
      text += list[j].text;
      if (j === last) end = text.length;
    }
    if (to < e) text += ' …';
    return { text: text, start: start, end: end };
  }

  function result(page, title, subtitle, surah, ayah, start, end, ids) {
    return {
      page: page, title: title, subtitle: subtitle,
      surah: surah || 0, ayah: ayah || 0,
      hitStart: start === undefined ? -1 : start,
      hitEnd: end === undefined ? -1 : end,
      wordIds: ids || []
    };
  }

  /* نتيجة للعبارة التي تبدأ عند الكلمة i وتمتد إلى آخر كلمة في ids */
  function buildResult(list, i, ids) {
    var w = list[i];
    var sn = snippetAt(list, i, ids[ids.length - 1]);
    return result(w.page, sn.text,
      'سورة ' + SURAH_NAMES[w.surah - 1] + ' · آية ' + Util.digits(w.ayah),
      w.surah, w.ayah, sn.start, sn.end, ids);
  }

  function search(query) {
    var empty = { results: [] };
    var q = toWestern(query.trim());
    if (!q) return empty;

    var m = PAIR.exec(q);
    if (m) {
      var s = +m[1], a = +m[2];
      if (s < 1 || s > 114 || a < 1 || a > QuranData.ayahCount(s)) return empty;
      var p = QuranData.pageOfAyah(s, a);
      if (!p) return empty;
      var r = result(p, 'سورة ' + SURAH_NAMES[s - 1] + ' · آية ' + Util.digits(a), 'صفحة ' + Util.digits(p), s, a);
      return { results: [r] };
    }

    if (SINGLE.test(q)) {
      var n = +q;
      if (n >= 1 && n <= QuranData.LAST_PAGE) {
        var page = QuranData.pages[n];
        return { results: [result(n, 'صفحة ' + Util.digits(n), 'سورة ' + SURAH_NAMES[page.surah - 1])] };
      }
    }

    var nq = normalize(q);
    if (!nq) return empty;

    var surahs = [];
    SURAH_NAMES.forEach(function (name, i) {
      if (normalize(name).indexOf(nq) < 0) return;
      var sp = QuranData.startPageOf(i + 1);
      if (sp) surahs.push(result(sp, 'سورة ' + name, 'تبدأ من صفحة ' + Util.digits(sp)));
    });
    if (surahs.length) return { results: surahs };

    var parts = nq.split(' ').filter(function (p) { return p.length > 0; });
    var list = index();
    return { results: parts.length >= 2 ? phraseResults(list, parts) : wordResults(list, nq) };
  }

  /* كلمة واحدة: كل ظهور نتيجة مستقلة */
  function wordResults(list, nq) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].norm.indexOf(nq) < 0) continue;
      out.push(buildResult(list, i, [i]));
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
  }

  /* عبارة من أكثر من كلمة: كلمات متتالية داخل الآية نفسها، وكل موضع نتيجة مستقلة */
  function phraseResults(list, parts) {
    var out = [];
    var k = parts.length;
    for (var i = 0; i <= list.length - k; i++) {
      var ok = true;
      for (var j = 0; j < k; j++) {
        var w = list[i + j];
        if (!sameAyah(w, list[i]) || w.norm.indexOf(parts[j]) < 0) { ok = false; break; }
      }
      if (!ok) continue;
      var ids = [];
      for (var t = 0; t < k; t++) ids.push(i + t);
      out.push(buildResult(list, i, ids));
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
  }

  window.Search = {
    search: search,
    setHighlight: setHighlight,
    isHit: isHit,
    firstWordOfPage: firstWordOfPage,
    normalize: normalize
  };
})();
