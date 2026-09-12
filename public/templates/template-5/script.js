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

    // Custom fields specific to this template
    TheWed.setText('[data-nekath]', cf.nekath ? ('Auspicious time: ' + cf.nekath) : '');
    var recRow = document.querySelector('[data-reception-row]');
    if (cf.reception) { TheWed.setText('[data-reception]', cf.reception); if (recRow) recRow.style.display = ''; }
    else if (recRow) recRow.style.display = 'none';

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


    TheWed.revealOnScroll('.reveal');
  }

  function set(sel, v) { var el = document.querySelector(sel); if (el) el.textContent = String(v).padStart(2, '0'); }
  function formatTime(t) { var m = /^(\d{2}):(\d{2})/.exec(t); if (!m) return t; var h=+m[1], mm=m[2], ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+mm+' '+ap; }

  TheWed.init(render);
})();
