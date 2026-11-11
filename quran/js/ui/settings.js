/* شاشة الإعدادات: حجم الخط، والتجويد، والقارئ، والمظهر، كما في SettingsActivity.kt */
(function () {
  var THEMES = [
    { name: 'أخضر هادئ', screen: '#F4F9F2', bar: '#8FBFA0', page: '#F4F9F2', ink: '#1B1B1B', highlight: '#E2EFDF', muted: '#333333', divider: '#E6F0E8' },
    { name: 'ورقي', screen: '#F7F0E1', bar: '#A67C52', page: '#F7F0E1', ink: '#3B2A1A', highlight: '#EAD9B8', muted: '#6B4F32', divider: '#E8DCC4' },
    { name: 'ليلي', screen: '#1C2420', bar: '#2E4A3D', page: '#1C2420', ink: '#E6EDE8', highlight: '#2F4A3D', muted: '#B8C7BE', divider: '#2A3530' },
    { name: 'سماوي', screen: '#EEF5FA', bar: '#5B8DB8', page: '#EEF5FA', ink: '#1B2A38', highlight: '#D5E6F3', muted: '#34506A', divider: '#D8E6F0' },
    { name: 'ذهبي فاتح', screen: '#FBF7EC', bar: '#B8963E', page: '#FBF7EC', ink: '#2B2110', highlight: '#F1E6C4', muted: '#6B5A2E', divider: '#EADFC4' }
  ];

  var screen = document.getElementById('settings-screen');
  var range = document.getElementById('font-range');
  var rangeLabel = document.getElementById('font-label');
  var recSel = document.getElementById('reciter');
  var themeRow = document.getElementById('theme-row');
  var selectedTheme = 0;

  function themeIndex() {
    var t = Util.clamp(Store.get('theme', 0), 0, THEMES.length - 1);
    return t;
  }

  function applyTheme(i) {
    var t = THEMES[i];
    var root = document.documentElement.style;
    root.setProperty('--screen', t.screen);
    root.setProperty('--bar', t.bar);
    root.setProperty('--page', t.page);
    root.setProperty('--ink', t.ink);
    root.setProperty('--highlight', t.highlight);
    root.setProperty('--muted', t.muted);
    root.setProperty('--divider', t.divider);
    return t;
  }

  function renderThemes() {
    themeRow.innerHTML = '';
    THEMES.forEach(function (t, i) {
      var item = Util.el('button', 'theme-item' + (i === selectedTheme ? ' selected' : ''));
      item.type = 'button';
      var sw = Util.el('div', 'theme-swatch');
      sw.style.background = t.bar;
      item.appendChild(sw);
      item.appendChild(Util.el('div', 'theme-name', t.name));
      item.addEventListener('click', function () {
        selectedTheme = i;
        renderThemes();
      });
      themeRow.appendChild(item);
    });
  }

  function fillReciters() {
    recSel.innerHTML = '';
    var saved = window.Audio_ ? Audio_.reciter() : '';
    var list = window.RECITERS.map(function (r) { return { name: r.name, folder: r.folder }; });
    if (!list.some(function (r) { return r.folder === saved; })) {
      list.push({ name: 'مخصص: ' + saved, folder: saved });
    }
    list.forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.folder;
      opt.textContent = r.name;
      if (r.folder === saved) opt.selected = true;
      recSel.appendChild(opt);
    });
  }

  function open() {
    var pct = FontScale.percent();
    range.value = pct;
    rangeLabel.textContent = 'الحجم: ' + pct + '%';
    var tj = Util.clamp(Store.get('tajweedMode', 1), 0, 2);
    document.querySelectorAll('input[name="taj"]').forEach(function (r) { r.checked = +r.value === tj; });
    /* التنقل وعدد الصفحات يخصان الاتجاه الحالي للجهاز */
    var landscape = Spread.isLandscape();
    var mode = Spread.modeFor(landscape);
    document.querySelector('input[name="nav"][value="' + (mode.nav ? 1 : 0) + '"]').checked = true;
    document.querySelector('input[name="spread"][value="' + (mode.two ? 2 : 1) + '"]').checked = true;
    document.getElementById('keep-awake').checked = !!Store.get('keepScreenOn', false);
    document.getElementById('mode-hint').textContent = 'هذه الخيارات تخص الاتجاه الحالي: ' + (landscape ? 'عرضي' : 'طولي');
    selectedTheme = themeIndex();
    renderThemes();
    fillReciters();
    screen.hidden = false;
  }

  function close() { screen.hidden = true; }

  function save() {
    Store.set('fontPercent', +range.value);
    var checked = document.querySelector('input[name="taj"]:checked');
    Store.set('tajweedMode', checked ? +checked.value : 1);
    Store.set('theme', selectedTheme);
    Store.set('reciter', recSel.value);
    Store.set('keepScreenOn', document.getElementById('keep-awake').checked);
    var navChecked = document.querySelector('input[name="nav"]:checked');
    var spreadChecked = document.querySelector('input[name="spread"]:checked');
    Spread.saveModeFor(Spread.isLandscape(),
      !!navChecked && +navChecked.value === 1,
      !!spreadChecked && +spreadChecked.value === 2);
    var t = applyTheme(selectedTheme);
    window.CurrentPalette = { name: THEMES[selectedTheme].name, ink: t.ink };
    close();
    Reader.refresh(window.CurrentPalette);
  }

  range.addEventListener('input', function () { rangeLabel.textContent = 'الحجم: ' + range.value + '%'; });
  document.getElementById('settings-save').addEventListener('click', save);
  document.getElementById('settings-cancel').addEventListener('click', close);
  document.getElementById('settings-back').addEventListener('click', close);

  window.Settings = {
    open: open,
    THEMES: THEMES,
    apply: function () {
      var i = themeIndex();
      var t = applyTheme(i);
      return { name: THEMES[i].name, ink: t.ink };
    }
  };
})();
