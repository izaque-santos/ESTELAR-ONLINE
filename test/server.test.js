'use strict';
const assert = require('assert'); const WebSocket = require('ws'); const http = require('http');
const { createServer } = require('../server/server'); const SIM = require('../public/shared/sim'); const C = SIM.C;
const wait = ms => new Promise(r => setTimeout(r, ms));
function client(port, name) {
  return new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + port); const c = { ws, msgs: [], last: {} };
    ws.on('message', d => { const m = JSON.parse(d); c.msgs.push(m); c.last[m.t] = m; });
    ws.on('open', () => { ws.send(JSON.stringify({ t: 'hi', name })); res(c); }); });
}
const evs = (c, k) => c.msgs.filter(m => m.t === 'ev' && m.k === k);
(async () => {
  const g = createServer(); await new Promise(r => g.server.listen(0, r)); const port = g.server.address().port;
  const get = u => new Promise(r => http.get('http://127.0.0.1:' + port + u, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => r([res.statusCode, b])); }));
  assert.strictEqual((await get('/'))[0], 200); assert.strictEqual((await get('/shared/sim.js'))[0], 200); assert.strictEqual((await get('/../server/server.js'))[0], 404);
  const A = await client(port, 'Ana<script>'), B = await client(port, 'Beto'); await wait(200);
  assert(A.last.welcome && B.last.welcome, 'boas-vindas'); const pa = g.players.get(A.last.welcome.id);
  assert.strictEqual(pa.name, 'Anascript', 'nome limpo');
  assert(B.msgs.some(m => m.t === 'snap' && m.P.length === 2), 'B vê duas naves');
  // movimento pelo servidor
  const z0 = pa.s.z; for (let i = 1; i <= 20; i++) { A.ws.send(JSON.stringify({ t: 'in', s: i, i: { t: 1 } })); await wait(52); }
  await wait(120); assert(pa.s.z < z0 - 5, 'servidor moveu a nave'); assert(A.last.snap.ack === 20, 'ack');
  // speed hack: 300 entradas de uma vez -> quase todas descartadas
  const ack0 = pa.ack; for (let i = 1; i <= 300; i++) A.ws.send(JSON.stringify({ t: 'in', s: ack0 + i, i: { t: 1 } }));
  await wait(150); assert(pa.ack - ack0 <= 10, 'limite de ritmo (' + (pa.ack - ack0) + ')');
  // não dá para mandar posição: campos extras são ignorados
  const x0 = pa.s.x; await wait(60); A.ws.send(JSON.stringify({ t: 'in', s: pa.ack + 1, i: { x: 9999 }, x: 9999 })); await wait(80); assert(Math.abs(pa.s.x - x0) < 5, 'sem teleporte');
  // minerar longe falha
  const rich = SIM.AST.find(a => a.rich); A.ws.send(JSON.stringify({ t: 'mine', a: rich.i })); await wait(80);
  assert(evs(A, 'nao').length >= 1 && pa.cargo === 0, 'mineração longe recusada');
  // perto: funciona, com intervalo mínimo
  pa.s.x = rich.x + rich.r + 10; pa.s.y = rich.y; pa.s.z = rich.z; pa.s.vx = pa.s.vy = pa.s.vz = 0;
  A.ws.send(JSON.stringify({ t: 'mine', a: rich.i })); A.ws.send(JSON.stringify({ t: 'mine', a: rich.i })); await wait(100);
  assert.strictEqual(pa.cargo, 1, 'só um cristal por intervalo'); assert.strictEqual(g.stock[rich.i], C.STOCK - 1);
  assert(B.msgs.some(m => m.t === 'ast' && m.i === rich.i), 'outros veem o asteroide mudar');
  for (let i = 0; i < 4; i++) { await wait(C.MINE_T * 1000); A.ws.send(JSON.stringify({ t: 'mine', a: rich.i })); } await wait(100);
  assert.strictEqual(pa.cargo, 5);
  // vender fora da doca falha, na doca e devagar funciona
  A.ws.send(JSON.stringify({ t: 'sell' })); await wait(80); assert.strictEqual(pa.cargo, 5, 'venda fora da doca recusada');
  pa.s.x = 0; pa.s.y = 28; pa.s.z = 0; pa.s.vx = pa.s.vy = pa.s.vz = 0; pa.s.hull = 50;
  A.ws.send(JSON.stringify({ t: 'sell' })); await wait(80); assert.strictEqual(pa.cr, 5 * C.PRICE); assert.strictEqual(pa.cargo, 0); assert.strictEqual(pa.s.hull, C.HULL);
  // lixo na rede não derruba
  A.ws.send('{{{'); A.ws.send(JSON.stringify({ t: 'mine', a: 99999 })); A.ws.send(JSON.stringify({ t: 'in', s: 'x' })); await wait(80);
  assert.strictEqual(A.ws.readyState, 1);
  B.ws.close(); await wait(120); assert(A.msgs.some(m => m.t === 'leave'), 'saída avisada'); assert.strictEqual(g.players.size, 1);
  A.ws.close(); g.wss.close(); g.server.close();
  console.log('servidor: OK'); process.exit(0);
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
