'use strict';
const assert = require('assert'); const SIM = require('../public/shared/sim'); const C = SIM.C;
let s = SIM.newShip();
for (let i = 0; i < 40; i++) SIM.step(s, { t: 1 }, C.TICK);
assert(s.z < C.SPAWN.z - 20, 'acelera para frente'); assert(SIM.speed(s) <= C.MAX_V + 0.5, 'respeita velocidade máxima');
const v1 = SIM.speed(s); for (let i = 0; i < 10; i++) SIM.step(s, { t: -1 }, C.TICK); assert(SIM.speed(s) < v1 - 15, 'freia');
const y0 = s.yaw; SIM.step(s, { y: 1 }, C.TICK); assert(s.yaw < y0, 'vira à direita');
const h0 = s.y; for (let i = 0; i < 10; i++) SIM.step(s, { l: 1 }, C.TICK); assert(s.y > h0 + 3, 'sobe reto');
s = SIM.newShip(); for (let i = 0; i < 100; i++) SIM.step(s, { p: 1 }, C.TICK); assert(s.pitch <= C.PITCH_MAX + 1e-9, 'limite de inclinação');
// turbo gasta energia e passa do limite normal
s = SIM.newShip(); for (let i = 0; i < 60; i++) SIM.step(s, { t: 1, b: 1 }, C.TICK); assert(s.en < C.ENERGY - 30 && SIM.speed(s) > C.MAX_V + 5, 'turbo');
// bater na estação: não atravessa e perde casco
s = SIM.newShip(); s.x = 0; s.y = 0; s.z = 60; s.vz = -70; const ev = {}; for (let i = 0; i < 30; i++) SIM.step(s, {}, C.TICK, ev);
assert(Math.hypot(s.x, s.y, s.z) >= SIM.STATION.hub + C.SHIP_R - 0.01, 'não atravessa a estação'); assert(s.hull < C.HULL, 'colisão causa dano');
// asteroides: não atravessa
const a = SIM.AST[0]; s = SIM.newShip(); s.x = a.x + a.r + 20; s.y = a.y; s.z = a.z; s.vx = -60; for (let i = 0; i < 30; i++) SIM.step(s, {}, C.TICK);
assert(Math.hypot(s.x - a.x, s.y - a.y, s.z - a.z) >= a.r + C.SHIP_R - 0.01, 'não atravessa asteroide');
// limite do mundo
s = SIM.newShip(); s.x = C.WORLD_R - 1; s.y = 0; s.z = 0; s.vx = 80; SIM.step(s, {}, C.TICK); assert(Math.hypot(s.x, s.y, s.z) <= C.WORLD_R + 1e-6, 'limite do setor');
// entradas malucas são limitadas
const ci = SIM.cleanInput({ t: 99, y: 'x', p: NaN, l: -5, b: 'sim' }); assert.deepStrictEqual(ci, { t: 1, y: 0, p: 0, l: -1, b: 1 });
// doca: na plataforma e devagar
s = SIM.newShip(); s.x = 0; s.y = 28; s.z = 0; s.vx = s.vy = s.vz = 0; assert(SIM.inDock(s)); s.vy = 30; assert(!SIM.inDock(s));
assert(SIM.AST.length >= 40 && SIM.AST.filter(x => x.rich).length >= 10, 'campo de asteroides');
console.log('sim: OK (' + SIM.AST.length + ' asteroides, ' + SIM.AST.filter(x => x.rich).length + ' com cristais)');
