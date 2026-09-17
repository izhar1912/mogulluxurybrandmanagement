/* ============================================================
   MLBM site script
   - Mobile menu
   - Sticky header + scroll progress + hero parallax
   - Active nav link while scrolling
   - Staggered scroll reveals
   - Count-up numbers + roster counts computed from the page
   - Inquiry form -> Google Apps Script (Sheet + email) -> thank-you page
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Mobile menu ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('#site-nav');

  function setMenu(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
    document.body.classList.toggle('nav-locked', open);
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMenu(false);
    });
  }

  /* ---------- Sticky header, progress bar, parallax ---------- */
  var header = document.querySelector('.site-header');
  var heroArt = document.querySelector('.hero-art');
  var progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);

  var ticking = false;
  function onScroll() {
    var y = window.scrollY;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (header) header.classList.toggle('is-scrolled', y > 40);
    progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(y / max, 1) : 0) + ')';
    if (heroArt && !reduceMotion && y < window.innerHeight * 1.2) {
      heroArt.style.setProperty('--parallax', (y * 0.25).toFixed(1) + 'px');
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ---------- Active nav link for on-page sections ---------- */
  if (nav && 'IntersectionObserver' in window) {
    var links = {};
    nav.querySelectorAll('a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      if (id && document.getElementById(id)) links[id] = a;
    });
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = links[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          Object.keys(links).forEach(function (k) { links[k].classList.remove('is-active'); });
          link.classList.add('is-active');
        } else {
          link.classList.remove('is-active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(links).forEach(function (id) { sectionObserver.observe(document.getElementById(id)); });
  }

  /* ---------- Roster: numbers and counts come from the lists ---------- */
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  document.querySelectorAll('.current-list li .number').forEach(function (el, i) { el.textContent = pad(i + 1); });
  document.querySelectorAll('.past-grid .past-card > span').forEach(function (el, i) { el.textContent = pad(i + 1); });
  document.querySelectorAll('[data-count-of]').forEach(function (el) {
    var total = document.querySelectorAll(el.getAttribute('data-count-of')).length;
    if (total) { el.setAttribute('data-count', total); el.setAttribute('data-pad', '2'); }
  });

  /* ---------- Count-up numbers ---------- */
  function runCount(el) {
    var end = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(end)) return;
    var start = parseInt(el.getAttribute('data-from') || '0', 10);
    var suffix = el.getAttribute('data-suffix') || '';
    var padTo = parseInt(el.getAttribute('data-pad') || '0', 10);
    var fmt = function (v) {
      var s = String(v);
      while (s.length < padTo) s = '0' + s;
      return s + suffix;
    };
    if (reduceMotion) { el.textContent = fmt(end); return; }
    var duration = 1400, t0 = null;
    function frame(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(start + (end - start) * eased));
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  /* ---------- Staggered reveals ---------- */
  var groups = new Map();
  document.querySelectorAll('.reveal').forEach(function (el) {
    var parent = el.parentElement;
    var i = groups.get(parent) || 0;
    el.style.setProperty('--d', (i * 0.09).toFixed(2) + 's');
    groups.set(parent, i + 1);
  });
  document.querySelectorAll('.deliverables span').forEach(function (el, i) {
    el.style.setProperty('--i', i);
  });

  var counters = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });

    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCount(entry.target);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { countObserver.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('visible'); });
    counters.forEach(runCount);
  }

  /* ============================================================
     Inquiry form
     The form's `action` attribute holds the Google Apps Script
     Web App URL (…/exec). On submit we:
       1. validate fields inline
       2. POST the fields as URL-encoded data (a "simple" request,
          so the browser sends no CORS preflight)
       3. read the JSON reply { ok: true }
       4. send the visitor to thank-you.html
     ============================================================ */
  var form = document.querySelector('#inquiry-form');
  if (!form) return;

  var statusEl = form.querySelector('.form-status');
  var submitBtn = form.querySelector('button[type="submit"]');
  var THANK_YOU = 'thank-you.html';
  var FALLBACK_EMAIL = 'melody@mlbmrep.com';

  var messages = {
    name: 'Enter your name.',
    email: 'Enter a valid email address, like you@example.com.',
    service: 'Choose the service you need.',
    message: 'Tell us briefly what you are building.',
    terms_accepted: 'Accept the Service Terms to send your inquiry.'
  };

  function errorSlot(field) {
    var label = field.closest('label');
    var slot = label.querySelector('.field-error');
    if (!slot) {
      slot = document.createElement('span');
      slot.className = 'field-error';
      slot.id = 'err-' + field.name;
      label.appendChild(slot);
      field.setAttribute('aria-describedby', slot.id);
    }
    return slot;
  }

  function checkField(field) {
    var valid = field.checkValidity() && (field.type === 'checkbox' || field.value.trim() !== '' || !field.required);
    field.classList.toggle('is-invalid', !valid);
    field.setAttribute('aria-invalid', String(!valid));
    errorSlot(field).textContent = valid ? '' : (messages[field.name] || 'Check this field.');
    return valid;
  }

  var fields = Array.prototype.slice.call(form.querySelectorAll('input[required], select[required], textarea[required]'));
  fields.forEach(function (field) {
    var evt = (field.type === 'checkbox' || field.tagName === 'SELECT') ? 'change' : 'blur';
    field.addEventListener(evt, function () { checkField(field); });
    field.addEventListener('input', function () {
      if (field.classList.contains('is-invalid')) checkField(field);
    });
  });

  function setStatus(html, isError) {
    statusEl.innerHTML = html;
    statusEl.classList.toggle('is-error', !!isError);
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle('is-loading', on);
    submitBtn.querySelector('.label').textContent = on ? 'Sending…' : 'Send inquiry';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setStatus('', false);

    var firstBad = null;
    fields.forEach(function (f) { if (!checkField(f) && !firstBad) firstBad = f; });
    if (firstBad) { firstBad.focus(); return; }

    var endpoint = form.getAttribute('action') || '';
    if (endpoint.indexOf('script.google.com') === -1 || endpoint.indexOf('PASTE_') !== -1) {
      console.warn('[MLBM] Form endpoint is not configured. Paste your Apps Script Web App URL into the form action in index.html.');
      setStatus('The inquiry form is not connected yet. Please email <a href="mailto:' + FALLBACK_EMAIL + '">' + FALLBACK_EMAIL + '</a>.', true);
      return;
    }

    var data = new URLSearchParams(new FormData(form));
    data.set('_ajax', '1');
    data.set('page', window.location.href);

    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 25000) : null;

    setLoading(true);
    fetch(endpoint, { method: 'POST', body: data, signal: controller ? controller.signal : undefined })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.ok) {
          window.location.assign(THANK_YOU);
        } else {
          throw new Error((json && json.error) || 'Unknown error');
        }
      })
      .catch(function (err) {
        console.error('[MLBM] Form submission failed:', err);
        setLoading(false);
        setStatus('Your inquiry did not send. Check your connection and try again, or email <a href="mailto:' + FALLBACK_EMAIL + '">' + FALLBACK_EMAIL + '</a>.', true);
      })
      .then(function () { if (timer) clearTimeout(timer); });
  });
})();
