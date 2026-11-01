/* تخطيط أسطر الصفحة كما في QuranPageView.kt: ملء العرض، واللف، والتصغير الطفيف، والتوزيع */
(function () {
  var PAD = 8;                 /* الحافة الداخلية بالبكسل */
  var SPREAD_CAP_EM = 0.12;    /* أقصى مسافة إضافية بين كلمتين في السطر الملفوف */
  var FIT_TOLERANCE = 0.05;    /* أقصى تجاوز يُعالج بالتصغير بدل النزول */
  var ctx = document.createElement('canvas').getContext('2d');

  function measure(glyph, font, size) {
    ctx.font = size + 'px "' + QuranData.familyOf(font) + '"';
    return ctx.measureText(glyph).width;
  }

  function sum(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s;
  }

  /* وحدات اللف: كل كلمة مع علامة نهاية الآية التي تليها، فلا تنفصل العلامة عن كلمتها */
  function unitsOf(tokens, widths) {
    var units = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === 'e' && units.length) {
        var last = units[units.length - 1];
        last.tokens.push(t);
        last.width += widths[i];
      } else {
        units.push({ tokens: [t], width: widths[i] });
      }
    }
    return units;
  }

  /* يقسم الوحدات إلى عدد الأسطر نفسه (k) بحيث لا يتجاوز أي سطر العرض،
     ويوزّع الفراغ بين الأسطر بأقل مجموع لمربعات الفراغ: فلا تبقى كلمة وحدها في آخر السطر إلا إن فرضها الحجم */
  function partition(units, k, avail) {
    var n = units.length;
    var INF = Infinity;
    var dp = [], from = [];
    for (var j = 0; j <= k; j++) {
      dp.push(new Array(n + 1).fill(INF));
      from.push(new Array(n + 1).fill(-1));
    }
    dp[0][0] = 0;
    for (var r = 1; r <= k; r++) {
      for (var i = 1; i <= n; i++) {
        var width = 0;
        for (var p = i - 1; p >= 0; p--) {
          width += units[p].width;
          if (width > avail && p < i - 1) break;
          if (dp[r - 1][p] === INF) continue;
          var slack = avail - width;
          var cost = dp[r - 1][p] + slack * slack;
          if (cost < dp[r][i]) { dp[r][i] = cost; from[r][i] = p; }
        }
      }
    }
    if (dp[k][n] === INF) return null;
    var out = [], end = n;
    for (var rr = k; rr >= 1; rr--) {
      var start = from[rr][end];
      var toks = [];
      for (var u = start; u < end; u++) toks = toks.concat(units[u].tokens);
      out.unshift(toks);
      end = start;
    }
    return out;
  }

  function countWords(tokens) {
    var c = 0;
    tokens.forEach(function (t) { if (t.type === 'w') c++; });
    return c;
  }

  /* يحسب الأسطر: fitPx حجم الملء، وrows الأسطر بعد اللف */
  function computeRows(page, width, sizeScale) {
    var avail = width - 2 * PAD;
    var maxW = 0;
    page.lines.forEach(function (tokens) {
      var w = sum(tokens.map(function (t) { return measure(t.glyph, t.font, 100); }));
      if (w > maxW) maxW = w;
    });
    var fitPx = maxW > 0 ? avail * 100 / maxW : 0;
    var size = fitPx * sizeScale;
    var rows = [];
    if (!(avail > 0) || size <= 0) return { fitPx: fitPx, size: size, rows: rows };

    page.lines.forEach(function (tokens) {
      var widths = tokens.map(function (t) { return measure(t.glyph, t.font, size); });
      var natural = sum(widths);
      if (natural <= avail) {
        rows.push({ tokens: tokens, widths: widths, scale: 1, wrapped: false });
        return;
      }
      /* الترويسة والبسملة رمز واحد لا يُلفّ، فنصغّر السطر كله ليبقى داخل الشاشة */
      var hasHeader = tokens.some(function (t) { return t.type === 'h'; });
      if (hasHeader || natural <= avail * (1 + FIT_TOLERANCE)) {
        rows.push({ tokens: tokens, widths: widths, scale: avail / natural, wrapped: true });
        return;
      }
      /* عدد الأسطر كما يعطيه اللف الجشع، ثم نعيد توزيع الكلمات على العدد نفسه بتوازن */
      var units = unitsOf(tokens, widths);
      var greedy = 0, curW = 0;
      units.forEach(function (u) {
        if (greedy === 0 || curW + u.width > avail) { greedy++; curW = u.width; }
        else curW += u.width;
      });
      /* نجرّب عدد الأسطر الأدنى ثم أكثر منه بسطر أو سطرين، ونختار التقسيم الذي فيه أقل سطور من كلمة واحدة */
      var best = null, bestSingles = Infinity;
      for (var extra = 0; extra <= 2; extra++) {
        var cand = partition(units, greedy + extra, avail);
        if (!cand) continue;
        var singles = 0;
        if (units.length > 1) cand.forEach(function (toks) { if (countWords(toks) === 1) singles++; });
        if (singles < bestSingles) { best = cand; bestSingles = singles; }
        if (singles === 0) break;
      }
      if (!best) best = [tokens];
      best.forEach(function (toks) {
        if (toks.length) rows.push({ tokens: toks, scale: 1, wrapped: true });
      });
    });
    return { fitPx: fitPx, size: size, rows: rows, avail: avail };
  }

  /* مسافة التوزيع في السطر الملفوف: إن كانت بين 0 و0.12em فنوزّع، وإلا نتمركز */
  function spreadOf(row, size, avail) {
    var n = row.tokens.length;
    if (!row.wrapped || n < 2) return false;
    var natural = sum(row.tokens.map(function (t) { return measure(t.glyph, t.font, size); }));
    var extra = (avail - natural) / (n - 1);
    return extra > 0 && extra <= SPREAD_CAP_EM * size;
  }

  window.Layout = { PAD: PAD, computeRows: computeRows, spreadOf: spreadOf, measure: measure };
})();
