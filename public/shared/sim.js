/* ÓRBITA — simulação compartilhada (servidor e navegador usam o mesmo código).
   Mundo: estação no centro, campo de asteroides em volta, limite esférico.
   A nave é controlada por entradas (acelerar, frear, virar, subir/descer, turbo). */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.SIM = m;
})(this, function () {
  'use strict';

  var C = {
    TICK: 0.05,            // 20 passos por segundo
    WORLD_R: 900,          // raio da área jogável
    SHIP_R: 3,             // raio de colisão da nave
    MAX_V: 42, BOOST_V: 78,
    ACC: 34, BOOST_ACC: 62, BRAKE: 46, LIFT: 24, DRAG: 0.32,
    YAW: 1.7, PITCH: 1.25, PITCH_MAX: 1.35,
    HULL: 100, ENERGY: 100, BOOST_COST: 28, ENERGY_REGEN: 14,
    CARGO: 10, MINE_RANGE: 32, MINE_T: 0.6, PRICE: 12, STOCK: 6, REGEN_T: 18,
    DOCK: { x: 0, y: 31, z: 0, r: 13, v: 12 },
    SPAWN: { x: 0, y: 12, z: 130, yaw: 0 }
  };

  /* estação: casco central, anel externo e braços diagonais */
  var STATION = { hub: 22, ringR: 62, ringT: 5.5, spokes: [] };
  [0.785, 2.356, 3.927, 5.498].forEach(function (a) {
    [30, 40, 50].forEach(function (d) { STATION.spokes.push({ x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, r: 4 }); });
  });

  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* campo de asteroides determinístico: todo mundo gera o mesmo */
  function makeAsteroids(seed) {
    var R = rng(seed || 7), L = [], tries = 0;
    while (L.length < 64 && tries++ < 4000) {
      var d = 150 + R() * 520, th = R() * Math.PI * 2, ph = (R() - 0.5) * 1.1,
        x = Math.cos(th) * Math.cos(ph) * d, y = Math.sin(ph) * d * 0.55, z = Math.sin(th) * Math.cos(ph) * d,
        r = 6 + Math.pow(R(), 1.8) * 24, ok = true;
      for (var i = 0; i < L.length; i++) { var o = L[i]; if (Math.hypot(o.x - x, o.y - y, o.z - z) < o.r + r + 18) { ok = false; break; } }
      if (Math.hypot(x - C.SPAWN.x, y - C.SPAWN.y, z - C.SPAWN.z) < r + 40) ok = false;
      if (!ok) continue;
      L.push({ i: L.length, x: x, y: y, z: z, r: r, rich: R() < 0.32, seed: Math.floor(R() * 1e9) });
    }
    // garante alguns ricos perto da estação para o começo ser rápido
    L.slice().sort(function (a, b) { return Math.hypot(a.x, a.y, a.z) - Math.hypot(b.x, b.y, b.z); }).slice(0, 4).forEach(function (a) { a.rich = true; });
    return L;
  }
  var AST = makeAsteroids(7);

  function newShip() {
    return { x: C.SPAWN.x, y: C.SPAWN.y, z: C.SPAWN.z, vx: 0, vy: 0, vz: 0, yaw: C.SPAWN.yaw, pitch: 0, hull: C.HULL, en: C.ENERGY };
  }
  function copy(s) { return { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, yaw: s.yaw, pitch: s.pitch, hull: s.hull, en: s.en }; }
  function forward(yaw, pitch) { var c = Math.cos(pitch); return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c }; }
  function cl(v, a, b) { v = +v; if (!(v === v)) return 0; return v < a ? a : v > b ? b : v; }

  /* limpa uma entrada vinda da rede */
  function cleanInput(i) {
    i = i || {};
    return { t: cl(i.t, -1, 1), y: cl(i.y, -1, 1), p: cl(i.p, -1, 1), l: cl(i.l, -1, 1), b: i.b ? 1 : 0 };
  }

  function speed(s) { return Math.hypot(s.vx, s.vy, s.vz); }

  /* empurra a nave para fora de uma esfera; devolve a força do impacto */
  function pushSphere(s, ox, oy, oz, r) {
    var dx = s.x - ox, dy = s.y - oy, dz = s.z - oz, d = Math.hypot(dx, dy, dz), min = r + C.SHIP_R;
    if (d >= min) return 0;
    if (d < 1e-6) { dx = 0; dy = 1; dz = 0; d = 1; }
    var nx = dx / d, ny = dy / d, nz = dz / d;
    s.x = ox + nx * min; s.y = oy + ny * min; s.z = oz + nz * min;
    var vn = s.vx * nx + s.vy * ny + s.vz * nz;
    if (vn >= 0) return 0;
    s.vx -= nx * vn * 1.5; s.vy -= ny * vn * 1.5; s.vz -= nz * vn * 1.5;
    return -vn;
  }
  /* anel da estação (toro deitado no plano XZ) */
  function pushRing(s) {
    var h = Math.hypot(s.x, s.z); if (h < 1e-6) return 0;
    var qx = s.x / h * STATION.ringR, qz = s.z / h * STATION.ringR;
    return pushSphere(s, qx, 0, qz, STATION.ringT);
  }

  /* um passo de simulação. ev recebe o que aconteceu (batida) */
  function step(s, inp, dt, ev) {
    var i = cleanInput(inp); dt = dt || C.TICK;
    s.yaw -= i.y * C.YAW * dt;
    if (s.yaw > Math.PI) s.yaw -= Math.PI * 2; else if (s.yaw < -Math.PI) s.yaw += Math.PI * 2;
    s.pitch = cl(s.pitch + i.p * C.PITCH * dt, -C.PITCH_MAX, C.PITCH_MAX);
    var f = forward(s.yaw, s.pitch), boost = i.b && i.t > 0 && s.en > 1;
    if (i.t > 0) { var a = (boost ? C.BOOST_ACC : C.ACC) * i.t * dt; s.vx += f.x * a; s.vy += f.y * a; s.vz += f.z * a; }
    else if (i.t < 0) { var sp = speed(s), b = Math.min(sp, C.BRAKE * -i.t * dt); if (sp > 1e-6) { s.vx -= s.vx / sp * b; s.vy -= s.vy / sp * b; s.vz -= s.vz / sp * b; } }
    s.vy += C.LIFT * i.l * dt;
    var k = 1 - C.DRAG * dt; s.vx *= k; s.vy *= k; s.vz *= k;
    var max = boost ? C.BOOST_V : C.MAX_V, v = speed(s);
    if (v > max) { var m = Math.max(max / v, 1 - 2.2 * dt); s.vx *= m; s.vy *= m; s.vz *= m; }
    s.en = boost ? Math.max(0, s.en - C.BOOST_COST * dt) : Math.min(C.ENERGY, s.en + C.ENERGY_REGEN * dt);
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;

    var hit = 0;
    for (var n = 0; n < AST.length; n++) { var o = AST[n]; if (Math.abs(s.x - o.x) < o.r + 4 && Math.abs(s.z - o.z) < o.r + 4) hit = Math.max(hit, pushSphere(s, o.x, o.y, o.z, o.r)); }
    hit = Math.max(hit, pushSphere(s, 0, 0, 0, STATION.hub), pushRing(s));
    for (n = 0; n < STATION.spokes.length; n++) { var q = STATION.spokes[n]; hit = Math.max(hit, pushSphere(s, q.x, q.y, q.z, q.r)); }
    if (hit > 0) { var dmg = Math.max(0, hit - 9) * 1.4; s.hull = Math.max(0, s.hull - dmg); if (ev) { ev.hit = hit; ev.dmg = dmg; } }

    var d = Math.hypot(s.x, s.y, s.z);
    if (d > C.WORLD_R) { var nx = s.x / d, ny = s.y / d, nz = s.z / d, vo = s.vx * nx + s.vy * ny + s.vz * nz; s.x = nx * C.WORLD_R; s.y = ny * C.WORLD_R; s.z = nz * C.WORLD_R; if (vo > 0) { s.vx -= nx * vo; s.vy -= ny * vo; s.vz -= nz * vo; } if (ev) ev.edge = 1; }
    return s;
  }

  function inDock(s) { var D = C.DOCK; return Math.hypot(s.x - D.x, s.y - D.y, s.z - D.z) <= D.r && speed(s) <= D.v; }
  function canMine(s, a) { return !!a && a.rich && Math.hypot(s.x - a.x, s.y - a.y, s.z - a.z) - a.r <= C.MINE_RANGE; }
  function nearestRich(s, stock) {
    var best = null, bd = 1e9;
    AST.forEach(function (a) { if (!a.rich || (stock && !stock[a.i])) return; var d = Math.hypot(s.x - a.x, s.y - a.y, s.z - a.z) - a.r; if (d < bd) { bd = d; best = a; } });
    return best ? { a: best, d: bd } : null;
  }

  var COLORS = [0x38bdf8, 0xf97316, 0xa3e635, 0xf472b6, 0xfacc15, 0x2dd4bf, 0xc084fc, 0xf87171];
  return { COLORS: COLORS, C: C, STATION: STATION, AST: AST, rng: rng, newShip: newShip, copy: copy, step: step, forward: forward, cleanInput: cleanInput, speed: speed, inDock: inDock, canMine: canMine, nearestRich: nearestRich };
});
