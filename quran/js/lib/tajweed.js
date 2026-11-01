/* أحكام التجويد بقواعد تقريبية على النص العثماني، منقولة حرفيًا من Tajweed.kt في الأندرويد */
(function () {
  var COLORS = { ghunna: '#1E8C3A', qalqala: '#1565C0', madd: '#E65100', madd_strong: '#C62828' };
  var SHADDA = 'ّ', SUKUN = 'ْ', SUKUN_SMALL = 'ۡ', FATHA = 'َ', DAMMA = 'ُ',
      KASRA = 'ِ', MADDAH = 'ٓ', SUPER_ALEF = 'ٰ';
  var HAMZA = 'ءأإؤئآ', QALQALA = 'قطبجد';

  function isMark(c) {
    var cp = c.charCodeAt(0);
    return (cp >= 0x064B && cp <= 0x065F) || cp === 0x0670 || (cp >= 0x06D6 && cp <= 0x06ED);
  }

  function parse(w) {
    var out = [], i = 0;
    while (i < w.length) {
      if (isMark(w[i])) { i++; continue; }
      var start = i, ch = w[i];
      i++;
      var marks = '';
      while (i < w.length && isMark(w[i])) { marks += w[i]; i++; }
      out.push({ pos: start, ch: ch, end: i, marks: marks });
    }
    return out;
  }

  function hasSukun(m) { return m.indexOf(SUKUN) >= 0 || m.indexOf(SUKUN_SMALL) >= 0; }
  function has(m, c) { return m.indexOf(c) >= 0; }

  function nextLetter(words, wi, letters, k) {
    if (k + 1 < letters.length) return letters[k + 1].ch;
    if (wi + 1 < words.length) {
      var nl = parse(words[wi + 1]);
      if (nl.length) return nl[0].ch;
    }
    return null;
  }

  /* يعيد لكل كلمة قائمة مقاطع: {start, end, color} */
  function compute(words) {
    return words.map(function (w, wi) {
      var letters = parse(w), spans = [];
      for (var k = 0; k < letters.length; k++) {
        var l = letters[k], m = l.marks;
        if ((l.ch === 'ن' || l.ch === 'م') && has(m, SHADDA)) {
          spans.push({ start: l.pos, end: l.end, color: 'ghunna' });
        }
        if (QALQALA.indexOf(l.ch) >= 0 && hasSukun(m)) {
          spans.push({ start: l.pos, end: l.end, color: 'qalqala' });
        }
        var prev = k > 0 ? letters[k - 1] : null;
        var isMaddLetter = false;
        if (prev) {
          if ((l.ch === 'ا' || l.ch === 'ى') && (m === '' || m === SUPER_ALEF)) isMaddLetter = has(prev.marks, FATHA);
          else if (l.ch === 'و' && m === '') isMaddLetter = has(prev.marks, DAMMA);
          else if (l.ch === 'ي' && m === '') isMaddLetter = has(prev.marks, KASRA);
        }
        var isAlefMaddah = l.ch === 'آ' || has(m, MADDAH);
        if (isMaddLetter || isAlefMaddah) {
          var nextCh = nextLetter(words, wi, letters, k);
          var strong = (nextCh !== null && HAMZA.indexOf(nextCh) >= 0) || isAlefMaddah;
          spans.push({ start: l.pos, end: l.end, color: strong ? 'madd_strong' : 'madd' });
        }
      }
      return spans;
    });
  }

  window.Tajweed = { COLORS: COLORS, compute: compute };
})();
