// AI&I World Desk — guide pages rendered from /data/gub.json (DOM only, no innerHTML).
(function () {
  'use strict';

  var GROUPS = [
    { id: 'all', label: 'All topics' },
    { id: 'war', label: 'War & energy', ids: ['iran-war-hormuz', 'red-sea-houthis', 'russia-diesel-ukraine', 'unsc-487', 'pentagon-and-military'] },
    { id: 'economy', label: 'Economy & markets', ids: ['bonds-rates-debt', 'cost-of-living', 'markets-geopolitics', 'us-china-summit', 'daily-life-playbook'] },
    { id: 'politics', label: 'Elections & courts', ids: ['midterms-2026', 'arizona-ballot', 'supreme-court-voting', 'press-access', 'shakeups-and-reruns'] },
    { id: 'method', label: 'Tech, media & method', ids: ['ai-governance', 'reading-political-youtube', 'live-sources'] }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var entries = [];
  var activeGroup = 'all';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function groupOf(id) {
    for (var i = 1; i < GROUPS.length; i++) if (GROUPS[i].ids.indexOf(id) > -1) return GROUPS[i];
    return GROUPS[0];
  }
  function statusClass(s) {
    s = String(s || '').toLowerCase();
    if (s === 'verified') return 'ok';
    if (s.indexOf('partly') === 0) return 'part';
    return 'warn';
  }
  function fmtDate(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  var URL_RE = /(https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])/g;
  function inline(parent, text) {
    var last = 0;
    String(text).replace(URL_RE, function (url, _g, off) {
      if (off > last) parent.appendChild(document.createTextNode(text.slice(last, off)));
      var a = el('a', null, url); a.href = url; a.rel = 'noopener noreferrer'; a.target = '_blank';
      parent.appendChild(a);
      last = off + url.length;
      return url;
    });
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  function prose(container, body) {
    String(body).split(/\n\s*\n/).forEach(function (block) {
      var lines = block.split('\n').filter(function (l) { return l.trim(); });
      var ul = null;
      lines.forEach(function (line) {
        var m = line.trim().match(/^[-•]\s+(.*)$/);
        if (m) {
          if (!ul) { ul = el('ul'); container.appendChild(ul); }
          var li = el('li'); inline(li, m[1]); ul.appendChild(li);
        } else {
          ul = null;
          var p = el('p'); inline(p, line.trim()); container.appendChild(p);
        }
      });
    });
  }

  function card(e) {
    var li = el('li', 'tcard');
    var a = el('a', 'tlink');
    a.href = '/guide?t=' + encodeURIComponent(e.id);
    var top = el('div', 'tmeta');
    top.appendChild(el('span', 'tgroup', groupOf(e.id).label));
    top.appendChild(el('span', 'badge sm ' + statusClass(e.status), e.status));
    a.appendChild(top);
    a.appendChild(el('h3', null, e.title));
    a.appendChild(el('p', 'tsum', e.summary));
    a.appendChild(el('span', 'tmore', 'Read the topic'));
    li.appendChild(a);
    return li;
  }

  function renderFilters() {
    var wrap = $('filters');
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    GROUPS.forEach(function (g) {
      var b = el('button', 'filter', g.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', g.id === activeGroup ? 'true' : 'false');
      b.addEventListener('click', function () { activeGroup = g.id; renderFilters(); renderGrid(); });
      wrap.appendChild(b);
    });
  }
  function renderGrid() {
    var grid = $('grid');
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    var g = GROUPS.filter(function (x) { return x.id === activeGroup; })[0];
    entries.filter(function (e) { return !g.ids || g.ids.indexOf(e.id) > -1; }).forEach(function (e) { grid.appendChild(card(e)); });
  }

  function renderHub(data) {
    $('hubView').hidden = false;
    $('entryView').hidden = true;
    $('statCount').textContent = String(entries.length);
    $('statChecked').textContent = fmtDate(data.checked);
    var n = 0; entries.forEach(function (e) { n += (e.sources || []).length; });
    $('statSources').textContent = String(n);
    document.title = 'World Desk Guide · AI&I';
    $('navGuide').setAttribute('aria-current', 'page');
    renderFilters();
    renderGrid();
  }

  function renderEntry(e) {
    $('hubView').hidden = true;
    $('entryView').hidden = false;
    document.title = e.title + ' · World Desk Guide';
    if (e.id === 'live-sources') $('navSources').setAttribute('aria-current', 'page');
    else $('navGuide').setAttribute('aria-current', 'page');
    $('eCat').textContent = groupOf(e.id).label;
    var st = $('eStatus');
    st.textContent = e.status;
    st.className = 'badge ' + statusClass(e.status);
    $('eTitle').textContent = e.title;
    $('eSummary').textContent = e.summary;
    $('eChecked').textContent = 'Checked ' + fmtDate(e.checked);
    $('eAsk').href = '/?ask=' + encodeURIComponent('Give me the latest on: ' + e.title + '. What changed recently, and what does it mean for me?');

    var body = $('eBody');
    while (body.firstChild) body.removeChild(body.firstChild);
    prose(body, e.body);

    var dl = $('eDetails');
    while (dl.firstChild) dl.removeChild(dl.firstChild);
    Object.keys(e.details || {}).forEach(function (k) {
      var v = e.details[k];
      if (!v || v === '—') return;
      var row = el('div', 'fact');
      row.appendChild(el('dt', null, k));
      var dd = el('dd'); inline(dd, String(v)); row.appendChild(dd);
      dl.appendChild(row);
    });

    var src = $('eSources');
    while (src.firstChild) src.removeChild(src.firstChild);
    (e.sources || []).forEach(function (s) {
      if (!/^https:\/\//.test(s.url)) return;
      var li = el('li');
      var a = el('a', null, s.title); a.href = s.url; a.rel = 'noopener noreferrer'; a.target = '_blank';
      li.appendChild(a);
      li.appendChild(el('span', 'src-host', new URL(s.url).hostname.replace(/^www\./, '')));
      src.appendChild(li);
    });

    var fl = $('eFolder');
    while (fl.firstChild) fl.removeChild(fl.firstChild);
    (e.from_folder || []).forEach(function (f) { fl.appendChild(el('li', null, f)); });
    $('eFolderWrap').hidden = !(e.from_folder || []).length;

    var rel = $('eRelated');
    while (rel.firstChild) rel.removeChild(rel.firstChild);
    var g = groupOf(e.id);
    entries.filter(function (x) { return x.id !== e.id && g.ids && g.ids.indexOf(x.id) > -1; }).slice(0, 3).forEach(function (x) { rel.appendChild(card(x)); });
    window.scrollTo(0, 0);
  }

  fetch('/data/gub.json', { headers: { Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error('load'); return r.json(); })
    .then(function (data) {
      entries = Array.isArray(data.entries) ? data.entries : [];
      var t = null;
      try { t = new URLSearchParams(location.search).get('t'); } catch (err) { t = null; }
      var hit = t ? entries.filter(function (e) { return e.id === t; })[0] : null;
      if (hit) renderEntry(hit); else renderHub(data);
    })
    .catch(function () {
      $('loadError').hidden = false;
    });
})();
