/* بيانات المصحف: الصفحات والأسطر والرموز، مع أعداد الآيات وبدايات السور والأجزاء */
(function () {
  var LAST_PAGE = 604;
  var raw = window.QCF_DATA;
  var pages = {};
  var ayahCounts = [];
  var ayahPage = {};
  var starts = {};
  var maxLineEm = raw.maxLineEm;
  var fonts = raw.fonts;

  function build() {
    /* أولًا: نصوص الكلمات بالترتيب لحساب التجويد */
    var words = [];
    var n;
    for (n = 1; n <= LAST_PAGE; n++) {
      raw.pages[String(n)].lines.forEach(function (line) {
        line.t.forEach(function (it) { if (it[0] === 'w') words.push(it[4]); });
      });
    }
    var spans = Tajweed.compute(words);
    var idx = 0;
    for (n = 1; n <= LAST_PAGE; n++) {
      var p = raw.pages[String(n)];
      var lines = p.lines.map(function (line) {
        return line.t.map(function (it) {
          var type = it[0];
          var tok = { type: type, glyph: it[1], font: it[2], ayah: it[3], text: it[4], surah: it[5] || 0, spans: [] };
          if (type === 'w') { tok.spans = spans[idx++] || []; }
          if (type === 'w' || type === 'e') {
            var s = tok.surah;
            if (s >= 1 && s <= 114 && tok.ayah > 0) {
              if (!ayahCounts[s] || tok.ayah > ayahCounts[s]) ayahCounts[s] = tok.ayah;
              var key = s * 1000 + tok.ayah;
              if (ayahPage[key] === undefined) ayahPage[key] = n;
            }
          }
          return tok;
        });
      });
      pages[n] = { number: n, surah: p.surah, juz: p.juz, lines: lines };
    }
    Object.keys(raw.surahStart).forEach(function (k) { starts[+k] = raw.surahStart[k]; });
  }
  build();

  function ayahCount(surah) { return ayahCounts[surah] || 0; }
  function pageOfAyah(surah, ayah) { return ayahPage[surah * 1000 + ayah] || null; }
  function startPageOf(surah) { return starts[surah] || null; }
  function juzStartPage(juz) {
    for (var n = 1; n <= LAST_PAGE; n++) if (pages[n].juz === juz) return n;
    return null;
  }
  /* الخط المستخدم لرمز: ملفات الصفحات تنتهي بـ _W، وQBSML كما هو */
  function familyOf(font) {
    return font.indexOf('QBSML') >= 0 ? font : font + '_W';
  }

  window.QuranData = {
    LAST_PAGE: LAST_PAGE,
    pages: pages,
    fonts: fonts,
    maxLineEm: maxLineEm,
    ayahCount: ayahCount,
    pageOfAyah: pageOfAyah,
    startPageOf: startPageOf,
    juzStartPage: juzStartPage,
    familyOf: familyOf
  };
})();
