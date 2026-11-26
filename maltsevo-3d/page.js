/* Wabi-Sabi · дом в 3D: поведение страницы. Обычный скрипт, работает в Safari 14+.
   Карточки точек обзора, проверка WebGL, запуск модуля просмотра, когда модель подходит к экрану;
   при сбое остаётся кадр модели. */
(function () {
  'use strict';
  var C = window.MALTSEVO;
  var html = document.documentElement;
  var el = document.getElementById('viewer');

  // связи «откуда какие точки видно»; по умолчанию — все
  if (!C.links) {
    C.links = { A: {}, B: {} };
    C.stops.forEach(function (s) {
      var others = C.stops.filter(function (o) { return o.id !== s.id; }).map(function (o) { return o.id; });
      C.links.A[s.id] = others; C.links.B[s.id] = others;
    });
  }

  // карточки точек обзора
  var list = el.querySelector('.stops');
  C.stops.forEach(function (s, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'stop';
    b.dataset.stop = s.id;
    b.setAttribute('aria-current', 'false');
    b.innerHTML = '<span class="stop-img"><img src="img/stop-' + s.id + '.webp" width="400" height="267" alt="" loading="lazy" decoding="async"></span>' +
      '<span class="stop-txt"><span class="stop-n mono">' + (i < 9 ? '0' : '') + (i + 1) + '</span>' +
      '<span class="stop-room">' + s.room + '</span><span class="stop-title">' + s.title + '</span></span>';
    list.appendChild(b);
  });

  // ---------- класс устройства ----------
  function hasWebGL2() {
    try { var c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; }
  }
  var ua = navigator.userAgent || '';
  var iosMatch = ua.match(/OS (\d+)_\d+(?:_\d+)? like Mac OS X/);
  var iosOld = iosMatch && parseInt(iosMatch[1], 10) < 15;
  if (!hasWebGL2() || iosOld) { fail('no webgl2'); return; }

  function fail(why) {
    el.classList.add('is-failed');
    var t = el.querySelector('.ld-t');
    if (t) t.textContent = '3D недоступно на этом устройстве — показан кадр модели';
    var n = el.querySelector('.ld-n'); if (n) n.textContent = '';
    Array.prototype.forEach.call(el.querySelectorAll('.toolbar button, .stop'), function (b) { b.disabled = true; });
    if (window.console) console.warn('wabi-sabi 3D:', why);
  }

  var started = false;
  function start() {
    if (started) return;
    started = true;
    var done = false;
    var timer = setTimeout(function () { if (!done) fail('timeout'); }, 90000);
    import('./app.js').then(function (m) {
      return m.createApp(el);
    }).then(function (api) {
      done = true; clearTimeout(timer);
      window.__wabi = api;
    }).catch(function (err) {
      done = true; clearTimeout(timer); fail(err);
    });
  }
  function near() {
    var r = el.getBoundingClientRect();
    var h = window.innerHeight || 800;
    return r.top < h * 2.2 && r.bottom > -h;
  }
  if (near() || /[?&]shot/.test(location.search) || location.hash) start();
  else {
    var onScroll = function () { if (near()) { window.removeEventListener('scroll', onScroll); start(); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    // на быстром соединении грузим сразу после страницы
    window.addEventListener('load', function () { setTimeout(start, 1200); });
  }
  // ссылка в обложке «Кухня · два варианта» — сразу второй вариант
  Array.prototype.forEach.call(document.querySelectorAll('[data-go-kitchen]'), function (a) {
    a.addEventListener('click', function () {
      start();
      var k = a.getAttribute('data-go-kitchen');
      var tries = 0;
      (function wait() { if (window.__wabi) window.__wabi.setKitchen(k); else if (tries++ < 200) setTimeout(wait, 150); })();
    });
  });
})();
