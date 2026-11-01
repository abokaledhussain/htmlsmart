/* التخزين: كل المفاتيح بالبادئة نفسها التي تستعملها الإعدادات، والقراءة والكتابة محميتان */
(function () {
  var PREFIX = 'myquran.';

  function get(key, fallback) {
    try {
      var raw = window.localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      /* التخزين ممتلئ أو محجوب: نتجاهل الحفظ ويعمل التطبيق */
    }
  }

  function remove(key) {
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch (e) { /* لا شيء */ }
  }

  window.Store = { get: get, set: set, remove: remove };
})();
