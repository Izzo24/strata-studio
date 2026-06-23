/* 丘壑 STRATA — interactions + WebGL generative terrain */
(function () {
  "use strict";

  /* ---------- header scroll state ---------- */
  var header = document.querySelector(".site-header");
  function onScroll() {
    if (window.scrollY > 40) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- mobile nav ---------- */
  var toggle = document.getElementById("navToggle");
  var nav = document.querySelector(".site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- contact form (front-end only) ---------- */
  var form = document.getElementById("contactForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var note = document.getElementById("formNote");
      if (note) note.hidden = false;
      form.querySelector("button[type=submit]").disabled = true;
    });
  }

  /* ---------- WebGL generative terrain ---------- */
  var canvas = document.getElementById("bg-canvas");
  if (!canvas || typeof THREE === "undefined") return;

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  } catch (err) {
    // WebGL unavailable — leave dark background, content remains readable.
    canvas.style.background = "linear-gradient(180deg,#181030,#100a1c)";
    return;
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x100a1c);
  scene.fog = new THREE.FogExp2(0x100a1c, 0.035);

  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 6.5, 16);
  camera.lookAt(0, 1.5, -6);

  // ---- terrain mesh ----
  var SEG = 140, SIZE = 80;
  var geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);

  var pos = geo.attributes.position;
  var count = pos.count;
  var colors = new Float32Array(count * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // dusk palette stops: night-plum -> magenta -> amber -> gold
  var cNight = new THREE.Color(0x241441);
  var cMag = new THREE.Color(0xd65a8e);
  var cAmber = new THREE.Color(0xf4a44c);
  var cGold = new THREE.Color(0xffd28a);
  var tmp = new THREE.Color();

  var mat = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: false });
  // a wireframe overlay gives the generative "contour" feel
  var wireMat = new THREE.MeshBasicMaterial({ color: 0x120a1f, wireframe: true, transparent: true, opacity: 0.18 });

  var mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  var wire = new THREE.Mesh(geo, wireMat);
  scene.add(wire);

  // base x/z for height function
  var bx = new Float32Array(count), bz = new Float32Array(count);
  for (var i = 0; i < count; i++) { bx[i] = pos.getX(i); bz[i] = pos.getZ(i); }

  function heightAt(x, z, t) {
    var h = 0;
    h += Math.sin(x * 0.18 + t * 0.6) * 1.7;
    h += Math.cos(z * 0.16 - t * 0.5) * 1.5;
    h += Math.sin((x + z) * 0.10 + t * 0.35) * 1.1;
    h += Math.sin(x * 0.42 + z * 0.30 + t) * 0.4;
    // ridge emphasis toward the horizon
    var ridge = Math.exp(-((x * x) / 900));
    return h * (0.7 + ridge * 0.6);
  }

  var MIN_H = -4, MAX_H = 5;
  function updateTerrain(t) {
    for (var i = 0; i < count; i++) {
      var x = bx[i], z = bz[i];
      var h = heightAt(x, z, t);
      pos.setY(i, h);
      var f = (h - MIN_H) / (MAX_H - MIN_H);
      f = Math.max(0, Math.min(1, f));
      if (f < 0.45) tmp.copy(cNight).lerp(cMag, f / 0.45);
      else if (f < 0.78) tmp.copy(cMag).lerp(cAmber, (f - 0.45) / 0.33);
      else tmp.copy(cAmber).lerp(cGold, (f - 0.78) / 0.22);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    pos.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  // initial fill so first frame is correct even if reduced motion
  updateTerrain(0);
  geo.computeVertexNormals();

  // ---- mouse parallax ----
  var targetX = 0, targetY = 0, curX = 0, curY = 0;
  window.addEventListener("pointermove", function (e) {
    targetX = (e.clientX / window.innerWidth - 0.5);
    targetY = (e.clientY / window.innerHeight - 0.5);
  }, { passive: true });

  var clock = new THREE.Clock();
  var running = true;

  function render() {
    if (!running) return;
    requestAnimationFrame(render);
    var t = prefersReduced ? 0 : clock.getElapsedTime() * 0.5;
    if (!prefersReduced) updateTerrain(t);

    curX += (targetX - curX) * 0.04;
    curY += (targetY - curY) * 0.04;
    camera.position.x = curX * 6;
    camera.position.y = 6.5 - curY * 2.5;
    // slow forward drift of the terrain
    mesh.position.z = wire.position.z = ((t * 1.6) % 11.43);
    camera.lookAt(0, 1.2, -6);
    renderer.render(scene, camera);
  }
  render();

  // pause when tab hidden (saves GPU)
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) { clock.start(); render(); }
  });

  // resize
  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }, 150);
  });
})();
