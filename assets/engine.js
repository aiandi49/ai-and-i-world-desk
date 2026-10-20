// AI&I World Desk — engine front end.
// Everything shown from the model or the visitor is rendered with textContent / DOM nodes only.
(function () {
  'use strict';

  var SILENCE_MS = 10000;           // mic turns off after this much silence
  var STORE_KEY = 'worlddesk-session-v1';
  var MAX_SEND = 24;                // most recent messages sent to the server
  var LONG_WAIT_MS = 8000;
  var VERY_LONG_WAIT_MS = 30000;
  var PROJECT = 'AI&I World Desk';
  var FILE_SLUG = 'ai-and-i-world-desk-briefing';
  var BOT_NAME = 'World Desk';
  var HIDDEN_FIELDS = { guide: true };

  var $ = function (id) { return document.getElementById(id); };
  var log = $('log'), input = $('chatInput'), form = $('composer'), sendBtn = $('sendBtn');
  var micBtn = $('micBtn'), micStatus = $('micStatus'), formError = $('formError');
  var countChip = $('countChip'), resetBtn = $('resetBtn'), downloadBtn = $('downloadBtn');
  var fullBtn = $('fullBtn'), chatCard = $('chatCard');

  var state = { messages: [], matches: [], selectedId: null, nextStep: '' };
  var busy = false;

  // ---------- storage ----------
  function load() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.messages)) {
        state.messages = data.messages.filter(function (m) {
          return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
        });
        state.matches = Array.isArray(data.matches) ? data.matches.filter(validMatch) : [];
        state.selectedId = typeof data.selectedId === 'string' ? data.selectedId : null;
        state.nextStep = typeof data.nextStep === 'string' ? data.nextStep : '';
      }
    } catch (e) { /* ignore */ }
  }
  function persist() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---------- MATCH parsing ----------
  function validMatch(m) {
    return m && typeof m === 'object' && typeof m.title === 'string' && m.title.trim() !== '';
  }
  function cleanMatch(m, i) {
    var score = (typeof m.score === 'number' && isFinite(m.score)) ? Math.max(0, Math.min(100, Math.round(m.score))) : null;
    var details = {};
    if (m.details && typeof m.details === 'object' && !Array.isArray(m.details)) {
      Object.keys(m.details).slice(0, 12).forEach(function (k) {
        var v = m.details[k];
        if (v === null || v === undefined) return;
        if (typeof v === 'object') v = Array.isArray(v) ? v.join(', ') : '';
        v = String(v).trim();
        if (v) details[String(k).slice(0, 60)] = v.slice(0, 400);
      });
    }
    return {
      id: (typeof m.id === 'string' && m.id.trim()) ? m.id.trim().slice(0, 80) : ('item-' + i),
      title: String(m.title).trim().slice(0, 140),
      score: score,
      why: typeof m.why === 'string' ? m.why.trim().slice(0, 300) : '',
      details: details
    };
  }
  // Strips every line starting with MATCH: (even malformed) and returns parsed matches.
  function splitReply(raw) {
    var lines = String(raw || '').split(/\r?\n/);
    var keep = [], matches = [];
    lines.forEach(function (line) {
      var t = line.trim();
      if (/^MATCH\s*:/i.test(t)) {
        var json = t.replace(/^MATCH\s*:\s*/i, '');
        try {
          var obj = JSON.parse(json);
          if (validMatch(obj)) matches.push(cleanMatch(obj, matches.length));
        } catch (e) { /* malformed: dropped silently */ }
      } else {
        keep.push(line);
      }
    });
    var visible = keep.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    var next = '';
    var nl = visible.split('\n');
    for (var i = nl.length - 1; i >= 0; i--) {
      var m = nl[i].trim().replace(/^\*\*|\*\*$/g, '');
      var mm = m.match(/^\**\s*Next step\s*:\**\s*(.+)$/i);
      if (mm) { next = mm[1].replace(/\*\*/g, '').trim(); break; }
    }
    return { visible: visible, matches: matches, next: next };
  }
  function sortMatches(list) {
    return list.slice().sort(function (a, b) {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });
  }

  // ---------- rich text rendering (DOM only) ----------
  var URL_RE = /(https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])/g;
  function appendInline(parent, text) {
    // **bold** and bare URLs
    var parts = String(text).split(/(\*\*[^*]+\*\*)/g);
    parts.forEach(function (part) {
      if (!part) return;
      var target = parent;
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        target = document.createElement('strong');
        parent.appendChild(target);
        part = part.slice(2, -2);
      }
      var last = 0;
      part.replace(URL_RE, function (url, _g, offset) {
        if (offset > last) target.appendChild(document.createTextNode(part.slice(last, offset)));
        var a = document.createElement('a');
        a.href = url;
        a.textContent = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        target.appendChild(a);
        last = offset + url.length;
        return url;
      });
      if (last < part.length) target.appendChild(document.createTextNode(part.slice(last)));
    });
  }
  function renderRich(container, text) {
    var blocks = String(text).split(/\n\s*\n/);
    blocks.forEach(function (block) {
      var lines = block.split('\n').filter(function (l) { return l.trim() !== ''; });
      if (!lines.length) return;
      var list = null, listType = '';
      lines.forEach(function (line) {
        var t = line.trim();
        var bullet = t.match(/^[-•*]\s+(.*)$/);
        var num = t.match(/^(\d+)[.)]\s+(.*)$/);
        if (bullet || num) {
          var type = bullet ? 'ul' : 'ol';
          if (!list || listType !== type) {
            list = document.createElement(type);
            listType = type;
            container.appendChild(list);
          }
          var li = document.createElement('li');
          appendInline(li, bullet ? bullet[1] : num[2]);
          list.appendChild(li);
        } else {
          list = null;
          var p = document.createElement('p');
          var h = t.match(/^#{1,6}\s+(.*)$/);
          if (h) { p.className = 'h'; appendInline(p, h[1]); } else { appendInline(p, t); }
          container.appendChild(p);
        }
      });
    });
  }

  // ---------- log ----------
  function addBubble(role, text, opts) {
    opts = opts || {};
    var div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'user' : 'bot') + (opts.error ? ' error' : '');
    if (role === 'user' || opts.error) {
      var lines = String(text).split('\n');
      lines.forEach(function (l, i) {
        if (i) div.appendChild(document.createElement('br'));
        div.appendChild(document.createTextNode(l));
      });
    } else {
      renderRich(div, text);
    }
    if (opts.sources && opts.sources.length) {
      var s = document.createElement('div');
      s.className = 'sources';
      var h = document.createElement('p');
      h.textContent = 'Sources';
      s.appendChild(h);
      var ol = document.createElement('ol');
      opts.sources.slice(0, 8).forEach(function (src) {
        if (!src || typeof src.url !== 'string' || !/^https?:\/\//i.test(src.url)) return;
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = src.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = (typeof src.title === 'string' && src.title.trim()) ? src.title.trim().slice(0, 160) : src.url;
        li.appendChild(a);
        ol.appendChild(li);
      });
      s.appendChild(ol);
      div.appendChild(s);
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }
  function renderLog() {
    var intro = log.querySelector('.intro');
    while (log.firstChild) log.removeChild(log.firstChild);
    if (intro) log.appendChild(intro);
    state.messages.forEach(function (m) {
      if (m.role === 'user') addBubble('user', m.content);
      else addBubble('bot', splitReply(m.content).visible, { sources: m.sources });
    });
  }
  function updateCount() {
    var n = state.messages.length;
    countChip.textContent = n === 0 ? 'No messages yet' : (n === 1 ? '1 message' : n + ' messages');
    var hasReply = state.messages.some(function (m) { return m.role === 'assistant'; });
    downloadBtn.disabled = !hasReply;
  }

  // ---------- side cards ----------
  var CIRC = 2 * Math.PI * 26;
  function selected() {
    var id = state.selectedId;
    var list = sortMatches(state.matches);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }
  function detailValue(m, key) {
    var keys = Object.keys(m.details || {});
    for (var i = 0; i < keys.length; i++) if (keys[i].toLowerCase() === key) return m.details[keys[i]];
    return '';
  }
  function renderCards() {
    var list = sortMatches(state.matches);
    var top = list[0] || null;
    $('topKind').textContent = top ? (detailValue(top, 'category') || detailValue(top, 'region') || 'World signal') : 'World signal';
    $('topName').textContent = top ? top.title : 'Waiting for your first question';
    $('topScore').textContent = top && top.score !== null ? String(top.score) : '—';
    $('topWhy').textContent = top
      ? (top.why || '') + (top.score === null ? ' Tell me where you live, what you invest in or what you care about, and I can score this for you.' : '')
      : 'Ask a question and the most important story for you shows up here.';

    // gauge
    var fill = $('gaugeFill');
    var pct = top && top.score !== null ? top.score : 0;
    fill.setAttribute('stroke-dasharray', (CIRC * pct / 100).toFixed(1) + ' ' + CIRC.toFixed(1));
    $('gaugeText').textContent = top && top.score !== null ? String(top.score) : '—';
    var anyScored = list.some(function (m) { return m.score !== null; });
    $('rankNote').textContent = !list.length
      ? 'Stories you ask about are ranked here by how much they could affect you.'
      : (anyScored ? 'Ranked by likely impact on you. Tap a story for details.' : 'Not scored yet. Share your priorities to rank these. Tap a story for details.');

    $('shortEmpty').hidden = list.length > 0;
    var ol = $('shortList');
    while (ol.firstChild) ol.removeChild(ol.firstChild);
    var sel = selected();
    list.slice(0, 6).forEach(function (m, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', sel && sel.id === m.id ? 'true' : 'false');
      var r = document.createElement('span'); r.className = 'rank'; r.textContent = String(i + 1);
      var n = document.createElement('span'); n.className = 'name'; n.textContent = m.title;
      var s = document.createElement('span'); s.className = 'sc'; s.textContent = m.score !== null ? String(m.score) : '—';
      b.appendChild(r); b.appendChild(n); b.appendChild(s);
      b.addEventListener('click', function () { state.selectedId = m.id; persist(); renderCards(); });
      li.appendChild(b);
      ol.appendChild(li);
    });

    // details
    var dl = $('detailFields');
    while (dl.firstChild) dl.removeChild(dl.firstChild);
    var link = $('guideLink');
    $('detailEmpty').hidden = !!sel;
    if (sel) {
      var head = document.createElement('div');
      var dt0 = document.createElement('dt'); dt0.textContent = 'Story';
      var dd0 = document.createElement('dd'); dd0.textContent = sel.title + (sel.score !== null ? ' · impact ' + sel.score : '');
      head.appendChild(dt0); head.appendChild(dd0); dl.appendChild(head);
      Object.keys(sel.details).forEach(function (k) {
        if (HIDDEN_FIELDS[k.toLowerCase()]) return;
        var w = document.createElement('div');
        var dt = document.createElement('dt'); dt.textContent = k;
        var dd = document.createElement('dd'); appendInline(dd, sel.details[k]);
        w.appendChild(dt); w.appendChild(dd); dl.appendChild(w);
      });
      var g = detailValue(sel, 'guide');
      if (g && /^[a-z0-9-]{2,60}$/.test(g)) {
        link.href = '/guide?t=' + encodeURIComponent(g);
        link.hidden = false;
      } else { link.hidden = true; }
    } else { link.hidden = true; }
    $('nextWrap').hidden = !state.nextStep;
    $('nextText').textContent = state.nextStep || '';
  }

  // ---------- thinking indicator ----------
  var thinking = null, t1 = null, t2 = null;
  function showThinking() {
    thinking = document.createElement('div');
    thinking.className = 'msg bot thinking';
    var dots = document.createElement('span');
    dots.className = 'dots';
    dots.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i++) dots.appendChild(document.createElement('span'));
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = 'The World Desk is checking live sources for you.';
    var note = document.createElement('p');
    note.className = 'think-note';
    note.hidden = true;
    thinking.appendChild(dots); thinking.appendChild(sr); thinking.appendChild(note);
    log.appendChild(thinking);
    log.scrollTop = log.scrollHeight;
    t1 = setTimeout(function () { note.hidden = false; note.textContent = 'Still working. Live searches can take up to a minute.'; log.scrollTop = log.scrollHeight; }, LONG_WAIT_MS);
    t2 = setTimeout(function () { note.textContent = 'Almost there. Cross-checking sources.'; }, VERY_LONG_WAIT_MS);
  }
  function hideThinking() {
    clearTimeout(t1); clearTimeout(t2); t1 = t2 = null;
    if (thinking && thinking.parentNode) thinking.parentNode.removeChild(thinking);
    thinking = null;
  }

  // ---------- textarea ----------
  function autoGrow() {
    if (!input.value) { input.style.height = ''; input.classList.remove('scrolls'); return; }
    input.style.height = 'auto';
    var max = parseFloat(getComputedStyle(input).maxHeight) || 136;
    var h = input.scrollHeight + 2;
    input.style.height = Math.min(h, max) + 'px';
    if (h > max) input.classList.add('scrolls'); else input.classList.remove('scrolls');
  }
  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = !msg;
  }

  // ---------- send ----------
  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    sendBtn.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    if (listening) stopListening();
    showError('');
    state.messages.push({ role: 'user', content: text.slice(0, 3000) });
    persist();
    addBubble('user', text);
    updateCount();
    input.value = '';
    autoGrow();
    setBusy(true);
    showThinking();

    var payload = state.messages.slice(-MAX_SEND).map(function (m) {
      return { role: m.role, content: m.content.slice(0, 3800) };
    });
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: payload })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    }).then(function (r) {
      hideThinking();
      if (!r.ok || !r.data || typeof r.data.reply !== 'string') {
        var msg = (r.data && typeof r.data.error === 'string') ? r.data.error : 'Something went wrong reaching the World Desk. Please try again.';
        addBubble('bot', msg, { error: true });
        return;
      }
      var sources = Array.isArray(r.data.sources) ? r.data.sources.filter(function (s) {
        return s && typeof s.url === 'string' && /^https?:\/\//i.test(s.url);
      }).slice(0, 8) : [];
      var parts = splitReply(r.data.reply);
      state.messages.push({ role: 'assistant', content: r.data.reply, sources: sources });
      if (parts.matches.length) {
        state.matches = parts.matches;
        state.selectedId = sortMatches(parts.matches)[0].id;
      }
      if (parts.next) state.nextStep = parts.next;
      persist();
      addBubble('bot', parts.visible || 'I could not put together an answer that time. Please ask again.', { sources: sources });
      updateCount();
      renderCards();
    }).catch(function () {
      hideThinking();
      addBubble('bot', 'The connection dropped before the World Desk answered. Check your internet and try again.', { error: true });
    }).then(function () {
      setBusy(false);
    });
  }

  form.addEventListener('submit', function (ev) { ev.preventDefault(); send(input.value); });
  input.addEventListener('input', autoGrow);
  window.addEventListener('resize', autoGrow);
  document.addEventListener('prefs:change', autoGrow);
  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(input.value); }
  });

  resetBtn.addEventListener('click', function () {
    if (listening) stopListening();
    state = { messages: [], matches: [], selectedId: null, nextStep: '' };
    persist();
    renderLog();
    updateCount();
    renderCards();
    showError('');
    input.focus();
  });

  // ---------- full page ----------
  function setFull(on) {
    chatCard.classList.toggle('is-full', on);
    document.body.classList.toggle('chat-full', on);
    fullBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    fullBtn.setAttribute('aria-label', on ? 'Exit full page' : 'Full page');
    fullBtn.setAttribute('title', on ? 'Exit full page' : 'Full page');
    autoGrow();
    if (on) input.focus(); else fullBtn.focus();
    log.scrollTop = log.scrollHeight;
  }
  fullBtn.addEventListener('click', function () { setFull(!chatCard.classList.contains('is-full')); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && chatCard.classList.contains('is-full')) setFull(false);
  });

  // ---------- download ----------
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function buildBriefing() {
    var now = new Date();
    var L = [];
    L.push(PROJECT + ' briefing, saved ' + now.toLocaleString());
    L.push('');
    L.push('Note: prices, polls and facts were checked during this conversation from live sources. Confirm them before acting on them. Market information is not financial advice.');
    L.push('');
    L.push('RANKED OPTIONS');
    var list = sortMatches(state.matches);
    if (!list.length) L.push('(none yet)');
    list.forEach(function (m, i) {
      L.push('');
      L.push((i + 1) + '. ' + m.title);
      L.push('   Impact score: ' + (m.score !== null ? m.score + '/100' : 'not scored'));
      if (m.why) L.push('   Why: ' + m.why);
      Object.keys(m.details).forEach(function (k) {
        if (HIDDEN_FIELDS[k.toLowerCase()]) return;
        L.push('   ' + k + ': ' + m.details[k]);
      });
    });
    L.push('');
    L.push('LATEST PLAN');
    var lastBot = null;
    for (var i = state.messages.length - 1; i >= 0; i--) if (state.messages[i].role === 'assistant') { lastBot = state.messages[i]; break; }
    L.push(lastBot ? splitReply(lastBot.content).visible : '(no reply yet)');
    if (lastBot && lastBot.sources && lastBot.sources.length) {
      L.push('');
      L.push('Sources:');
      lastBot.sources.forEach(function (s) { L.push('- ' + (s.title ? s.title + ' ' : '') + s.url); });
    }
    L.push('');
    L.push('FULL CONVERSATION');
    state.messages.forEach(function (m) {
      L.push('');
      L.push((m.role === 'user' ? 'You: ' : BOT_NAME + ': ') + (m.role === 'user' ? m.content : splitReply(m.content).visible));
    });
    var text = L.join('\n').split('\n').filter(function (line) { return !/^\s*MATCH\s*:/i.test(line); }).join('\r\n');
    var name = FILE_SLUG + '-' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '.txt';
    return { text: '﻿' + text + '\r\n', name: name };
  }
  downloadBtn.addEventListener('click', function () {
    if (downloadBtn.disabled) return;
    var b = buildBriefing();
    var blob = new Blob([b.text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = b.name;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
  });

  // ---------- voice input ----------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var isAndroid = /Android/i.test(navigator.userAgent || '');
  var rec = null, listening = false, silenceTimer = null, lastSpeech = 0;
  var baseText = '', committed = '', sessionFinal = '', interim = '';

  function joinText() {
    var spoken = (committed + ' ' + sessionFinal + ' ' + interim).replace(/\s+/g, ' ').trim();
    var sep = baseText && spoken && !/\s$/.test(baseText) ? ' ' : '';
    input.value = baseText + sep + spoken;
    autoGrow();
  }
  function armSilence() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(function () { stopListening(); }, SILENCE_MS);
  }
  function setMicUi(on) {
    micBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    micBtn.setAttribute('aria-label', on ? 'Stop voice input' : 'Start voice input');
    micBtn.setAttribute('title', on ? 'Stop voice input' : 'Start voice input');
    micStatus.hidden = !on;
  }
  function micError(code) {
    var msg = {
      'not-allowed': 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then tap the mic again.',
      'service-not-allowed': 'Voice input isn’t allowed in this browser right now. Check your browser’s microphone and speech settings, then tap the mic again.',
      'audio-capture': 'No microphone was found. Connect one or check your device settings, then tap the mic again.',
      'network': 'Voice input lost its connection. Check your internet, then tap the mic again.',
      'start': 'Voice input couldn’t start. Tap the mic to try again.'
    }[code] || 'Voice input stopped unexpectedly. Tap the mic to try again.';
    stopListening();
    showError(msg);
  }
  function startSession() {
    rec = new SR();
    rec.lang = document.documentElement.lang || 'en-US';
    rec.interimResults = true;
    rec.continuous = !isAndroid;
    rec.maxAlternatives = 1;
    sessionFinal = ''; interim = '';
    rec.onresult = function (ev) {
      var fin = '', tmp = '';
      for (var i = 0; i < ev.results.length; i++) {
        var r = ev.results[i];
        if (r.isFinal) fin += r[0].transcript + ' '; else tmp += r[0].transcript + ' ';
      }
      sessionFinal = fin.trim();
      interim = tmp.trim();
      lastSpeech = Date.now();
      armSilence();
      joinText();
    };
    rec.onerror = function (ev) {
      if (ev.error === 'no-speech' || ev.error === 'aborted') return; // silence is handled by the timer
      micError(ev.error);
    };
    rec.onend = function () {
      committed = (committed + ' ' + sessionFinal).trim();
      sessionFinal = ''; interim = '';
      joinText();
      if (listening && Date.now() - lastSpeech < SILENCE_MS) {
        try { startSession(); } catch (e) { micError('start'); }
      } else if (listening) {
        stopListening();
      }
    };
    rec.start();
  }
  function startListening() {
    showError('');
    baseText = input.value;
    committed = ''; sessionFinal = ''; interim = '';
    lastSpeech = Date.now();
    listening = true;
    setMicUi(true);
    armSilence();
    try { startSession(); } catch (e) { micError('start'); }
  }
  function stopListening() {
    listening = false;
    clearTimeout(silenceTimer);
    if (rec) {
      var r = rec; rec = null;
      r.onend = null; r.onresult = null; r.onerror = null;
      try { r.stop(); } catch (e) { /* ignore */ }
    }
    committed = (committed + ' ' + sessionFinal).trim();
    sessionFinal = ''; interim = '';
    if (baseText || committed) joinText();
    setMicUi(false);
  }
  if (SR) {
    micBtn.hidden = false;
    micBtn.addEventListener('click', function () { if (listening) stopListening(); else startListening(); });
  }

  // ---------- boot ----------
  load();
  renderLog();
  updateCount();
  renderCards();
  autoGrow();
  try {
    var ask = new URLSearchParams(location.search).get('ask');
    if (ask) { input.value = ask.slice(0, 3000); autoGrow(); }
  } catch (e) { /* ignore */ }
})();
