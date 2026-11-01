/* نوافذ الفهرس: علامات القراءة، والانتقال إلى صفحة، ودروس التجويد */
(function () {
  function fmtDate(t) {
    var d = new Date(t);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function bookmarksDialog(onOpen) {
    var list = Util.el('div', 'mark-list');
    var body = document.createElement('div');
    body.appendChild(list);

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.hidden = true;
    body.appendChild(fileInput);

    var dlg = null;
    function rebuild() {
      list.innerHTML = '';
      var marks = Bookmarks.all();
      if (!marks.length) {
        list.appendChild(Util.el('p', 'empty', 'لا توجد علامات محفوظة بعد.'));
        return;
      }
      marks.forEach(function (m) {
        var row = Util.el('div', 'mark-row');
        var info = Util.el('div', 'mark-info');
        info.appendChild(Util.el('div', 'mark-title', 'سورة ' + SURAH_NAMES[m.surah - 1] + ' · آية ' + Util.digits(m.ayah)));
        info.appendChild(Util.el('div', 'mark-meta', 'صفحة ' + Util.digits(m.page) + ' · ' + fmtDate(m.time)));
        info.addEventListener('click', function () { dlg.close(); onOpen(m.page); });
        var del = Util.el('button', 'btn btn-danger btn-small', 'حذف');
        del.type = 'button';
        del.addEventListener('click', function () {
          Dialogs.confirm('تحذير: حذف العلامة',
            'سيتم حذف علامة سورة ' + SURAH_NAMES[m.surah - 1] + ' · آية ' + Util.digits(m.ayah) + ' نهائيًا، ولا يمكن التراجع عن ذلك.',
            'حذف', function () {
              Bookmarks.remove(m);
              Dialogs.toast('تم حذف العلامة');
              rebuild();
            });
        });
        row.appendChild(info);
        row.appendChild(del);
        list.appendChild(row);
      });
    }

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = Bookmarks.importJson(String(reader.result));
        Dialogs.open({
          title: res.error ? 'تعذّرت الاستعادة' : 'تمت الاستعادة',
          body: Util.el('p', 'modal-text', res.error || ('تمت إضافة ' + res.added + ' علامة جديدة، والمكررة لم تُضَف.')),
          actions: [{ label: 'حسنًا', primary: true, onClick: function (close) { close(); rebuild(); } }]
        });
      };
      reader.readAsText(file, 'utf-8');
      fileInput.value = '';
    });

    rebuild();
    var row = Util.el('div', 'modal-row');
    var backup = Util.el('button', 'btn', 'نسخ احتياطي');
    backup.type = 'button';
    backup.addEventListener('click', function () { download('myquran-bookmarks.json', Bookmarks.exportJson()); });
    var restore = Util.el('button', 'btn', 'استعادة');
    restore.type = 'button';
    restore.addEventListener('click', function () { fileInput.click(); });
    row.appendChild(backup);
    row.appendChild(restore);
    body.appendChild(row);

    dlg = Dialogs.open({ title: 'علامات القراءة', subtitle: 'اضغط على علامة للانتقال إليها', body: body, size: 'lg',
      actions: [{ label: 'إغلاق', primary: true }] });
    return dlg;
  }

  function gotoDialog(onGo) {
    var input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.className = 'field field-center';
    input.placeholder = 'من 1 إلى ' + Util.digits(QuranData.LAST_PAGE);
    var body = document.createElement('div');
    body.appendChild(input);
    Dialogs.open({
      title: 'اذهب إلى صفحة',
      body: body,
      actions: [
        { label: 'ذهاب', primary: true, onClick: function (close) {
          var n = parseInt(input.value, 10);
          if (!(n >= 1 && n <= QuranData.LAST_PAGE)) {
            Dialogs.toast('أدخل رقمًا من 1 إلى ' + Util.digits(QuranData.LAST_PAGE));
            return;
          }
          close();
          onGo(n);
        } },
        { label: 'إلغاء' }
      ]
    });
    setTimeout(function () { input.focus(); }, 50);
  }

  window.Extras = { bookmarksDialog: bookmarksDialog, gotoDialog: gotoDialog };
})();
