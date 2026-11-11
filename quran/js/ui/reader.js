/* صفحات المصحف: عرض متصل بالتمرير، وتحميل الصفحات عند الاقتراب منها، والتحديد والتلاوة والتمرير التلقائي */
(function () {
  var reader = document.getElementById('reader');
  var pagesEl = document.getElementById('pages');
  var titleEl = document.getElementById('title');
  var juzEl = document.getElementById('juz');
  var scrollBar = document.getElementById('scrollbar');
  var scrollPlay = document.getElementById('scroll-play');
  var scrollSpeedLabel = document.getElementById('scroll-speed');
  var audioBar = document.getElementById('audiobar');
  var audioLabel = document.getElementById('audio-label');
  var audioPlay = document.getElementById('audio-play');
  var SURAH_NAMES = window.SURAH_NAMES;

  var LAST = QuranData.LAST_PAGE;
  var DEFAULT_SPEED = 3;
  var LONG_PRESS_MS = 500;
  var PLAYING_COLOR = '#C62828';
  var SEARCH_RED = '#D32F2F';

  var sections = {};
  var rendered = {};     /* رقم الصفحة -> مفتاح التخطيط الذي رُسمت به */
  var fontReady = {};    /* اسم الخط -> محمَّل */
  var state = { visible: 1, activeSurah: -1, activeAyah: -1, chrome: false, auto: false, saveTimer: null, curl: false, two: false };
  var tried = {};        /* عناصر التقليب التي طُلب تحميل خطوطها */
  var settings = { scale: 1, tajweed: 1 };
  var palette = null;
  var longTimer = null, longFired = false, downAt = null;
  var fadeTimer = null;

  /* ---------- الإعدادات ---------- */
  function readSettings() {
    settings.scale = FontScale.scaleFor(FontScale.percent());
    settings.tajweed = Util.clamp(Store.get('tajweedMode', 1), 0, 2);
  }

  function layoutKey() {
    return [pagesEl.clientWidth, settings.scale, settings.tajweed, palette.name].join('|');
  }

  function scrollSpeed() { return Util.clamp(Store.get('scrollSpeed', DEFAULT_SPEED), 1, 10); }

  /* ---------- الخطوط ---------- */
  function ensureFonts(page) {
    var families = {};
    page.lines.forEach(function (line) {
      line.forEach(function (t) { families[QuranData.familyOf(t.font)] = t.glyph; });
    });
    var jobs = Object.keys(families).map(function (f) {
      if (fontReady[f]) return Promise.resolve();
      return document.fonts.load('100px "' + f + '"', families[f]).then(
        function () { fontReady[f] = true; },
        function () { fontReady[f] = true; });
    });
    return Promise.all(jobs);
  }

  /* ---------- الألوان ---------- */
  function wordColor(t) {
    if (settings.tajweed === 0) return palette.ink;
    for (var i = 0; i < t.spans.length; i++) {
      var c = t.spans[i].color;
      if (settings.tajweed === 2 || c === 'ghunna' || c === 'qalqala') return Tajweed.COLORS[c];
    }
    return palette.ink;
  }

  function baseColorOf(t) {
    return t.type === 'w' ? wordColor(t) : palette.ink;
  }

  /* ---------- بناء الصفحة ---------- */
  function fontsReadyFor(page) {
    var ok = true;
    page.lines.forEach(function (line) {
      line.forEach(function (t) { if (!fontReady[QuranData.familyOf(t.font)]) ok = false; });
    });
    return ok;
  }

  /* busy: أثناء إعادة الرسم الشامل لا نعوّض الارتفاع، بل نضبط الموضع في النهاية */
  var busy = false;

  function renderPage(n) {
    var page = QuranData.pages[n];
    var sec = sections[n];
    if (!page || !sec) return;
    var key = layoutKey();
    if (rendered[n] === key) return;
    if (fontsReadyFor(page)) { draw(n, page, sec, key); return; }
    ensureFonts(page).then(function () {
      if (rendered[n] === key) return;
      draw(n, page, sec, key);
    });
  }

  function draw(n, page, sec, key) {
    var topBefore = sec.getBoundingClientRect().top;
    var heightBefore = sec.offsetHeight;
    var result = Layout.computeRows(page, pagesEl.clientWidth, settings.scale);
    /* مواضع كلمات الصفحة في الفهرس العام للبحث، لتلوين الكلمات المختارة فقط */
    var gi = Search.firstWordOfPage(n);
    var gis = new Map();
    page.lines.forEach(function (line) {
      line.forEach(function (t) { if (t.type === 'w') gis.set(t, gi++); });
    });
    sec.innerHTML = '';
    sec.style.minHeight = '';
    var prevJuz = n > 1 ? QuranData.pages[n - 1].juz : null;
    if (prevJuz !== page.juz) sec.appendChild(Util.el('div', 'juz', 'الجزء ' + Util.digits(page.juz)));

    var body = Util.el('div', 'lines');
    result.rows.forEach(function (row) {
      var size = result.size * row.scale;
      var line = Util.el('div', 'ln');
      line.style.height = (result.size * 1.5) + 'px';
      /* الترويسة والبسملة تحتاج فراغاً فوقها يفصلها عن الآية السابقة */
      if (row.tokens.some(function (t) { return t.type === 'h' || t.type === 'b'; })) {
        line.style.marginTop = (result.size * 1.5 * 0.35) + 'px';
      }
      line.style.justifyContent = Layout.spreadOf(row, result.size, result.avail) ? 'space-between' : 'center';
      row.tokens.forEach(function (t) {
        var span = Util.el('span', 'tok');
        span.textContent = t.glyph;
        span.style.fontFamily = '"' + QuranData.familyOf(t.font) + '"';
        span.style.fontSize = size + 'px';
        span.style.lineHeight = (result.size * 1.5) + 'px';
        /* كلمات العبارة المختارة تُلوَّن بالأحمر بدون تظليل، في الموضع الذي اختاره المستخدم فقط */
        var g = gis.has(t) ? gis.get(t) : -1;
        var hit = g >= 0 && Search.isHit(g);
        span.dataset.base = hit ? SEARCH_RED : baseColorOf(t);
        if (hit) span.dataset.hit = '1';
        if (g >= 0) span.dataset.gi = g;
        span.style.color = span.dataset.base;
        if (t.type === 'w' || t.type === 'e') {
          span.dataset.s = t.surah;
          span.dataset.a = t.ayah;
        }
        line.appendChild(span);
      });
      body.appendChild(line);
    });
    sec.appendChild(body);
    sec.appendChild(Util.el('div', 'pnum', Util.digits(n)));
    sec.appendChild(Util.el('div', 'divider'));
    rendered[n] = key;
    markStates(sec);

    /* إن تغيّر ارتفاع صفحة فوق الشاشة نعوّض الفرق حتى لا تقفز القراءة */
    var diff = sec.offsetHeight - heightBefore;
    if (!busy && diff && topBefore < reader.getBoundingClientRect().top) reader.scrollTop += diff;
  }

  /* تظليل الآية المختارة وتلوين الجارية تلاوتها */
  function markStates(root) {
    if (state.curl && !root) { Curl.clearCache(); Curl.draw(); return; }
    var toks = (root || pagesEl).querySelectorAll('.tok[data-a]');
    var playing = Audio_.isActive();
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      var s = +t.dataset.s, a = +t.dataset.a;
      var isPlaying = playing && s === Audio_.surah && a === Audio_.ayah;
      t.classList.toggle('hl', s === state.activeSurah && a === state.activeAyah);
      t.classList.toggle('play', isPlaying);
      t.style.color = isPlaying ? PLAYING_COLOR : t.dataset.base;
    }
  }

  /* ---------- تحميل الصفحات عند الاقتراب ---------- */
  function build() {
    for (var n = 1; n <= LAST; n++) {
      var sec = Util.el('section', 'page');
      sec.dataset.n = n;
      pagesEl.appendChild(sec);
      sections[n] = sec;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) renderPage(+e.target.dataset.n);
      });
    }, { root: reader, rootMargin: '1400px 0px' });
    Object.keys(sections).forEach(function (k) { io.observe(sections[k]); });
  }

  /* ---------- الموضع ---------- */
  function pageAtTop() {
    var rt = reader.getBoundingClientRect().top;
    var from = Math.max(1, state.visible - 3), to = Math.min(LAST, state.visible + 3);
    var best = state.visible;
    for (var n = from; n <= to; n++) {
      if (sections[n].getBoundingClientRect().top <= rt + reader.clientHeight * 0.35) best = n;
    }
    return best;
  }

  function setVisible(n) {
    if (n === state.visible && titleEl.dataset.page === String(n)) return;
    state.visible = n;
    titleEl.dataset.page = String(n);
    /* على الشاشات الضيقة نختصر النص حتى يبقى اسم السورة ظاهرًا كاملًا، كما في الأندرويد */
    var narrow = Math.min(window.innerWidth, window.innerHeight) < 600;
    titleEl.textContent = narrow
      ? 'سورة ' + SURAH_NAMES[QuranData.pages[n].surah - 1]
      : 'صفحة ' + Util.digits(n) + '  ·  سورة ' + SURAH_NAMES[QuranData.pages[n].surah - 1];
    juzEl.textContent = (narrow ? 'جزء ' : 'الجزء ') + Util.digits(QuranData.pages[n].juz);
    saveSoon();
  }

  function saveSoon() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(savePosition, 300);
  }

  function savePosition() {
    var n = state.visible;
    var offset = state.curl ? 0 : Math.round(sections[n].getBoundingClientRect().top - reader.getBoundingClientRect().top);
    Store.set('page', n);
    Store.set('pageOffset', offset);
  }

  function onScroll() {
    setVisible(pageAtTop());
    wakeAudioBar();
  }

  /* الانتقال إلى صفحة مع إزاحة، كما scrollToPositionWithOffset في الأندرويد */
  function preloadNeighbours(n) {
    [n - 1, n + 1].forEach(function (k) {
      if (k >= 1 && k <= LAST && QuranData.pages[k]) ensureFonts(QuranData.pages[k]);
    });
  }

  function jumpTo(n, offset) {
    n = Util.clamp(n, 1, LAST);
    offset = offset || 0;
    if (state.curl) {
      var cp = Spread.positionOf(n, state.two);
      setVisible(Spread.pagesAt(cp, state.two)[0]);
      Curl.jump(cp);
      return;
    }
    /* إن لم تُرسم الصفحة المطلوبة بعد (ينتظر خطها)، نعطيها ارتفاع الصفحة الحالية مؤقتاً
       حتى يتم الانتقال فورًا، ثم يُزال هذا الارتفاع عند الرسم */
    var prevH = sections[state.visible] ? sections[state.visible].offsetHeight : 0;
    if (!rendered[n] && prevH > 0 && !fontsReadyFor(QuranData.pages[n])) {
      sections[n].style.minHeight = prevH + 'px';
    }
    setVisible(n);
    var id = state.jumpId = (state.jumpId || 0) + 1;
    var place = function () {
      var rt = reader.getBoundingClientRect().top;
      reader.scrollTop += sections[n].getBoundingClientRect().top - rt - offset;
    };
    /* أي لمس أو تمرير يدوي يوقف الضبط التلقائي فورًا */
    var cancel = function () { state.jumpId++; };
    reader.addEventListener('touchstart', cancel, { passive: true });
    reader.addEventListener('wheel', cancel, { passive: true });
    reader.addEventListener('pointerdown', cancel, { passive: true });
    var finish = function () {
      reader.removeEventListener('touchstart', cancel);
      reader.removeEventListener('wheel', cancel);
      reader.removeEventListener('pointerdown', cancel);
    };
    renderPage(n);
    place();
    /* الصفحات فوق الهدف تُرسم لاحقًا وتغيّر الارتفاعات، والخطوط قد تصل بعد الرسم؛
       لذلك نعيد الضبط في كل إطار حتى يستقر الموضع أو تنتهي المهلة */
    var started = Date.now();
    var step = function () {
      if (state.jumpId !== id) { finish(); return; }
      renderPage(n);
      place();
      if (Date.now() - started < 1500) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
    ensureFonts(QuranData.pages[n]).then(function () {
      if (state.jumpId !== id) return;
      renderPage(n);
      place();
    });
    preloadNeighbours(n);
  }

  /* ---------- التحديد والضغط ---------- */
  function onPointerDown(e) {
    longFired = false;
    downAt = { x: e.clientX, y: e.clientY };
    clearTimeout(longTimer);
    var tok = e.target.closest ? e.target.closest('.tok[data-a]') : null;
    if (!tok) return;
    longTimer = setTimeout(function () {
      longFired = true;
      Reader.onLongPress(+tok.dataset.s, +tok.dataset.a, +tok.closest('.page').dataset.n);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e) {
    if (downAt && (Math.abs(e.clientX - downAt.x) > 10 || Math.abs(e.clientY - downAt.y) > 10)) {
      clearTimeout(longTimer);
    }
  }

  function onPointerUp() { clearTimeout(longTimer); }

  function onClick(e) {
    if (longFired) { longFired = false; return; }
    var tok = e.target.closest ? e.target.closest('.tok[data-a]') : null;
    if (tok) toggleAyah(+tok.dataset.s, +tok.dataset.a);
    toggleChrome();
  }

  function toggleAyah(s, a) {
    if (state.activeSurah === s && state.activeAyah === a) {
      state.activeSurah = -1;
      state.activeAyah = -1;
    } else {
      state.activeSurah = s;
      state.activeAyah = a;
    }
    markStates();
  }

  /* ---------- الأشرطة ---------- */
  function toggleChrome() { setChrome(!state.chrome); }

  function setChrome(show) {
    state.chrome = show;
    scrollBar.hidden = !show;
    scrollSpeedLabel.textContent = 'شريط التمرير · السرعة ' + Util.digits(scrollSpeed());
  }

  function changeSpeed(delta) {
    Store.set('scrollSpeed', Util.clamp(scrollSpeed() + delta, 1, 10));
    scrollSpeedLabel.textContent = 'شريط التمرير · السرعة ' + Util.digits(scrollSpeed());
  }

  function wakeAudioBar() {
    if (!Audio_.isActive()) return;
    audioBar.classList.remove('faded');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () { audioBar.classList.add('faded'); }, 2500);
  }

  function updateAudio() {
    if (Audio_.isActive()) {
      audioBar.hidden = false;
      audioLabel.textContent = Audio_.error || (SURAH_NAMES[Audio_.surah - 1] + ' · آية ' + Util.digits(Audio_.ayah));
      audioPlay.textContent = Audio_.isPlaying ? '❚❚' : '▶';
      wakeAudioBar();
    } else {
      audioBar.hidden = true;
    }
    markStates();
  }

  function onAudioChanged() {
    updateAudio();
    if (Audio_.isActive()) {
      var p = QuranData.pageOfAyah(Audio_.surah, Audio_.ayah);
      if (p && p !== state.visible) jumpTo(p, 0);
    }
  }

  /* ---------- التمرير التلقائي ---------- */
  var raf = null, lastTs = 0, remainder = 0, wakeLock = null;

  function tick(ts) {
    if (!state.auto) return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    remainder += (10 + (scrollSpeed() - 1) * 8) * dt;
    var dy = Math.floor(remainder);
    if (dy > 0) {
      remainder -= dy;
      reader.scrollTop += dy;
    }
    if (reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 2) {
      stopAuto();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function startAuto() {
    if (state.auto || state.curl) return;
    state.auto = true;
    lastTs = 0;
    remainder = 0;
    raf = requestAnimationFrame(tick);
    keepAwake();
    scrollPlay.textContent = '❚❚';
  }

  function stopAuto() {
    state.auto = false;
    cancelAnimationFrame(raf);
    keepAwake();
    scrollPlay.textContent = '▶';
  }

  /* الانتقال إلى أول كلمة من النتيجة داخل الصفحة (أو أول الآية إن لم تكن النتيجة كلمات)، ليظهر في أعلى الشاشة */
  function scrollToWord(n, s, a, gi, attempt) {
    attempt = attempt || 0;
    renderPage(n);
    var target = gi >= 0
      ? sections[n].querySelector('.tok[data-gi="' + gi + '"]')
      : sections[n].querySelector('.tok[data-s="' + s + '"][data-a="' + a + '"]');
    if (!target) {
      if (attempt < 12) setTimeout(function () { scrollToWord(n, s, a, gi, attempt + 1); }, 40);
      return;
    }
    var rt = reader.getBoundingClientRect().top;
    reader.scrollTop += target.getBoundingClientRect().top - rt - 100;
  }

  /* ---------- وضع التقليب (الاتجاه العرضي) ---------- */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#F4F9F2';
  }

  /* لوحة العنصر المطلوب: تُرسم بعد تحميل خطوطه، ولا تُرسم قبلها */
  function spreadEntry(pos) {
    var pages = Spread.pagesAt(pos, state.two);
    if (!Spread.fontsLoaded(pages)) {
      if (!tried[pos]) {
        tried[pos] = true;
        Spread.ready(pages).then(function () { Curl.clearCache(); Curl.draw(); });
      }
      return null;
    }
    var size = Curl.size();
    return Spread.render(pos, size.w, size.h, {
      two: state.two,
      scale: settings.scale,
      tajweed: settings.tajweed,
      page: cssVar('--page'),
      ink: cssVar('--ink'),
      muted: cssVar('--muted'),
      highlight: cssVar('--highlight'),
      activeSurah: state.activeSurah,
      activeAyah: state.activeAyah,
      playSurah: Audio_.isActive() ? Audio_.surah : -1,
      playAyah: Audio_.isActive() ? Audio_.ayah : -1
    });
  }

  /* يطبّق وضع العرض حسب الاتجاه الحالي وإعداداته، ويعيد true إن تغيّر الوضع */
  function applyMode() {
    var m = Spread.modeFor(Spread.isLandscape());
    var was = state.curl;
    state.curl = m.nav;
    state.two = m.two;
    reader.hidden = state.curl;
    if (state.curl) {
      if (state.auto) stopAuto();
      Curl.count = Spread.countOf(state.two);
      Curl.pos = Spread.positionOf(state.visible, state.two);
      Curl.show();
    } else {
      Curl.hide();
    }
    return was !== state.curl;
  }

  /* إبقاء الشاشة مضاءة: إذا فُعّل الخيار في الإعدادات، أو أثناء التمرير التلقائي */
  var keepWake = null;
  function keepAwake() {
    var want = !!Store.get('keepScreenOn', false) || state.auto;
    if (want && !keepWake && navigator.wakeLock) {
      navigator.wakeLock.request('screen').then(function (l) {
        keepWake = l;
        l.addEventListener('release', function () { keepWake = null; });
      }, function () {});
    } else if (!want && keepWake) {
      try { keepWake.release(); } catch (e) { /* لا شيء */ }
      keepWake = null;
    }
  }

  /* النقر في الوسط في وضع التقليب: الآية ثم الشريط، كما في الأندرويد */
  function curlCenterTap(x, y) {
    var hit = Curl.hitAt(x, y);
    if (hit) toggleAyah(hit.s, hit.a);
    toggleChrome();
  }

  var resizeT = null;
  function onResize() {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      var n = state.visible;
      applyMode();
      if (state.curl) Curl.clearCache();
      jumpTo(n, 0);
    }, 120);
  }

  /* ---------- الواجهة العامة ---------- */
  var Reader = {
    init: function (pal) {
      palette = pal;
      readSettings();
      build();
      reader.addEventListener('scroll', onScroll, { passive: true });
      pagesEl.addEventListener('pointerdown', onPointerDown);
      pagesEl.addEventListener('pointermove', onPointerMove);
      pagesEl.addEventListener('pointerup', onPointerUp);
      pagesEl.addEventListener('pointercancel', onPointerUp);
      pagesEl.addEventListener('click', onClick);
      document.getElementById('scroll-minus').addEventListener('click', function () { changeSpeed(-1); });
      document.getElementById('scroll-plus').addEventListener('click', function () { changeSpeed(1); });
      scrollPlay.addEventListener('click', function () { if (state.auto) stopAuto(); else startAuto(); });
      document.getElementById('scroll-close').addEventListener('click', function () { stopAuto(); setChrome(false); });
      document.getElementById('audio-prev').addEventListener('click', function () { Audio_.previous(); });
      document.getElementById('audio-next').addEventListener('click', function () { Audio_.next(); });
      document.getElementById('audio-close').addEventListener('click', function () { Audio_.stop(); });
      audioPlay.addEventListener('click', function () { Audio_.togglePause(); });
      Audio_.onChange(onAudioChanged);
      setChrome(false);
      updateAudio();
      Curl.provider = spreadEntry;
      Curl.onPageChanged = function (pos) {
        setVisible(Spread.pagesAt(pos, state.two)[0]);
        saveSoon();
      };
      Curl.onCenterTap = curlCenterTap;
      Curl.onLongPress = function (hit) { Reader.onLongPress(hit.s, hit.a, hit.page); };
      applyMode();
      keepAwake();
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) keepAwake(); });
      jumpTo(Util.clamp(Store.get('page', 1), 1, LAST), Store.get('pageOffset', 0));
    },

    /* إعادة الرسم بعد تغيير الحجم أو التجويد أو الثيم، مع البقاء في الصفحة نفسها */
    refresh: function (pal) {
      palette = pal || palette;
      readSettings();
      var changed = applyMode();
      keepAwake();
      if (state.curl) {
        Curl.clearCache();
        jumpTo(state.visible, 0);
        return;
      }
      if (changed) { jumpTo(state.visible, 0); markStates(); return; }
      var anchor = state.visible;
      var offset = sections[anchor].getBoundingClientRect().top - reader.getBoundingClientRect().top;
      busy = true;
      Object.keys(rendered).forEach(function (k) { rendered[+k] = null; });
      Object.keys(sections).forEach(function (k) {
        if (sections[k].childNodes.length) renderPage(+k);
      });
      busy = false;
      var rt = reader.getBoundingClientRect().top;
      reader.scrollTop += sections[anchor].getBoundingClientRect().top - rt - offset;
      markStates();
    },

    jumpTo: jumpTo,
    scrollToWord: scrollToWord,
    currentPage: function () { return state.visible; },
    updateAudio: updateAudio,
    onLongPress: function () {}
  };

  window.Reader = Reader;

  /* بعد اكتمال تحميل الخطوط نعيد قياس الأسطر المرسومة، لأن القياس قبل ذلك قد يعطي عرضاً خاطئاً
     للبسملة والترويسة فتخرج عن حدود الشاشة */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      try { if (Object.keys(rendered).length) Reader.refresh(); } catch (e) {}
    });
  }
})();
