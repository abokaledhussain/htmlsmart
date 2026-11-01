/* حجم الخط: من 1% إلى 200%، و50% هو الحجم العادي (ملء عرض الشاشة) كما في الأندرويد */
(function () {
  var MIN = 1, MAX = 200, DEFAULT = 50;

  /* الهاتف يبدأ من 40% كما في الأندرويد، والشاشات الكبيرة من 50% */
  function defaultPercent() {
    return Math.min(window.innerWidth, window.innerHeight) < 600 ? 40 : DEFAULT;
  }

  function percent() {
    return Util.clamp(Store.get('fontPercent', defaultPercent()), MIN, MAX);
  }

  function scaleFor(p) {
    p = Util.clamp(p, MIN, MAX);
    return p <= DEFAULT
      ? 0.3 + 0.7 * (p - MIN) / (DEFAULT - MIN)
      : 1 + 3 * (p - DEFAULT) / (MAX - DEFAULT);
  }

  window.FontScale = { MIN: MIN, MAX: MAX, DEFAULT: DEFAULT, percent: percent, scaleFor: scaleFor };
})();
