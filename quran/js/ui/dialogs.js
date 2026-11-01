/* النوافذ المنبثقة بالتصميم نفسه: إطار كريمي بحواف مستديرة وزخرفة إسلامية، ورسالة مؤقتة */
(function () {
  var ORNAMENT = '━━━━━  ۞  ━━━━━';

  /* opts: { title, quranTitle, subtitle, body (Node), actions: [{label, primary, danger, onClick(close)}], size: 'lg' } */
  function open(opts) {
    var overlay = Util.el('div', 'modal-overlay');
    var panel = Util.el('div', 'modal-panel' + (opts.size === 'lg' ? ' modal-lg' : ''));
    if (opts.title) {
      panel.appendChild(Util.el('h2', 'modal-title' + (opts.quranTitle ? ' quran-font' : ''), opts.title));
    }
    if (opts.subtitle) panel.appendChild(Util.el('p', 'modal-sub', opts.subtitle));
    panel.appendChild(Util.el('div', 'modal-orn', ORNAMENT));
    var body = Util.el('div', 'modal-body');
    if (opts.body) body.appendChild(opts.body);
    panel.appendChild(body);

    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    var actions = Util.el('div', 'modal-actions');
    (opts.actions || []).forEach(function (a) {
      var cls = 'btn' + (a.primary ? ' btn-primary' : '') + (a.danger ? ' btn-danger' : '');
      var btn = Util.el('button', cls, a.label);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        if (a.onClick) a.onClick(close); else close();
      });
      actions.appendChild(btn);
    });
    if (opts.actions && opts.actions.length) panel.appendChild(actions);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    return { close: close, body: body, panel: panel };
  }

  function toast(message) {
    var t = Util.el('div', 'toast', message);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2000);
  }

  function confirm(title, message, okLabel, onOk) {
    open({
      title: title,
      body: Util.el('p', 'modal-text', message),
      actions: [
        { label: okLabel, primary: true, danger: true, onClick: function (close) { close(); onOk(); } },
        { label: 'إلغاء' }
      ]
    });
  }

  window.Dialogs = { open: open, toast: toast, confirm: confirm };
})();
