/**
 * TheWed shared template runtime.
 *
 * Each template calls TheWed.init(render) with its own render(data) function.
 * The runtime:
 *   - listens for postMessage {type:'thewed:data', data} from the editor / public shell,
 *   - signals {type:'thewed:ready'} to its parent so the parent posts data,
 *   - renders built-in demo data when the template is opened directly (standalone),
 *   - wires up any RSVP form marked with [data-thewed-rsvp] to POST /api/rsvp/:slug,
 *   - exposes helpers: formatDate, countdown, escapeHtml, revealOnScroll.
 *
 * Data contract (data):
 *   { template:{folderKey,...},
 *     invitation:{groomName,brideName,weddingDate,weddingTime,venueName,venueAddress,storyText,customFields,slug,status},
 *     images:{hero:{url}|null, couple:[{url}], gallery:[{url}]},
 *     mode:'live'|'preview' }
 */
(function (global) {
  var DEMO = {
    template: { folderKey: '' },
    invitation: {
      groomName: 'Kavindu',
      brideName: 'Senali',
      weddingDate: nextSaturdayIso(),
      weddingTime: '17:30',
      venueName: 'The Grand Ballroom',
      venueAddress: 'Cinnamon Grand, 77 Galle Rd, Colombo 03',
      storyText:
        'What began as a chance meeting under Colombo rain became a love we never saw coming. Five years, countless cups of tea, and one very good dog later — we are ready to say “I do”.',
      customFields: { hashtag: '#KavinduWedsSenali', rsvp_phone: '+94 77 123 4567' },
      slug: '',
      status: 'preview',
    },
    images: { hero: null, couple: [], gallery: [] },
    mode: 'preview',
  };

  function nextSaturdayIso() {
    var d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + 120);
    return d.toISOString().slice(0, 10);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  function parseDate(dateStr, timeStr) {
    if (!dateStr) return null;
    var t = (timeStr && /^\d{2}:\d{2}/.test(timeStr)) ? timeStr : '00:00';
    var d = new Date(dateStr + 'T' + t + ':00');
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDate(dateStr, opts) {
    opts = opts || {};
    var d = parseDate(dateStr);
    if (!d) return '';
    var day = DAYS[d.getDay()];
    var out = MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    if (opts.withDay) out = day + ', ' + out;
    return out;
  }

  function startCountdown(dateStr, timeStr, onTick) {
    var target = parseDate(dateStr, timeStr);
    function tick() {
      if (!target) { onTick(null); return; }
      var diff = target.getTime() - Date.now();
      if (diff <= 0) { onTick({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true }); return; }
      var s = Math.floor(diff / 1000);
      onTick({
        days: Math.floor(s / 86400),
        hours: Math.floor((s % 86400) / 3600),
        minutes: Math.floor((s % 3600) / 60),
        seconds: s % 60,
        done: false,
      });
    }
    tick();
    if (TheWed._cd) clearInterval(TheWed._cd);
    TheWed._cd = setInterval(tick, 1000);
  }

  function revealOnScroll(selector) {
    var els = document.querySelectorAll(selector);
    if (!('IntersectionObserver' in global)) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  }

  function wireRsvp(data) {
    var form = document.querySelector('[data-thewed-rsvp]');
    if (!form) return;
    if (form._wired) return;
    form._wired = true;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = form.querySelector('[data-rsvp-status]');
      var slug = (TheWed.data && TheWed.data.invitation && TheWed.data.invitation.slug) || '';
      var isLive = TheWed.data && TheWed.data.mode === 'live' && slug;
      if (!isLive) {
        if (status) { status.textContent = 'RSVP is enabled once your invitation is published.'; }
        return;
      }
      var fd = {
        guest_name: (form.querySelector('[name=guest_name]') || {}).value || '',
        attending: (form.querySelector('[name=attending]') || {}).value !== 'no',
        guest_count: (form.querySelector('[name=guest_count]') || {}).value || 1,
        message: (form.querySelector('[name=message]') || {}).value || '',
      };
      if (!fd.guest_name.trim()) { if (status) status.textContent = 'Please enter your name.'; return; }
      var btn = form.querySelector('button[type=submit]');
      if (btn) { btn.disabled = true; }
      fetch('/api/rsvp/' + encodeURIComponent(slug), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fd),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || 'Could not submit');
          if (status) status.textContent = fd.attending ? 'Thank you! We can’t wait to celebrate with you. 💛' : 'Thank you for letting us know. You’ll be missed!';
          form.reset();
        }).catch(function (err) { if (status) status.textContent = err.message; })
        .finally(function () { if (btn) btn.disabled = false; });
    });
  }

  var TheWed = {
    data: null,
    _cd: null,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    parseDate: parseDate,
    startCountdown: startCountdown,
    revealOnScroll: revealOnScroll,
    setText: function (sel, value, fallback) {
      var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (el) el.textContent = (value != null && value !== '') ? value : (fallback || '');
    },
    init: function (render) {
      function run(data) {
        TheWed.data = data;
        try { render(data); } catch (e) { console.error('render error', e); }
        wireRsvp(data);
      }
      global.addEventListener('message', function (e) {
        if (e && e.data && e.data.type === 'thewed:data') run(e.data.data);
      });
      try {
        if (global.parent && global.parent !== global) {
          global.parent.postMessage({ type: 'thewed:ready' }, '*');
        }
      } catch (e) { /* ignore */ }
      // Standalone (opened directly, not embedded) → show demo.
      if (global.parent === global) run(DEMO);
    },
  };

  global.TheWed = TheWed;
})(window);
