/* التلاوة آية بآية من everyayah.com، مع الانتقال تلقائيًا للآية والسورة التالية، كما في AyahPlayer.kt */
(function () {
  var DEFAULT_RECITER = 'Husary_64kbps';
  var el = new Audio();
  el.preload = 'auto';
  var state = { surah: -1, ayah: -1, error: null };
  var listeners = [];

  function reciter() {
    var r = Store.get('reciter', null);
    return (typeof r === 'string' && r.trim()) ? r.trim() : DEFAULT_RECITER;
  }

  function notify() { listeners.forEach(function (fn) { fn(api); }); }

  function isActive() { return state.surah > 0; }

  function load() {
    state.error = null;
    var url = 'https://everyayah.com/data/' + reciter() + '/' + Util.pad3(state.surah) + Util.pad3(state.ayah) + '.mp3';
    el.src = url;
    var p = el.play();
    if (p && p.catch) p.catch(function () { fail(); });
    notify();
  }

  function fail() {
    state.error = 'تعذّر تشغيل الآية، تأكد من الاتصال بالإنترنت أو من اسم القارئ في الإعدادات';
    notify();
  }

  function play(surah, ayah) {
    state.surah = surah;
    state.ayah = ayah;
    load();
  }

  function togglePause() {
    if (!isActive()) return;
    if (el.paused) el.play().catch(fail); else el.pause();
    notify();
  }

  function next() {
    if (!isActive()) return;
    var count = QuranData.ayahCount(state.surah);
    if (state.ayah < count) state.ayah++;
    else if (state.surah < 114 && QuranData.ayahCount(state.surah + 1) > 0) { state.surah++; state.ayah = 1; }
    else { stop(); return; }
    load();
  }

  function previous() {
    if (!isActive()) return;
    if (state.ayah > 1) state.ayah--;
    else if (state.surah > 1) { state.surah--; state.ayah = Math.max(1, QuranData.ayahCount(state.surah)); }
    else return;
    load();
  }

  function stop() {
    el.pause();
    el.removeAttribute('src');
    el.load();
    state.surah = -1;
    state.ayah = -1;
    state.error = null;
    notify();
  }

  el.addEventListener('ended', function () { next(); });
  el.addEventListener('error', function () { if (isActive()) fail(); });
  el.addEventListener('play', notify);
  el.addEventListener('pause', notify);

  var api = {
    get surah() { return state.surah; },
    get ayah() { return state.ayah; },
    get error() { return state.error; },
    get isPlaying() { return isActive() && !el.paused; },
    isActive: isActive,
    reciter: reciter,
    DEFAULT_RECITER: DEFAULT_RECITER,
    play: play,
    togglePause: togglePause,
    next: next,
    previous: previous,
    stop: stop,
    onChange: function (fn) { listeners.push(fn); }
  };
  window.Audio_ = api;
})();
