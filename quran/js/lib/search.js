/* البحث في المصحف، مطابق لـ Search.kt في الأندرويد:
   رقم واحد صفحة، ورقمان سورة وآية، واسم سورة، أو كلمة من النص (كل ظهور نتيجة، مع جزء من الآية حوله) */
(function () {
  var MAX_RESULTS = 100;
  var SNIPPET_WORDS = 6;
  var DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g;
  var ALEF = /[أإآٱ]/g;
  var PAIR = /^(\d{1,3})\s+(\d{1,3})$/;
  var SINGLE = /^\d{1,3}$/;

  var wordIndex = null;   /* كل كلمة في المصحف بترتيبها مع صفحتها وآيتها ونصها المطبّع، تُبنى عند أول بحث بالكلمة */
  var wordQuery = null;   /* النص المطبّع للكلمة المبحوث عنها الآن للتلوين بالأحمر، أو null */

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

  function wordHit(text) {
    return wordQuery !== null && normalize(text).indexOf(wordQuery) >= 0;
  }

  /* الأرقام الهندية إلى غربية، حتى تُفهم الأرقام المكتوبة بأي لوحة مفاتيح */
  function toWestern(s) {
    return s.replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); });
  }

  function index() {
    if (wordIndex) return wordIndex;
    wordIndex = [];
    for (var n = 1; n <= QuranData.LAST_PAGE; n++) {
      QuranData.pages[n].lines.forEach(function (line) {
        line.forEach(function (t) {
          if (t.type === 'w') {
            wordIndex.push({ page: n, surah: t.surah, ayah: t.ayah, text: t.text, norm: normalize(t.text) });
          }
        });
      });
    }
    return wordIndex;
  }

  /* جزء من الآية حول الكلمة: ست كلمات قبلها وست بعدها، مع موضع الكلمة فيه */
  function snippetAt(list, i) {
    var w = list[i];
    var s = i, e = i;
    while (s > 0 && list[s - 1].surah === w.surah && list[s - 1].ayah === w.ayah) s--;
    while (e < list.length - 1 && list[e + 1].surah === w.surah && list[e + 1].ayah === w.ayah) e++;
    var from = Math.max(s, i - SNIPPET_WORDS);
    var to = Math.min(e, i + SNIPPET_WORDS);
    var text = from > s ? '… ' : '';
    var start = -1, end = -1;
    for (var j = from; j <= to; j++) {
      if (j > from) text += ' ';
      if (j === i) start = text.length;
      text += list[j].text;
      if (j === i) end = text.length;
    }
    if (to < e) text += ' …';
    return { text: text, start: start, end: end };
  }

  function result(page, title, subtitle, surah, ayah, occurrence, start, end) {
    return {
      page: page, title: title, subtitle: subtitle,
      surah: surah || 0, ayah: ayah || 0, occurrence: occurrence || 0,
      hitStart: start === undefined ? -1 : start, hitEnd: end === undefined ? -1 : end
    };
  }

  function search(query) {
    var empty = { results: [], wordQuery: null };
    var q = toWestern(query.trim());
    if (!q) return empty;

    var m = PAIR.exec(q);
    if (m) {
      var s = +m[1], a = +m[2];
      if (s < 1 || s > 114 || a < 1 || a > QuranData.ayahCount(s)) return empty;
      var p = QuranData.pageOfAyah(s, a);
      if (!p) return empty;
      var r = result(p, 'سورة ' + SURAH_NAMES[s - 1] + ' · آية ' + Util.digits(a), 'صفحة ' + Util.digits(p), s, a);
      return { results: [r], wordQuery: null };
    }

    if (SINGLE.test(q)) {
      var n = +q;
      if (n >= 1 && n <= QuranData.LAST_PAGE) {
        var page = QuranData.pages[n];
        return { results: [result(n, 'صفحة ' + Util.digits(n), 'سورة ' + SURAH_NAMES[page.surah - 1])], wordQuery: null };
      }
    }

    var nq = normalize(q);

    var surahs = [];
    SURAH_NAMES.forEach(function (name, i) {
      if (normalize(name).indexOf(nq) < 0) return;
      var sp = QuranData.startPageOf(i + 1);
      if (sp) surahs.push(result(sp, 'سورة ' + name, 'تبدأ من صفحة ' + Util.digits(sp)));
    });
    if (surahs.length) return { results: surahs, wordQuery: null };

    /* كل ظهور للكلمة نتيجة مستقلة، وترقيمه داخل الآية في الصفحة الواحدة */
    var list = index();
    var out = [];
    var key = -1, keyPage = -1, occ = 0;
    for (var i2 = 0; i2 < list.length; i2++) {
      var w = list[i2];
      var k = w.surah * 1000 + w.ayah;
      if (k !== key || w.page !== keyPage) { key = k; keyPage = w.page; occ = 0; }
      if (w.norm.indexOf(nq) < 0) continue;
      var sn = snippetAt(list, i2);
      out.push(result(w.page, sn.text,
        'سورة ' + SURAH_NAMES[w.surah - 1] + ' · آية ' + Util.digits(w.ayah),
        w.surah, w.ayah, occ, sn.start, sn.end));
      occ++;
      if (out.length >= MAX_RESULTS) break;
    }
    return { results: out, wordQuery: nq };
  }

  window.Search = {
    search: search,
    wordHit: wordHit,
    setWordQuery: function (q) { wordQuery = q; },
    getWordQuery: function () { return wordQuery; },
    normalize: normalize
  };
})();
