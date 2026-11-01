/* نافذة البحث في المصحف، بتصميم الأندرويد: بطاقة مستديرة بنقش النجوم، وحقل بحث مستدير، ونتائج بجزء من الآية */
(function () {
  var DEBOUNCE_MS = 250;

  /* نجمة ثمانية: 16 رأسًا متناوبًا بين الطول الكامل والداخلي */
  function starPath(cx, cy, r, inner) {
    var d = '';
    for (var i = 0; i < 16; i++) {
      var rad = i % 2 === 0 ? r : inner;
      var a = i * Math.PI / 8 - Math.PI / 2;
      d += (i === 0 ? 'M' : 'L') + (cx + rad * Math.cos(a)).toFixed(2) + ' ' + (cy + rad * Math.sin(a)).toFixed(2) + ' ';
    }
    return d + 'Z';
  }

  var TILE = 44;
  var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='" + TILE + "' height='" + TILE + "'>" +
    "<path d='" + starPath(22, 22, 17, 8.5) + "' fill='none' stroke='#C9A84C' stroke-width='1' stroke-opacity='0.55'/></svg>";
  var PATTERN = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';

  var ICON = '<svg class="search-ic" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
    '<path d="M20 20 L16.5 16.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  /* يبني العنوان: الكلمة المطابقة بالأحمر وخط عريض */
  function appendTitle(node, r) {
    if (r.hitStart < 0 || r.hitEnd > r.title.length) {
      node.textContent = r.title;
      return;
    }
    node.appendChild(document.createTextNode(r.title.slice(0, r.hitStart)));
    node.appendChild(Util.el('span', 'search-hit', r.title.slice(r.hitStart, r.hitEnd)));
    node.appendChild(document.createTextNode(r.title.slice(r.hitEnd)));
  }

  function open() {
    var overlay = Util.el('div', 'modal-overlay');
    var panel = Util.el('div', 'search-panel');

    var head = Util.el('div', 'search-head-i');
    head.style.backgroundImage = PATTERN;
    head.appendChild(Util.el('h2', 'search-title', 'بحث في المصحف'));
    panel.appendChild(head);

    var body = Util.el('div', 'search-body');
    var field = Util.el('div', 'search-field');
    field.innerHTML = ICON;
    var input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'سورة، أو صفحة، أو السورة والآية، أو كلمة';
    input.setAttribute('enterkeyhint', 'search');
    input.autocomplete = 'off';
    field.appendChild(input);
    body.appendChild(field);

    var status = Util.el('div', 'search-status');
    var list = Util.el('div', 'search-list');
    body.appendChild(status);
    body.appendChild(list);
    panel.appendChild(body);

    var actions = Util.el('div', 'modal-actions');
    var closeBtn = Util.el('button', 'btn btn-primary', 'إغلاق');
    closeBtn.type = 'button';
    actions.appendChild(closeBtn);
    panel.appendChild(actions);
    overlay.appendChild(panel);

    var timer = null;
    var current = [];

    function close() {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function render(out, q) {
      current = out.results;
      Search.setWordQuery(out.wordQuery);
      list.innerHTML = '';
      current.forEach(function (r) {
        var b = Util.el('button', 'search-item');
        b.type = 'button';
        var t = Util.el('div', 'search-item-title');
        appendTitle(t, r);
        b.appendChild(t);
        b.appendChild(Util.el('div', 'search-item-sub', r.subtitle));
        b.addEventListener('click', function () { pick(r); });
        list.appendChild(b);
      });
      status.textContent = !q.trim() ? '' :
        current.length === 0 ? 'لا توجد نتائج' :
        current.length >= 100 ? 'أول 100 نتيجة' :
        'عدد النتائج: ' + Util.digits(current.length);
    }

    function run() {
      clearTimeout(timer);
      render(Search.search(input.value), input.value);
    }

    /* الانتقال: تحديث التلوين أولًا، ثم الصفحة، ثم السطر المحدد بعد استقرار الرسم */
    function pick(r) {
      close();
      Reader.refresh();
      Reader.jumpTo(r.page, 0);
      if (r.surah > 0) {
        setTimeout(function () { Reader.scrollToWord(r.page, r.surah, r.ayah, r.occurrence); }, 200);
      }
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(run, DEBOUNCE_MS);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); run(); }
    });
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    setTimeout(function () { input.focus(); }, 50);
  }

  window.SearchDialog = { open: open };
})();
