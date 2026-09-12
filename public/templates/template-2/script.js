(function () {
  function render(data) {
    var inv = data.invitation || {};
    var imgs = data.images || {};
    var cf = inv.customFields || {};

    document.querySelectorAll('[data-groom]').forEach(function (el) { el.textContent = inv.groomName || 'Groom'; });
    document.querySelectorAll('[data-bride]').forEach(function (el) { el.textContent = inv.brideName || 'Bride'; });

    var initials = ((inv.groomName || '').charAt(0) + ' · ' + (inv.brideName || '').charAt(0)).toUpperCase();
    TheWed.setText('[data-initials]', initials.trim() === '·' ? '' : initials);

    var longDate = TheWed.formatDate(inv.weddingDate);
    document.querySelectorAll('[data-date-long]').forEach(function (el) { el.textContent = longDate; });
    TheWed.setText('[data-date-short]', shortDate(inv.weddingDate));
    document.querySelectorAll('[data-venue-name]').forEach(function (el) { el.textContent = inv.venueName || ''; });
    TheWed.setText('[data-venue-address]', inv.venueAddress || '');
    TheWed.setText('[data-time]', inv.weddingTime ? formatTime(inv.weddingTime) : '');

    var media = document.querySelector('[data-hero-media]');
    if (media) {
      if (imgs.hero) { media.style.backgroundImage = 'url(' + imgs.hero.url + ')'; media.classList.remove('empty'); }
      else if (imgs.couple && imgs.couple[0]) { media.style.backgroundImage = 'url(' + imgs.couple[0].url + ')'; media.classList.remove('empty'); }
      else media.classList.add('empty');
    }

    var storySection = document.querySelector('[data-story-section]');
    TheWed.setText('[data-story]', inv.storyText || '');
    if (storySection) storySection.style.display = inv.storyText ? '' : 'none';

    var gallerySection = document.querySelector('[data-gallery-section]');
    var galleryEl = document.querySelector('[data-gallery]');
    var gallery = imgs.gallery || [];
    if (galleryEl) galleryEl.innerHTML = gallery.map(function (g) { return '<figure><img src="' + g.url + '" alt="" loading="lazy"/></figure>'; }).join('');
    if (gallerySection) gallerySection.style.display = gallery.length ? '' : 'none';

    TheWed.setText('[data-hashtag]', cf.hashtag || '');
    TheWed.setText('[data-rsvp-phone]', cf.rsvp_phone ? ('RSVP by phone — ' + cf.rsvp_phone) : '');

    TheWed.revealOnScroll('.reveal-up');
  }

  function set(sel, v) { var el = document.querySelector(sel); if (el) el.textContent = v; }
  function shortDate(d) { if (!d) return ''; var dt = TheWed.parseDate(d); if (!dt) return ''; return dt.getFullYear() + '.' + String(dt.getMonth()+1).padStart(2,'0') + '.' + String(dt.getDate()).padStart(2,'0'); }
  function formatTime(t) { var m = /^(\d{2}):(\d{2})/.exec(t); if (!m) return t; var h=+m[1], mm=m[2], ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+mm+' '+ap; }

  TheWed.init(render);
})();
