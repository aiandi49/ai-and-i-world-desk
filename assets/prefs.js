// Text size selector and theme toggle, shared by every page.
(function () {
  'use strict';
  var root = document.documentElement;
  var SIZE_NAMES = { sm: 'small', md: 'medium', lg: 'large', xl: 'extra large' };

  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function syncSize() {
    var current = root.getAttribute('data-font-size') || 'sm';
    var buttons = document.querySelectorAll('.size-btn');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var size = b.getAttribute('data-size');
      var on = size === current;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', 'Text size ' + SIZE_NAMES[size] + (on ? ' (current)' : ''));
    }
  }

  function syncTheme() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    var dark = root.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.setAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  document.addEventListener('click', function (ev) {
    var sizeBtn = ev.target.closest ? ev.target.closest('.size-btn') : null;
    if (sizeBtn) {
      var size = sizeBtn.getAttribute('data-size');
      if (SIZE_NAMES[size]) {
        root.setAttribute('data-font-size', size);
        save('pref-font-size', size);
        syncSize();
        document.dispatchEvent(new CustomEvent('prefs:change'));
      }
      return;
    }
    var themeBtn = ev.target.closest ? ev.target.closest('#themeToggle') : null;
    if (themeBtn) {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      save('pref-theme', next);
      syncTheme();
      document.dispatchEvent(new CustomEvent('prefs:change'));
    }
  });

  syncSize();
  syncTheme();
})();
