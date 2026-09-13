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
      dress_code: 'Dress code', add_calendar: 'Add to Calendar', rsvp_cta: 'RSVP', adults: 'Adults', children: 'Children',
      our_story: 'Our Story', thank_you: 'Thank you!',
    },
    si: {
      greeting: 'ආදරණීය', directions: 'දිශාව සොයන්න', schedule: 'වැඩසටහන', today: 'අද තමයි ඒ දවස!',
      days: 'දින', hours: 'පැය', minutes: 'මිනිත්තු', seconds: 'තත්පර',
      rsvp: 'පැමිණීම දන්වන්න', name: 'ඔබේ නම', attend_q: 'ඔබ සහභාගී වේද?', yes: 'සතුටින් පැමිණේ',
      no: 'කනගාටුවෙන් නොපැමිණේ', guests: 'අමුත්තන් ගණන', meal: 'ආහාර තේරීම', message: 'පණිවිඩය',
      send: 'යවන්න', confirmed: 'අමුත්තන් තහවුරු කර ඇත', guestbook: 'සුබ පැතුම් පොත', wishes: 'සුබ පැතුම්',
      wish_name: 'ඔබේ නම', wish_msg: 'යුවළ සඳහා ඔබේ සුබ පැතුම', wish_send: 'පළ කරන්න',
      share: 'WhatsApp හරහා බෙදන්න', mute: 'සංගීතය: නැත', unmute: 'සංගීතය: ඇත', no_wishes: 'පළමු සුබ පැතුම තබන්න.',
      dress_code: 'ඇඳුම් රටාව', add_calendar: 'දින දර්ශනයට එක් කරන්න', rsvp_cta: 'පැමිණීම දන්වන්න', adults: 'වැඩිහිටියන්', children: 'ළමයි',
      our_story: 'අපගේ කතාව', thank_you: 'ස්තුතියි!',
    },
    ta: {
      greeting: 'அன்பார்ந்த', directions: 'வழி காட்டு', schedule: 'நிகழ்ச்சி நிரல்', today: 'இன்று தான் அந்த நாள்!',
      days: 'நாட்கள்', hours: 'மணி', minutes: 'நிமிடம்', seconds: 'விநாடி',
      rsvp: 'வருகையை உறுதிசெய்', name: 'உங்கள் பெயர்', attend_q: 'நீங்கள் வருகிறீர்களா?', yes: 'மகிழ்ச்சியுடன் வருகிறேன்',
      no: 'வர இயலாது', guests: 'விருந்தினர் எண்ணிக்கை', meal: 'உணவு விருப்பம்', message: 'செய்தி',
      send: 'அனுப்பு', confirmed: 'விருந்தினர்கள் உறுதி', guestbook: 'வாழ்த்து புத்தகம்', wishes: 'வாழ்த்துக்கள்',
      wish_name: 'உங்கள் பெயர்', wish_msg: 'தம்பதியருக்கு உங்கள் வாழ்த்து', wish_send: 'வாழ்த்து இடு',
      share: 'WhatsApp இல் பகிர்', mute: 'இசை: இல்லை', unmute: 'இசை: ஆம்', no_wishes: 'முதல் வாழ்த்தை இடுங்கள்.',
      dress_code: 'உடை நடை', add_calendar: 'நாட்காட்டியில் சேர்', rsvp_cta: 'வருகையை உறுதிசெய்', adults: 'பெரியவர்கள்', children: 'குழந்தைகள்',
      our_story: 'எங்கள் கதை', thank_you: 'நன்றி!',
    },
  };
  var currentLang = 'en';

  function t(key) { return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key; }

  var DEMO = {
    template: { folderKey: '' },
    invitation: {
      groomName: 'Kavindu', brideName: 'Senali', weddingDate: nextSaturdayIso(), weddingTime: '17:30',
      venueName: 'The Grand Ballroom', venueAddress: 'Cinnamon Grand, 77 Galle Rd, Colombo 03',
      storyText: 'What began as a chance meeting under Colombo rain became a love we never saw coming. Five years, countless cups of tea, and one very good dog later, we are ready to say “I do”.',
      customFields: { hashtag: '#KavinduWedsSenali', rsvp_phone: '+94 77 123 4567', nekath: '9:15 AM' },
      schedule: [
        { name: 'Poruwa Ceremony', time: '9:15 AM', venue: 'Main Hall' },
        { name: 'Lunch Reception', time: '12:30 PM', venue: 'Garden Terrace' },
        { name: 'Evening Party', time: '7:00 PM', venue: 'The Grand Ballroom' },
      ],
      mapLink: 'https://maps.google.com/?q=Cinnamon+Grand+Colombo',
      musicUrl: '', languageDefault: 'en',
      slug: '', status: 'preview',
    },
    images: {
      hero: { url: '/templates/_shared/samples/hero.svg' },
      couple: [{ url: '/templates/_shared/samples/couple.svg' }],
      gallery: [
        { url: '/templates/_shared/samples/g1.svg' },
        { url: '/templates/_shared/samples/g2.svg' },
        { url: '/templates/_shared/samples/g3.svg' },
        { url: '/templates/_shared/samples/g4.svg' },
      ],
    },
    wishes: [{ guest_name: 'Nimal', message: 'Wishing you a lifetime of love and laughter.', created_at: new Date().toISOString() }],
    events: [
      { id: 1, name: 'Poruwa Ceremony', type: 'Poruwa', date: nextSaturdayIso(), time: '09:15', venueName: 'Cinnamon Grand', venueAddress: '77 Galle Rd, Colombo 03', mapLink: 'https://maps.google.com/?q=Cinnamon+Grand+Colombo', sortOrder: 0, dressCode: 'Traditional' },
      { id: 2, name: 'Reception', type: 'Reception', date: nextSaturdayIso(), time: '19:00', venueName: 'The Grand Ballroom', venueAddress: '', mapLink: '', sortOrder: 1, dressCode: 'Formal / Black tie' },
      { id: 3, name: 'Homecoming', type: 'Homecoming', date: nextSaturdayIso(1), time: '18:00', venueName: 'Family Residence, Kandy', venueAddress: '', mapLink: '', sortOrder: 2, dressCode: 'Smart casual' },
    ],
    milestones: [
      { id: 1, title: 'How We Met', date: 'Winter 2019', body: 'A rainy evening in Colombo, one shared umbrella, and a conversation that never really ended.', imageUrl: '/templates/_shared/samples/g2.svg' },
      { id: 2, title: 'The Proposal', date: 'Spring 2024', body: 'On the cliffs at sunset, with the whole family hiding nearby, the answer was an easy yes.', imageUrl: '/templates/_shared/samples/g3.svg' },
      { id: 3, title: 'The Big Day', date: nextSaturdayIso(), body: 'Now we invite you to celebrate the beginning of forever with us.', imageUrl: '/templates/_shared/samples/g1.svg' },
    ],
    mode: 'preview',
  };

  function nextSaturdayIso(offset) {
    var d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + 120 + (offset || 0));
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

  // ---- Events: timeline + primary display + auto-switching countdown ----
  function eventDateTime(e) {
    if (!e || !e.date) return null;
    return parseDate(e.date, e.time);
  }

  var currentEvents = [];
  function renderEvents(data) {
    var events = (data.events && data.events.length) ? data.events.slice() : fallbackEvents(data.invitation);
    events.sort(function (a, b) {
      var da = eventDateTime(a), db2 = eventDateTime(b);
      if (da && db2) return da - db2;
      if (da) return -1;
      if (db2) return 1;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
    currentEvents = events;
    var coupleNames = ((data.invitation.groomName || '') + ' & ' + (data.invitation.brideName || '')).trim();

    // Timeline (shown when there are 2+ events)
    var wrap = document.querySelector('[data-schedule]');
    var section = document.querySelector('[data-schedule-section]');
    if (wrap) {
      wrap.innerHTML = events.map(function (e, idx) {
        var when = [formatDate(e.date), e.time ? formatTime(e.time) : ''].filter(Boolean).join(' · ');
        var showType = e.type && e.type !== 'Custom' && String(e.name || '').toLowerCase().indexOf(e.type.toLowerCase()) < 0;
        var typeLabel = showType ? ('<span class="tw-tl-type">' + escapeHtml(e.type) + '</span>') : '';
        return '<div class="tw-tl-item">' +
          '<div class="tw-tl-dot"></div>' +
          '<div class="tw-tl-body">' +
          (when ? '<div class="tw-tl-time">' + escapeHtml(when) + '</div>' : '') +
          '<div class="tw-tl-name">' + escapeHtml(e.name) + ' ' + typeLabel + '</div>' +
          (e.venueName ? '<div class="tw-tl-venue">' + escapeHtml(e.venueName) + '</div>' : '') +
          (e.dressCode ? '<div class="tw-tl-dress">' + t('dress_code') + ': ' + escapeHtml(e.dressCode) + '</div>' : '') +
          '<div class="tw-tl-actions">' +
            (e.mapLink ? '<a class="tw-tl-map" href="' + escapeHtml(mapHref(e.mapLink)) + '" target="_blank" rel="noopener">' + t('directions') + '</a>' : '') +
            calendarButtonsHtml(idx) +
          '</div>' +
          '</div></div>';
      }).join('');
      wireCalendarButtons(coupleNames);
    }
    if (section) section.style.display = events.length >= 2 ? '' : 'none';

    // Primary event drives the headline date/venue display
    var primary = events[0] || {};
    document.querySelectorAll('[data-date-long]').forEach(function (el) { el.textContent = primary.date ? formatDate(primary.date, { withDay: true }) : ''; });
    document.querySelectorAll('[data-venue-name]').forEach(function (el) { el.textContent = primary.venueName || ''; });
    TheWed.setText('[data-venue-address]', primary.venueAddress || '');
    TheWed.setText('[data-time]', primary.time ? formatTime(primary.time) : '');

    // Map from the primary event (fallback: first event that has a link)
    var mapLink = primary.mapLink || (events.find ? (events.find(function (e) { return e.mapLink; }) || {}).mapLink : '') || '';
    wireMap(mapLink);

    injectPrimaryCalendar(0, coupleNames);
    startEventCountdown(events);
  }

  // ---- Add to Calendar (.ics download + Google Calendar link) ----
  function pad2(n) { return String(n).padStart(2, '0'); }
  function icsStamp(d) {
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' +
      pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
  }
  function eventTimes(e) {
    var start = parseDate(e.date, e.time) || parseDate(e.date, '12:00');
    if (!start) return null;
    var end = new Date(start.getTime() + 3 * 3600 * 1000);
    return { start: start, end: end };
  }
  function calTitle(e, coupleNames) {
    var base = e.name || (e.type && e.type !== 'Custom' ? e.type : 'Wedding');
    return coupleNames ? (base + ' — ' + coupleNames) : base;
  }
  function gcalUrl(e, coupleNames) {
    var tt = eventTimes(e); if (!tt) return '';
    var params = 'action=TEMPLATE' +
      '&text=' + encodeURIComponent(calTitle(e, coupleNames)) +
      '&dates=' + icsStamp(tt.start) + '/' + icsStamp(tt.end) +
      (e.venueName ? '&location=' + encodeURIComponent([e.venueName, e.venueAddress].filter(Boolean).join(', ')) : '') +
      '&details=' + encodeURIComponent('We would love to see you there!');
    return 'https://calendar.google.com/calendar/render?' + params;
  }
  function downloadIcs(e, coupleNames) {
    var tt = eventTimes(e); if (!tt) return;
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TheWed//Invitation//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + Math.random().toString(36).slice(2) + '@thewed',
      'DTSTAMP:' + icsStamp(new Date()),
      'DTSTART:' + icsStamp(tt.start),
      'DTEND:' + icsStamp(tt.end),
      'SUMMARY:' + calTitle(e, coupleNames).replace(/,/g, '\\,'),
      e.venueName ? ('LOCATION:' + [e.venueName, e.venueAddress].filter(Boolean).join(', ').replace(/,/g, '\\,')) : '',
      'DESCRIPTION:We would love to see you there!',
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean);
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (e.name || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.ics';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }
  function calendarButtonsHtml(idx) {
    return '<span class="tw-cal">' +
      '<a class="tw-cal-btn tw-cal-g" data-gcal="' + idx + '" target="_blank" rel="noopener">' + t('add_calendar') + '</a>' +
      '<a class="tw-cal-btn tw-cal-i" href="#" data-ics="' + idx + '">.ics</a>' +
      '</span>';
  }
  function wireCalendarButtons(coupleNames) {
    document.querySelectorAll('[data-gcal]').forEach(function (a) {
      var e = currentEvents[Number(a.getAttribute('data-gcal'))];
      if (e) a.setAttribute('href', gcalUrl(e, coupleNames));
    });
    document.querySelectorAll('[data-ics]').forEach(function (a) {
      if (a._wired) return; a._wired = true;
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var e = currentEvents[Number(a.getAttribute('data-ics'))];
        if (e) downloadIcs(e, coupleNames);
      });
    });
  }
  // Put an "Add to Calendar" control near the primary event's Get Directions.
  function injectPrimaryCalendar(idx, coupleNames) {
    var host = document.querySelector('[data-map-section]') || document.querySelector('[data-directions]');
    if (!host || !currentEvents.length) return;
    var container = host.matches('[data-map-section]') ? host : host.parentElement;
    var existing = container.querySelector('.tw-primary-cal');
    if (existing) existing.remove();
    var span = document.createElement('div');
    span.className = 'tw-primary-cal';
    span.innerHTML = calendarButtonsHtml(idx);
    container.appendChild(span);
    wireCalendarButtons(coupleNames);
  }

  // ---- Our Story milestone timeline (optional) ----
  function renderMilestones(data) {
    var list = document.querySelector('[data-story-timeline]');
    var section = document.querySelector('[data-story-timeline-section]');
    var ms = (data.milestones || []);
    if (list) {
      list.innerHTML = ms.map(function (m) {
        return '<div class="tw-ms">' +
          (m.imageUrl ? '<div class="tw-ms-img"><img src="' + escapeHtml(m.imageUrl) + '" alt="" loading="lazy"/></div>' : '') +
          '<div class="tw-ms-body">' +
            (m.date ? '<div class="tw-ms-date">' + escapeHtml(m.date) + '</div>' : '') +
            '<div class="tw-ms-title">' + escapeHtml(m.title) + '</div>' +
            (m.body ? '<div class="tw-ms-text">' + escapeHtml(m.body) + '</div>' : '') +
          '</div></div>';
      }).join('');
      // gentle staggered fade-in
      var items = list.querySelectorAll('.tw-ms');
      items.forEach(function (el, i) {
        el.style.opacity = 0; el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity .7s ease, transform .7s ease';
        setTimeout(function () { el.style.opacity = 1; el.style.transform = 'none'; }, 120 + i * 140);
      });
    }
    if (section) section.style.display = ms.length ? '' : 'none';
  }

  // ---- Shared component styles (calendar buttons, dress code, milestones) ----
  function injectSharedStyles() {
    if (document.getElementById('tw-shared-styles')) return;
    var css = '' +
      '.tw-tl-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}' +
      '.tw-tl-dress{font-size:13px;opacity:.85;margin-top:3px}' +
      '.tw-cal{display:inline-flex;gap:6px;align-items:center}' +
      '.tw-cal-btn{display:inline-block;font-size:12px;letter-spacing:.5px;text-decoration:none;border:1px solid currentColor;border-radius:20px;padding:5px 12px;opacity:.8;cursor:pointer}' +
      '.tw-cal-btn:hover{opacity:1}' +
      '.tw-cal-i{opacity:.6}' +
      '.tw-primary-cal{margin-top:12px;display:flex;justify-content:center}' +
      '.tw-ms{display:grid;grid-template-columns:120px 1fr;gap:18px;align-items:center;max-width:640px;margin:0 auto 22px;text-align:left}' +
      '.tw-ms-img{width:120px;height:120px;border-radius:12px;overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,.12)}' +
      '.tw-ms-img img{width:100%;height:100%;object-fit:cover}' +
      '.tw-ms-date{font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.7;margin-bottom:2px}' +
      '.tw-ms-title{font-family:Georgia,serif;font-size:24px;margin-bottom:4px}' +
      '.tw-ms-text{font-size:15px;line-height:1.6;opacity:.9}' +
      '@media(max-width:560px){.tw-ms{grid-template-columns:1fr;text-align:center;gap:10px}.tw-ms-img{margin:0 auto}}';
    var st = document.createElement('style');
    st.id = 'tw-shared-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---- Floating "RSVP" quick action (scrolls to the form) ----
  function injectRsvpFab() {
    if (!document.querySelector('[data-thewed-rsvp]')) return;
    if (document.querySelector('.tw-rsvp-fab')) return;
    var b = document.createElement('button');
    b.className = 'tw-rsvp-fab';
    b.type = 'button';
    b.textContent = t('rsvp_cta');
    b.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:9997;background:#b08d57;color:#fff;border:none;border-radius:30px;padding:12px 20px;font-size:14px;letter-spacing:1px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,0.25)';
    b.addEventListener('click', function () {
      var f = document.querySelector('[data-thewed-rsvp]');
      if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.body.appendChild(b);
  }

  // ---- Confetti burst (celebratory, lightweight) ----
  function launchConfetti() {
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10000';
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var colors = ['#b08d57', '#e6c976', '#c98b9b', '#8a9a7b', '#ffffff', '#6e1420'];
    var pieces = [];
    for (var i = 0; i < 140; i++) {
      pieces.push({ x: canvas.width / 2, y: canvas.height / 3,
        vx: (Math.random() - 0.5) * 12, vy: Math.random() * -14 - 4,
        size: Math.random() * 8 + 4, color: colors[i % colors.length],
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
    var start = Date.now();
    (function frame() {
      var elapsed = Date.now() - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(function (p) {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (elapsed < 2600) requestAnimationFrame(frame);
      else if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    })();
  }

  // Celebratory success popup for a joyful RSVP.
  function showRsvpCelebration() {
    var existing = document.querySelector('.tw-celebrate');
    if (existing) existing.remove();
    var wrap = document.createElement('div');
    wrap.className = 'tw-celebrate';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(20,15,10,0.35);opacity:0;transition:opacity .3s ease';
    wrap.innerHTML = '<div style="background:#fffdf9;border-radius:16px;padding:30px 34px;max-width:340px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);transform:scale(.9);transition:transform .3s ease">' +
      '<div style="font-size:44px">💐</div>' +
      '<div style="font-family:Georgia,serif;font-size:26px;color:#3b342c;margin:8px 0 6px">' + t('thank_you') + '</div>' +
      '<div style="color:#8a8177;font-size:15px">Your RSVP has been received. We can’t wait to celebrate with you!</div>' +
      '</div>';
    document.body.appendChild(wrap);
    var card = wrap.firstChild;
    requestAnimationFrame(function () { wrap.style.opacity = 1; card.style.transform = 'scale(1)'; });
    function close() { wrap.style.opacity = 0; setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 300); }
    wrap.addEventListener('click', close);
    setTimeout(close, 4200);
  }

  function fallbackEvents(inv) {
    if (!inv) return [];
    if (inv.weddingDate || inv.venueName) {
      return [{ name: 'Wedding', type: 'Custom', date: inv.weddingDate || '', time: inv.weddingTime || '',
        venueName: inv.venueName || '', venueAddress: inv.venueAddress || '', mapLink: inv.mapLink || '', sortOrder: 0 }];
    }
    return [];
  }

  function formatTime(tstr) {
    var m = /^(\d{2}):(\d{2})/.exec(tstr || ''); if (!m) return tstr || '';
    var h = +m[1], mm = m[2], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + mm + ' ' + ap;
  }

  function mapHref(link) {
    var m = /<iframe[^>]*src=["']([^"']+)["']/i.exec(link || '');
    return m ? m[1] : link;
  }

  function startEventCountdown(events) {
    var cdEl = document.querySelector('[data-countdown]');
    var todayEl = document.querySelector('[data-today]');
    function pickTarget() {
      var now = Date.now();
      var upcoming = events.map(eventDateTime).filter(Boolean).filter(function (d) { return d.getTime() > now; });
      upcoming.sort(function (a, b) { return a - b; });
      return upcoming[0] || null;
    }
    function anyToday() {
      return events.some(function (e) { return isWeddingToday(e.date); });
    }
    function pad(n) { return String(n).padStart(2, '0'); }
    function tick() {
      var target = pickTarget();
      if (!target) {
        if (anyToday()) {
          if (todayEl) { todayEl.textContent = t('today'); todayEl.style.display = ''; }
          if (cdEl) cdEl.style.display = 'none';
        } else {
          if (todayEl) todayEl.style.display = 'none';
          if (cdEl) cdEl.style.display = 'none';
        }
        return;
      }
      if (todayEl) todayEl.style.display = 'none';
      if (cdEl) cdEl.style.display = '';
      var diff = target.getTime() - Date.now();
      var s = Math.max(0, Math.floor(diff / 1000));
      setCd('[data-cd-days]', Math.floor(s / 86400));
      setCd('[data-cd-hours]', pad(Math.floor((s % 86400) / 3600)));
      setCd('[data-cd-mins]', pad(Math.floor((s % 3600) / 60)));
      setCd('[data-cd-secs]', pad(s % 60));
    }
    function setCd(sel, v) { var el = document.querySelector(sel); if (el) el.textContent = v; }
    tick();
    if (TheWed._cd) clearInterval(TheWed._cd);
    TheWed._cd = setInterval(tick, 1000);
  }

  // ---- Venue map / directions ----
  function wireMap(link) {
    link = (link || '').trim();
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

  // ---- RSVP (guest name + attending) ----
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
        children_count: (form.querySelector('[name=children_count]') || {}).value || 0,
        message: (form.querySelector('[name=message]') || {}).value || '',
      };
      if (!fd.guest_name.trim()) { if (status) status.textContent = 'Please enter your name.'; return; }
      var btn = form.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      fetch('/api/rsvp/' + encodeURIComponent(slug), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fd),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || 'Could not submit');
          if (fd.attending) { showRsvpCelebration(); launchConfetti(); }
          if (status) status.textContent = fd.attending ? 'Thank you! We can’t wait to celebrate with you.' : 'Thank you for letting us know. You’ll be missed!';
          form.reset();
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
      var val = t(el.getAttribute('data-i18n'));
      if (el.children && el.children.length) {
        // Label wraps controls (e.g. <label>Adults<input></label>): translate
        // only the leading text node so inputs/selects are preserved.
        var done = false;
        for (var i = 0; i < el.childNodes.length; i += 1) {
          var n = el.childNodes[i];
          if (n.nodeType === 3 && n.textContent.trim()) { n.textContent = val; done = true; break; }
        }
        if (!done) el.insertBefore(document.createTextNode(val), el.firstChild);
      } else {
        el.textContent = val;
      }
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

  // ---- Intro opener (envelope / curtain / bloom / doors …) ----
  // Each template supplies a full-screen [data-opener] cover with its own CSS
  // animation for the ".tw-opened" state; this just handles the tap-to-open,
  // scroll lock, and cleanup. Runs once per page load.
  function initOpener() {
    var opener = document.querySelector('[data-opener]');
    if (!opener || opener._wired) return;
    opener._wired = true;
    var root = document.documentElement;
    var prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    function open() {
      if (opener.classList.contains('tw-opened')) return;
      opener.classList.add('tw-opened');
      root.style.overflow = prevOverflow || '';
      setTimeout(function () { opener.style.display = 'none'; }, 1800);
      try { global.dispatchEvent(new Event('scroll')); } catch (e) {}
    }
    opener.addEventListener('click', open);
  }

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
        renderEvents(data);
        renderMilestones(data);
        injectRsvpFab();
        wireGalleryLightbox();
        wireMusic(data.invitation);
        currentWishes = data.wishes || currentWishes;
        renderWishes(currentWishes);
        wireGuestbook(data);
        renderGreeting(data);
        wireShare(data);
        wireRsvp(data);
        injectLangSwitch();
        applyI18n();
        if (data.invitation.slug && data.mode === 'live') loadWishes(data.invitation.slug);
      }
      injectSharedStyles();
      initOpener();
      global.addEventListener('message', function (e) {
        if (e && e.data && e.data.type === 'thewed:data') run(e.data.data);
      });
      try { if (global.parent && global.parent !== global) global.parent.postMessage({ type: 'thewed:ready' }, '*'); } catch (e) {}
      if (global.parent === global) run(DEMO);
    },
  };

  global.TheWed = TheWed;
})(window);
