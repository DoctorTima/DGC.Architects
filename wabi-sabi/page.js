/* Wabi-Sabi: поведение страницы. Обычный скрипт, работает в Safari 14+.
   3D запускается, когда окно модели подходит к экрану; при сбое остаётся кадр модели. */
(function () {
  'use strict';
  var html = document.documentElement;

  // ---------- класс устройства ----------
  function hasWebGL2() {
    try { var c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; }
  }
  var ua = navigator.userAgent || '';
  var iosMatch = ua.match(/OS (\d+)_\d+(?:_\d+)? like Mac OS X/);
  var iosOld = iosMatch && parseInt(iosMatch[1], 10) < 16;
  var conn = navigator.connection || {};
  var webgl2 = hasWebGL2();
  var lite = !webgl2 || iosOld || conn.saveData === true || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  try { if (sessionStorage.getItem('dgc-3d') === 'on' && webgl2) lite = false; } catch (e) {}
  if (lite) html.classList.add('lite');

  // ---------- 3D ----------
  var viewers = Array.prototype.slice.call(document.querySelectorAll('.viewer'));
  var mod = null;
  function loadModule() {
    if (!mod) mod = import('./viewer.js');
    return mod;
  }
  function fail(el, why) {
    el.classList.remove('is-loading');
    el.classList.add('is-failed');
    var s = el.querySelector('.stage-status');
    if (s) s.textContent = '3D недоступно на этом устройстве — показан кадр модели';
    var pi = el.querySelector('.pin-info'); if (pi) pi.textContent = 'Метки на кадре совпадают с таблицей ниже';
    Array.prototype.forEach.call(el.querySelectorAll('.toolbar button'), function (b) { b.disabled = true; });
    if (window.console) console.warn('wabi-sabi 3D:', why);
  }
  function start(el) {
    if (el.dataset.started) return;
    el.dataset.started = '1';
    el.classList.add('is-loading');
    var st = el.querySelector('.stage-start'); if (st) st.hidden = true;
    var s = el.querySelector('.stage-status'); if (s) s.textContent = 'Загрузка модели…';
    var done = false;
    var timer = setTimeout(function () { if (!done) fail(el, 'timeout'); }, 25000);
    loadModule().then(function (m) {
      return m.createViewer(el, window.WABI_ROOMS[el.dataset.room]);
    }).then(function () {
      done = true; clearTimeout(timer);
      el.classList.remove('is-loading');
    }).catch(function (err) {
      done = true; clearTimeout(timer); fail(el, err);
    });
  }
  function near(el) {
    var r = el.getBoundingClientRect();
    var h = window.innerHeight || 800;
    return r.top < h * 1.8 && r.bottom > -h;
  }
  viewers.forEach(function (el) {
    var btn = el.querySelector('.stage-start');
    if (lite) {
      if (webgl2 && btn) {
        btn.hidden = false;
        btn.addEventListener('click', function () {
          try { sessionStorage.setItem('dgc-3d', 'on'); } catch (e) {}
          start(el);
        });
      } else {
        fail(el, 'no webgl2');
      }
    }
  });
  if (!lite) {
    var check = function () { viewers.forEach(function (el) { if (!el.dataset.started && near(el)) start(el); }); };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) start(e.target); });
      }, { rootMargin: '600px 0px' });
      viewers.forEach(function (el) { io.observe(el); });
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { ticking = false; check(); });
    }, { passive: true });
    window.addEventListener('hashchange', check);
    check();
  }

  // ---------- визуализации крупно ----------
  var dlg = document.querySelector('.lightbox');
  if (dlg) {
    var img = dlg.querySelector('img'), cap = dlg.querySelector('.lb-cap');
    var open = function (src, text) {
      img.src = src; img.alt = text; cap.textContent = text;
      if (typeof dlg.showModal === 'function') dlg.showModal(); else { dlg.setAttribute('open', ''); html.classList.add('lb-open'); }
    };
    var close = function () {
      if (typeof dlg.close === 'function' && dlg.open) dlg.close(); else dlg.removeAttribute('open');
      html.classList.remove('lb-open');
    };
    Array.prototype.forEach.call(document.querySelectorAll('.shot-link'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); open(a.getAttribute('data-full'), a.getAttribute('data-cap')); });
    });
    dlg.querySelector('.lb-close').addEventListener('click', close);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }
})();
