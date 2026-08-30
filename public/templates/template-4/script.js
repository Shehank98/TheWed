(function () {
  var animated = false;

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

    var heroBg = document.querySelector('[data-hero-bg]');
    if (heroBg && imgs.hero) heroBg.style.backgroundImage = 'linear-gradient(rgba(8,7,9,0.35), rgba(8,7,9,0.6)), url(' + imgs.hero.url + ')';

    var storyMedia = document.querySelector('[data-story-media]');
    var sp = (imgs.couple && imgs.couple[0]) || imgs.hero;
    if (storyMedia) { if (sp) { storyMedia.style.backgroundImage = 'url(' + sp.url + ')'; storyMedia.classList.remove('empty'); } else storyMedia.classList.add('empty'); }

    var storySection = document.querySelector('[data-story-section]');
    TheWed.setText('[data-story]', inv.storyText || '');
    if (storySection) storySection.style.display = inv.storyText ? '' : 'none';

    var gallerySection = document.querySelector('[data-gallery-section]');
    var galleryEl = document.querySelector('[data-gallery]');
    var gallery = imgs.gallery || [];
    if (galleryEl) galleryEl.innerHTML = gallery.map(function (g) { return '<figure><img src="' + g.url + '" alt="" loading="lazy"/></figure>'; }).join('');
    if (gallerySection) gallerySection.style.display = gallery.length ? '' : 'none';

    TheWed.setText('[data-hashtag]', cf.hashtag || '');
    TheWed.setText('[data-rsvp-phone]', cf.rsvp_phone ? ('RSVP: ' + cf.rsvp_phone) : '');

    TheWed.startCountdown(inv.weddingDate, inv.weddingTime, function (c) {
      if (!c) return;
      set('[data-cd-days]', c.days); set('[data-cd-hours]', c.hours);
      set('[data-cd-mins]', c.minutes); set('[data-cd-secs]', c.seconds);
    });

    setupAnimations();
  }

  function set(sel, v) { var el = document.querySelector(sel); if (el) el.textContent = String(v).padStart(2, '0'); }
  function formatTime(t) { var m = /^(\d{2}):(\d{2})/.exec(t); if (!m) return t; var h=+m[1], mm=m[2], ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+mm+' '+ap; }

  function setupAnimations() {
    if (animated) return; animated = true;
    var hasGsap = window.gsap && window.ScrollTrigger;
    if (!hasGsap) {
      document.body.classList.add('no-gsap');
      TheWed.revealOnScroll('[data-reveal]');
      return;
    }
    gsap.registerPlugin(ScrollTrigger);

    // Hero intro
    gsap.to('.hero [data-reveal]', { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12, delay: 0.15 });

    // Section reveals
    gsap.utils.toArray('section [data-reveal]').forEach(function (el) {
      gsap.to(el, {
        opacity: 1, y: 0, duration: 0.9, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 85%' },
      });
    });

    // Parallax layers
    gsap.utils.toArray('[data-parallax]').forEach(function (el) {
      gsap.to(el, {
        yPercent: 14, ease: 'none',
        scrollTrigger: { trigger: el.closest('section') || el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  }

  TheWed.init(render);
})();
