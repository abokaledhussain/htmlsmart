/* تقليب الورق في الوضع العرضي: منقول من CurlPageView.kt (الأندرويد) إلى لوحة الويب */
(function () {
  var canvas = document.getElementById('curl');
  var ctx = canvas.getContext('2d');
  var DURATION = 600;            /* مدة التقليب بالنقر (مللي ثانية) */
  var SLOP = 10;                 /* أقل حركة تُعد سحبًا */
  var FAST = 40;                 /* سحبة سريعة تكفي لإتمام التقليب */
  var LONG_MS = 500;

  var api = {
    count: 0,            /* عدد العناصر (صفحة أو صفحتين) */
    pos: 0,              /* العنصر الظاهر من 0 */
    rtl: true,
    provider: null,      /* function(pos) -> {canvas, hits} أو null إن لم تُحمَّل الخطوط بعد */
    onPageChanged: null, /* function(pos) */
    onCenterTap: null,   /* function(x, y) */
    onLongPress: null,   /* function(hit) */
    paper: '#F4F9F2'
  };

  var cache = new Map();   /* أحدث 4 عناصر مرسومة */
  var topImg = null, underImg = null;
  var drawing = false, busy = false;
  var curT = 0, curLift = null, anim = null;
  var drag = null;
  var downX = 0, downY = 0, downT = 0, longFired = false, longTimer = null;

  function size() {
    var r = canvas.getBoundingClientRect();
    return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
  }

  function entryOf(pos) {
    if (pos < 0 || pos >= api.count) return null;
    if (cache.has(pos)) {
      var e = cache.get(pos);
      cache.delete(pos);
      cache.set(pos, e);
      return e;
    }
    var e2 = api.provider ? api.provider(pos) : null;
    if (e2) {
      cache.set(pos, e2);
      while (cache.size > 4) cache.delete(cache.keys().next().value);
    }
    return e2;
  }

  function clearCache() { cache.clear(); }

  /* ---------- الرسم: منقول من drawCurlCore ---------- */
  function drawCurlCore(c, w, h, top, under, t, lift) {
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, w, h);
    if (under) c.drawImage(under, 0, 0, w, h);
    if (t <= 0) {
      if (top) c.drawImage(top, 0, 0, w, h);
      return;
    }
    if (t >= 1) return;

    var cx = Math.max(1, 2 * w * t);
    var factor = lift === null ? 1 : 0.7;
    var cy = h - Math.max(0, Math.min(0.6 * h, Math.min(0.5 * h, cx * 0.9) * factor + (lift || 0)));
    var mx = cx / 2, my = (h + cy) / 2;
    var dx = cx, dy = cy - h;
    var len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    var px = -dy, py = dx;
    var big = 3 * w + h;

    function half(s) {
      var p = new Path2D();
      p.moveTo(mx - px * big, my - py * big);
      p.lineTo(mx + px * big, my + py * big);
      p.lineTo(mx + px * big + s * dx * big, my + py * big + s * dy * big);
      p.lineTo(mx - px * big + s * dx * big, my - py * big + s * dy * big);
      p.closePath();
      return p;
    }

    /* 1) ظل الورقة المنحنية على الصفحة التي تحتها */
    c.save();
    c.clip(half(-1));
    var g1 = c.createLinearGradient(mx, my, mx - dx * 55, my - dy * 55);
    g1.addColorStop(0, 'rgba(0,0,0,0.38)');
    g1.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g1;
    c.fillRect(0, 0, w, h);
    c.restore();

    /* 2) الجزء الباقي من الصفحة العلوية */
    c.save();
    c.clip(half(1));
    if (top) c.drawImage(top, 0, 0, w, h);
    c.restore();

    /* 3) الجزء المطوي: ظهر الورقة مع انعكاسه */
    c.save();
    c.clip(half(-1));
    var dm = dx * mx + dy * my;
    c.transform(1 - 2 * dx * dx, -2 * dx * dy, -2 * dx * dy, 1 - 2 * dy * dy, 2 * dx * dm, 2 * dy * dm);
    c.fillStyle = '#F4F1EA';
    c.fillRect(0, 0, w, h);
    if (top) {
      c.globalAlpha = 56 / 255;
      c.drawImage(top, 0, 0, w, h);
      c.globalAlpha = 1;
    }
    var g2 = c.createLinearGradient(mx, my, mx - dx * 90, my - dy * 90);
    g2.addColorStop(0, 'rgba(0,0,0,0.42)');
    g2.addColorStop(0.5, 'rgba(0,0,0,0.08)');
    g2.addColorStop(1, 'rgba(255,255,255,0.28)');
    c.fillStyle = g2;
    c.fillRect(-w, -h, 2 * w, 2 * h);
    c.restore();
  }

  function draw() {
    var s = size();
    if (canvas.width !== Math.round(s.w * (window.devicePixelRatio || 1))) {
      canvas.width = Math.round(s.w * (window.devicePixelRatio || 1));
      canvas.height = Math.round(s.h * (window.devicePixelRatio || 1));
    }
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = api.paper;
    ctx.fillRect(0, 0, s.w, s.h);
    if (drawing) {
      drawCurlCore(ctx, s.w, s.h, topImg, underImg, curT, curLift);
    } else {
      var e = entryOf(api.pos);
      if (e) ctx.drawImage(e.canvas, 0, 0, s.w, s.h);
    }
  }

  /* ---------- الحركة ---------- */
  function finish(d, commit) {
    drawing = false;
    busy = false;
    topImg = null;
    underImg = null;
    anim = null;
    if (commit) {
      api.pos = d.target;
      if (api.onPageChanged) api.onPageChanged(api.pos);
      entryOf(api.pos + 1);
      entryOf(api.pos - 1);
    }
    draw();
  }

  function settle(d, to, commit) {
    busy = true;
    drawing = true;
    var from = d.t;
    var startLift = d.lift;
    var duration = Math.max(100, DURATION * Math.abs(to - from));
    var t0 = null;
    if (anim) cancelAnimationFrame(anim);
    function step(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / duration);
      var ease = k * k * (3 - 2 * k);
      curT = from + (to - from) * ease;
      curLift = startLift === null ? null : startLift * (1 - ease);
      if (k < 1) {
        anim = requestAnimationFrame(step);
        draw();
      } else {
        finish(d, commit);
      }
    }
    anim = requestAnimationFrame(step);
  }

  function animateFlip(target) {
    var fwd = target > api.pos;
    var cur = entryOf(api.pos);
    var other = entryOf(target);
    if (!other || !cur) { jump(target); return; }
    topImg = (fwd ? cur : other).canvas;
    underImg = (fwd ? other : cur).canvas;
    settle({ fwd: fwd, target: target, t: fwd ? 0 : 1, lift: null }, fwd ? 1 : 0, true);
  }

  function jump(target) {
    if (anim) cancelAnimationFrame(anim);
    anim = null;
    drawing = false;
    busy = false;
    drag = null;
    api.pos = target;
    draw();
  }

  function goPos(target) {
    if (busy) return;
    target = Math.max(0, Math.min(api.count - 1, target));
    if (target === api.pos) return;
    if (Math.abs(target - api.pos) === 1) {
      animateFlip(target);
    } else {
      jump(target);
      if (api.onPageChanged) api.onPageChanged(api.pos);
    }
  }

  /* ---------- اللمس ---------- */
  function localXY(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    if (busy) return;
    var p = localXY(e);
    downX = p.x; downY = p.y; downT = Date.now();
    drag = null;
    longFired = false;
    clearTimeout(longTimer);
    longTimer = setTimeout(function () {
      if (!drag && !busy) {
        longFired = true;
        var hit = hitAt(downX, downY);
        if (hit && api.onLongPress) api.onLongPress(hit);
      }
    }, LONG_MS);
  }

  function onMove(e) {
    if (busy) return;
    var p = localXY(e);
    var dx = p.x - downX, dy = p.y - downY;
    if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) clearTimeout(longTimer);
    var w = size().w;
    if (!drag) {
      if (Math.abs(dx) < SLOP || Math.abs(dx) < Math.abs(dy)) return;
      /* التقليب يبدأ من الأطراف فقط (30% من كل جهة)، والسحب من الوسط لا يقلّب */
      var startRatio = downX / w;
      if (startRatio > 0.3 && startRatio < 0.7) return;
      var right = dx > 0;
      var fwd = api.rtl ? right : !right;
      if (fwd ? api.pos >= api.count - 1 : api.pos <= 0) return;
      var target = fwd ? api.pos + 1 : api.pos - 1;
      drag = { fwd: fwd, right: right, target: target, t: fwd ? 0 : 1, lift: 0 };
      var cur = entryOf(api.pos);
      var other = entryOf(target);
      if (!cur || !other) { drag = null; return; }
      topImg = (fwd ? cur : other).canvas;
      underImg = (fwd ? other : cur).canvas;
      drawing = true;
    }
    var span = Math.max(drag.right ? w - downX : downX, w * 0.5);
    var u = Math.min(1, Math.max(0, (drag.right ? p.x - downX : downX - p.x) / span));
    drag.t = drag.fwd ? u : 1 - u;
    drag.lift = downY - p.y;
    curT = drag.t;
    curLift = drag.lift;
    draw();
  }

  function onUp(e) {
    clearTimeout(longTimer);
    if (busy) return;
    var p = localXY(e);
    if (drag) {
      var d = drag;
      drag = null;
      var fast = (Date.now() - downT) < 350 && Math.abs(p.x - downX) > FAST;
      var commit = fast || (d.fwd ? d.t > 0.5 : d.t < 0.5);
      var to = commit ? (d.fwd ? 1 : 0) : (d.fwd ? 0 : 1);
      settle(d, to, commit);
    } else if (!longFired && Math.abs(p.x - downX) < SLOP && Math.abs(p.y - downY) < SLOP) {
      handleTap(p.x, p.y);
    }
  }

  /* النقر على 30% من الطرف يقلّب الصفحة، والوسط يُعد نقرة للشريط والآية */
  function handleTap(x, y) {
    var w = size().w;
    var xr = x / w;
    var nextZone = api.rtl ? xr < 0.3 : xr > 0.7;
    var prevZone = api.rtl ? xr > 0.7 : xr < 0.3;
    if (nextZone) goPos(api.pos + 1);
    else if (prevZone) goPos(api.pos - 1);
    else if (api.onCenterTap) api.onCenterTap(x, y);
  }

  function hitAt(x, y) {
    var e = entryOf(api.pos);
    if (!e) return null;
    for (var i = 0; i < e.hits.length; i++) {
      var h = e.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', function () {
    clearTimeout(longTimer);
    if (drag) { var d = drag; drag = null; settle(d, d.fwd ? 0 : 1, false); }
  });

  api.show = function () { canvas.hidden = false; draw(); };
  api.hide = function () {
    canvas.hidden = true;
    if (anim) cancelAnimationFrame(anim);
    anim = null; drawing = false; busy = false; drag = null;
  };
  api.draw = draw;
  api.size = size;
  api.jump = jump;
  api.clearCache = clearCache;
  api.hitAt = hitAt;
  api.isBusy = function () { return busy; };
  window.Curl = api;
})();
