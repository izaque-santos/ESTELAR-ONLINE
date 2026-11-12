/* ÓRBITA — servidor: arquivos do jogo + WebSocket.
   O servidor é quem manda: ele roda a física com as entradas de cada piloto,
   confere mineração e venda, e devolve o estado oficial 20 vezes por segundo. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const SIM = require('../public/shared/sim');
const C = SIM.C;

const ROOT = path.join(__dirname, '..');
const FILES = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/style.css': ['public/style.css', 'text/css; charset=utf-8'],
  '/game.js': ['public/game.js', 'text/javascript; charset=utf-8'],
  '/vendor/three.min.js': ['public/vendor/three.min.js', 'text/javascript; charset=utf-8'],
  '/shared/sim.js': ['public/shared/sim.js', 'text/javascript; charset=utf-8']
};

function createServer(opts) {
  opts = opts || {};
  const server = http.createServer((req, res) => {
    const u = (req.url || '/').split('?')[0];
    if (u === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    const f = FILES[u];
    if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('não encontrado'); }
    fs.readFile(path.join(ROOT, f[0]), (err, data) => {
      if (err) { res.writeHead(500); return res.end('erro'); }
      res.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'no-cache' }); res.end(data);
    });
  });

  const wss = new WebSocketServer({ server, maxPayload: 4096 });
  const players = new Map();
  const stock = SIM.AST.map(a => (a.rich ? C.STOCK : 0));
  const regen = SIM.AST.map(() => 0);
  let nextId = 1;
  const MAX_PLAYERS = opts.maxPlayers || 40;

  function send(p, m) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(m)); }
  function all(m) { const s = JSON.stringify(m); players.forEach(p => { if (p.ws.readyState === 1) p.ws.send(s); }); }
  function cleanName(n) { n = String(n || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16); return n || 'Piloto'; }
  const COLORS = SIM.COLORS;

  function respawn(p, why) {
    p.s = SIM.newShip(); p.s.x += (Math.random() - 0.5) * 30; p.s.y += (Math.random() - 0.5) * 10;
    p.cargo = 0; send(p, { t: 'ev', k: 'respawn', why });
  }

  wss.on('connection', ws => {
    if (players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); return ws.close(); }
    let p = null;
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || typeof m.t !== 'string') return;
      if (!p) {
        if (m.t !== 'hi') return;
        p = { id: nextId++, ws, name: cleanName(m.name), color: COLORS[Number.isInteger(m.c) && m.c >= 0 && m.c < COLORS.length ? m.c : (nextId - 2) % COLORS.length], s: SIM.newShip(), ack: 0, input: SIM.cleanInput({}), tokens: 6, lastTok: Date.now(), cargo: 0, cr: 0, mineAt: 0, strikes: 0 };
        p.s.x += (Math.random() - 0.5) * 30;
        players.set(p.id, p);
        send(p, { t: 'welcome', id: p.id, color: p.color, s: p.s, stock, players: [...players.values()].map(q => ({ id: q.id, name: q.name, color: q.color })) });
        all({ t: 'join', id: p.id, name: p.name, color: p.color });
        return;
      }
      if (m.t === 'in') {
        /* limite de ritmo: no máximo uma entrada a cada 50 ms (com folga pequena).
           Quem manda mais rápido que o relógio (speed hack) tem a entrada descartada. */
        const now = Date.now();
        p.tokens = Math.min(6, p.tokens + (now - p.lastTok) / (C.TICK * 1000)); p.lastTok = now;
        if (p.tokens < 1) { p.strikes++; return; }
        p.tokens -= 1;
        const seq = Math.floor(+m.s);
        if (!(seq > p.ack)) return;
        p.ack = seq; p.input = SIM.cleanInput(m.i);
        const ev = {};
        SIM.step(p.s, p.input, C.TICK, ev);
        if (p.s.hull <= 0) respawn(p, 'destruida');
        return;
      }
      if (m.t === 'mine') {
        const a = SIM.AST[m.a | 0], now = Date.now();
        if (!a || !a.rich) return send(p, { t: 'ev', k: 'nao', msg: 'Esse asteroide não tem cristais.' });
        if (!SIM.canMine(p.s, a)) return send(p, { t: 'ev', k: 'nao', msg: 'Chegue mais perto do asteroide.' });
        if (p.cargo >= C.CARGO) return send(p, { t: 'ev', k: 'nao', msg: 'Porão cheio. Volte para a estação.' });
        if (stock[a.i] <= 0) return send(p, { t: 'ev', k: 'nao', msg: 'Asteroide esgotado. Procure outro.' });
        if (now - p.mineAt < C.MINE_T * 1000 - 60) return;
        p.mineAt = now; p.cargo++; stock[a.i]--; regen[a.i] = now;
        send(p, { t: 'ev', k: 'mined', cargo: p.cargo });
        all({ t: 'ast', i: a.i, n: stock[a.i], by: p.id });
        return;
      }
      if (m.t === 'sell') {
        if (!SIM.inDock(p.s)) return send(p, { t: 'ev', k: 'nao', msg: 'Pouse devagar na plataforma da estação para vender.' });
        if (p.cargo <= 0) return send(p, { t: 'ev', k: 'nao', msg: 'Porão vazio. Vá minerar.' });
        const ganho = p.cargo * C.PRICE; p.cr += ganho; p.cargo = 0; p.s.hull = C.HULL;
        send(p, { t: 'ev', k: 'sold', ganho, cr: p.cr });
        return;
      }
      if (m.t === 'ping') return send(p, { t: 'pong', c: m.c });
    });
    ws.on('close', () => { if (p) { players.delete(p.id); all({ t: 'leave', id: p.id }); } });
    ws.on('error', () => {});
  });

  /* estado oficial para todos, 20x por segundo */
  const tick = setInterval(() => {
    const now = Date.now();
    SIM.AST.forEach(a => { if (a.rich && stock[a.i] < C.STOCK && now - regen[a.i] > C.REGEN_T * 1000) { stock[a.i]++; regen[a.i] = now; all({ t: 'ast', i: a.i, n: stock[a.i] }); } });
    const P = [];
    players.forEach(p => { const s = p.s; P.push([p.id, +s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2), +s.yaw.toFixed(3), +s.pitch.toFixed(3), +p.input.y.toFixed(2), p.input.t > 0 ? (p.input.b ? 2 : 1) : 0]); });
    players.forEach(p => send(p, { t: 'snap', ack: p.ack, me: p.s, cargo: p.cargo, cr: p.cr, P }));
  }, C.TICK * 1000);

  server.on('close', () => clearInterval(tick));
  return { server, wss, players, stock };
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createServer().server.listen(port, () => console.log('ÓRBITA rodando em http://localhost:' + port));
}
module.exports = { createServer };
