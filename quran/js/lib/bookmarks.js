/* علامات القراءة، والنسخة الاحتياطية بالصيغة نفسها التي يستعملها تطبيق الأندرويد */
(function () {
  var APP = 'myquran';

  function isValid(m) {
    return m && m.surah >= 1 && m.surah <= 114 && m.ayah >= 1 && m.page >= 1 && m.page <= QuranData.LAST_PAGE;
  }

  function all() {
    var list = Store.get('bookmarks', []);
    if (!Array.isArray(list)) return [];
    return list.filter(isValid).sort(function (a, b) { return b.time - a.time; });
  }

  function save(list) { Store.set('bookmarks', list); }

  function add(surah, ayah, page) {
    var list = all();
    if (list.some(function (m) { return m.surah === surah && m.ayah === ayah; })) return false;
    list.push({ surah: surah, ayah: ayah, page: page, time: Date.now() });
    save(list);
    return true;
  }

  function remove(mark) {
    save(all().filter(function (m) {
      return !(m.time === mark.time && m.surah === mark.surah && m.ayah === mark.ayah);
    }));
  }

  function exportJson() {
    return JSON.stringify({ app: APP, version: 1, bookmarks: all() }, null, 2);
  }

  /* يدمج العلامات من نسخة احتياطية، ويتخطى المكرر، ولا يحذف أي علامة حالية */
  function importJson(text) {
    var root;
    try { root = JSON.parse(text); } catch (e) { return { added: 0, error: 'الملف ليس ملف علامات صالحًا.' }; }
    if (!root || root.app !== APP || !Array.isArray(root.bookmarks)) {
      return { added: 0, error: 'هذا الملف ليس نسخة علامات من هذا التطبيق.' };
    }
    var list = all(), added = 0;
    root.bookmarks.filter(isValid).forEach(function (m) {
      if (list.some(function (x) { return x.surah === m.surah && x.ayah === m.ayah; })) return;
      list.push({ surah: m.surah, ayah: m.ayah, page: m.page, time: m.time || Date.now() });
      added++;
    });
    save(list);
    return { added: added, error: null };
  }

  window.Bookmarks = { all: all, add: add, remove: remove, exportJson: exportJson, importJson: importJson };
})();
