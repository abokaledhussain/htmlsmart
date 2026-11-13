/* رسم صفحة أو صفحتين على لوحة (canvas) للتقليب في الوضع العرضي، كما في CurlPageView وrenderSpread بالأندرويد */
(function () {
  var TOP = 24;              /* هامش علوي صغير أعلى الصفحة (بالبكسل) */
  var NUM_SIZE = 16;         /* حجم رقم الصفحة */
  var NUM_GAP = 4;           /* المسافة بين آخر سطر ورقم الصفحة */
  var NUM_SPACE = NUM_GAP + NUM_SIZE + 8;
  var FOLD_W = 26;           /* عرض تدرج الطيّة في المنتصف */
  var EDGE = 8;              /* عرض الأوراق المكدّسة على الحافة الخارجية */
  var STRIPES = ['#E6DDC9', '#D2C6AA', '#E6DDC9', '#CDBF9F', '#E6DDC9', '#C6B794', '#E0D6BE', '#BFB08C'];
  var PLAYING_COLOR = '#C62828';
  var LAST = QuranData.LAST_PAGE;

  /* موضع العنصر في القائمة: صفحة لكل عنصر، أو صفحتان */
  function positionOf(n, two) { return two ? Math.floor((n - 1) / 2) : n - 1; }
  function pagesAt(pos, two) {
    var list = two ? [pos * 2 + 1, pos * 2 + 2] : [pos + 1];
    return list.filter(function (n) { return n >= 1 && n <= LAST; });
  }
  function countOf(two) { return two ? Math.ceil(LAST / 2) : LAST; }

  /* تحميل الخطوط اللازمة لصفحات العنصر قبل الرسم */
  function ready(pages) {
    var families = {};
    pages.forEach(function (n) {
      QuranData.pages[n].lines.forEach(function (line) {
        line.forEach(function (t) { families[QuranData.familyOf(t.font)] = t.glyph; });
      });
    });
    return Promise.all(Object.keys(families).map(function (f) {
      return document.fonts.load('100px "' + f + '"', families[f]).then(
        function () {}, function () {});
    }));
  }

  function fontsLoaded(pages) {
    var ok = true;
    pages.forEach(function (n) {
      QuranData.pages[n].lines.forEach(function (line) {
        line.forEach(function (t) {
          if (!document.fonts.check('100px "' + QuranData.familyOf(t.font) + '"', t.glyph)) ok = false;
        });
      });
    });
    return ok;
  }

  /* لون الكلمة حسب التجويد، كما في reader.js */
  function wordColor(t, tajweed, ink) {
    if (tajweed === 0) return ink;
    for (var i = 0; i < t.spans.length; i++) {
      var c = t.spans[i].color;
      if (tajweed === 2 || c === 'ghunna' || c === 'qalqala') return Tajweed.COLORS[c];
    }
    return ink;
  }

  /**
   * يرسم العنصر على لوحة بالأبعاد المطلوبة.
   * opts: { two, scale, tajweed, page (لون الورق), ink, muted, highlight, activeSurah, activeAyah, playSurah, playAyah }
   * يعيد { canvas, hits } وhits بإحداثيات اللوحة نفسها.
   */
  function render(pos, w, h, opts) {
    var pages = pagesAt(pos, opts.two);
    var colW = opts.two ? Math.floor(w / 2) : w;
    var hits = [];
    var canvas = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = opts.page;
    c.fillRect(0, 0, w, h);

    /* تخطيط كل صفحة، ثم مقياس مشترك حتى لا يُقطع أطول سطر */
    var laid = pages.map(function (n) {
      var page = QuranData.pages[n];
      var res = Layout.computeRows(page, colW, opts.scale);
      return { n: n, page: page, res: res, lineH: res.size * 1.5, height: res.rows.length * res.size * 1.5 };
    });
    var tallest = laid.reduce(function (m, p) { return Math.max(m, p.height); }, 1);
    var s = Math.min(1, (h - TOP - NUM_SPACE) / tallest);

    laid.forEach(function (p, i) {
      var colX = (opts.two && i === 0) ? colW : 0;
      var left = colX + (colW - colW * s) / 2;
      c.save();
      c.beginPath();
      c.rect(colX, 0, colW, h);
      c.clip();
      c.translate(left, TOP);
      c.scale(s, s);
      drawColumn(c, p, colW, opts, hits, left, TOP, s);
      c.restore();
      /* رقم الصفحة أسفل آخر سطر مباشرة، في وسط العمود */
      var bottom = TOP + p.height * s;
      c.font = NUM_SIZE * 1 + 'px "' + 'system-ui' + '"';
      c.fillStyle = opts.muted;
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.fillText(Util.digits(p.n), colX + colW / 2, bottom + NUM_GAP + NUM_SIZE);
    });

    if (opts.two) {
      var fx = w / 2 - FOLD_W / 2;
      var g = c.createLinearGradient(fx, 0, fx + FOLD_W, 0);
      g.addColorStop(0, 'rgba(60,40,20,0)');
      g.addColorStop(0.32, 'rgba(60,40,20,0.10)');
      g.addColorStop(0.48, 'rgba(60,40,20,0.30)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.56, 'rgba(60,40,20,0.24)');
      g.addColorStop(0.8, 'rgba(60,40,20,0.06)');
      g.addColorStop(1, 'rgba(60,40,20,0)');
      c.fillStyle = g;
      c.fillRect(fx, 0, FOLD_W, h);
      /* نهاية الصفحات على الحافتين الخارجيتين: أوراق مكدّسة */
      var stripeW = EDGE / STRIPES.length;
      STRIPES.forEach(function (col, k) {
        c.fillStyle = col;
        c.fillRect(w - EDGE + k * stripeW, 0, stripeW, h);
        c.fillRect(k * stripeW, 0, stripeW, h);
      });
    }
    return { canvas: canvas, hits: hits };
  }

  /* رسم أسطر صفحة واحدة في إحداثيات الصفحة (قبل المقياس)، مع تسجيل مواضع الآيات */
  function drawColumn(c, p, colW, opts, hits, left, top, s) {
    var res = p.res;
    var pad = Layout.PAD;
    var avail = colW - 2 * pad;
    res.rows.forEach(function (row, ri) {
      var size = res.size * row.scale;
      var y = ri * p.lineH;
      c.font = size + 'px "' + QuranData.familyOf(row.tokens[0] ? row.tokens[0].font : '') + '"';
      var widths = row.tokens.map(function (t) {
        c.font = size + 'px "' + QuranData.familyOf(t.font) + '"';
        return c.measureText(t.glyph).width;
      });
      var natural = widths.reduce(function (a, b) { return a + b; }, 0);
      var spread = Layout.spreadOf(row, res.size, res.avail);
      var n = row.tokens.length;
      var gap = spread && n > 1 ? (avail - natural) / (n - 1) : 0;
      var total = natural + gap * Math.max(0, n - 1);
      /* الكلمات من اليمين إلى اليسار، فنبدأ من الحافة اليمنى للسطر الموسّط */
      var x = spread ? colW - pad : colW - pad - (avail - total) / 2;
      row.tokens.forEach(function (t, i) {
        var w = widths[i];
        var left0 = x - w;
        c.font = size + 'px "' + QuranData.familyOf(t.font) + '"';
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
        var isAyah = (t.type === 'w' || t.type === 'e') && t.surah > 0;
        var active = isAyah && t.surah === opts.activeSurah && t.ayah === opts.activeAyah;
        var playing = isAyah && t.surah === opts.playSurah && t.ayah === opts.playAyah;
        if (active) {
          c.fillStyle = opts.highlight;
          c.fillRect(left0, y, w, p.lineH);
        }
        c.fillStyle = playing ? PLAYING_COLOR : (t.type === 'w' ? wordColor(t, opts.tajweed, opts.ink) : opts.ink);
        c.fillText(t.glyph, left0, y + p.lineH * 0.8);
        if (isAyah) {
          hits.push({
            x: left + left0 * s, y: top + y * s, w: w * s, h: p.lineH * s,
            s: t.surah, a: t.ayah, page: p.n
          });
        }
        x = left0 - gap;
      });
    });
  }

  function isLandscape() { return window.matchMedia('(orientation: landscape)').matches; }

  /* التابلت: أصغر بعدي النافذة 600 بكسل أو أكثر (الآيباد وأجهزة اللوحات). الجوال والآيفون أصغر من ذلك */
  function isTablet() { return Math.min(window.innerWidth, window.innerHeight) >= 600; }

  /* إعدادات الاتجاه: التنقل (تقليب أو تمرير) وصفحة/صفحتان، والافتراضي للعرضي تقليب وصفحتان.
     على الجوال والآيفون: تمرير مستمر بصفحة واحدة في الاتجاهين، بلا تقليب ولا صفحتين */
  function modeFor(landscape) {
    if (!isTablet()) return { nav: false, two: false };
    return {
      nav: !!Store.get(landscape ? 'navLandscape' : 'navPortrait', landscape),
      two: !!Store.get(landscape ? 'twoPageLandscape' : 'twoPagePortrait', landscape)
    };
  }

  function saveModeFor(landscape, nav, two) {
    Store.set(landscape ? 'navLandscape' : 'navPortrait', nav);
    Store.set(landscape ? 'twoPageLandscape' : 'twoPagePortrait', two);
  }

  window.Spread = {
    LAST: LAST,
    isLandscape: isLandscape,
    isTablet: isTablet,
    modeFor: modeFor,
    saveModeFor: saveModeFor,
    positionOf: positionOf,
    pagesAt: pagesAt,
    countOf: countOf,
    ready: ready,
    fontsLoaded: fontsLoaded,
    render: render,
    TOP: TOP
  };
})();
