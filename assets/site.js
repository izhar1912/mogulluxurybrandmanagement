(() => {
  const d = document, root = d.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Mobile menu ---------- */
  const header = d.querySelector('.site-header');
  const toggle = d.querySelector('.menu-toggle');
  const nav = d.querySelector('#site-nav');
  const setMenu = open => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
    root.classList.toggle('menu-open', open);
    if (open) header.classList.remove('is-hidden');
  };
  if (toggle && nav) {
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
    d.addEventListener('keydown', e => {
      if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); toggle.focus(); }
    });
  }

  /* ---------- Form → Google Sheet + email (Apps Script) ---------- */
  const form = d.querySelector('#inquiry-form');
  if (form) {
    const btn = form.querySelector('button[type="submit"]');
    const status = form.querySelector('.form-status');
    const label = btn && [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    const original = label ? label.textContent : '';
    const endpoint = form.getAttribute('action') || '';
    const thankYou = form.dataset.thankYou || 'thank-you.html';
    const connected = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/.test(endpoint);

    const setBusy = busy => {
      if (!btn) return;
      btn.classList.toggle('is-sending', busy);
      btn.toggleAttribute('aria-busy', busy);
      if (label) label.textContent = busy ? 'Sending your inquiry ' : original;
    };
    const say = html => { if (status) status.innerHTML = html; };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (form.dataset.busy) return;
      if (!connected) {
        say('This form isn’t connected yet. Please email <a href="mailto:Melody@mlbmrep.com">Melody@mlbmrep.com</a> directly.');
        return;
      }
      form.dataset.busy = '1';
      say('');
      setBusy(true);
      const body = new URLSearchParams(new FormData(form));
      body.append('page', location.href.split('#')[0]);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      try {
        await fetch(endpoint, { method: 'POST', mode: 'no-cors', body, signal: ctrl.signal });
        clearTimeout(timer);
        location.href = thankYou;
      } catch (err) {
        clearTimeout(timer);
        delete form.dataset.busy;
        setBusy(false);
        say('Your inquiry didn’t send. Check your connection and try again, or email <a href="mailto:Melody@mlbmrep.com">Melody@mlbmrep.com</a>.');
      }
    });
    addEventListener('pageshow', () => { delete form.dataset.busy; setBusy(false); });
  }

  /* ---------- Headings: split into masked words ---------- */
  const splitWords = h => {
    const text = h.textContent.replace(/\s+/g, ' ').trim();
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(ch => {
        if (ch.nodeType === 3) {
          const frag = d.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(' '); return; }
            const w = d.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
            const wi = d.createElement('span'); wi.className = 'wi'; wi.style.setProperty('--i', i++);
            wi.textContent = part; w.append(wi); frag.append(w);
          });
          ch.replaceWith(frag);
        } else if (ch.nodeType === 1 && ch.tagName !== 'SUP') {
          walk(ch);
        }
      });
    };
    walk(h);
    h.setAttribute('aria-label', text);
  };

  const heads = [...d.querySelectorAll('h1, h2')];
  const animatedHeads = [];
  heads.forEach(h => {
    if (!reduce && !h.closest('.legal-content')) { splitWords(h); animatedHeads.push(h); }
    h.classList.add('is-split');
  });

  /* ---------- Reveal on scroll (with sibling stagger) ---------- */
  const reveals = [...d.querySelectorAll('.reveal')];
  reveals.forEach(el => {
    const sibs = [...el.parentElement.children].filter(c => c.classList.contains('reveal'));
    if (sibs.length > 2) el.style.transitionDelay = `${(sibs.indexOf(el) % 3) * 90}ms`;
  });

  const show = el => el.classList.add(el.classList.contains('reveal') ? 'visible' : 'is-in');
  const heroHeads = animatedHeads.filter(h => h.tagName === 'H1');
  const scrollHeads = animatedHeads.filter(h => h.tagName !== 'H1');

  setTimeout(() => heroHeads.forEach(h => h.classList.add('is-in')), 250);

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        if (el.classList.contains('reveal')) el.classList.add('visible');
        if (scrollHeads.includes(el)) el.classList.add('is-in');
        io.unobserve(el);
      }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(el => io.observe(el));
    scrollHeads.forEach(el => io.observe(el));
  } else {
    reveals.forEach(show); scrollHeads.forEach(show);
  }

  /* ---------- FAQ accordion easing ---------- */
  d.querySelectorAll('.faq-list details').forEach(det => {
    const summary = det.querySelector('summary');
    const body = d.createElement('div');
    body.className = 'faq-body';
    [...det.children].filter(c => c !== summary).forEach(c => body.append(c));
    det.append(body);
    if (det.open) det.classList.add('is-open');

    let anim = null;
    summary.addEventListener('click', e => {
      if (reduce || !body.animate) { requestAnimationFrame(() => det.classList.toggle('is-open', det.open)); return; }
      e.preventDefault();
      if (anim) anim.cancel();
      const opts = { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' };
      if (det.open) {
        det.classList.remove('is-open');
        anim = body.animate([{ height: body.offsetHeight + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { ...opts, duration: 380 });
        anim.onfinish = () => { det.open = false; anim = null; };
      } else {
        det.open = true;
        det.classList.add('is-open');
        anim = body.animate([{ height: '0px', opacity: 0 }, { height: body.offsetHeight + 'px', opacity: 1 }], opts);
        anim.onfinish = () => { anim = null; };
      }
    });
  });

  /* ---------- Scroll: header state, parallax, process steps ---------- */
  const fixedHeader = header && !header.classList.contains('legal-header');
  const heroArt = d.querySelector('.hero-art');
  const letterHero = d.querySelector('.page-hero, .roster-hero');
  const steps = [...d.querySelectorAll('.steps li')];
  let lastY = scrollY, ticking = false;

  const onScroll = () => {
    const y = Math.max(0, scrollY);
    if (fixedHeader) {
      header.classList.toggle('is-scrolled', y > 40);
      const menuOpen = nav && nav.classList.contains('open');
      const focusInside = !!header.querySelector(':focus-visible');
      if (!menuOpen && !focusInside) {
        if (y > lastY + 4 && y > 320) header.classList.add('is-hidden');
        else if (y < lastY - 4 || y <= 320) header.classList.remove('is-hidden');
      }
    }
    lastY = y;
    if (!reduce) {
      if (heroArt && y < innerHeight * 1.3) heroArt.style.translate = `0 ${(y * 0.28).toFixed(1)}px`;
      if (letterHero && y < innerHeight * 1.3) letterHero.style.setProperty('--py', `${(y * 0.18).toFixed(1)}px`);
    }
    const line = innerHeight * 0.62;
    steps.forEach(li => li.classList.toggle('is-on', li.getBoundingClientRect().top < line));
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  if (header) header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
  onScroll();
})();
