/* HtmlSmart — نسخة الويب. منطق الواجهة والصفحات والمجلدات والإعدادات.
   المزامنة والقفل غير متاحين هنا، ويظهر لهما إشعار بتحميل نسخ الأجهزة الأخرى. */
(function () {
  'use strict';

  /** روابط تحميل نسخ الأجهزة الأخرى، عدّلها قبل النشر */
  const DOWNLOADS = [
    { name: 'Android', url: '#' },
    { name: 'Windows', url: '#' },
    { name: 'macOS', url: '#' },
    { name: 'iPhone (iOS)', url: '#' }
  ];

  const LONG_PRESS_MS = 500;
  const DEFAULT_HTML = '<h1>مرحباً</h1>\n<p>صفحة جديدة</p>';
  const ICONS = {
    more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>'
  };

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

  const DEFAULT_SETTINGS = { cols: 3, theme: 'system', textSize: 'medium', keepAwake: false, imageQuality: 85, lastBackup: 0 };
  let state = {
    pages: [],
    folders: [],
    order: [],
    settings: Object.assign({}, DEFAULT_SETTINGS)
  };
  let saveTimer = null;
  let longFired = false;
  let pendingIcon = null;

  // ---------- الحفظ ----------
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => HSStorage.write(state), 150);
  }

  // ---------- التنظيف والترتيب ----------
  /** رقم فريد للصفحة يطابق معرّف الأندرويد (لملفات الأيقونات والمرفقات في ZIP) */
  function nextNumId() {
    const max = state.pages.reduce((m, p) => Math.max(m, p.numId || 0), 0);
    return Math.max(max + 1, Date.now());
  }

  function normalize() {
    for (const p of state.pages) {
      if (!p.numId) p.numId = nextNumId();
      if (!p.assets) p.assets = {};
    }
    const pageIds = new Set(state.pages.map((p) => p.id));
    const folderIds = new Set();
    state.folders = state.folders.filter((f) => {
      if (folderIds.has(f.id)) return false;
      folderIds.add(f.id);
      return true;
    });
    for (const p of state.pages) {
      if (p.folderId && !folderIds.has(p.folderId)) p.folderId = null;
    }
    const seen = new Set();
    const order = [];
    for (const t of state.order) {
      if (typeof t !== 'string' || t.length < 3) continue;
      const id = t.slice(2);
      const ok = (t[0] === 'p' && pageIds.has(id) && !state.pages.find((p) => p.id === id).folderId)
        || (t[0] === 'f' && folderIds.has(id));
      if (ok && !seen.has(t)) {
        seen.add(t);
        order.push(t);
      }
    }
    for (const p of state.pages) {
      const t = 'p:' + p.id;
      if (!p.folderId && !seen.has(t)) { seen.add(t); order.push(t); }
    }
    for (const f of state.folders) {
      const t = 'f:' + f.id;
      if (!seen.has(t)) { seen.add(t); order.push(t); }
    }
    state.order = order;
  }

  function homeItems() {
    const out = [];
    for (const t of state.order) {
      const id = t.slice(2);
      if (t[0] === 'p') {
        const p = state.pages.find((x) => x.id === id);
        if (p && !p.folderId) out.push({ type: 'page', page: p });
      } else {
        const f = state.folders.find((x) => x.id === id);
        if (f) out.push({ type: 'folder', folder: f });
      }
    }
    return out;
  }

  function pagesIn(folderId) {
    return state.pages.filter((p) => p.folderId === folderId);
  }

  // ---------- الرسم ----------
  function iconNode(page) {
    const thumb = el('div', 'thumb');
    if (page.icon) {
      const img = el('img');
      img.src = page.icon;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.appendChild(el('div', 'default-icon', (page.title || '?').trim().charAt(0) || '?'));
    }
    return thumb;
  }

  function pageCard(page) {
    const card = el('div', 'card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', page.title);
    card.appendChild(iconNode(page));
    card.appendChild(el('div', 'label', page.title));
    const more = el('button', 'more');
    more.innerHTML = ICONS.more;
    more.setAttribute('aria-label', 'خيارات');
    more.addEventListener('click', (e) => { e.stopPropagation(); openPageMenu(page); });
    card.appendChild(more);
    bindPress(card, () => openPage(page), () => openPageMenu(page));
    return card;
  }

  function folderCard(folder) {
    const card = el('div', 'card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', folder.name);
    const thumb = el('div', 'thumb');
    thumb.style.borderRadius = '22px';
    const box = el('div', 'folder-thumb');
    box.style.width = '100%';
    box.style.height = '100%';
    for (const p of pagesIn(folder.id).slice(0, 4)) {
      const mini = el('div', 'mini');
      if (p.icon) {
        const img = el('img');
        img.src = p.icon;
        img.alt = '';
        mini.appendChild(img);
      } else {
        mini.textContent = '📄';
      }
      box.appendChild(mini);
    }
    thumb.appendChild(box);
    card.appendChild(thumb);
    card.appendChild(el('div', 'label', folder.name));
    bindPress(card, () => openFolder(folder), () => openFolderMenu(folder));
    return card;
  }

  /** نقرة قصيرة تفتح، والضغط المطول أو الزر الأيمن يفتح القائمة */
  function bindPress(node, onTap, onLong) {
    let timer = null;
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      longFired = false;
      clearTimeout(timer);
      timer = setTimeout(() => { longFired = true; onLong(); }, LONG_PRESS_MS);
    });
    const cancel = () => clearTimeout(timer);
    node.addEventListener('pointerup', cancel);
    node.addEventListener('pointerleave', cancel);
    node.addEventListener('pointercancel', cancel);
    node.addEventListener('click', () => {
      if (longFired) { longFired = false; return; }
      onTap();
    });
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); }
    });
    node.addEventListener('contextmenu', (e) => { e.preventDefault(); onLong(); });
  }

  function render() {
    const grid = $('#grid');
    const query = $('#search').value.trim().toLowerCase();
    grid.textContent = '';
    $('#brandFoot').classList.add('hidden');
    if (query) {
      const hits = state.pages.filter((p) => (p.title || '').toLowerCase().includes(query));
      hits.forEach((p) => grid.appendChild(pageCard(p)));
      $('#empty').textContent = 'لا توجد نتائج مطابقة.';
      $('#empty').classList.toggle('hidden', hits.length > 0);
      $('#brandFoot').classList.add('hidden');
      return;
    }
    const items = homeItems();
    for (const it of items) {
      grid.appendChild(it.type === 'page' ? pageCard(it.page) : folderCard(it.folder));
    }
    $('#empty').textContent = 'لا توجد صفحات بعد. اضغط + لإضافة صفحة.';
    $('#empty').classList.toggle('hidden', items.length > 0);
    $('#brandFoot').classList.remove('hidden');
  }

  const TEXT_SIZES = { small: '14px', medium: '15px', large: '17px' };

  function applySettings() {
    const root = document.documentElement;
    root.style.setProperty('--cols', String(state.settings.cols));
    root.style.fontSize = TEXT_SIZES[state.settings.textSize] || '15px';
    if (state.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.settings.theme);
    syncWakeLock();
  }

  /** إبقاء الشاشة مضاءة عبر Screen Wake Lock إن توفّر في المتصفح */
  let wakeSentinel = null;
  async function syncWakeLock() {
    try {
      const want = state.settings.keepAwake && document.visibilityState === 'visible';
      if (want && 'wakeLock' in navigator) {
        if (!wakeSentinel) {
          wakeSentinel = await navigator.wakeLock.request('screen');
          wakeSentinel.addEventListener('release', () => { wakeSentinel = null; });
        }
      } else if (wakeSentinel) {
        const s = wakeSentinel;
        wakeSentinel = null;
        await s.release();
      }
    } catch (_) {
      wakeSentinel = null;
    }
  }

  // ---------- ملء الشاشة ----------
  function toggleFullscreen() {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) {
        const p = req.call(root);
        if (p && p.catch) p.catch(() => {});
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function updateFullIcon() {
    const on = !!document.fullscreenElement;
    $('#btnFull').setAttribute('aria-label', on ? 'إنهاء ملء الشاشة' : 'ملء الشاشة');
    $('#fullIcon').innerHTML = on
      ? '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'
      : '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>';
  }

  /** يحذف المرفقات التي لم تعد تُشار إليها في HTML أو CSS أو JS أي صفحة، ويعيد عددها */
  function cleanOrphanFiles() {
    let removed = 0;
    for (const p of state.pages) {
      const text = [p.html, p.css, p.js].join('\n');
      for (const rel of Object.keys(p.assets || {})) {
        if (!text.includes(rel)) {
          delete p.assets[rel];
          removed++;
        }
      }
    }
    if (removed) save();
    return removed;
  }

  // ---------- الصفحات ----------
  /** يستبدل المسارات النسبية (مثل img/logo.png) بروابط البيانات المحفوظة، لأن الصفحة تُعرض معزولة */
  function rewriteAssets(text, assets) {
    if (!text || !assets) return text;
    let out = text;
    const keys = Object.keys(assets).sort((a, b) => b.length - a.length);
    for (const rel of keys) {
      const esc = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(^|[\\s"\'(=,;:])(?:\\./)?' + esc + '(?=[\\s"\')?#;,]|$)', 'g');
      out = out.replace(re, (m, pre) => pre + assets[rel]);
    }
    return out;
  }

  function buildDoc(page, draft) {
    const assets = draft ? draft.assets : (page && page.assets);
    const html = rewriteAssets(draft ? draft.html : page.html, assets);
    const css = rewriteAssets(draft ? draft.css : page.css, assets);
    const js = rewriteAssets(draft ? draft.js : page.js, assets);
    const styleTag = css ? `<style>\n${css}\n</style>` : '';
    const scriptTag = js ? `<script>\n${js}\n</script>` : '';
    if (/<html[\s>]|<!doctype/i.test(html)) {
      let doc = html;
      doc = /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, styleTag + '</head>') : styleTag + doc;
      doc = /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, scriptTag + '</body>') : doc + scriptTag;
      return doc;
    }
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styleTag}</head><body>${html}${scriptTag}</body></html>`;
  }

  function openPage(page) {
    closeOverlays();
    $('#viewerTitle').textContent = page.title;
    $('#viewerFrame').srcdoc = buildDoc(page);
    $('#viewer').classList.remove('hidden');
    $('#viewerEdit').onclick = () => { closeViewer(); openEditor(page); };
  }

  function closeViewer() {
    $('#viewer').classList.add('hidden');
    $('#viewerFrame').srcdoc = '';
  }

  function openEditor(page, afterSave) {
    pendingIcon = undefined;
    const isNew = !page;
    const draft = page ? { ...page } : { title: '', html: DEFAULT_HTML, css: '', js: '', icon: '', assets: {} };
    const wrap = el('div');
    wrap.appendChild(el('h2', '', isNew ? 'صفحة جديدة' : 'تعديل الصفحة'));

    const titleLbl = el('label', '', 'عنوان الصفحة');
    const titleIn = el('input');
    titleIn.type = 'text';
    titleIn.maxLength = 60;
    titleIn.value = draft.title;
    titleLbl.appendChild(titleIn);
    wrap.appendChild(titleLbl);

    const iconRow = el('div', 'icon-pick');
    const thumb = el('div', 'thumb');
    const preview = () => {
      thumb.textContent = '';
      const src = pendingIcon !== undefined ? pendingIcon : draft.icon;
      if (src) {
        const img = el('img');
        img.src = src;
        img.alt = '';
        thumb.appendChild(img);
      } else {
        thumb.appendChild(el('div', 'default-icon', (titleIn.value.trim().charAt(0) || '?')));
      }
    };
    preview();
    titleIn.addEventListener('input', preview);
    const pickBtn = el('button', 'btn ghost', 'اختيار أيقونة');
    pickBtn.type = 'button';
    pickBtn.onclick = () => {
      $('#filePick').onchange = async (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        pendingIcon = await fileToIcon(f);
        preview();
      };
      $('#filePick').click();
    };
    const clearBtn = el('button', 'btn ghost', 'بدون أيقونة');
    clearBtn.type = 'button';
    clearBtn.onclick = () => { pendingIcon = ''; preview(); };
    iconRow.append(thumb, pickBtn, clearBtn);
    wrap.appendChild(iconRow);

    const tabs = el('div', 'tabs');
    const areas = {};
    const tabNames = [['html', 'HTML'], ['css', 'CSS'], ['js', 'JS']];
    const tabBtns = {};
    let current = 'html';
    const area = el('textarea');
    area.spellcheck = false;
    area.value = draft.html;
    const showTab = (name) => {
      areas[current] = area.value;
      current = name;
      area.value = areas[name] !== undefined ? areas[name] : draft[name];
      for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('on', k === name);
    };
    for (const [key, label] of tabNames) {
      const b = el('button', '', label);
      b.type = 'button';
      b.onclick = () => showTab(key);
      tabBtns[key] = b;
      tabs.appendChild(b);
    }
    tabBtns.html.classList.add('on');
    wrap.appendChild(tabs);
    wrap.appendChild(area);

    const row = el('div', 'row end');
    const cancel = el('button', 'btn ghost', 'إلغاء');
    cancel.type = 'button';
    const prev = el('button', 'btn ghost', 'معاينة');
    prev.type = 'button';
    const saveBtn = el('button', 'btn', 'حفظ');
    saveBtn.type = 'button';
    cancel.onclick = closeModal;
    prev.onclick = () => {
      areas[current] = area.value;
      const d = { html: areas.html !== undefined ? areas.html : draft.html, css: areas.css !== undefined ? areas.css : draft.css, js: areas.js !== undefined ? areas.js : draft.js, assets: draft.assets || {} };
      closeModal();
      $('#viewerTitle').textContent = titleIn.value.trim() || 'معاينة';
      $('#viewerFrame').srcdoc = buildDoc(null, d);
      $('#viewer').classList.remove('hidden');
      $('#viewerEdit').onclick = () => { closeViewer(); openEditor(page, afterSave); };
    };
    saveBtn.onclick = () => {
      areas[current] = area.value;
      const title = titleIn.value.trim() || 'صفحة بلا عنوان';
      const html = areas.html !== undefined ? areas.html : draft.html;
      const css = areas.css !== undefined ? areas.css : draft.css;
      const js = areas.js !== undefined ? areas.js : draft.js;
      const icon = pendingIcon !== undefined ? pendingIcon : draft.icon;
      if (page) {
        Object.assign(page, { title, html, css, js, icon, updatedAt: Date.now() });
      } else {
        const p = { id: uid(), numId: nextNumId(), title, html, css, js, icon, assets: {}, folderId: null, createdAt: Date.now(), updatedAt: Date.now() };
        state.pages.push(p);
        state.order.push('p:' + p.id);
      }
      normalize();
      save();
      closeModal();
      render();
      if (afterSave) afterSave();
    };
    row.append(cancel, prev, saveBtn);
    wrap.appendChild(row);
    openModal(wrap);
    titleIn.focus();
  }

  function fileToIcon(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2;
        const sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        const q = (state.settings.imageQuality || 85) / 100;
        let out = canvas.toDataURL('image/webp', q);
        if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', q);
        URL.revokeObjectURL(url);
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    });
  }

  function deletePage(page) {
    confirmBox(`حذف الصفحة "${page.title}" نهائياً؟`, 'حذف', () => {
      state.pages = state.pages.filter((p) => p.id !== page.id);
      state.order = state.order.filter((t) => t !== 'p:' + page.id);
      normalize();
      save();
      render();
    });
  }

  function movePage(page, folderId) {
    page.folderId = folderId;
    page.updatedAt = Date.now();
    normalize();
    save();
    render();
  }

  // ---------- القوائم ----------
  function openPageMenu(page) {
    const wrap = el('div');
    wrap.appendChild(el('h2', '', page.title));
    const list = el('ul', 'list');
    const addItem = (label, fn, cls) => {
      const li = el('li');
      const b = el('button', cls || '', label);
      b.type = 'button';
      b.onclick = () => { closeModal(); fn(); };
      li.appendChild(b);
      list.appendChild(li);
    };
    addItem('📖 فتح', () => openPage(page));
    addItem('✏️ تعديل', () => openEditor(page));
    addItem('📁 نقل إلى مجلد', () => openMovePicker(page));
    if (page.folderId) addItem('📤 إخراج من المجلد', () => movePage(page, null));
    addItem('🗑 حذف', () => deletePage(page), 'danger-text');
    wrap.appendChild(list);
    const row = el('div', 'row end');
    const close = el('button', 'btn ghost', 'إغلاق');
    close.type = 'button';
    close.onclick = closeModal;
    row.appendChild(close);
    wrap.appendChild(row);
    openModal(wrap, true);
  }

  function openMovePicker(page) {
    const wrap = el('div');
    wrap.appendChild(el('h2', '', 'نقل "' + page.title + '" إلى'));
    const list = el('ul', 'list');
    const choose = (folderId) => { closeModal(); movePage(page, folderId); };
    if (state.folders.length === 0) {
      wrap.appendChild(el('p', '', 'لا توجد مجلدات بعد. أنشئ مجلداً من القائمة الجانبية أولاً.'));
    }
    for (const f of state.folders) {
      const li = el('li');
      const b = el('button', '', '📂 ' + f.name);
      b.type = 'button';
      b.onclick = () => choose(f.id);
      li.appendChild(b);
      list.appendChild(li);
    }
    const li = el('li');
    const root = el('button', '', '🏠 الشاشة الرئيسية');
    root.type = 'button';
    root.onclick = () => choose(null);
    li.appendChild(root);
    list.prepend(li);
    wrap.appendChild(list);
    const row = el('div', 'row end');
    const cancel = el('button', 'btn ghost', 'إلغاء');
    cancel.type = 'button';
    cancel.onclick = closeModal;
    row.appendChild(cancel);
    wrap.appendChild(row);
    openModal(wrap, true);
  }

  function openFolder(folder) {
    const wrap = el('div');
    wrap.appendChild(el('h2', '', folder.name));
    const pages = pagesIn(folder.id);
    if (!pages.length) wrap.appendChild(el('p', '', 'المجلد فارغ. أضف صفحات إليه من قائمة الصفحة: "نقل إلى مجلد".'));
    const grid = el('div', 'grid');
    grid.style.padding = '0';
    grid.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
    for (const p of pages) grid.appendChild(pageCard(p));
    wrap.appendChild(grid);
    const row = el('div', 'row end');
    const rename = el('button', 'btn ghost', 'إعادة تسمية');
    rename.type = 'button';
    rename.onclick = () => { closeModal(); promptName('اسم المجلد', folder.name, (name) => { folder.name = name; save(); render(); }); };
    const dissolve = el('button', 'btn ghost', 'تفكيك المجلد');
    dissolve.type = 'button';
    dissolve.onclick = () => { closeModal(); dissolveFolder(folder); };
    const close = el('button', 'btn', 'إغلاق');
    close.type = 'button';
    close.onclick = closeModal;
    row.append(rename, dissolve, close);
    wrap.appendChild(row);
    openModal(wrap);
  }

  function openFolderMenu(folder) {
    const wrap = el('div');
    wrap.appendChild(el('h2', '', folder.name));
    const list = el('ul', 'list');
    const items = [
      ['📂 فتح', () => openFolder(folder)],
      ['✏️ تغيير الاسم', () => promptName('اسم المجلد', folder.name, (name) => { folder.name = name; save(); render(); })],
      ['🧩 تفكيك المجلد', () => dissolveFolder(folder)]
    ];
    for (const [label, fn] of items) {
      const li = el('li');
      const b = el('button', '', label);
      b.type = 'button';
      b.onclick = () => { closeModal(); fn(); };
      li.appendChild(b);
      list.appendChild(li);
    }
    wrap.appendChild(list);
    const row = el('div', 'row end');
    const close = el('button', 'btn ghost', 'إغلاق');
    close.type = 'button';
    close.onclick = closeModal;
    row.appendChild(close);
    wrap.appendChild(row);
    openModal(wrap, true);
  }

  function dissolveFolder(folder) {
    const idx = state.order.indexOf('f:' + folder.id);
    const freed = pagesIn(folder.id).map((p) => { p.folderId = null; return 'p:' + p.id; });
    state.folders = state.folders.filter((f) => f.id !== folder.id);
    if (idx >= 0) state.order.splice(idx, 1, ...freed);
    else state.order.push(...freed);
    normalize();
    save();
    render();
  }

  function createFolder() {
    promptName('اسم المجلد الجديد', 'مجلد جديد', (name) => {
      const f = { id: uid(), name };
      state.folders.push(f);
      state.order.push('f:' + f.id);
      normalize();
      save();
      render();
    });
  }

  // ---------- النوافذ العامة ----------
  function openModal(node, compact) {
    const modal = $('#modal');
    modal.textContent = '';
    modal.appendChild(node);
    modal.classList.remove('hidden');
    $('#modalBg').classList.remove('hidden');
    if (compact) modal.style.width = 'min(400px, calc(100vw - 24px))';
    else modal.style.width = '';
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    $('#modalBg').classList.add('hidden');
    $('#modal').textContent = '';
  }

  function closeOverlays() {
    closeModal();
    closeDrawer();
  }

  function confirmBox(message, okText, onOk) {
    const wrap = el('div');
    wrap.appendChild(el('p', '', message));
    const row = el('div', 'row end');
    const no = el('button', 'btn ghost', 'إلغاء');
    no.type = 'button';
    no.onclick = closeModal;
    const yes = el('button', 'btn danger', okText);
    yes.type = 'button';
    yes.onclick = () => { closeModal(); onOk(); };
    row.append(no, yes);
    wrap.appendChild(row);
    openModal(wrap, true);
  }

  function promptName(label, value, onOk) {
    const wrap = el('div');
    wrap.appendChild(el('h2', '', label));
    const input = el('input');
    input.type = 'text';
    input.maxLength = 40;
    input.value = value || '';
    input.style.width = '100%';
    input.style.border = '1px solid var(--divider)';
    input.style.borderRadius = '10px';
    input.style.padding = '10px 12px';
    input.style.background = 'var(--bg)';
    wrap.appendChild(input);
    const row = el('div', 'row end');
    const cancel = el('button', 'btn ghost', 'إلغاء');
    cancel.type = 'button';
    cancel.onclick = closeModal;
    const ok = el('button', 'btn', 'حفظ');
    ok.type = 'button';
    const submit = () => {
      const name = input.value.trim().slice(0, 40);
      if (!name) return;
      closeModal();
      onOk(name);
    };
    ok.onclick = submit;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    row.append(cancel, ok);
    wrap.appendChild(row);
    openModal(wrap, true);
    input.focus();
    input.select();
  }

  /** نافذة إشعار مع روابط تحميل نسخ الأجهزة الأخرى */
  function openNotice(title, paragraphs) {
    const wrap = el('div');
    wrap.appendChild(el('h2', '', title));
    for (const t of paragraphs) wrap.appendChild(el('p', '', t));
    wrap.appendChild(el('p', '', 'حمّل تطبيق HtmlSmart على الأجهزة الأربعة:'));
    const ul = el('ul', 'platforms');
    for (const d of DOWNLOADS) {
      const li = el('li');
      const a = el('a', '', d.name);
      a.href = d.url;
      a.target = '_blank';
      a.rel = 'noopener';
      li.appendChild(a);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    const row = el('div', 'row end');
    const close = el('button', 'btn', 'حسناً');
    close.type = 'button';
    close.onclick = closeModal;
    row.appendChild(close);
    wrap.appendChild(row);
    openModal(wrap, true);
  }

  function openSync() {
    openNotice('المزامنة بين الأجهزة', [
      'المزامنة عبر الشبكة غير متاحة في نسخة المتصفح، لأن المتصفح لا يستطيع الاتصال بالأجهزة الأخرى مباشرة.'
    ]);
  }

  function settingRow(title, subtitle, control) {
    const row = el('div', 'set-row');
    const text = el('div', 'set-text');
    text.appendChild(el('div', 'set-title', title));
    if (subtitle) text.appendChild(el('div', 'set-sub', subtitle));
    row.appendChild(text);
    if (control) row.appendChild(control);
    return row;
  }

  function selectControl(options, value, onChange) {
    const sel = el('select');
    for (const [v, label] of options) {
      const o = el('option', '', label);
      o.value = String(v);
      if (String(value) === String(v)) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function switchControl(checked, onChange) {
    const lbl = el('label', 'switch');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.addEventListener('change', () => onChange(input.checked));
    lbl.append(input, el('span'));
    return lbl;
  }

  /** صف إعداد غير متاح في المتصفح: يفتح نافذة تشرح ذلك وتعرض روابط التحميل */
  function lockedRow(title, subtitle) {
    const row = settingRow(title, subtitle, el('span', 'lock-badge', 'تطبيق الأندرويد'));
    row.classList.add('locked');
    row.addEventListener('click', () => openNotice(title, [
      'هذه الميزة متاحة في تطبيقات الأجهزة الأخرى، لأنها تعتمد على إمكانات الجهاز نفسه.'
    ]));
    return row;
  }

  function openSettings() {
    const s = state.settings;
    const wrap = el('div');
    wrap.appendChild(el('h2', '', 'الإعدادات'));

    const sec = (t) => wrap.appendChild(el('div', 'settings-sec', t));
    const put = (node) => wrap.appendChild(node);

    sec('المظهر');
    put(settingRow('الوضع', 'تلقائي حسب النظام أو فاتح أو داكن', selectControl(
      [['system', 'تلقائي (حسب النظام)'], ['light', 'فاتح'], ['dark', 'داكن']], s.theme,
      (v) => { s.theme = v; applySettings(); save(); })));
    put(settingRow('عدد الأعمدة', 'عدد البطاقات في الشاشة الرئيسية', selectControl(
      [1, 2, 3, 4, 5, 6].map((n) => [n, n + ' أعمدة']), s.cols,
      (v) => { s.cols = Number(v); applySettings(); save(); })));
    put(settingRow('حجم النص', null, selectControl(
      [['small', 'صغير'], ['medium', 'متوسط (افتراضي)'], ['large', 'كبير']], s.textSize,
      (v) => { s.textSize = v; applySettings(); save(); })));

    sec('العرض');
    put(settingRow('إبقاء الشاشة مضاءة', 'منع إطفاء الشاشة أثناء المشاهدة', switchControl(s.keepAwake,
      (v) => { s.keepAwake = v; applySettings(); save(); })));

    sec('المتصفح');
    put(lockedRow('المتصفح الافتراضي (WebView)', 'اختيار طريقة فتح الروابط الخارجية'));

    sec('الملفات');
    put(settingRow('جودة ضغط الصور', 'تُطبَّق على الأيقونات الجديدة', selectControl(
      [[75, 'منخفضة (75%)'], [85, 'متوسطة (85%) — موصى بها'], [95, 'عالية (95%)']], s.imageQuality,
      (v) => { s.imageQuality = Number(v); save(); })));
    const cleanBtn = el('button', 'btn ghost', 'تنظيف');
    cleanBtn.type = 'button';
    cleanBtn.onclick = () => {
      const n = cleanOrphanFiles();
      alert(n ? `تم حذف ${n} ملف غير مستخدم.` : 'لا توجد ملفات غير مستخدمة.');
    };
    put(settingRow('حذف الملفات اليتيمة', 'حذف المرفقات التي لم تعد تستخدمها أي صفحة', cleanBtn));

    sec('الأمان');
    put(lockedRow('قفل التطبيق بكلمة مرور', 'رمز PIN من 4 إلى 6 أرقام'));
    put(lockedRow('فتح القفل بالبصمة', 'استخدام بصمة الإصبع أو الوجه'));
    put(lockedRow('مهلة القفل التلقائي', 'فوراً، أو بعد 30 ثانية، أو دقيقة، أو 5 دقائق'));

    sec('النسخ الاحتياطي');
    const last = s.lastBackup ? new Date(s.lastBackup).toLocaleString('ar') : 'لم تُنشأ نسخة بعد';
    put(settingRow('آخر نسخة احتياطية', last, null));
    const bkBtn = el('button', 'btn ghost', 'فتح');
    bkBtn.type = 'button';
    bkBtn.onclick = () => { closeModal(); openBackup(); };
    put(settingRow('النسخ والاستعادة', 'JSON أو ZIP متوافق مع تطبيق الأندرويد', bkBtn));

    sec('متقدم');
    const clearBtn = el('button', 'btn ghost', 'مسح');
    clearBtn.type = 'button';
    clearBtn.onclick = async () => {
      try {
        if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
        alert('تم مسح الكاش');
      } catch (_) {
        alert('تعذّر مسح الكاش');
      }
    };
    put(settingRow('مسح الكاش', 'حذف الملفات المؤقتة فقط. لن تتأثر صفحاتك.', clearBtn));
    const sizeText = el('div', 'set-sub', 'جارٍ الحساب...');
    const sizeRow = settingRow('حجم البيانات الحالية', null, null);
    sizeRow.querySelector('.set-text').appendChild(sizeText);
    put(sizeRow);
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((e) => {
        sizeText.textContent = e.usage ? (e.usage / 1048576).toFixed(2) + ' ميغابايت' : 'غير متاح';
      }).catch(() => { sizeText.textContent = 'غير متاح'; });
    } else {
      sizeText.textContent = 'غير متاح في هذا المتصفح';
    }
    const resetBtn = el('button', 'btn danger', 'إعادة تعيين');
    resetBtn.type = 'button';
    resetBtn.onclick = () => confirmBox('سيتم إعادة الإعدادات إلى الافتراضي. لن تُحذف صفحاتك أو ملفاتك.', 'إعادة تعيين', () => {
      state.settings = Object.assign({}, DEFAULT_SETTINGS, {
        lastBackup: state.settings.lastBackup,
        remoteHash: state.settings.remoteHash,
        appliedLocalHash: state.settings.appliedLocalHash
      });
      applySettings();
      save();
      openSettings();
    });
    put(settingRow('إعادة تعيين الإعدادات', 'استعادة جميع الإعدادات للافتراضي', resetBtn));

    sec('عن التطبيق');
    const about = el('div', 'about');
    about.appendChild(el('p', '', 'الإصدار: HtmlSmart Web 1.4 (مطابق لتطبيق الأندرويد 3.5.25)'));
    about.appendChild(el('p', '', 'التقنيات: HTML و CSS و JavaScript و IndexedDB و JSZip'));
    wrap.appendChild(about);

    const row = el('div', 'row end');
    const close = el('button', 'btn', 'تم');
    close.type = 'button';
    close.onclick = closeModal;
    row.appendChild(close);
    wrap.appendChild(row);
    openModal(wrap);
  }

  function openBackup() {
    const wrap = el('div');
    wrap.appendChild(el('h2', '', 'نسخ احتياطي'));
    wrap.appendChild(el('p', '', `عدد الصفحات: ${state.pages.length}`));
    const json = el('button', 'btn block', 'نسخة JSON');
    json.type = 'button';
    json.onclick = () => { HSBackup.exportJson(state, state.pages); markBackup(); closeModal(); };
    const zip = el('button', 'btn ghost block', 'نسخة ZIP');
    zip.type = 'button';
    zip.style.marginTop = '8px';
    zip.onclick = async () => {
      try {
        await HSBackup.exportZip(state, state.pages);
        markBackup();
        closeModal();
      } catch (err) {
        alert(err.message || 'تعذّر إنشاء النسخة');
      }
    };
    wrap.append(json, zip);
    const row = el('div', 'row end');
    const close = el('button', 'btn ghost', 'إغلاق');
    close.type = 'button';
    close.onclick = closeModal;
    row.appendChild(close);
    wrap.appendChild(row);
    openModal(wrap, true);
  }

  function markBackup() {
    state.settings.lastBackup = Date.now();
    save();
  }

  function openRestore() {
    $('#restorePick').onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try {
        data = await HSBackup.readFile(file);
      } catch (err) {
        alert('تعذّر قراءة الملف: ' + (err.message || err));
        return;
      }
      askRestoreMode(data);
    };
    $('#restorePick').click();
  }

  function askRestoreMode(data) {
    const wrap = el('div');
    wrap.appendChild(el('h2', '', 'استعادة النسخة'));
    wrap.appendChild(el('p', '', `تحتوي النسخة على ${data.list.length} صفحة.`));
    const row = el('div', 'row end');
    const cancel = el('button', 'btn ghost', 'إلغاء');
    cancel.type = 'button';
    cancel.onclick = closeModal;
    const merge = el('button', 'btn', 'دمج مع الموجود');
    merge.type = 'button';
    merge.onclick = () => { closeModal(); applyRestore(data, false); };
    const replace = el('button', 'btn danger', 'استبدال الكل');
    replace.type = 'button';
    replace.onclick = () => { closeModal(); applyRestore(data, true); };
    row.append(cancel, merge, replace);
    wrap.appendChild(row);
    openModal(wrap, true);
  }

  function applyRestore(data, replace, silent) {
    if (replace) {
      state.pages = [];
      state.folders = [];
      state.order = [];
    }
    const used = new Set(state.pages.map((p) => p.numId));
    let counter = Math.max(Date.now(), ...used);
    const fresh = () => ++counter;
    const made = HSBackup.toPages(data.list, uid, state.folders, fresh, data);
    for (const p of made) {
      // إن تكرر الرقم الأصلي مع صفحة موجودة نعطي الصفحة المستوردة رقماً جديداً
      if (used.has(p.numId)) p.numId = fresh();
      used.add(p.numId);
      state.pages.push(p);
    }
    normalize();
    save();
    render();
    if (!silent) alert(`تمت الاستعادة: ${made.length} صفحة.`);
  }

  // ---------- النسخة المنشورة مع الصفحة (backup.zip) ----------
  const REMOTE_BACKUP = 'backup.zip';

  async function sha256Hex(buf) {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** بصمة بيانات الجهاز الحالية، لمعرفة إن كان قد عدّل شيئاً منذ آخر استعادة */
  function localFingerprint() {
    const text = JSON.stringify({ p: state.pages, f: state.folders, o: state.order });
    return sha256Hex(new TextEncoder().encode(text));
  }

  function isBusy() {
    return !$('#viewer').classList.contains('hidden') || !$('#modal').classList.contains('hidden');
  }

  /** يفحص backup.zip بجانب الصفحة، ويستعيده إن تغيّر منذ آخر مرة */
  async function checkRemoteBackup() {
    if (!window.crypto || !crypto.subtle || isBusy()) return;
    let buf;
    try {
      const res = await fetch(REMOTE_BACKUP, { cache: 'no-store' });
      if (!res.ok) return;
      buf = await res.arrayBuffer();
    } catch (_) {
      return; // لا يوجد ملف أو لا يوجد اتصال
    }
    const remoteHash = await sha256Hex(buf);
    if (remoteHash === state.settings.remoteHash) return;

    const localHash = await localFingerprint();
    const localChanged = state.settings.appliedLocalHash !== localHash;
    if (localChanged && state.pages.length > 0) {
      askRemoteRestore(buf, remoteHash);
    } else {
      await applyRemoteBackup(buf, remoteHash);
    }
  }

  async function applyRemoteBackup(buf, remoteHash) {
    try {
      const data = await HSBackup.readFile(new File([buf], REMOTE_BACKUP));
      applyRestore(data, true, true);
      state.settings.remoteHash = remoteHash;
      state.settings.appliedLocalHash = await localFingerprint();
      save();
      showToast(`تمت استعادة النسخة المنشورة: ${data.list.length} صفحة`);
    } catch (err) {
      console.warn('تعذّرت الاستعادة التلقائية', err);
    }
  }

  function askRemoteRestore(buf, remoteHash) {
    const wrap = el('div');
    wrap.appendChild(el('h2', '', 'نسخة جديدة متاحة'));
    wrap.appendChild(el('p', '', 'تم تحديث النسخة المنشورة، لكن هذا الجهاز عدّل صفحاته بعد آخر استعادة. هل تستبدل صفحاته بالنسخة الجديدة؟ التعديلات المحلية ستفقد.'));
    const row = el('div', 'row end');
    const ignore = el('button', 'btn ghost', 'تجاهل');
    ignore.type = 'button';
    ignore.onclick = () => { state.settings.remoteHash = remoteHash; save(); closeModal(); };
    const replace = el('button', 'btn danger', 'استبدال');
    replace.type = 'button';
    replace.onclick = () => { closeModal(); applyRemoteBackup(buf, remoteHash); };
    row.append(ignore, replace);
    wrap.appendChild(row);
    openModal(wrap, true);
  }

  function showToast(text) {
    const t = el('div', 'toast', text);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ---------- القائمة الجانبية ----------
  function openDrawer() {
    $('#drawer').classList.add('open');
    $('#drawerBg').classList.remove('hidden');
  }
  function closeDrawer() {
    $('#drawer').classList.remove('open');
    $('#drawerBg').classList.add('hidden');
  }

  function bindDrawer() {
    $('#drawer').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      closeDrawer();
      switch (b.dataset.act) {
        case 'home': closeViewer(); window.scrollTo(0, 0); render(); break;
        case 'new': openEditor(null); break;
        case 'newFolder': createFolder(); break;
        case 'columns': openSettings(true); break;
        case 'settings': openSettings(false); break;
        case 'sync': openSync(); break;
        case 'backup': openBackup(); break;
        case 'restore': openRestore(); break;
      }
    });
    $('#drawerBg').addEventListener('click', () => { closeDrawer(); closeModal(); });
    $('#modalBg').addEventListener('click', closeModal);
  }

  // ---------- التهيئة ----------
  async function init() {
    const saved = await HSStorage.read();
    if (saved && Array.isArray(saved.pages)) {
      state = {
        pages: saved.pages || [],
        folders: saved.folders || [],
        order: saved.order || [],
        settings: Object.assign({}, DEFAULT_SETTINGS, saved.settings || {})
      };
    }
    normalize();
    applySettings();
    render();

    $('#btnMenu').addEventListener('click', openDrawer);
    $('#btnAdd').addEventListener('click', () => openEditor(null));
    $('#btnFull').addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFullIcon);
    updateFullIcon();
    document.addEventListener('visibilitychange', syncWakeLock);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkRemoteBackup(); });
    checkRemoteBackup();
    $('#search').addEventListener('input', render);
    $('#viewerBack').addEventListener('click', closeViewer);
    bindDrawer();

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#modal').classList.contains('hidden')) closeModal();
      else if (!$('#drawer').classList.contains('hidden') && $('#drawer').classList.contains('open')) closeDrawer();
      else if (!$('#viewer').classList.contains('hidden')) closeViewer();
    });

    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  init();
})();
