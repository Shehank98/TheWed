/**
 * TheWed shared template runtime.
 *
 * Each template calls TheWed.init(render) with its own render(data). The runtime
 * owns all the shared behavior so the 5 templates stay in sync:
 *   - postMessage data contract (editor preview + public page),
 *   - countdown with a "Today's the day!" swap on the wedding day,
 *   - event schedule timeline, venue map / Get Directions,
 *   - photo gallery lightbox, optional background music (muted autoplay + toggle),
 *   - guestbook (wishes wall) submit + list, RSVP (incl. meal preference) + a
 *     live "X guests confirmed" counter,
 *   - per-guest personalization ("Dear <name>" from ?to=), WhatsApp share,
 *   - a Sinhala / Tamil / English label switcher (couple's own text is untouched).
 *
 * Templates supply styled containers with data-* hooks; the runtime fills them.
 *
 * Data contract (data):
 *   invitation: { groomName, brideName, weddingDate, weddingTime, venueName,
 *     venueAddress, storyText, customFields, schedule:[{name,time,venue}],
 *     mapLink, musicUrl, languageDefault, mealPrefEnabled, slug, status }
 *   images: { hero, couple:[], gallery:[] }
 *   wishes: [{guest_name, message, created_at}]   (public only)
 *   stats: { confirmedGuests }                    (public only)
 *   guestName: string   (from ?to=, public only)
 *   publicUrl: string   (canonical /i/<slug> url)
 *   mode: 'live' | 'preview'
 */
(function (global) {
  // ---- i18n dictionary (static UI labels only) ----
  var I18N = {
    en: {
      greeting: 'Dear', directions: 'Get Directions', schedule: 'Schedule', today: "Today's the day!",
      days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds',
      rsvp: 'RSVP', name: 'Your name', attend_q: 'Will you attend?', yes: 'Joyfully accepts',
      no: 'Regretfully declines', guests: 'Number of guests', meal: 'Meal preference', message: 'Message',
      send: 'Send', confirmed: 'guests confirmed', guestbook: 'Guestbook', wishes: 'Wishes & Blessings',
      wish_name: 'Your name', wish_msg: 'Your wish for the couple', wish_send: 'Post wish',
      share: 'Share on WhatsApp', mute: 'Music: off', unmute: 'Music: on', no_wishes: 'Be the first to leave a wish.',
    },
    si: {
      greeting: 'ආදරණීය', directions: 'දිශාව සොයන්න', schedule: 'වැඩසටහන', today: 'අද තමයි ඒ දවස!',
      days: 'දින', hours: 'පැය', minutes: 'මිනිත්තු', seconds: 'තත්පර',
      rsvp: 'පැමිණීම දන්වන්න', name: 'ඔබේ නම', attend_q: 'ඔබ සහභාගී වේද?', yes: 'සතුටින් පැමිණේ',
      no: 'කනගාටුවෙන් නොපැමිණේ', guests: 'අමුත්තන් ගණන', meal: 'ආහාර තේරීම', message: 'පණිවිඩය',
      send: 'යවන්න', confirmed: 'අමුත්තන් තහවුරු කර ඇත', guestbook: 'සුබ පැතුම් පොත', wishes: 'සුබ පැතුම්',
      wish_name: 'ඔබේ නම', wish_msg: 'යුවළ සඳහා ඔබේ සුබ පැතුම', wish_send: 'පළ කරන්න',
      share: 'WhatsApp හරහා බෙදන්න', mute: 'සංගීතය: නැත', unmute: 'සංගීතය: ඇත', no_wishes: 'පළමු සුබ පැතුම තබන්න.',
    },
    ta: {
      greeting: 'அன்பார்ந்த', directions: 'வழி காட்டு', schedule: 'நிகழ்ச்சி நிரல்', today: 'இன்று தான் அந்த நாள்!',
      days: 'நாட்கள்', hours: 'மணி', minutes: 'நிமிடம்', seconds: 'விநாடி',
      rsvp: 'வருகையை உறுதிசெய்', name: 'உங்கள் பெயர்', attend_q: 'நீங்கள் வருகிறீர்களா?', yes: 'மகிழ்ச்சியுடன் வருகிறேன்',
      no: 'வர இயலாது', guests: 'விருந்தினர் எண்ணிக்கை', meal: 'உணவு விருப்பம்', message: 'செய்தி',
      send: 'அனுப்பு', confirmed: 'விருந்தினர்கள் உறுதி', guestbook: 'வாழ்த்து புத்தகம்', wishes: 'வாழ்த்துக்கள்',
      wish_name: 'உங்கள் பெயர்', wish_msg: 'தம்பதியருக்கு உங்கள் வாழ்த்து', wish_send: 'வாழ்த்து இடு',
      share: 'WhatsApp இல் பகிர்', mute: 'இசை: இல்லை', unmute: 'இசை: ஆம்', no_wishes: 'முதல் வாழ்த்தை இடுங்கள்.',
    },
  };
  var currentLang = 'en';

  function t(key) { return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key; }

  var DEMO = {
    template: { folderKey: '' },
    invitation: {
      groomName: 'Kavindu', brideName: 'Senali', weddingDate: nextSaturdayIso(), weddingTime: '17:30',
      venueName: 'The Grand Ballroom', venueAddress: 'Cinnamon Grand, 77 Galle Rd, Colombo 03',
      storyText: 'What began as a chance meeting under Colombo rain became a love we never saw coming. Five years, countless cups of tea, and one very good dog later — we are ready to say “I do”.',
      customFields: { hashtag: '#KavinduWedsSenali', rsvp_phone: '+94 77 123 4567', nekath: '9:15 AM' },
      schedule: [
        { name: 'Poruwa Ceremony', time: '9:15 AM', venue: 'Main Hall' },
        { name: 'Lunch Reception', time: '12:30 PM', venue: 'Garden Terrace' },
        { name: 'Evening Party', time: '7:00 PM', venue: 'The Grand Ballroom' },
      ],
      mapLink: 'https://maps.google.com/?q=Cinnamon+Grand+Colombo',
      musicUrl: '', languageDefault: 'en', mealPrefEnabled: true,
      slug: '', status: 'preview',
    },
    images: { hero: null, couple: [], gallery: [] },
    wishes: [{ guest_name: 'Nimal', message: 'Wishing you a lifetime of love and laughter!', created_at: new Date().toISOString() }],
    stats: { confirmedGuests: 42 },
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
    var tt = (timeStr && /^\d{2}:\d{2}/.test(timeStr)) ? timeStr : '00:00';
    var d = new Date(dateStr + 'T' + tt + ':00');
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDate(dateStr, opts) {
    opts = opts || {};
    var d = parseDate(dateStr);
    if (!d) return '';
    var out = MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    if (opts.withDay) out = DAYS[d.getDay()] + ', ' + out;
    return out;
  }

  function isWeddingToday(dateStr) {
    var d = parseDate(dateStr);
    if (!d) return false;
    var now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  function startCountdown(dateStr, timeStr, onTick) {
    var target = parseDate(dateStr, timeStr);
    var todayEl = document.querySelector('[data-today]');
    var cdEl = document.querySelector('[data-countdown]');
    function tick() {
      // Show the "today" message on the wedding day and hide the counter.
      if (isWeddingToday(dateStr)) {
        if (todayEl) { todayEl.textContent = t('today'); todayEl.style.display = ''; }
        if (cdEl) cdEl.style.display = 'none';
        return;
      }
      if (todayEl) todayEl.style.display = 'none';
      if (cdEl) cdEl.style.display = '';
      if (!target) { onTick(null); return; }
      var diff = target.getTime() - Date.now();
      if (diff <= 0) { onTick({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true }); return; }
      var s = Math.floor(diff / 1000);
      onTick({ days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600),
        minutes: Math.floor((s % 3600) / 60), seconds: s % 60, done: false });
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

  // ---- Schedule timeline ----
  function renderSchedule(schedule) {
    var wrap = document.querySelector('[data-schedule]');
    var section = document.querySelector('[data-schedule-section]');
    schedule = Array.isArray(schedule) ? schedule : [];
    if (wrap) {
      wrap.innerHTML = schedule.map(function (it) {
        return '<div class="tw-tl-item">' +
          '<div class="tw-tl-dot"></div>' +
          '<div class="tw-tl-body">' +
          (it.time ? '<div class="tw-tl-time">' + escapeHtml(it.time) + '</div>' : '') +
          '<div class="tw-tl-name">' + escapeHtml(it.name) + '</div>' +
          (it.venue ? '<div class="tw-tl-venue">' + escapeHtml(it.venue) + '</div>' : '') +
          '</div></div>';
      }).join('');
    }
    if (section) section.style.display = schedule.length ? '' : 'none';
  }

  // ---- Venue map / directions ----
  function wireMap(inv) {
    var link = (inv.mapLink || '').trim();
    var btn = document.querySelector('[data-directions]');
    var embed = document.querySelector('[data-map-embed]');
    var section = document.querySelector('[data-map-section]');
    var hasMap = Boolean(link);
    if (section) section.style.display = hasMap ? '' : 'none';
    if (!hasMap) { if (embed) embed.innerHTML = ''; return; }

    // Embed code pasted directly?
    var iframeSrc = null;
    var m = /<iframe[^>]*src=["']([^"']+)["']/i.exec(link);
    if (m) iframeSrc = m[1];
    var href = iframeSrc || link;
    if (btn) { btn.setAttribute('href', href); btn.setAttribute('target', '_blank'); btn.setAttribute('rel', 'noopener'); btn.style.display = ''; }
    if (embed) {
      embed.innerHTML = iframeSrc
        ? '<iframe src="' + escapeHtml(iframeSrc) + '" loading="lazy" style="border:0;width:100%;height:100%" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>'
        : '';
    }
  }

  // ---- Photo gallery lightbox (attached once) ----
  var lightbox = null;
  var lightboxImgs = [];
  var lightboxIdx = 0;
  function ensureLightbox() {
    if (lightbox) return;
    lightbox = document.createElement('div');
    lightbox.className = 'tw-lightbox';
    lightbox.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);display:none;align-items:center;justify-content:center;z-index:9999';
    lightbox.innerHTML =
      '<button class="tw-lb-close" aria-label="Close" style="position:absolute;top:16px;right:20px;background:none;border:none;color:#fff;font-size:34px;cursor:pointer;line-height:1">×</button>' +
      '<button class="tw-lb-prev" aria-label="Previous" style="position:absolute;left:12px;background:none;border:none;color:#fff;font-size:44px;cursor:pointer">‹</button>' +
      '<img class="tw-lb-img" src="" alt="" style="max-width:90vw;max-height:86vh;object-fit:contain;border-radius:4px;box-shadow:0 10px 40px rgba(0,0,0,0.6)"/>' +
      '<button class="tw-lb-next" aria-label="Next" style="position:absolute;right:12px;background:none;border:none;color:#fff;font-size:44px;cursor:pointer">›</button>';
    document.body.appendChild(lightbox);
    var imgEl = lightbox.querySelector('.tw-lb-img');
    function show(i) { lightboxIdx = (i + lightboxImgs.length) % lightboxImgs.length; imgEl.src = lightboxImgs[lightboxIdx]; }
    lightbox.querySelector('.tw-lb-close').onclick = function () { lightbox.style.display = 'none'; };
    lightbox.querySelector('.tw-lb-prev').onclick = function (e) { e.stopPropagation(); show(lightboxIdx - 1); };
    lightbox.querySelector('.tw-lb-next').onclick = function (e) { e.stopPropagation(); show(lightboxIdx + 1); };
    lightbox.addEventListener('click', function (e) { if (e.target === lightbox) lightbox.style.display = 'none'; });
    global.addEventListener('keydown', function (e) {
      if (lightbox.style.display === 'none') return;
      if (e.key === 'Escape') lightbox.style.display = 'none';
      if (e.key === 'ArrowLeft') show(lightboxIdx - 1);
      if (e.key === 'ArrowRight') show(lightboxIdx + 1);
    });
    TheWed._lbShow = show;
  }
  function wireGalleryLightbox() {
    ensureLightbox();
    var grid = document.querySelector('[data-gallery]');
    if (!grid || grid._lbWired) return;
    grid._lbWired = true;
    grid.addEventListener('click', function (e) {
      var img = e.target.closest && e.target.closest('img');
      if (!img) return;
      lightboxImgs = Array.prototype.map.call(grid.querySelectorAll('img'), function (i) { return i.src; });
      var idx = lightboxImgs.indexOf(img.src);
      lightbox.style.display = 'flex';
      TheWed._lbShow(idx < 0 ? 0 : idx);
    });
  }

  // ---- Background music (muted autoplay + floating toggle) ----
  var audioEl = null;
  function wireMusic(inv) {
    var url = (inv.musicUrl || '').trim();
    var btn = document.querySelector('[data-music-btn]') || injectMusicButton();
    if (!url) { if (btn) btn.style.display = 'none'; if (audioEl) { audioEl.pause(); } return; }
    if (!audioEl) { audioEl = document.createElement('audio'); audioEl.loop = true; document.body.appendChild(audioEl); }
    if (audioEl.getAttribute('src') !== url) audioEl.setAttribute('src', url);
    audioEl.muted = true;
    var p = audioEl.play(); if (p && p.catch) p.catch(function () {});
    btn.style.display = '';
    function label() { btn.textContent = audioEl.muted ? '🔇' : '🔊'; btn.title = audioEl.muted ? t('unmute') : t('mute'); }
    label();
    btn.onclick = function () {
      audioEl.muted = !audioEl.muted;
      if (!audioEl.muted) { var pp = audioEl.play(); if (pp && pp.catch) pp.catch(function () {}); }
      label();
    };
  }
  function injectMusicButton() {
    var b = document.createElement('button');
    b.setAttribute('data-music-btn', '');
    b.className = 'tw-float-btn tw-music-btn';
    b.style.cssText = 'position:fixed;right:16px;bottom:16px;width:46px;height:46px;border-radius:50%;border:none;background:rgba(0,0,0,0.55);color:#fff;font-size:20px;cursor:pointer;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,0.3)';
    document.body.appendChild(b);
    return b;
  }

  // ---- Guestbook (wishes wall) ----
  function renderWishes(wishes) {
    var list = document.querySelector('[data-wishes]');
    if (!list) return;
    wishes = Array.isArray(wishes) ? wishes : [];
    if (!wishes.length) { list.innerHTML = '<p class="tw-no-wishes">' + t('no_wishes') + '</p>'; return; }
    list.innerHTML = wishes.map(function (w) {
      return '<div class="tw-wish"><div class="tw-wish-msg">“' + escapeHtml(w.message) + '”</div>' +
        '<div class="tw-wish-name">— ' + escapeHtml(w.guest_name) + '</div></div>';
    }).join('');
  }
  function loadWishes(slug) {
    if (!slug) return;
    fetch('/api/invitations/public/' + encodeURIComponent(slug) + '/wishes')
      .then(function (r) { return r.json(); })
      .then(function (j) { renderWishes(j.wishes || []); })
      .catch(function () {});
  }
  function wireGuestbook(data) {
    var form = document.querySelector('[data-wish-form]');
    if (!form || form._wired) return;
    form._wired = true;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = form.querySelector('[data-wish-status]');
      var slug = data.invitation.slug;
      var isLive = data.mode === 'live' && slug;
      if (!isLive) { if (status) status.textContent = 'The guestbook opens once your invitation is published.'; return; }
      var payload = {
        guest_name: (form.querySelector('[name=guest_name]') || {}).value || '',
        message: (form.querySelector('[name=message]') || {}).value || '',
      };
      if (!payload.guest_name.trim() || !payload.message.trim()) { if (status) status.textContent = 'Please add your name and a message.'; return; }
      var btn = form.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      fetch('/api/wishes/' + encodeURIComponent(slug), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || 'Could not post');
          if (status) status.textContent = 'Thank you for your wish! 💐';
          form.reset(); loadWishes(slug);
        }).catch(function (err) { if (status) status.textContent = err.message; })
        .finally(function () { if (btn) btn.disabled = false; });
    });
  }

  // ---- RSVP (with meal preference) + confirmed counter ----
  function updateConfirmedCounter(data) {
    var el = document.querySelector('[data-confirmed-count]');
    var section = document.querySelector('[data-confirmed-section]');
    if (!el && !section) return;
    function set(n) { if (el) el.textContent = n; if (section) section.style.display = ''; }
    if (data.stats && typeof data.stats.confirmedGuests === 'number') set(data.stats.confirmedGuests);
    var slug = data.invitation.slug;
    if (data.mode === 'live' && slug) {
      fetch('/api/invitations/public/' + encodeURIComponent(slug) + '/stats')
        .then(function (r) { return r.json(); }).then(function (j) { if (typeof j.confirmedGuests === 'number') set(j.confirmedGuests); })
        .catch(function () {});
    }
  }
  function toggleMealField(inv) {
    var field = document.querySelector('[data-meal-field]');
    if (field) field.style.display = inv.mealPrefEnabled ? '' : 'none';
  }
  function wireRsvp(data) {
    var form = document.querySelector('[data-thewed-rsvp]');
    if (!form || form._wired) return;
    form._wired = true;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = form.querySelector('[data-rsvp-status]');
      var slug = (TheWed.data && TheWed.data.invitation && TheWed.data.invitation.slug) || '';
      var isLive = TheWed.data && TheWed.data.mode === 'live' && slug;
      if (!isLive) { if (status) status.textContent = 'RSVP is enabled once your invitation is published.'; return; }
      var fd = {
        guest_name: (form.querySelector('[name=guest_name]') || {}).value || '',
        attending: (form.querySelector('[name=attending]') || {}).value !== 'no',
        guest_count: (form.querySelector('[name=guest_count]') || {}).value || 1,
        message: (form.querySelector('[name=message]') || {}).value || '',
        meal_preference: (form.querySelector('[name=meal_preference]') || {}).value || '',
      };
      if (!fd.guest_name.trim()) { if (status) status.textContent = 'Please enter your name.'; return; }
      var btn = form.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      fetch('/api/rsvp/' + encodeURIComponent(slug), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fd),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || 'Could not submit');
          if (status) status.textContent = fd.attending ? 'Thank you! We can’t wait to celebrate with you. 💛' : 'Thank you for letting us know. You’ll be missed!';
          form.reset();
          updateConfirmedCounter(TheWed.data);
        }).catch(function (err) { if (status) status.textContent = err.message; })
        .finally(function () { if (btn) btn.disabled = false; });
    });
  }

  // ---- Per-guest personalization ("Dear <name>") ----
  function renderGreeting(data) {
    var el = document.querySelector('[data-guest-greeting]');
    var section = document.querySelector('[data-guest-greeting-section]');
    var name = (data.guestName || '').trim();
    if (el) el.textContent = name ? (t('greeting') + ' ' + name) : '';
    var show = Boolean(name);
    if (section) section.style.display = show ? '' : 'none';
    else if (el) el.style.display = show ? '' : 'none';
  }

  // ---- WhatsApp share ----
  function wireShare(data) {
    var btn = document.querySelector('[data-share-whatsapp]');
    if (!btn) return;
    var url = data.publicUrl || (data.invitation.slug ? (location.origin + '/i/' + data.invitation.slug) : '');
    if (!url) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    var msg = data.invitation.groomName + ' & ' + data.invitation.brideName + " are getting married! You're invited 💛 " + url;
    btn.setAttribute('href', 'https://wa.me/?text=' + encodeURIComponent(msg));
    btn.setAttribute('target', '_blank');
    btn.setAttribute('rel', 'noopener');
  }

  // ---- Language switcher ----
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
  }
  function injectLangSwitch() {
    var existing = document.querySelector('[data-lang-switch]');
    var box = existing;
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-lang-switch', '');
      box.className = 'tw-lang-switch';
      box.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9998;display:flex;gap:4px;background:rgba(0,0,0,0.5);padding:4px;border-radius:999px';
      document.body.appendChild(box);
    }
    box.innerHTML = ['en', 'si', 'ta'].map(function (l) {
      var labels = { en: 'EN', si: 'සි', ta: 'த' };
      return '<button data-lang="' + l + '" style="border:none;background:none;color:#fff;cursor:pointer;padding:4px 9px;border-radius:999px;font-size:13px' +
        (l === currentLang ? ';background:#fff;color:#111' : '') + '">' + labels[l] + '</button>';
    }).join('');
    box.querySelectorAll('[data-lang]').forEach(function (b) {
      b.onclick = function () { setLang(b.getAttribute('data-lang')); };
    });
  }
  function setLang(lang) {
    currentLang = I18N[lang] ? lang : 'en';
    applyI18n();
    injectLangSwitch();
    // Re-run light bits whose text depends on language.
    if (TheWed.data) { renderGreeting(TheWed.data); renderWishes((TheWed.data.wishes) || currentWishes); }
    var todayEl = document.querySelector('[data-today]');
    if (todayEl && todayEl.style.display !== 'none') todayEl.textContent = t('today');
  }

  var currentWishes = [];

  var TheWed = {
    data: null, _cd: null,
    escapeHtml: escapeHtml, formatDate: formatDate, parseDate: parseDate,
    startCountdown: startCountdown, revealOnScroll: revealOnScroll, t: t,
    setText: function (sel, value, fallback) {
      var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (el) el.textContent = (value != null && value !== '') ? value : (fallback || '');
    },
    init: function (render) {
      function run(data) {
        TheWed.data = data;
        currentLang = (data.invitation && I18N[data.invitation.languageDefault]) ? data.invitation.languageDefault : 'en';
        try { render(data); } catch (e) { console.error('render error', e); }
        // Shared behaviors
        renderSchedule(data.invitation.schedule);
        wireMap(data.invitation);
        wireGalleryLightbox();
        wireMusic(data.invitation);
        toggleMealField(data.invitation);
        currentWishes = data.wishes || currentWishes;
        renderWishes(currentWishes);
        wireGuestbook(data);
        updateConfirmedCounter(data);
        renderGreeting(data);
        wireShare(data);
        wireRsvp(data);
        injectLangSwitch();
        applyI18n();
        if (data.invitation.slug && data.mode === 'live') loadWishes(data.invitation.slug);
      }
      global.addEventListener('message', function (e) {
        if (e && e.data && e.data.type === 'thewed:data') run(e.data.data);
      });
      try { if (global.parent && global.parent !== global) global.parent.postMessage({ type: 'thewed:ready' }, '*'); } catch (e) {}
      if (global.parent === global) run(DEMO);
    },
  };

  global.TheWed = TheWed;
})(window);
