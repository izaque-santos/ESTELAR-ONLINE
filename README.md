# ÓRBITA — protótipo de jogo espacial 3D online

Navegador + celular, feito com **Three.js** (3D) e **Node + WebSocket** (multiplayer).

## Rodar
```
npm install
npm start        # http://localhost:3000
npm test         # física + servidor
```
No Render: Build `npm install`, Start `npm start`. Sem servidor (abrindo o `index.html` direto) o jogo roda offline, sozinho.

## Estrutura
- `public/shared/sim.js`: física, mundo e regras. O mesmo arquivo roda no servidor e no navegador.
- `server/server.js`: serve o jogo e é o servidor oficial (simula as naves, valida mineração e venda).
- `public/game.js`: cena 3D, nave, câmera, HUD, controles de teclado e toque, rede.
- `public/vendor/three.min.js`: Three.js r128 (biblioteca MIT).

## Como o multiplayer funciona
O cliente manda **só entradas** (acelerar, virar…) 20x por segundo, nunca a posição.
O servidor roda a física e devolve o estado oficial. O cliente prevê a própria nave e corrige suavemente.
Validações no servidor: ritmo de entradas (bloqueia speed hack), distância para minerar, intervalo entre cristais, estoque do asteroide, porão cheio, venda só pousado na plataforma e devagar, nome limpo, tamanho de mensagem.

## Controles
W/S acelerar/frear · A/D virar · ↑/↓ apontar · Espaço/C subir/descer · Shift turbo · E minerar (segurar) / vender (tocar) · mouse arrasta câmera, roda = zoom, V centraliza, H ajuda.
Celular: joystick (virar/apontar), ACELERAR, FREAR, ▲ ▼, TURBO, AÇÃO, CÂM.
