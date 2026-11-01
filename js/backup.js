/* النسخ الاحتياطي والاستعادة بصيغة تطبيق الأندرويد 3.5.25:
   JSON: قائمة صفحات (BackupPage).
   ZIP: manifest.json (القائمة نفسها) + icons/<id>.webp + files/<id>/<المسار النسبي>.
   المعرّف id رقم (Long) كما في الأندرويد. */
(function () {
  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', mp3: 'audio/mpeg', wav: 'audio/wav',
    ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf', json: 'application/json',
    txt: 'text/plain', css: 'text/css', js: 'text/javascript', html: 'text/html', htm: 'text/html',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf'
  };

  function mimeOf(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    return MIME[ext] || 'application/octet-stream';
  }

  function base64Of(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return '';
    const i = dataUrl.indexOf(',');
    return i >= 0 ? dataUrl.slice(i + 1) : '';
  }

  function dataUrlOf(mime, base64) {
    return `data:${mime};base64,${base64}`;
  }

  function toBackupList(state, pages) {
    return pages.map((p) => ({
      id: p.numId,
      title: p.title || '',
      html: p.html || '',
      css: p.css || '',
      js: p.js || '',
      iconUri: '',
      iconBase64: '',
      attachedFiles: null,
      folderName: p.folderId ? (state.folders.find((f) => f.id === p.folderId) || {}).name || null : null
    }));
  }

  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function exportJson(state, pages) {
    const list = toBackupList(state, pages).map((b, i) => ({ ...b, iconBase64: base64Of(pages[i].icon) }));
    download(`Backup_${stamp()}.json`, new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' }));
  }

  async function exportZip(state, pages) {
    if (!window.JSZip) throw new Error('مكتبة ZIP غير محمّلة. تحقق من الاتصال بالإنترنت.');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(toBackupList(state, pages), null, 2), { createFolders: false });
    for (const p of pages) {
      const icon = base64Of(p.icon);
      if (icon) zip.file(`icons/${p.numId}.webp`, icon, { base64: true, createFolders: false });
      for (const [rel, dataUrl] of Object.entries(p.assets || {})) {
        const b64 = base64Of(dataUrl);
        if (b64) zip.file(`files/${p.numId}/${rel}`, b64, { base64: true, createFolders: false });
      }
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    download(`Backup_Full_${stamp()}.zip`, blob);
  }

  /** يعيد { list, icons: {id: base64}, files: {id: [{rel, base64}]} } */
  async function readFile(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.zip')) {
      if (!window.JSZip) throw new Error('مكتبة ZIP غير محمّلة.');
      const zip = await JSZip.loadAsync(file);
      const entry = zip.file('manifest.json');
      if (!entry) throw new Error('ملف ZIP لا يحتوي manifest.json');
      const list = normalizeList(JSON.parse(await entry.async('string')));
      const icons = {};
      const files = {};
      const jobs = [];
      zip.forEach((path, f) => {
        if (f.dir) return;
        let m = path.match(/^icons\/(\d+)\.webp$/i);
        if (m) {
          jobs.push(f.async('base64').then((b64) => { icons[m[1]] = b64; }));
          return;
        }
        m = path.match(/^files\/(\d+)\/(.+)$/);
        if (m) {
          const rel = m[2];
          const id = m[1];
          jobs.push(f.async('base64').then((b64) => {
            (files[id] = files[id] || []).push({ rel, base64: b64 });
          }));
        }
      });
      await Promise.all(jobs);
      return { list, icons, files };
    }
    return { list: normalizeList(JSON.parse(await file.text())), icons: {}, files: {} };
  }

  function normalizeList(data) {
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.pages) ? data.pages : null);
    if (!list || !list.length) throw new Error('الملف لا يحتوي صفحات صالحة');
    return list.filter((b) => b && (b.title !== undefined || b.html !== undefined));
  }

  /**
   * يحوّل سجلات النسخة إلى صفحات ومجلدات للتطبيق.
   * nextNumId: دالة تعطي رقماً جديداً غير مستخدم. extras: { icons, files } من ملف ZIP.
   */
  function toPages(list, makeId, folders, nextNumId, extras) {
    const icons = (extras && extras.icons) || {};
    const files = (extras && extras.files) || {};
    const pages = [];
    for (const b of list) {
      let folderId = null;
      if (b.folderName) {
        let f = folders.find((x) => x.name === b.folderName);
        if (!f) {
          f = { id: makeId(), name: String(b.folderName).slice(0, 40) };
          folders.push(f);
        }
        folderId = f.id;
      }
      const numId = Number.isSafeInteger(Number(b.id)) && Number(b.id) > 0 ? Number(b.id) : nextNumId();
      const key = String(b.id);
      let icon = '';
      if (icons[key]) icon = dataUrlOf('image/webp', icons[key]);
      else if (b.iconBase64) icon = dataUrlOf('image/webp', b.iconBase64);
      const assets = {};
      for (const f of files[key] || []) assets[f.rel] = dataUrlOf(mimeOf(f.rel), f.base64);
      pages.push({
        id: makeId(),
        numId,
        title: String(b.title || 'صفحة بلا عنوان'),
        html: String(b.html || ''),
        css: String(b.css || ''),
        js: String(b.js || ''),
        icon,
        assets,
        folderId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    return pages;
  }

  window.HSBackup = { exportJson, exportZip, readFile, toPages, download };
})();
