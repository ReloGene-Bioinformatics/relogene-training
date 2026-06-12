/* ============================================================
   ReloGene - UI interactions
   loader · nav · mobile menu · scroll reveal · counters · cards
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Loader ---------- */
  window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    if (loader) setTimeout(() => loader.classList.add('hide'), 550);
  });
  // failsafe
  setTimeout(() => { const l = document.getElementById('loader'); if (l) l.classList.add('hide'); }, 2600);

  document.addEventListener('DOMContentLoaded', () => {

    /* ---------- Nav scroll state ---------- */
    const nav = document.querySelector('.nav');
    const onScroll = () => { if (nav) nav.classList.toggle('scrolled', window.scrollY > 30); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    /* ---------- Mobile menu ---------- */
    const burger = document.querySelector('.nav-burger');
    const menu = document.getElementById('mobileMenu');
    if (burger && menu) {
      const toggle = (open) => {
        burger.classList.toggle('open', open);
        menu.classList.toggle('open', open);
        document.body.style.overflow = open ? 'hidden' : '';
      };
      burger.addEventListener('click', () => toggle(!menu.classList.contains('open')));
      menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => toggle(false)));
    }

    /* ---------- Scroll reveal ---------- */
    const reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      const ro = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } });
      }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(el => ro.observe(el));
    } else {
      reveals.forEach(el => el.classList.add('in'));
    }

    /* ---------- Animated counters ---------- */
    const counters = document.querySelectorAll('[data-count]');
    const animate = (el) => {
      const target = parseFloat(el.getAttribute('data-count'));
      const dec = (el.getAttribute('data-count').indexOf('.') > -1) ? 1 : 0;
      const dur = 1800; const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * eased).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = target.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
      };
      requestAnimationFrame(step);
    };
    if ('IntersectionObserver' in window) {
      const co = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { animate(e.target); co.unobserve(e.target); } });
      }, { threshold: 0.5 });
      counters.forEach(c => co.observe(c));
    } else counters.forEach(c => c.textContent = c.getAttribute('data-count'));

    /* ---------- Feature card pointer glow ---------- */
    document.querySelectorAll('.feature-card').forEach(card => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      });
    });

    /* ---------- Subtle parallax on hero content ---------- */
    const heroContent = document.querySelector('[data-parallax]');
    if (heroContent && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.addEventListener('scroll', () => {
        const y = window.scrollY;
        if (y < window.innerHeight) {
          heroContent.style.transform = `translateY(${y * 0.18}px)`;
          heroContent.style.opacity = String(Math.max(0, 1 - y / (window.innerHeight * 0.85)));
        }
      }, { passive: true });
    }

    /* ---------- Mark active nav link by filename ---------- */
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link, .mobile-menu a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === path || (path === 'index.html' && href === './') || (path === '' && href === 'index.html')) a.classList.add('active');
    });
  });
})();

/* ============================================================
   Scroll comet - a single comet glides down a faint spine,
   tracking scroll progress (top of page -> bottom).
   ============================================================ */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    zIndex: '-1', pointerEvents: 'none'
  });

  function start() {
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    const TOP = 0.08, BOT = 0.92;   // vertical travel band within the viewport
    const WAVES = 2.5;              // number of S-bends down the page
    let cur = 0;                    // eased scroll fraction (trailing glide)

    function progress() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, (window.scrollY || 0) / max)) : 0;
    }
    const px = (f, cx, amp) => cx + amp * Math.sin(f * Math.PI * WAVES);
    const py = (f) => (TOP + f * (BOT - TOP)) * H;

    function frame() {
      ctx.clearRect(0, 0, W, H);
      cur += (progress() - cur) * 0.07;      // smooth follow
      const cx = W / 2;
      const amp = Math.min(W * 0.24, 240);   // horizontal sway of the S

      // faint S-shaped spine connecting the page
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let f = 0; f <= 1.0001; f += 0.015) {
        const X = px(f, cx, amp), Y = py(f);
        f === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
      }
      ctx.stroke();

      // glowing tail riding the curve behind the head
      const N = 30, span = 0.12;
      for (let i = 0; i < N; i++) {
        const f1 = cur - span * (i + 1) / N;
        const f2 = cur - span * i / N;
        if (f1 < 0) continue;
        const a = 1 - i / N;                  // brighter near the head
        ctx.strokeStyle = 'rgba(255,' + Math.round(70 + 50 * a) + ',' + Math.round(100 + 40 * a) + ',' + (0.55 * a) + ')';
        ctx.lineWidth = 0.6 + 2.2 * a;
        ctx.beginPath();
        ctx.moveTo(px(f1, cx, amp), py(f1));
        ctx.lineTo(px(f2, cx, amp), py(f2));
        ctx.stroke();
      }

      // comet head: soft halo + bright core
      const hx = px(cur, cx, amp), hy = py(cur);
      const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, 30);
      halo.addColorStop(0, 'rgba(255,120,150,0.85)');
      halo.addColorStop(0.4, 'rgba(255,59,92,0.4)');
      halo.addColorStop(1, 'rgba(255,59,92,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(hx, hy, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0, Math.PI * 2); ctx.fill();

      requestAnimationFrame(frame);
    }
    frame();
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
