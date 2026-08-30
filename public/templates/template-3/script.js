(function () {
  function render(data) {
    var inv = data.invitation || {};
    var imgs = data.images || {};
    var cf = inv.customFields || {};

    TheWed.setText('[data-groom]', inv.groomName, 'Groom');
    TheWed.setText('[data-bride]', inv.brideName, 'Bride');

    var longDate = TheWed.formatDate(inv.weddingDate, { withDay: true });
    document.querySelectorAll('[data-date-long]').forEach(function (el) { el.textContent = longDate; });
    document.querySelectorAll('[data-venue-name]').forEach(function (el) { el.textContent = inv.venueName || ''; });
    TheWed.setText('[data-venue-address]', inv.venueAddress || '');
    TheWed.setText('[data-time]', inv.weddingTime ? formatTime(inv.weddingTime) : '');

    var photo = document.querySelector('[data-couple-photo]');
    var cp = (imgs.couple && imgs.couple[0]) || imgs.hero;
    if (photo) { if (cp) { photo.style.backgroundImage = 'url(' + cp.url + ')'; photo.classList.remove('empty'); } else photo.classList.add('empty'); }

    var storySection = document.querySelector('[data-story-section]');
    TheWed.setText('[data-story]', inv.storyText || '');
    if (storySection) storySection.style.display = inv.storyText ? '' : 'none';

    var gallerySection = document.querySelector('[data-gallery-section]');
    var galleryEl = document.querySelector('[data-gallery]');
    var gallery = imgs.gallery || [];
    if (galleryEl) galleryEl.innerHTML = gallery.map(function (g) { return '<figure><img src="' + g.url + '" alt="" loading="lazy"/></figure>'; }).join('');
    if (gallerySection) gallerySection.style.display = gallery.length ? '' : 'none';

    TheWed.setText('[data-hashtag]', cf.hashtag || '');
    TheWed.setText('[data-rsvp-phone]', cf.rsvp_phone ? ('RSVP by phone: ' + cf.rsvp_phone) : '');

    TheWed.startCountdown(inv.weddingDate, inv.weddingTime, function (c) {
      if (!c) return;
      set('[data-cd-days]', c.days); set('[data-cd-hours]', c.hours);
      set('[data-cd-mins]', c.minutes); set('[data-cd-secs]', c.seconds);
    });

    TheWed.revealOnScroll('.bloom');
    spawnPetals();
  }

  function set(sel, v) { var el = document.querySelector(sel); if (el) el.textContent = v; }
  function formatTime(t) { var m = /^(\d{2}):(\d{2})/.exec(t); if (!m) return t; var h=+m[1], mm=m[2], ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+mm+' '+ap; }

  var petalsSpawned = false;
  function spawnPetals() {
    if (petalsSpawned) return; petalsSpawned = true;
    var field = document.querySelector('.petal-field');
    if (!field) return;
    var glyphs = ['❀', '✿', '❁', '＊'];
    for (var i = 0; i < 14; i++) {
      var s = document.createElement('span');
      s.textContent = glyphs[i % glyphs.length];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.fontSize = (12 + Math.random() * 16) + 'px';
      s.style.animationDuration = (9 + Math.random() * 10) + 's';
      s.style.animationDelay = (-Math.random() * 12) + 's';
      field.appendChild(s);
    }
  }

  TheWed.init(render);
})();
