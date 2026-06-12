/* ============================================================
   ReloGene - Three.js particle backgrounds
   Neural-network particle field + DNA double helix.
   Gracefully no-ops if WebGL/THREE unavailable.
   ============================================================ */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasWebGL = (() => {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { return false; }
  })();

  function makeRenderer(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    return r;
  }

  /* ---------- Neural network particle field (hero / cta / contact) ---------- */
  function neuralField(canvas, opts) {
    opts = opts || {};
    const COUNT = opts.count || 130;
    const LINK_DIST = opts.linkDist || 2.4;
    const SPREAD = opts.spread || 16;
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 14;

    const positions = new Float32Array(COUNT * 3);
    const velocities = [];
    for (let i = 0; i < COUNT; i++) {
      positions[i*3]   = (Math.random() - 0.5) * SPREAD;
      positions[i*3+1] = (Math.random() - 0.5) * SPREAD * 0.62;
      positions[i*3+2] = (Math.random() - 0.5) * SPREAD * 0.5;
      velocities.push(new THREE.Vector3((Math.random()-0.5)*0.006, (Math.random()-0.5)*0.006, (Math.random()-0.5)*0.006));
    }

    // points
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const sprite = makeDot();
    const pMat = new THREE.PointsMaterial({ size: opts.dotSize || 0.16, map: sprite, transparent: true, color: 0xff5c78, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });
    const points = new THREE.Points(pGeo, pMat);
    scene.add(points);

    // lines
    const lineGeo = new THREE.BufferGeometry();
    const maxLines = COUNT * 8;
    const linePos = new Float32Array(maxLines * 6);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lines);

    const mouse = new THREE.Vector2(0, 0);
    const target = new THREE.Vector2(0, 0);
    window.addEventListener('pointermove', (e) => {
      target.x = (e.clientX / window.innerWidth - 0.5);
      target.y = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });

    function makeDot() {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(32,32,0,32,32,32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,120,150,0.9)');
      g.addColorStop(1, 'rgba(255,59,92,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
      const t = new THREE.CanvasTexture(c); return t;
    }

    let raf, running = true;
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }

    function frame() {
      if (!running) return;
      const pos = pGeo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        pos[i*3]   += velocities[i].x;
        pos[i*3+1] += velocities[i].y;
        pos[i*3+2] += velocities[i].z;
        for (let a = 0; a < 3; a++) {
          const lim = a === 0 ? SPREAD/2 : (a === 1 ? SPREAD*0.31 : SPREAD*0.25);
          if (pos[i*3+a] > lim || pos[i*3+a] < -lim) velocities[i].getComponent(a), velocities[i].setComponent(a, -velocities[i].getComponent(a));
        }
      }
      pGeo.attributes.position.needsUpdate = true;

      // rebuild links
      let n = 0;
      for (let i = 0; i < COUNT; i++) {
        for (let j = i+1; j < COUNT; j++) {
          const dx = pos[i*3]-pos[j*3], dy = pos[i*3+1]-pos[j*3+1], dz = pos[i*3+2]-pos[j*3+2];
          const d2 = dx*dx+dy*dy+dz*dz;
          if (d2 < LINK_DIST*LINK_DIST && n < maxLines) {
            linePos[n*6]=pos[i*3]; linePos[n*6+1]=pos[i*3+1]; linePos[n*6+2]=pos[i*3+2];
            linePos[n*6+3]=pos[j*3]; linePos[n*6+4]=pos[j*3+1]; linePos[n*6+5]=pos[j*3+2];
            n++;
          }
        }
      }
      lineGeo.setDrawRange(0, n*2);
      lineGeo.attributes.position.needsUpdate = true;

      mouse.x += (target.x - mouse.x) * 0.04;
      mouse.y += (target.y - mouse.y) * 0.04;
      scene.rotation.y = mouse.x * 0.5;
      scene.rotation.x = mouse.y * 0.3;
      scene.rotation.z += 0.0004;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();
    if (reduceMotion) { renderer.render(scene, camera); }
    else frame();

    // pause when offscreen
    const io = new IntersectionObserver((es) => {
      es.forEach(e => {
        if (e.isIntersecting && !reduceMotion) { if (!running) { running = true; frame(); } }
        else { running = false; cancelAnimationFrame(raf); }
      });
    }, { threshold: 0 });
    io.observe(canvas);

    return { resize };
  }

  /* ---------- DNA double helix (who-we-are visual) ---------- */
  function dnaHelix(canvas) {
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 13);

    const group = new THREE.Group();
    scene.add(group);

    const TURNS = 22, RAD = 2.4, GAP = 0.42, HEIGHT = 18;
    const matA = new THREE.MeshBasicMaterial({ color: 0xff3b5c });
    const matB = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const rungMat = new THREE.MeshBasicMaterial({ color: 0xff5c78, transparent: true, opacity: 0.35 });
    const sphereGeo = new THREE.SphereGeometry(0.17, 12, 12);

    for (let i = 0; i < TURNS; i++) {
      const t = i * GAP;
      const y = (i * (HEIGHT / TURNS)) - HEIGHT / 2;
      const x1 = Math.cos(t) * RAD, z1 = Math.sin(t) * RAD;
      const x2 = Math.cos(t + Math.PI) * RAD, z2 = Math.sin(t + Math.PI) * RAD;

      const s1 = new THREE.Mesh(sphereGeo, matA); s1.position.set(x1, y, z1); group.add(s1);
      const s2 = new THREE.Mesh(sphereGeo, matB); s2.position.set(x2, y, z2); group.add(s2);

      // rung
      const start = new THREE.Vector3(x1, y, z1), end = new THREE.Vector3(x2, y, z2);
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), rungMat);
      cyl.position.copy(start).add(dir.clone().multiplyScalar(0.5));
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
      group.add(cyl);
    }
    group.rotation.z = 0.18;

    let raf, running = true;
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight; if (!w||!h) return;
      renderer.setSize(w, h, false); camera.aspect = w/h; camera.updateProjectionMatrix();
    }
    function frame() {
      if (!running) return;
      group.rotation.y += 0.006;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    window.addEventListener('resize', resize); resize();
    if (reduceMotion) renderer.render(scene, camera); else frame();
    const io = new IntersectionObserver((es)=>es.forEach(e=>{
      if (e.isIntersecting && !reduceMotion){ if(!running){running=true;frame();} } else { running=false; cancelAnimationFrame(raf); }
    }), { threshold: 0 });
    io.observe(canvas);
    return { resize };
  }

  /* ---------- bootstrap ---------- */
  function init() {
    if (!hasWebGL || typeof THREE === 'undefined') {
      document.querySelectorAll('[data-bg]').forEach(c => c.classList.add('bg-fallback'));
      return;
    }
    document.querySelectorAll('canvas[data-bg]').forEach((canvas) => {
      const type = canvas.getAttribute('data-bg');
      try {
        if (type === 'helix') dnaHelix(canvas);
        else if (type === 'neural-dense') neuralField(canvas, { count: 150, linkDist: 2.6, spread: 18, dotSize: 0.18 });
        else if (type === 'neural-soft') neuralField(canvas, { count: 80, linkDist: 2.6, spread: 16, dotSize: 0.15 });
        else neuralField(canvas, {});
      } catch (e) { /* silent */ }
    });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
