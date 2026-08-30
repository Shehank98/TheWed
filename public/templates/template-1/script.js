(function () {
  function render(data) {
    var inv = data.invitation || {};
    var imgs = data.images || {};
    var cf = inv.customFields || {};

    document.querySelectorAll('[data-groom]').forEach(function (el) { el.textContent = inv.groomName || 'Groom'; });
    document.querySelectorAll('[data-bride]').forEach(function (el) { el.textContent = inv.brideName || 'Bride'; });

    var longDate = TheWed.formatDate(inv.weddingDate, { withDay: true });
    document.querySelectorAll('[data-date-long]').forEach(function (el) { el.textContent = longDate; });
    document.querySelectorAll('[data-venue-name]').forEach(function (el) { el.textContent = inv.venueName || ''; });
    document.querySelectorAll('[data-venue-address]').forEach(function (el) { el.textContent = inv.venueAddress || ''; });
    TheWed.setText('[data-time]', inv.weddingTime ? formatTime(inv.weddingTime) : '');

    // Story
    var storySection = document.querySelector('[data-story-section]');
    TheWed.setText('[data-story]', inv.storyText || '');
    var photo = document.querySelector('[data-couple-photo]');
    var couplePhoto = (imgs.couple && imgs.couple[0]) || imgs.hero;
    if (photo) {
      if (couplePhoto) { photo.style.backgroundImage = 'url(' + couplePhoto.url + ')'; photo.classList.remove('empty'); }
      else { photo.classList.add('empty'); }
    }
    if (storySection) storySection.style.display = inv.storyText ? '' : 'none';

    // Gallery
    var gallerySection = document.querySelector('[data-gallery-section]');
    var galleryEl = document.querySelector('[data-gallery]');
    var gallery = (imgs.gallery || []);
    if (galleryEl) {
      galleryEl.innerHTML = gallery.map(function (g) {
        return '<figure><img src="' + g.url + '" alt="" loading="lazy"/></figure>';
      }).join('');
    }
    if (gallerySection) gallerySection.style.display = gallery.length ? '' : 'none';

    // Hero background tint if hero image present
    if (imgs.hero) {
      var hero = document.querySelector('.hero');
      hero.style.backgroundImage =
        'linear-gradient(rgba(255,253,249,0.86), rgba(255,253,249,0.92)), url(' + imgs.hero.url + ')';
      hero.style.backgroundSize = 'cover';
      hero.style.backgroundPosition = 'center';
    }

    // Custom fields
    TheWed.setText('[data-hashtag]', cf.hashtag || '');
    TheWed.setText('[data-rsvp-phone]', cf.rsvp_phone ? ('To RSVP by phone: ' + cf.rsvp_phone) : '');

    // Countdown
    TheWed.startCountdown(inv.weddingDate, inv.weddingTime, function (c) {
      if (!c) return;
      set('[data-cd-days]', c.days); set('[data-cd-hours]', c.hours);
      set('[data-cd-mins]', c.minutes); set('[data-cd-secs]', c.seconds);
    });

    TheWed.revealOnScroll('.reveal');
  }

  function set(sel, v) { var el = document.querySelector(sel); if (el) el.textContent = String(v).padStart(2, '0'); }
  function formatTime(t) {
    var m = /^(\d{2}):(\d{2})/.exec(t); if (!m) return t;
    var h = +m[1], mm = m[2], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return h + ':' + mm + ' ' + ap;
  }

  TheWed.init(render);
})();
