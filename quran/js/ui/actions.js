/* إجراءات الآية (الضغط المطوّل): التفسير والاستماع وحفظ العلامة، ونافذة نص التفسير */
(function () {
  var AYAH_GREEN = '#1E8C3A';

  function refText(s, a) {
    return 'سورة ' + SURAH_NAMES[s - 1] + ' · آية ' + Util.digits(a);
  }

  /* نص الآية كاملًا من الصفحة الحالية والمجاورتين، لأن الآية قد تمتد بين صفحتين */
  function ayahPlainText(s, a, page) {
    var parts = [];
    for (var p = Math.max(1, page - 1); p <= Math.min(QuranData.LAST_PAGE, page + 1); p++) {
      QuranData.pages[p].lines.forEach(function (line) {
        line.forEach(function (t) {
          if (t.type === 'w' && t.surah === s && t.ayah === a) parts.push(t.text);
        });
      });
    }
    return parts.length ? parts.join(' ') + ' ﴿' + Util.digits(a) + '﴾' : '';
  }

  function copyText(text) {
    var done = function () { Dialogs.toast('تم النسخ'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* لا شيء */ }
    ta.remove();
  }

  function shareText(text, title) {
    if (navigator.share) {
      navigator.share({ title: title || 'تفسير الآية', text: text }).catch(function () { /* ألغى المستخدم */ });
    } else {
      copyText(text);
    }
  }

  function ayahActions(s, a, page) {
    var ref = refText(s, a);
    var select = document.createElement('select');
    select.className = 'field';
    Tafsir.SOURCES.forEach(function (src, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = src.name;
      select.appendChild(opt);
    });

    var body = document.createElement('div');
    body.appendChild(Util.el('p', 'modal-label', 'اختر التفسير'));
    body.appendChild(select);

    /* حفظ العلامة، والقراءة، ومشاركة الآية وحدها بدون التفسير، في صف واحد */
    var row = Util.el('div', 'modal-row');
    var mark = Util.el('button', 'tile');
    mark.type = 'button';
    mark.innerHTML = '<span class="tile-ic">🏷</span><span>حفظ علامة</span>';
    var listen = Util.el('button', 'tile');
    listen.type = 'button';
    listen.innerHTML = '<span class="tile-ic">🔊</span><span>قراءة</span>';
    var share = Util.el('button', 'tile');
    share.type = 'button';
    share.innerHTML = '<span class="tile-ic">📤</span><span>مشاركة</span>';
    row.appendChild(mark);
    row.appendChild(listen);
    row.appendChild(share);
    body.appendChild(row);
    share.addEventListener('click', function () {
      shareText(ayahPlainText(s, a, page) + '\n' + ref, 'مشاركة الآية');
    });

    var dlg = Dialogs.open({
      title: 'تفسير الآية',
      subtitle: ref,
      body: body,
      actions: [
        { label: 'عرض التفسير', primary: true, onClick: function (close) {
          var src = Tafsir.SOURCES[+select.value];
          close();
          showTafsir(src, s, a, page);
        } },
        { label: 'إلغاء' }
      ]
    });
    listen.addEventListener('click', function () { dlg.close(); Audio_.play(s, a); });
    mark.addEventListener('click', function () {
      var added = Bookmarks.add(s, a, page);
      Dialogs.toast(added ? 'تم حفظ العلامة' : 'هذه الآية محفوظة مسبقًا');
      dlg.close();
    });
  }

  function showTafsir(src, s, a, page) {
    var ayahBox = Util.el('div', 'tafsir-ayah', ayahPlainText(s, a, page));
    var text = Util.el('div', 'tafsir-text', 'جارٍ التحميل…');
    var body = document.createElement('div');
    body.appendChild(ayahBox);
    body.appendChild(text);
    var current = '';

    var tools = Util.el('div', 'modal-row');
    var copy = Util.el('button', 'tile');
    copy.type = 'button';
    copy.innerHTML = '<span class="tile-ic">📋</span><span>نسخ</span>';
    var share = Util.el('button', 'tile');
    share.type = 'button';
    share.innerHTML = '<span class="tile-ic">📤</span><span>مشاركة</span>';
    tools.appendChild(copy);
    tools.appendChild(share);
    body.appendChild(tools);

    var dlg = Dialogs.open({
      title: src.name,
      subtitle: refText(s, a),
      body: body,
      size: 'lg',
      actions: [{ label: 'إغلاق', primary: true }]
    });
    var full = function () { return refText(s, a) + '\n' + ayahPlainText(s, a, page) + '\n\n' + current; };
    copy.addEventListener('click', function () { copyText(full()); });
    share.addEventListener('click', function () { shareText(full()); });

    Tafsir.ayahText(src.id, s, a).then(function (t) {
      current = t || 'لا يتوفر تفسير لهذه الآية في هذا الكتاب.';
      text.textContent = current;
    }, function (err) {
      current = 'تعذّر تحميل التفسير.\n' + (err && err.message ? err.message : '');
      text.textContent = current;
    });
    return dlg;
  }

  window.Actions = { ayahActions: ayahActions, copyText: copyText, refText: refText };
  Reader.onLongPress = function (s, a, page) { ayahActions(s, a, page); };
})();
