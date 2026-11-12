/* ÓRBITA — cliente 3D (Three.js).
   Prevê a própria nave com a mesma física do servidor e corrige quando chega o estado oficial.
   Outras naves são interpoladas com um pequeno atraso para ficarem suaves. */
(function () {
  'use strict';
  var C = SIM.C, $ = function (id) { return document.getElementById(id); };
  var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');

  /* ---------- cena ---------- */
  var renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
  $('game').appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04050c);
  var camera = new THREE.PerspectiveCamera(66, 1, 0.5, 9000);
  function resize() { var w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();

  scene.add(new THREE.AmbientLight(0x5a6890, 0.6));
  scene.add(new THREE.HemisphereLight(0x8fa8ff, 0x2a1a0a, 0.35));
  var sun = new THREE.DirectionalLight(0xfff0d8, 1.35); sun.position.set(600, 320, 380); scene.add(sun);

  function canvasTex(w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); }

  /* céu: degradê com nebulosas, estrelas, sol e um planeta ao fundo */
  (function sky() {
    var t = canvasTex(1024, 512, function (q, w, h) {
      var g = q.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#03040a'); g.addColorStop(0.5, '#070a1a'); g.addColorStop(1, '#03040a'); q.fillStyle = g; q.fillRect(0, 0, w, h);
      var R = SIM.rng(42);
      [['rgba(70,40,140,', 9], ['rgba(20,110,140,', 7], ['rgba(150,60,90,', 4]].forEach(function (c) {
        for (var i = 0; i < c[1]; i++) { var x = R() * w, y = h * (0.25 + R() * 0.5), r = 60 + R() * 160, rg = q.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c[0] + '0.22)'); rg.addColorStop(1, c[0] + '0)'); q.fillStyle = rg; q.fillRect(x - r, y - r, r * 2, r * 2); }
      });
    });
    var m = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false, fog: false }));
    scene.add(m);
    var R = SIM.rng(9), n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { var u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), d = 4200; pos[i * 3] = s * Math.cos(a) * d; pos[i * 3 + 1] = u * d; pos[i * 3 + 2] = s * Math.sin(a) * d; var b = 0.55 + R() * 0.45, tint = R(); col[i * 3] = b * (tint > 0.85 ? 1 : 0.85); col[i * 3 + 1] = b * 0.9; col[i * 3 + 2] = b * (tint < 0.2 ? 0.7 : 1); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, depthWrite: false })));
    var glow = canvasTex(256, 256, function (q) { var rg = q.createRadialGradient(128, 128, 0, 128, 128, 128); rg.addColorStop(0, 'rgba(255,250,235,1)'); rg.addColorStop(0.12, 'rgba(255,230,180,.9)'); rg.addColorStop(0.4, 'rgba(255,170,90,.18)'); rg.addColorStop(1, 'rgba(255,150,80,0)'); q.fillStyle = rg; q.fillRect(0, 0, 256, 256); });
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.position.copy(sun.position).normalize().multiplyScalar(4300); sp.scale.set(1100, 1100, 1); scene.add(sp);
    var pt = canvasTex(512, 256, function (q, w, h) { var R2 = SIM.rng(3); for (var y = 0; y < h; y++) { var v = Math.sin(y * 0.09) * 0.5 + Math.sin(y * 0.31 + 1) * 0.3 + R2() * 0.15; q.fillStyle = 'rgb(' + Math.round(120 + v * 40) + ',' + Math.round(80 + v * 30) + ',' + Math.round(150 + v * 40) + ')'; q.fillRect(0, y, w, 1); } });
    var planet = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), new THREE.MeshStandardMaterial({ map: pt, roughness: 1, metalness: 0 }));
    planet.position.set(-2600, -900, -3000); planet.rotation.z = 0.35; scene.add(planet);
  })();

  /* poeira espacial em volta da câmera: dá sensação de velocidade */
  var DUST_N = 500, DUST_S = 160, dustPos = new Float32Array(DUST_N * 3), dustBase = [];
  (function () { var R = SIM.rng(5); for (var i = 0; i < DUST_N; i++) dustBase.push([R() * DUST_S, R() * DUST_S, R() * DUST_S]); })();
  var dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x9fb6d8, size: 0.35, transparent: true, opacity: 0.55, depthWrite: false }));
  dust.frustumCulled = false; scene.add(dust);
  function updateDust(c) { for (var i = 0; i < DUST_N; i++) { var b = dustBase[i]; for (var k = 0; k < 3; k++) { var cc = k === 0 ? c.x : k === 1 ? c.y : c.z, v = ((b[k] - cc) % DUST_S + DUST_S) % DUST_S; dustPos[i * 3 + k] = cc + v - DUST_S / 2; } } dustGeo.attributes.position.needsUpdate = true; }

  /* ---------- estação ---------- */
  var station = new THREE.Group(), blinkers = [], padRing;
  (function () {
    var metal = new THREE.MeshStandardMaterial({ color: 0xb9c3d1, metalness: 0.55, roughness: 0.42 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x283041, metalness: 0.6, roughness: 0.5 });
    var lit = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
    var warm = new THREE.MeshBasicMaterial({ color: 0xffc46b });
    station.add(new THREE.Mesh(new THREE.SphereGeometry(SIM.STATION.hub, 40, 28), metal));
    var band = new THREE.Mesh(new THREE.CylinderGeometry(22.7, 22.7, 4.5, 48, 1, true), dark); station.add(band);
    for (var i = 0; i < 32; i++) { var a = i / 32 * Math.PI * 2, w = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.3), i % 5 === 0 ? warm : lit); w.position.set(Math.cos(a) * 22.9, 0, Math.sin(a) * 22.9); w.rotation.y = -a + Math.PI / 2; station.add(w); }
    [-9, 9].forEach(function (y) { var r = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(22 * 22 - y * y) + 0.15, 0.35, 6, 48), dark); r.rotation.x = Math.PI / 2; r.position.y = y; station.add(r); });
    // plataforma de pouso no topo
    var pad = new THREE.Mesh(new THREE.CylinderGeometry(12, 13.5, 1.6, 48), dark); pad.position.y = 21.6; station.add(pad);
    var padTop = new THREE.Mesh(new THREE.CylinderGeometry(11.6, 11.6, 0.2, 48), new THREE.MeshStandardMaterial({ color: 0x1a2130, metalness: 0.3, roughness: 0.8 })); padTop.position.y = 22.5; station.add(padTop);
    padRing = new THREE.Mesh(new THREE.TorusGeometry(10.6, 0.32, 8, 64), new THREE.MeshBasicMaterial({ color: 0x43e39a })); padRing.rotation.x = Math.PI / 2; padRing.position.y = 22.7; station.add(padRing);
    [[6, 0.5], [0.5, 6]].forEach(function (s) { var b = new THREE.Mesh(new THREE.BoxGeometry(s[0], 0.1, s[1]), new THREE.MeshBasicMaterial({ color: 0x43e39a })); b.position.y = 22.65; station.add(b); });
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(C.DOCK.r, C.DOCK.r, 16, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x43e39a, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 31; station.add(beam);
    var gl = new THREE.PointLight(0x43e39a, 1.3, 70); gl.position.y = 30; station.add(gl);
    // antena embaixo com luz piscando
    var ant = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 22, 8), dark); ant.position.y = -31; station.add(ant);
    var tip = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4a5a })); tip.position.y = -42.5; station.add(tip); blinkers.push(tip);
    // anel externo
    var ring = new THREE.Mesh(new THREE.TorusGeometry(SIM.STATION.ringR, SIM.STATION.ringT, 18, 120), metal); ring.rotation.x = Math.PI / 2; station.add(ring);
    var ringIn = new THREE.Mesh(new THREE.TorusGeometry(SIM.STATION.ringR - 4.9, 0.6, 6, 120), lit); ringIn.rotation.x = Math.PI / 2; station.add(ringIn);
    for (i = 0; i < 48; i++) { a = i / 48 * Math.PI * 2; var p = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 0.4), i % 2 ? dark : metal); p.position.set(Math.cos(a) * (SIM.STATION.ringR + 5.3), 0, Math.sin(a) * (SIM.STATION.ringR + 5.3)); p.rotation.y = -a + Math.PI / 2; station.add(p); }
    // braços e painéis solares
    var solar = new THREE.MeshStandardMaterial({ color: 0x1b3a86, metalness: 0.7, roughness: 0.25, emissive: 0x081a40 });
    [0.785, 2.356, 3.927, 5.498].forEach(function (a, k) {
      var arm = new THREE.Group(); arm.rotation.y = -a;
      var c = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, SIM.STATION.ringR - 20, 12), dark); c.rotation.z = Math.PI / 2; c.position.x = (SIM.STATION.ringR + 20) / 2; arm.add(c);
      var l = new THREE.Mesh(new THREE.BoxGeometry(SIM.STATION.ringR - 24, 0.5, 0.5), lit); l.position.set((SIM.STATION.ringR + 20) / 2, 2.5, 0); arm.add(l);
      var pnl = new THREE.Mesh(new THREE.BoxGeometry(26, 0.35, 11), solar); pnl.position.set(SIM.STATION.ringR + 22, 0, 0); arm.add(pnl);
      var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 6), dark); mast.rotation.z = Math.PI / 2; mast.position.x = SIM.STATION.ringR + 8; arm.add(mast);
      var bl = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: k % 2 ? 0xff4a5a : 0x43e39a })); bl.position.set(SIM.STATION.ringR + 35.5, 0, 0); arm.add(bl); blinkers.push(bl);
      station.add(arm);
    });
    scene.add(station);
  })();

  /* ---------- asteroides ---------- */
  var rockMat = [0x6f655c, 0x5d5a58, 0x7a6a58, 0x55504c].map(function (c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0.05, flatShading: true }); });
  var crystMat = new THREE.MeshStandardMaterial({ color: 0x48e5ff, emissive: 0x1aa6c8, emissiveIntensity: 1.1, roughness: 0.2, metalness: 0.1, flatShading: true });
  var stock = SIM.AST.map(function (a) { return a.rich ? C.STOCK : 0; });
  var rocks = SIM.AST.map(function (a) {
    var R = SIM.rng(a.seed), k1 = 1.5 + R() * 2, k2 = 1.5 + R() * 2, k3 = 2 + R() * 3, p1 = R() * 6, p2 = R() * 6, p3 = R() * 6;
    var geo = new THREE.IcosahedronGeometry(a.r, a.r > 16 ? 3 : 2), pos = geo.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).normalize(); var f = 1 + 0.16 * Math.sin(v.x * k1 + p1) * Math.sin(v.y * k2 + p2) + 0.1 * Math.sin(v.z * k3 + p3 + v.x * 2) - 0.06 * Math.abs(Math.sin(v.y * 5 + p1)); pos.setXYZ(i, v.x * a.r * f, v.y * a.r * f * (0.82 + 0.18 * Math.cos(p3)), v.z * a.r * f); }
    geo.computeVertexNormals();
    var g = new THREE.Group(); g.position.set(a.x, a.y, a.z);
    var m = new THREE.Mesh(geo, rockMat[a.i % rockMat.length]); g.add(m);
    var spin = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.06);
    var cr = [];
    if (a.rich) {
      for (var n = 0; n < C.STOCK; n++) {
        var dir = new THREE.Vector3(R() - 0.5, R() - 0.2, R() - 0.5).normalize(), s = 1.1 + R() * 1.2;
        var c = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), crystMat); c.scale.set(0.7, 1.9, 0.7);
        c.position.copy(dir).multiplyScalar(a.r * 0.92); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); m.add(c); cr.push(c);
      }
    }
    scene.add(g);
    return { g: g, m: m, spin: spin, cr: cr };
  });
  function showStock(i) { var r = rocks[i]; r.cr.forEach(function (c, k) { c.visible = k < stock[i]; }); }

  /* ---------- naves ---------- */
  var glowTex = canvasTex(64, 64, function (q) { var rg = q.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(140,220,255,.8)'); rg.addColorStop(1, 'rgba(60,140,255,0)'); q.fillStyle = rg; q.fillRect(0, 0, 64, 64); });
  function makeShip(color) {
    var root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.rotation.order = 'YXZ';
    var hullM = new THREE.MeshStandardMaterial({ color: 0xd9dfe8, metalness: 0.5, roughness: 0.38 });
    var accM = new THREE.MeshStandardMaterial({ color: color, metalness: 0.4, roughness: 0.45 });
    var darkM = new THREE.MeshStandardMaterial({ color: 0x232a36, metalness: 0.6, roughness: 0.5 });
    function add(geo, mat, x, y, z, rx, ry, rz) { var o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); body.add(o); return o; }
    add(new THREE.CylinderGeometry(0.85, 1.5, 6.4, 8), hullM, 0, 0, 0.2, -Math.PI / 2);
    add(new THREE.ConeGeometry(0.85, 2.4, 8), accM, 0, 0, -4.2, -Math.PI / 2);
    var cp = add(new THREE.SphereGeometry(0.8, 14, 10), new THREE.MeshStandardMaterial({ color: 0x0b1c2c, metalness: 0.9, roughness: 0.1, emissive: 0x0a3a50 }), 0, 0.72, -1.4); cp.scale.set(1, 0.7, 1.9);
    [-1, 1].forEach(function (s) {
      var w = add(new THREE.BoxGeometry(4.2, 0.22, 2.4), hullM, s * 2.6, -0.15, 1.1, 0, s * 0.42, 0);
      add(new THREE.BoxGeometry(3.4, 0.24, 0.5), accM, s * 2.5, -0.1, 0.35, 0, s * 0.42, 0);
      add(new THREE.BoxGeometry(0.3, 0.9, 1.6), darkM, s * 4.55, 0.25, 2.1);
      add(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff4a5a : 0x43e39a }), s * 4.6, 0.75, 2.1);
      add(new THREE.CylinderGeometry(0.5, 0.62, 2.2, 10), darkM, s * 1.25, -0.05, 3.1, Math.PI / 2);
      add(new THREE.TorusGeometry(0.55, 0.08, 6, 16), accM, s * 1.25, -0.05, 4.15);
    });
    add(new THREE.BoxGeometry(0.22, 1.5, 1.8), accM, 0, 0.95, 2.5, 0.35);
    var glows = [], flames = [];
    [-1.25, 1.25].forEach(function (x) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7fd8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.position.set(x, -0.05, 4.4); body.add(sp); glows.push(sp);
      var fl = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x6cc8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      fl.rotation.x = -Math.PI / 2; fl.position.set(x, -0.05, 5.6); body.add(fl); flames.push(fl);
    });
    root.userData = { body: body, glows: glows, flames: flames, thr: 0, bank: 0 };
    return root;
  }
  function engine(ship, level, dt) {
    var u = ship.userData; u.thr += (level - u.thr) * Math.min(1, dt * 6);
    var t = u.thr, boost = t > 1.2;
    u.glows.forEach(function (g) { var s = 1.2 + t * 1.6 + Math.random() * 0.25; g.scale.set(s, s, 1); g.material.color.setHex(boost ? 0xffc46b : 0x7fd8ff); });
    u.flames.forEach(function (f) { var l = 0.15 + t * 0.9 + Math.random() * 0.12; f.scale.set(1, l, 1); f.position.z = 4.2 + 1.5 * l; f.material.color.setHex(boost ? 0xffb547 : 0x6cc8ff); f.visible = t > 0.05; });
  }
  function label(text, color) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64; var q = c.getContext('2d');
    q.font = '700 30px system-ui, sans-serif'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.lineWidth = 6; q.strokeStyle = 'rgba(0,0,0,.75)'; q.strokeText(text, 128, 32); q.fillStyle = '#' + ('00000' + color.toString(16)).slice(-6); q.fillText(text, 128, 32);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, transparent: true })); sp.scale.set(10, 2.5, 1); sp.position.y = 4.2; return sp;
  }

  /* raio de mineração */
  function makeBeam() { var b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x48e5ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); b.visible = false; scene.add(b); return b; }
  var up3 = new THREE.Vector3(0, 1, 0);
  function aimBeam(b, from, to) { var d = new THREE.Vector3().subVectors(to, from), L = d.length(); b.position.copy(from).addScaledVector(d, 0.5); b.scale.set(1, L, 1); b.quaternion.setFromUnitVectors(up3, d.normalize()); b.visible = true; }

  /* ---------- estado ---------- */
  var me = SIM.newShip(), prev = SIM.copy(me), myShip = makeShip(0x38bdf8), corr = new THREE.Vector3();
  scene.add(myShip);
  var myBeam = makeBeam();
  var others = new Map();
  var online = false, ws = null, myId = 0, myColor = 0x38bdf8, myName = 'Piloto', seq = 0, pend = [], cargo = 0, cr = 0, everOnline = false, started = false;
  var COLORS = SIM.COLORS, myCi = 0;
  var lastInput = SIM.cleanInput({}), mineAt = 0, mining = false, actPrev = false;

  function toast(t, ms) { var e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { e.classList.remove('on'); }, ms || 1800); }
  function flash() { var e = $('flash'); e.classList.add('on'); setTimeout(function () { e.classList.remove('on'); }, 60); }

  /* ---------- rede ---------- */
  function setNet(on) { online = on; var e = $('net'); e.textContent = on ? 'online' : 'offline'; e.classList.toggle('on', on); }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function connect() {
    if (location.protocol === 'file:') { $('netInfo').textContent = 'Modo offline (sem servidor).'; $('netDot').className = 'dot off'; return; }
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host); } catch (e) { return; }
    ws.onopen = function () { $('netInfo').textContent = 'Servidor online · pronto para decolar'; $('netDot').className = 'dot on'; if (started) hello(); };
    ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
    ws.onclose = function () {
      setNet(false); others.forEach(function (o) { scene.remove(o.ship); scene.remove(o.beam); }); others.clear(); renderList();
      if (!everOnline) { $('netInfo').textContent = 'Sem servidor agora: dá para voar sozinho (offline).'; $('netDot').className = 'dot off'; }
      else toast('Conexão perdida. Tentando voltar…', 2500);
      setTimeout(connect, 2500);
    };
  }
  function hello() { send({ t: 'hi', name: myName, c: myCi }); }
  function onMsg(m) {
    if (m.t === 'welcome') {
      myId = m.id; myColor = m.color; everOnline = true; setNet(true);
      me = SIM.copy(m.s); prev = SIM.copy(me); pend = []; seq = 0; corr.set(0, 0, 0);
      paintShip(myShip, myColor);
      m.stock.forEach(function (n, i) { stock[i] = n; showStock(i); });
      m.players.forEach(function (p) { if (p.id !== myId) addOther(p); });
      renderList(); toast('Conectado ao setor. Bons voos, ' + myName + '!');
    } else if (m.t === 'join') { if (m.id !== myId) { addOther(m); renderList(); toast(m.name + ' entrou no setor', 1500); } }
    else if (m.t === 'leave') { var o = others.get(m.id); if (o) { scene.remove(o.ship); scene.remove(o.beam); others.delete(m.id); renderList(); } }
    else if (m.t === 'snap') {
      cargo = m.cargo; cr = m.cr;
      var before = renderPos(); me = SIM.copy(m.me); pend = pend.filter(function (q) { return q.s > m.ack; });
      pend.forEach(function (q) { SIM.step(me, q.i, C.TICK); }); prev = SIM.copy(me);
      var after = renderPos(); corr.add(before.sub(after)); if (corr.length() > 25) corr.set(0, 0, 0);
      var now = performance.now();
      m.P.forEach(function (p) { if (p[0] === myId) return; var o = others.get(p[0]); if (!o) return; o.buf.push({ t: now, x: p[1], y: p[2], z: p[3], yaw: p[4], pitch: p[5], turn: p[6], thr: p[7] }); if (o.buf.length > 30) o.buf.shift(); });
    } else if (m.t === 'ast') {
      stock[m.i] = m.n; showStock(m.i);
      var ob = others.get(m.by); if (ob) ob.beamT = 0.45, ob.beamTo = m.i;
    } else if (m.t === 'ev') {
      if (m.k === 'mined') { cargo = m.cargo; toast('+1 cristal (' + cargo + '/' + C.CARGO + ')', 900); }
      else if (m.k === 'sold') { cr = m.cr; toast('Venda feita: +' + m.ganho + ' créditos. Casco reparado!', 2600); }
      else if (m.k === 'respawn') { toast('Nave destruída! Você voltou para perto da estação.', 2800); flash(); corr.set(0, 0, 0); }
      else if (m.k === 'nao') toast(m.msg, 1600);
    } else if (m.t === 'full') toast('Setor cheio. Tente mais tarde.', 3000);
  }
  function paintShip(ship, color) { ship.userData.body.children.forEach(function (o) { if (o.material && o.material.color && o.material.metalness === 0.4) o.material.color.setHex(color); }); }
  function addOther(p) {
    if (others.has(p.id)) return; var s = makeShip(p.color); s.add(label(p.name, p.color)); scene.add(s);
    others.set(p.id, { id: p.id, name: p.name, color: p.color, ship: s, buf: [], beam: makeBeam(), beamT: 0, beamTo: -1 });
  }
  function renderList() {
    var L = [{ name: myName + ' (você)', color: myColor, me: 1 }]; others.forEach(function (o) { L.push(o); });
    $('nOn').textContent = L.length;
    $('lista').innerHTML = L.map(function (o) { return '<li' + (o.me ? ' class="me"' : '') + '><i style="background:#' + ('00000' + o.color.toString(16)).slice(-6) + '"></i>' + esc(o.name) + '</li>'; }).join('');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* modo offline: as mesmas regras do servidor, rodando aqui */
  var offRegen = SIM.AST.map(function () { return 0; });
  function offlineMine(a) {
    var now = Date.now();
    if (!SIM.canMine(me, a)) return toast('Chegue mais perto do asteroide.', 1200);
    if (cargo >= C.CARGO) return toast('Porão cheio. Volte para a estação.', 1500);
    if (stock[a.i] <= 0) return toast('Asteroide esgotado. Procure outro.', 1500);
    cargo++; stock[a.i]--; offRegen[a.i] = now; showStock(a.i); toast('+1 cristal (' + cargo + '/' + C.CARGO + ')', 900);
  }
  function offlineSell() {
    if (!SIM.inDock(me)) return toast('Pouse devagar na plataforma da estação para vender.', 1600);
    if (cargo <= 0) return toast('Porão vazio. Vá minerar.', 1400);
    var g = cargo * C.PRICE; cr += g; cargo = 0; me.hull = C.HULL; toast('Venda feita: +' + g + ' créditos. Casco reparado!', 2600);
  }
  function offlineTick() {
    var now = Date.now();
    SIM.AST.forEach(function (a) { if (a.rich && stock[a.i] < C.STOCK && now - offRegen[a.i] > C.REGEN_T * 1000) { stock[a.i]++; offRegen[a.i] = now; showStock(a.i); } });
    if (me.hull <= 0) { me = SIM.newShip(); prev = SIM.copy(me); cargo = 0; toast('Nave destruída! Você voltou para perto da estação.', 2800); flash(); }
  }

  /* ---------- controles ---------- */
  var keys = {}, touch = { x: 0, y: 0, thr: 0, brk: 0, up: 0, dn: 0, boost: 0, act: 0 };
  window.addEventListener('keydown', function (e) {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    keys[e.code] = 1;
    if (e.code === 'KeyH') $('help').hidden = !$('help').hidden;
    if (e.code === 'KeyV') cam.reset();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = 0; });
  window.addEventListener('blur', function () { keys = {}; });
  function k(a, b) { return (keys[a] || keys[b]) ? 1 : 0; }
  function readInput() {
    var t = k('KeyW') - k('KeyS') + touch.thr - touch.brk, y = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft') + touch.x,
      p = k('ArrowUp', 'KeyI') - k('ArrowDown', 'KeyK') + touch.y, l = k('Space', 'KeyR') - k('KeyC', 'KeyF') + touch.up - touch.dn,
      b = k('ShiftLeft', 'ShiftRight') || touch.boost;
    return SIM.cleanInput({ t: t, y: y, p: p, l: l, b: b });
  }
  function actionHeld() { return !!(keys.KeyE || touch.act); }

  /* joystick e botões de toque */
  (function () {
    var st = $('stick'), kn = $('knob'), sid = null;
    function mv(t) { var r = st.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = t.clientX - cx, dy = t.clientY - cy, m = r.width / 2 - 10, d = Math.hypot(dx, dy); if (d > m) { dx *= m / d; dy *= m / d; } kn.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; touch.x = Math.abs(dx / m) < 0.12 ? 0 : dx / m; touch.y = Math.abs(dy / m) < 0.12 ? 0 : -dy / m; }
    st.addEventListener('touchstart', function (e) { e.preventDefault(); sid = e.changedTouches[0].identifier; mv(e.changedTouches[0]); }, { passive: false });
    st.addEventListener('touchmove', function (e) { e.preventDefault(); [].forEach.call(e.changedTouches, function (t) { if (t.identifier === sid) mv(t); }); }, { passive: false });
    function end(e) { [].forEach.call(e.changedTouches, function (t) { if (t.identifier === sid) { sid = null; touch.x = touch.y = 0; kn.style.transform = ''; } }); }
    st.addEventListener('touchend', end); st.addEventListener('touchcancel', end);
    [].forEach.call(document.querySelectorAll('#btns button'), function (b) {
      var key = b.getAttribute('data-k');
      b.addEventListener('touchstart', function (e) { e.preventDefault(); touch[key] = 1; b.classList.add('on'); }, { passive: false });
      function off(e) { e.preventDefault(); touch[key] = 0; b.classList.remove('on'); }
      b.addEventListener('touchend', off, { passive: false }); b.addEventListener('touchcancel', off, { passive: false });
    });
    $('bCam').addEventListener('click', function () { cam.cycle(); });
    $('bHelp').addEventListener('click', function () { document.body.classList.toggle('showhelp'); });
  })();

  /* ---------- câmera em terceira pessoa ---------- */
  var cam = {
    dist: 24, yaw: 0, pitch: 0.22, presets: [16, 24, 38], pi: 1, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false,
    reset: function () { this.yaw = 0; this.pitch = 0.22; toast('Câmera centralizada', 700); },
    cycle: function () { this.pi = (this.pi + 1) % this.presets.length; this.dist = this.presets[this.pi]; this.yaw = 0; this.pitch = 0.22; toast('Câmera: ' + ['perto', 'média', 'longe'][this.pi], 700); }
  };
  (function () {
    var el = renderer.domElement, drag = null;
    el.addEventListener('mousedown', function (e) { drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('mouseup', function () { drag = null; });
    window.addEventListener('mousemove', function (e) { if (!drag) return; cam.yaw -= (e.clientX - drag.x) * 0.006; cam.pitch = Math.max(-0.9, Math.min(1.2, cam.pitch + (e.clientY - drag.y) * 0.005)); drag = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('wheel', function (e) { e.preventDefault(); cam.dist = Math.max(12, Math.min(70, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
    var tid = null, last = null;
    el.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; tid = t.identifier; last = { x: t.clientX, y: t.clientY }; }, { passive: true });
    el.addEventListener('touchmove', function (e) { [].forEach.call(e.changedTouches, function (t) { if (t.identifier !== tid) return; cam.yaw -= (t.clientX - last.x) * 0.008; cam.pitch = Math.max(-0.9, Math.min(1.2, cam.pitch + (t.clientY - last.y) * 0.006)); last = { x: t.clientX, y: t.clientY }; }); }, { passive: true });
    el.addEventListener('touchend', function () { tid = null; });
  })();
  function updateCamera(p, yaw, pitch, dt) {
    var f = SIM.forward(yaw + cam.yaw, pitch * 0.7 - cam.pitch);
    var want = new THREE.Vector3(p.x - f.x * cam.dist, p.y - f.y * cam.dist + cam.dist * 0.12, p.z - f.z * cam.dist);
    var fl = SIM.forward(yaw, pitch), look = new THREE.Vector3(p.x + fl.x * 10, p.y + fl.y * 10 + 1.5, p.z + fl.z * 10);
    var k = cam.init ? 1 - Math.exp(-dt * 7) : 1; cam.init = true;
    cam.pos.lerp(want, k); cam.look.lerp(look, Math.min(1, k * 1.6));
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
    var sp = SIM.speed(me); camera.fov += ((66 + Math.max(0, sp - C.MAX_V) * 0.25) - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  }

  /* ---------- objetivo, marcador e HUD ---------- */
  var target = null;
  function objective() {
    var dock = SIM.inDock(me), nr = SIM.nearestRich(me, stock), txt, step;
    if (dock && cargo > 0) { step = 'PASSO 3 · VENDER'; txt = (isTouch ? 'Toque em AÇÃO' : 'Aperte E') + ' para vender ' + cargo + ' cristais.'; target = null; }
    else if (cargo >= C.CARGO || (cargo > 0 && Math.hypot(me.x, me.y, me.z) < 110)) { step = 'PASSO 2 · VOLTAR'; txt = cargo >= C.CARGO ? 'Porão cheio! Pouse devagar na plataforma verde no topo da estação.' : 'Pouse devagar na plataforma verde no topo da estação para vender.'; target = { x: C.DOCK.x, y: C.DOCK.y, z: C.DOCK.z, dock: 1 }; }
    else if (nr && nr.d <= C.MINE_RANGE) { step = 'PASSO 1 · MINERAR'; txt = (isTouch ? 'Segure AÇÃO' : 'Segure E') + ' para minerar os cristais (' + cargo + '/' + C.CARGO + ').'; target = { x: nr.a.x, y: nr.a.y, z: nr.a.z }; }
    else { step = 'PASSO 1 · MINERAR'; txt = 'Voe até um asteroide com cristais azuis (' + cargo + '/' + C.CARGO + ').'; target = nr ? { x: nr.a.x, y: nr.a.y, z: nr.a.z } : null; }
    $('objStep').textContent = step; $('objTxt').textContent = txt;
  }
  var v3 = new THREE.Vector3();
  function placeMarker() {
    var mk = $('marker'); if (!target) { mk.style.display = 'none'; return; }
    mk.style.display = 'block'; mk.classList.toggle('rock', !target.dock);
    var d = Math.hypot(target.x - me.x, target.y - me.y, target.z - me.z);
    $('mkTxt').textContent = Math.round(d) + ' m';
    v3.set(target.x, target.y, target.z).project(camera);
    var behind = v3.z > 1, w = window.innerWidth, h = window.innerHeight, x = (v3.x + 1) / 2 * w, y = (1 - v3.y) / 2 * h;
    if (behind) { x = w - x; y = h - y; }
    var m = 60, edge = behind || x < m || x > w - m || y < m || y > h - m;
    mk.classList.toggle('edge', edge);
    if (edge) { var cx = w / 2, cy = h / 2, dx = x - cx, dy = y - cy; if (behind && Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; var s = Math.min((w / 2 - m) / Math.abs(dx || 1e-6), (h / 2 - m) / Math.abs(dy || 1e-6)); x = cx + dx * s; y = cy + dy * s; mk.querySelector('.arrow').style.transform = 'rotate(' + (Math.atan2(dy, dx) + Math.PI / 2) + 'rad)'; }
    else mk.querySelector('.arrow').style.transform = '';
    mk.style.left = x + 'px'; mk.style.top = y + 'px';
  }
  var pipsBuilt = false;
  function hud() {
    var sp = SIM.speed(me);
    $('tSpd').textContent = Math.round(sp); $('bSpd').style.width = Math.min(100, sp / C.BOOST_V * 100) + '%';
    $('tHull').textContent = Math.round(me.hull); $('bHull').style.width = me.hull + '%'; $('bHull').style.background = me.hull < 35 ? 'var(--red)' : '';
    $('tEn').textContent = Math.round(me.en); $('bEn').style.width = me.en + '%';
    if (!pipsBuilt) { $('pips').innerHTML = new Array(C.CARGO + 1).join('<i></i>'); pipsBuilt = true; }
    [].forEach.call($('pips').children, function (e, i) { e.classList.toggle('on', i < cargo); });
    $('tCargo').textContent = cargo + '/' + C.CARGO; $('tCr').textContent = cr;
  }

  /* ---------- laço principal ---------- */
  var acc = 0, last = performance.now(), hudT = 0;
  function renderPos() { var a = acc / C.TICK; return new THREE.Vector3(prev.x + (me.x - prev.x) * a, prev.y + (me.y - prev.y) * a, prev.z + (me.z - prev.z) * a); }
  function lerpAng(a, b, t) { var d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (started) {
      acc += dt;
      while (acc >= C.TICK) {
        acc -= C.TICK; prev = SIM.copy(me); var inp = readInput(), ev = {};
        SIM.step(me, inp, C.TICK, ev); lastInput = inp;
        if (online) { seq++; pend.push({ s: seq, i: inp }); if (pend.length > 120) pend.shift(); send({ t: 'in', s: seq, i: inp }); }
        else offlineTick();
        if (ev.dmg > 0) { flash(); toast('Colisão! Casco -' + Math.round(ev.dmg), 900); }
      }
      // ação: tocar perto da plataforma vende, segurar perto de asteroide minera
      var act = actionHeld(), nr = SIM.nearestRich(me, stock);
      if (act && !actPrev && SIM.inDock(me)) { online ? send({ t: 'sell' }) : offlineSell(); }
      mining = act && !SIM.inDock(me) && nr && nr.d <= C.MINE_RANGE && cargo < C.CARGO;
      if (act && !actPrev && !SIM.inDock(me) && (!nr || nr.d > C.MINE_RANGE)) toast(cargo >= C.CARGO ? 'Porão cheio. Volte para a estação.' : 'Nada para minerar aqui. Siga o marcador azul.', 1300);
      if (mining && performance.now() - mineAt >= C.MINE_T * 1000) { mineAt = performance.now(); online ? send({ t: 'mine', a: nr.a.i }) : offlineMine(nr.a); }
      actPrev = act;
    }

    var tt = now / 1000;
    corr.multiplyScalar(Math.exp(-dt * 10));
    var a = acc / C.TICK, p = renderPos().add(corr), yaw = lerpAng(prev.yaw, me.yaw, a), pitch = prev.pitch + (me.pitch - prev.pitch) * a;
    if (started) { myShip.position.copy(p); myShip.rotation.set(pitch, yaw, 0); } else { myShip.position.set(Math.cos(tt * 0.06 + 0.3) * 104, 34 + Math.sin(tt * 0.8) * 1.2, Math.sin(tt * 0.06 + 0.3) * 104); myShip.rotation.set(0, -(tt * 0.06 + 0.3), 0); }
    var u = myShip.userData; u.bank += ((-lastInput.y * 0.55) - u.bank) * Math.min(1, dt * 5); u.body.rotation.z = u.bank;
    engine(myShip, !started ? 0.7 : lastInput.t > 0 ? (lastInput.b && me.en > 1 ? 1.6 : lastInput.t) : 0, dt);
    if (mining && nr) { var nose = new THREE.Vector3(0, -0.3, -4.5).applyEuler(myShip.rotation).add(p), ap = rocks[nr.a.i].g.position, dir = new THREE.Vector3().subVectors(p, ap).normalize(); aimBeam(myBeam, nose, ap.clone().addScaledVector(dir, nr.a.r * 0.9)); myBeam.material.opacity = 0.6 + Math.random() * 0.4; } else myBeam.visible = false;

    // outras naves (interpoladas ~120 ms no passado)
    var rt = performance.now() - 120;
    others.forEach(function (o) {
      var b = o.buf; if (!b.length) { o.ship.visible = false; return; } o.ship.visible = true;
      while (b.length > 2 && b[1].t <= rt) b.shift();
      var s0 = b[0], s1 = b[1] || b[0], t = s1.t > s0.t ? Math.max(0, Math.min(1, (rt - s0.t) / (s1.t - s0.t))) : 1;
      o.ship.position.set(s0.x + (s1.x - s0.x) * t, s0.y + (s1.y - s0.y) * t, s0.z + (s1.z - s0.z) * t);
      o.ship.rotation.set(s0.pitch + (s1.pitch - s0.pitch) * t, lerpAng(s0.yaw, s1.yaw, t), 0);
      var ou = o.ship.userData; ou.bank += ((-s1.turn * 0.55) - ou.bank) * Math.min(1, dt * 5); ou.body.rotation.z = ou.bank;
      engine(o.ship, s1.thr === 2 ? 1.6 : s1.thr, dt);
      if (o.beamT > 0 && o.beamTo >= 0) { o.beamT -= dt; var r = rocks[o.beamTo].g.position, dd = new THREE.Vector3().subVectors(o.ship.position, r).normalize(); aimBeam(o.beam, o.ship.position, r.clone().addScaledVector(dd, SIM.AST[o.beamTo].r * 0.9)); } else o.beam.visible = false;
    });

    // animações do cenário
    rocks.forEach(function (r) { r.m.rotation.x += r.spin.x * dt; r.m.rotation.y += r.spin.y * dt; r.m.rotation.z += r.spin.z * dt; });
    crystMat.emissiveIntensity = 0.9 + Math.sin(tt * 3) * 0.3;
    blinkers.forEach(function (b, i) { b.visible = Math.sin(tt * 3 + i * 1.7) > -0.2; });
    padRing.material.color.setHex(SIM.inDock(me) ? 0xffffff : (Math.sin(tt * 4) > 0 ? 0x43e39a : 0x1f8a5a));

    if (started) updateCamera(p, yaw, pitch, dt);
    else { var ca = tt * 0.06; camera.position.set(Math.cos(ca) * 128, 46 + Math.sin(tt * 0.1) * 10, Math.sin(ca) * 128); camera.lookAt(isTouch && innerWidth < 760 ? 0 : -30 * Math.sin(ca + 1.57), 6, isTouch && innerWidth < 760 ? 0 : 30 * Math.cos(ca + 1.57)); }
    updateDust(camera.position);
    if (started) { hudT -= dt; if (hudT <= 0) { hudT = 0.1; hud(); objective(); } placeMarker(); }
    renderer.render(scene, camera);
  }

  /* ---------- tela inicial ---------- */
  var saved = ''; try { saved = localStorage.getItem('orbita_nome') || ''; } catch (e) {}
  $('nome').value = saved;
  function start() {
    myName = ($('nome').value || '').trim().slice(0, 16) || 'Piloto';
    try { localStorage.setItem('orbita_nome', myName); } catch (e) {}
    $('pName').textContent = myName; $('start').hidden = true; $('hud').hidden = false; started = true;
    if (isTouch) $('help').hidden = true; else setTimeout(function () { $('help').hidden = true; toast('Aperte H para ver os controles de novo', 2200); }, 20000);
    if (ws && ws.readyState === 1) hello(); else toast('Jogando offline (sem servidor).', 2200);
    renderList(); setNet(online);
  }
  try { myCi = Math.max(0, Math.min(COLORS.length - 1, +(localStorage.getItem('orbita_cor') || 0) | 0)); } catch (e) {}
  function pickColor(i) { myCi = i; myColor = COLORS[i]; paintShip(myShip, myColor); [].forEach.call($('cores').children, function (b, k) { b.classList.toggle('on', k === i); b.setAttribute('aria-checked', k === i); }); try { localStorage.setItem('orbita_cor', i); } catch (e) {} }
  $('cores').innerHTML = COLORS.map(function (c, i) { var h = '#' + ('00000' + c.toString(16)).slice(-6); return '<button type="button" role="radio" aria-label="Cor ' + (i + 1) + '" style="background:' + h + ';color:' + h + '"></button>'; }).join('');
  [].forEach.call($('cores').children, function (b, i) { b.addEventListener('click', function () { pickColor(i); }); });
  pickColor(myCi);
  // nave de exibição parada ao lado da estação na tela inicial
  myShip.position.set(0, 12, 130);
  $('entrar').addEventListener('submit', function (e) { e.preventDefault(); start(); });
  connect();
  requestAnimationFrame(frame);
  window.__orbita = { get me() { return me; }, get cargo() { return cargo; }, get online() { return online; }, keys: keys, cam: cam, others: others, stock: stock };
})();
