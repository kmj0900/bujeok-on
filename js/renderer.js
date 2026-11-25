import { Tile } from './map.js';
import { ready, drawCell, TILE_CELL, EFFECT_CELL, ITEM_CELL, NINJA_ROW } from './sprites.js';
import { pathCells, entryInfo } from './hazard.js';
import { struggleNeeded } from './player.js';

// 임시 도형 렌더링 (스프라이트는 이후 단계에서 교체)
const COLORS = {
  floorA: '#6fae52',
  floorB: '#65a249',
  solid: '#4b5a4a',
  solidTop: '#7a8a76',
  crate: '#b9803f',
  crateEdge: '#6e4620',
};
const FONT = '"Malgun Gothic", sans-serif';

function isBorder(map, x, y) {
  return x === 0 || y === 0 || x === map.def.width - 1 || y === map.def.height - 1;
}

export function drawMap(ctx, map, sprites, time = 0) {
  drawTiles(ctx, map, sprites, time);
  const tint = map.def.theme && map.def.theme.tint;
  if (tint) { // 전용 타일이 생기기 전까지 맵 분위기를 색조로 구분한다
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, map.def.width * map.def.tileSize, map.def.height * map.def.tileSize);
  }
}

// 맵 theme.sheet에 해당하는 타일 시트(없으면 기본 tiles). 칸 순서는 모든 시트가 같다.
export function tileSheet(map, sprites) {
  if (!sprites) return null;
  const name = (map.def.theme && map.def.theme.sheet) || 'tiles';
  return sprites[name] ?? null;
}

// 물웅덩이를 놓을 바닥 칸(장식, 통과 가능): 좌표 해시로 고정. 네 모서리 시작 구역은 비운다.
export function isPuddle(map, x, y) {
  const theme = map.def.theme || {};
  if (!theme.puddles) return false; // 상자가 부서져도 웅덩이가 그대로 있도록 칸 종류와 무관하게 해시로만 정한다
  const w = map.def.width, h = map.def.height;
  if ((x <= 3 || x >= w - 4) && (y <= 3 || y >= h - 4)) return false;
  let hsh = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177) >>> 0;
  return (((hsh ^ (hsh >>> 16)) >>> 0) % 100) < (theme.puddles.rate ?? 12);
}

// ---- 폭포 계곡 외곽 테두리(2026-11-25): 방향마다 다른 타일을 시드로 한 번 정해 두고, 폭포·물길만 시간으로 움직인다(시각 전용, 판정 무관).
const WF = Object.freeze({ top: 0, left: 1, hedge: 2, stream: 3, streamRock: 4, fall: 5, foam: 6, corner: 7, shore: 8, grass: 9 });
const planCache = new WeakMap();

function hash3(x, y, seed) {
  let h = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul((seed | 0) + 7, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// 바위산 외곽 시트(border_mountain.png) 줄 구성
const MT = Object.freeze({ top: 0, left: 1, right: 2, deco: 3, lip: 4, sky: 5, corner: 6, floor: 7, topLip: 8, topCorner: 9 });

// 한 칸의 그리기 계획(맵 시드로 한 번만 정하고 맵 객체에 보관).
//  테두리: { kind: 'plain'|'fall'|'stream'|'sky', col, row, over?, rock?, ... } / 안쪽: { grass: 0~3, foam?, shore? }
export function borderPlan(map) {
  let plan = planCache.get(map);
  if (plan) return plan;
  const cfg = map.def.theme.borderStyle;
  const W = map.def.width, H = map.def.height, seed = map.seed ?? 0;
  const mountain = cfg.type === 'mountain';
  const fall = cfg.fall;
  plan = { cells: [], floorRow: mountain ? MT.floor : WF.grass };
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      const h = hash3(x, y, seed);
      const edge = y === 0 || y === H - 1 || x === 0 || x === W - 1;
      let c;
      if (!edge) {
        c = { grass: h % 4 };
        if (!mountain) {
          if (y === 1 && x >= fall.from && x <= fall.to) c.foam = x === fall.from ? 3 : x === fall.to ? 4 : (h >>> 5) % 3;
          if (x === W - 2) c.shore = (h >>> 3) % 3;
        }
      } else if (mountain) {
        const bottom = (over) => ({ kind: 'sky', sky: { row: MT.sky, col: 0 }, clouds: [{ row: MT.sky, col: 1, speed: 1 }, { row: MT.sky, col: 2, speed: 0.55 }], lip: over ? null : { row: MT.lip, col: h % 4 }, over });
        const topEdge = (over) => ({ kind: 'sky', sky: { row: MT.topLip, col: 4 }, clouds: [{ row: MT.sky, col: 1, speed: -0.8 }, { row: MT.sky, col: 2, speed: -0.4 }], lip: over ? null : { row: MT.topLip, col: h % 4 }, over }); // 위쪽 절벽: 구름은 아래쪽과 반대로 흐른다
        if (y === 0 && x === 0) c = topEdge({ row: MT.topCorner, col: 0 });
        else if (y === 0 && x === W - 1) c = topEdge({ row: MT.topCorner, col: 1 });
        else if (y === H - 1 && x === 0) c = bottom({ row: MT.corner, col: 2 });
        else if (y === H - 1 && x === W - 1) c = bottom({ row: MT.corner, col: 3 });
        else if (y === H - 1) c = bottom(null);
        else if (y === 0) c = topEdge(null);
        else if (x === 0) c = { kind: 'plain', row: MT.left, col: h % 4 };
        else if (y === 3 || y === H - 4) c = { kind: 'plain', row: MT.deco, col: (h >>> 4) % 2 };       // 붉은 수련 깃발
        else if (y === (H >> 1)) c = { kind: 'plain', row: MT.deco, col: 2 + ((h >>> 4) % 2) };           // 석등
        else c = { kind: 'plain', row: MT.right, col: h % 4 };
      } else {
        if (x === 0 && y === 0) c = { kind: 'plain', row: WF.corner, col: 0 };
        else if (x === 0 && y === H - 1) c = { kind: 'plain', row: WF.corner, col: 2 };
        else if (x === W - 1 && y === 0) c = { kind: 'stream', col: 0, over: { row: WF.corner, col: 1 } };
        else if (x === W - 1 && y === H - 1) c = { kind: 'stream', col: 0, over: { row: WF.corner, col: 3 } };
        else if (y === 0 && x >= fall.from && x <= fall.to) {
          c = { kind: 'fall', row: WF.fall, col: x === fall.from ? 0 : x === fall.to ? 3 : 1 + (h % 2) };
        } else if (y === 0) c = { kind: 'plain', row: WF.top, col: h % 4 };
        else if (y === H - 1) c = { kind: 'plain', row: WF.hedge, col: h % 4 };
        else if (x === 0) c = { kind: 'plain', row: WF.left, col: h % 4 };
        else c = { kind: 'stream', col: 0, rock: y >= 3 && y <= H - 4 && h % 5 === 0 };
      }
      row.push(c);
    }
    plan.cells.push(row);
  }
  planCache.set(map, plan);
  return plan;
}
export const waterfallPlan = borderPlan; // 예전 이름(테스트 호환)

function drawTiles(ctx, map, sprites, time = 0) {
  const ts = map.def.tileSize;
  const sheet = tileSheet(map, sprites);
  const theme = map.def.theme || {};
  const useSheet = !!sheet && ready(sheet);
  const bsheet = theme.borderStyle && sprites ? sprites[theme.borderStyle.sheet] : null;
  const useBorder = useSheet && !!bsheet && ready(bsheet);
  const plan = useBorder ? borderPlan(map) : null;
  const frame = Math.floor(time * 6) % 4;
  ctx.clearRect(0, 0, map.def.width * ts, map.def.height * ts);
  for (let y = 0; y < map.def.height; y++) {
    for (let x = 0; x < map.def.width; x++) {
      const px = x * ts, py = y * ts;
      const t = map.grid[y][x];
      if (useSheet) {
        const img = sheet;
        if (useBorder && isBorder(map, x, y)) {
          const c = plan.cells[y][x];
          if (c.kind === 'sky') { // 산 정상 절벽(위·아래): 하늘·안개 위로 구름이 옆으로 흐르고, 절벽 가장자리가 그 위를 덮는다
            drawCell(ctx, bsheet, c.sky.col, c.sky.row, px, py);
            for (const cl of c.clouds) drawScrollingX(ctx, bsheet, cl.col, cl.row, px, py, time * (theme.borderStyle.cloudSpeed ?? 5) * cl.speed);
            if (c.lip) drawCell(ctx, bsheet, c.lip.col, c.lip.row, px, py);
            if (c.over) drawCell(ctx, bsheet, c.over.col, c.over.row, px, py);
          } else if (c.kind === 'fall') drawScrolling(ctx, bsheet, c.col, px, py, time * (theme.borderStyle.fall.speed ?? 28), c.row); // 폭포는 아래로 흐른다
          else if (c.kind === 'stream') {
            drawCell(ctx, bsheet, frame, c.rock ? WF.streamRock : WF.stream, px, py); // 계곡 물길(프레임 애니메이션)
            if (c.over) drawCell(ctx, bsheet, c.over.col, c.over.row, px, py);
          } else drawCell(ctx, bsheet, c.col, c.row, px, py);
        } else if (t === Tile.SOLID && isBorder(map, x, y)) {
          const top = theme.topCell; // 위쪽 테두리 일부 칸을 따로 그린다(폭포 계곡의 폭포)
          const cell = top && y === 0 && x >= top.from && x <= top.to
            ? top.cell
            : TILE_CELL.treeA + ((x * 7 + y * 13) % (theme.borderCells ?? 3)); // 바깥 벽 = 숲(깊은 숲) / 절벽(폭포 계곡)
          if (top && cell === top.cell) drawScrolling(ctx, img, cell, px, py, time * (top.speed ?? 28)); // 폭포는 아래로 흐른다
          else drawCell(ctx, img, cell, 0, px, py);
        } else {
          if (theme.puddles && isPuddle(map, x, y)) {
            drawCell(ctx, img, theme.puddles.cells[(x * 3 + y) % theme.puddles.cells.length], 0, px, py);
          } else if (useBorder) {
            const g = plan.cells[y][x].grass; // 풀밭 4종: 시트 기본 2종 + 추가 2종(시드로 고정)
            if (g < 2) drawCell(ctx, img, g, 0, px, py); else drawCell(ctx, bsheet, g - 2, plan.floorRow, px, py);
          } else {
            drawCell(ctx, img, (x + y) % 2 ? TILE_CELL.grassA : TILE_CELL.grassB, 0, px, py);
          }
          const pc = useBorder ? plan.cells[y][x] : null;
          if (pc && pc.foam !== undefined) { // 폭포 아래 물보라·얕은 물가
            ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 3 + x);
            drawCell(ctx, bsheet, pc.foam, WF.foam, px, py);
            ctx.globalAlpha = 1;
          }
          if (pc && pc.shore !== undefined) drawCell(ctx, bsheet, pc.shore, WF.shore, px, py); // 오른쪽 물가 경계
          const sp = useBorder ? null : theme.splash; // (예전 방식) 폭포가 닿는 바닥의 물보라
          if (sp && y === 1 && x >= sp.from && x <= sp.to) {
            ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time * 3 + x);
            drawCell(ctx, img, sp.cell, 0, px, py);
            ctx.globalAlpha = 1;
          }
          if (t === Tile.SOLID) drawCell(ctx, img, TILE_CELL.rock, 0, px, py);
          else if (t === Tile.BREAKABLE) drawCell(ctx, img, TILE_CELL.crate, 0, px, py);
        }
        continue;
      }
      ctx.fillStyle = (x + y) % 2 ? COLORS.floorA : COLORS.floorB;
      ctx.fillRect(px, py, ts, ts);
      if (t === Tile.SOLID) {
        ctx.fillStyle = COLORS.solid;
        ctx.fillRect(px, py, ts, ts);
        ctx.fillStyle = COLORS.solidTop;
        ctx.fillRect(px + 3, py + 3, ts - 6, ts - 10);
      } else if (t === Tile.BREAKABLE) {
        ctx.fillStyle = COLORS.crateEdge;
        ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
        ctx.fillStyle = COLORS.crate;
        ctx.fillRect(px + 5, py + 5, ts - 10, ts - 10);
        ctx.fillStyle = COLORS.crateEdge;
        ctx.fillRect(px + 5, py + ts / 2 - 1, ts - 10, 2);
      }
    }
  }
}

// 세로로 이어지는(주기 8px) 칸 이미지를 offset(px)만큼 아래로 흘려 그린다.
function drawScrolling(ctx, img, cell, px, py, offset, row = 0) {
  const ts = 32;
  const o = Math.floor(offset) % ts;
  if (o === 0) { drawCell(ctx, img, cell, row, px, py); return; }
  ctx.drawImage(img, cell * ts, row * ts, ts, ts - o, px, py + o, ts, ts - o);
  ctx.drawImage(img, cell * ts, row * ts + ts - o, ts, o, px, py, ts, o);
}

// 가로로 이어지는(주기 32px) 칸 이미지를 offset(px)만큼 오른쪽으로 흘려 그린다(구름).
function drawScrollingX(ctx, img, cell, row, px, py, offset) {
  const ts = 32;
  const o = ((Math.floor(offset) % ts) + ts) % ts; // 음수 속도(왼쪽으로 흐름)도 처리
  if (o === 0) { drawCell(ctx, img, cell, row, px, py); return; }
  ctx.drawImage(img, cell * ts, row * ts, ts - o, ts, px + o, py, ts - o, ts);
  ctx.drawImage(img, cell * ts + ts - o, row * ts, o, ts, px, py, o, ts);
}

// 화면에 그릴 위치(칸 단위). 논리 좌표는 즉시 한 칸 이동하므로, 이동 쿨다운 진행률로 이전 칸→현재 칸을 보간한다.
export function visualPos(p) {
  const kMove = p.moveCooldown > 0 ? p.moveCooldown / p.moveInterval : 0; // 1→0
  const kSlide = p.slide > 0 ? p.slide / p.slideDur : 0; // 물살에 밀리는 중
  const k = Math.max(kMove, kSlide);
  return { x: p.x + (p.fromX - p.x) * k, y: p.y + (p.fromY - p.y) * k };
}

// 걷기 프레임: 정지 0, 이동 중에는 칸마다 발을 번갈아(1/3) 내딛는다.
export function walkFrame(p) {
  if (p.moveCooldown <= 0 && !(p.slide > 0)) return 0;
  return p.steps % 2 ? 1 : 3;
}

// 닌자 스프라이트(시트가 없으면 임시 도형). 탈락(ELIMINATED)은 수련장에서 퇴장하므로 그리지 않는다.
// 무적 중에는 깜박이며 머리 위에 별이 돌고, 봉인 중에는 보라색 수정에 갇힌다. 애니메이션은 game.time 기준이라 일시정지에 멈춘다.
export function drawPlayers(ctx, game, sprites) {
  const ts = game.map.def.tileSize;
  for (const p of game.players) {
    if (p.state === 'ELIMINATED') continue;
    const sealed = p.state === 'SEALED';
    const blink = p.invincible > 0 && Math.floor(p.invincible * 10) % 2 === 0;
    const v = visualPos(p);
    const sheet = sprites && sprites.ninja && sprites.ninja[p.id];
    if (!ready(sheet)) { drawPlayerFallback(ctx, game, p, v, sealed, blink); continue; }
    const px = v.x * ts, py = v.y * ts;
    // 그림자
    ctx.fillStyle = 'rgba(20, 40, 20, 0.35)';
    ctx.beginPath();
    ctx.ellipse(px + ts / 2, py + ts - 5, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = blink ? 0.4 : 1;
    drawCell(ctx, sheet, sealed ? 0 : walkFrame(p), NINJA_ROW[p.facing] ?? 0, px, py - 2);
    ctx.globalAlpha = 1;
    const fx = sprites.effects;
    if (ready(fx)) {
      if (sealed) { drawCell(ctx, fx, EFFECT_CELL.crystal, 0, px, py - 1); drawStruggle(ctx, p, px, py); }
      else if (p.invincible > 0) drawCell(ctx, fx, EFFECT_CELL.stars0 + (Math.floor(game.time * 6) % 2), 0, px, py - 7);
    }
  }
}

function drawPlayerFallback(ctx, game, p, v, sealed, blink) {
  const ts = game.map.def.tileSize;
  ctx.globalAlpha = blink ? 0.35 : 1;
  const px = v.x * ts + (ts - 24) / 2;
  const py = v.y * ts + (ts - 24) / 2;
  ctx.fillStyle = sealed ? '#8a8a8a' : p.color;
  ctx.fillRect(px, py, 24, 24);
  ctx.fillStyle = '#f2e9d0';
  ctx.fillRect(px, py + 6, 24, 4); // 머리띠
  ctx.fillStyle = '#1d2b1f';
  const eye = { up: [8, 2], down: [8, 14], left: [3, 11], right: [17, 11] }[p.facing];
  const side = p.facing === 'left' || p.facing === 'right';
  ctx.fillRect(px + eye[0], py + eye[1], 3, 3);
  ctx.fillRect(px + eye[0] + (side ? 0 : 7), py + eye[1] + (side ? 7 : 0), 3, 3);
  ctx.globalAlpha = 1;
  if (sealed) {
    ctx.fillStyle = '#c0392b';
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('봉인', v.x * ts + ts / 2, v.y * ts - 1);
    drawStruggle(ctx, p, v.x * ts, v.y * ts);
  }
}

// 봉인 탈출 연타 진행도(머리 위 칸). 이동키를 계속 눌러야 한다.
function drawStruggle(ctx, p, px, py) {
  const n = struggleNeeded(p), w = n > 12 ? 3 : 4, gap = 1, total = n * (w + gap) - gap;
  const x0 = Math.round(px + 16 - total / 2), y0 = py - 8;
  ctx.fillStyle = 'rgba(20, 20, 30, 0.8)';
  ctx.fillRect(x0 - 1, y0 - 1, total + 2, 6);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i < p.struggle ? '#ffd84a' : '#555a66';
    ctx.fillRect(x0 + i * (w + gap), y0, w, 4);
  }
}

// 바닥의 능력 두루마리. 위아래로 살짝 떠다니고(game.time 기준), 폭발이 끝나 나타난 것만 그린다.
const ITEM_FALLBACK = { speed: ['#3aa6d8', '속'], range: ['#e8590c', '범'], bomb: ['#8a4fe0', '부'] };
export function drawItems(ctx, game, sprites) {
  const ts = game.map.def.tileSize;
  const sheet = sprites && ready(sprites.items) ? sprites.items : null;
  for (const it of game.items) {
    if (!it.ready) continue;
    const bob = Math.round(Math.sin(game.time * 4 + it.x + it.y) * 1.5);
    if (sheet) { drawCell(ctx, sheet, ITEM_CELL[it.type], 0, it.x * ts, it.y * ts + bob); continue; }
    const [color, ch] = ITEM_FALLBACK[it.type];
    ctx.fillStyle = color;
    ctx.fillRect(it.x * ts + 6, it.y * ts + 6 + bob, ts - 12, ts - 12);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(ch, it.x * ts + ts / 2, it.y * ts + ts / 2 + 4 + bob);
  }
}

// 아이템을 먹은 닌자 머리 위에 떠오르며 사라지는 글자
const POPUP = { speed: ['속도 UP!', '#8fd8f5'], range: ['범위 UP!', '#ffb066'], bomb: ['부적 UP!', '#c9a5ff'] };
export function drawPopups(ctx, game) {
  const ts = game.map.def.tileSize;
  for (const pp of game.popups) {
    const p = game.players[pp.playerId];
    if (!p || p.state === 'ELIMINATED') continue;
    const v = visualPos(p);
    const [text, color] = POPUP[pp.itemType];
    const x = v.x * ts + ts / 2;
    const y = v.y * ts - 6 - pp.age * 18;
    ctx.globalAlpha = Math.min(1, (1 - pp.age) * 2.5);
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1d1208';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }
}

// 임시 부적: 노란 종이 + 붉은 문양. 퓨즈가 1초 미만이면 깜박인다.
export function drawBombs(ctx, game, sprites) {
  const ts = game.map.def.tileSize;
  const fx = sprites && ready(sprites.effects) ? sprites.effects : null;
  for (const b of game.bombs) {
    if (fx) {
      const rate = b.fuse < 1 ? 8 : 3; // 터지기 직전에는 더 빠르게 깜박
      drawCell(ctx, fx, EFFECT_CELL.bomb0 + (Math.floor(game.time * rate) % 2), 0, b.x * ts, b.y * ts);
      continue;
    }
    const cx = b.x * ts + ts / 2, cy = b.y * ts + ts / 2;
    const urgent = b.fuse < 1 && Math.floor(b.fuse * 8) % 2 === 0;
    ctx.fillStyle = '#3b2a14';
    ctx.fillRect(cx - 9, cy - 12, 18, 24);
    ctx.fillStyle = urgent ? '#ffffff' : '#f4d03f';
    ctx.fillRect(cx - 7, cy - 10, 14, 20);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(cx - 3, cy - 6, 6, 4);
    ctx.fillRect(cx - 1, cy - 2, 2, 8);
  }
}

// 임시 폭발: 칸마다 주황 바탕 + 노란 중심
export function drawExplosions(ctx, game, sprites) {
  const ts = game.map.def.tileSize;
  const fx = sprites && ready(sprites.effects) ? sprites.effects : null;
  for (const ex of game.explosions) {
    for (const c of ex.cells) {
      if (fx) {
        drawCell(ctx, fx, EFFECT_CELL.flame0 + (Math.floor(game.time * 12) % 3), 0, c.x * ts, c.y * ts);
        continue;
      }
      ctx.fillStyle = '#e67e22';
      ctx.fillRect(c.x * ts + 1, c.y * ts + 1, ts - 2, ts - 2);
      ctx.fillStyle = '#f9e44a';
      ctx.fillRect(c.x * ts + 8, c.y * ts + 8, ts - 16, ts - 16);
    }
  }
}

// 수리검 예고: 날아갈 칸을 붉게 깜박이고(남은 시간이 줄수록 빠르게), 들어오는 바깥 벽 칸에 진행 방향 화살표를 그린다.
// 예고한 줄 전체가 그대로 날아가는 경로다(바위·상자에 막히지 않는다). 애니메이션은 예고 남은 시간 기준이라 일시정지에 멈춘다.
export function drawHazardWarning(ctx, game) {
  const cur = game.hazard && game.hazard.current;
  if (!cur || cur.state !== 'warn') return;
  if (game.hazard.cfg.type === 'rockfall') { drawRockShadows(ctx, game, cur); return; }
  const ts = game.map.def.tileSize;
  const left = cur.timer;
  const rate = left < 0.5 ? 14 : 6;
  const pulse = Math.floor(left * rate) % 2 === 0;
  const water = game.hazard.cfg.type === 'current'; // 물살은 푸른색, 수리검은 붉은색
  for (const c of pathCells(game.map, cur.line)) {
    ctx.fillStyle = water
      ? (pulse ? 'rgba(60, 150, 235, 0.45)' : 'rgba(60, 150, 235, 0.2)')
      : (pulse ? 'rgba(220, 40, 40, 0.42)' : 'rgba(220, 40, 40, 0.18)');
    ctx.fillRect(c.x * ts, c.y * ts, ts, ts);
    ctx.strokeStyle = 'rgba(255, 220, 220, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x * ts + 0.5, c.y * ts + 0.5, ts - 1, ts - 1);
  }
  const e = entryInfo(game.map, cur.line);
  const cx = e.x * ts + ts / 2, cy = e.y * ts + ts / 2;
  const nx = -e.dy, ny = e.dx; // 진행 방향에 수직
  ctx.fillStyle = water ? (pulse ? '#4aa8ff' : '#a8d4ff') : (pulse ? '#ff5a4d' : '#ffb3a8');
  ctx.strokeStyle = '#1d1208';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + e.dx * 10, cy + e.dy * 10);
  ctx.lineTo(cx - e.dx * 8 + nx * 9, cy - e.dy * 8 + ny * 9);
  ctx.lineTo(cx - e.dx * 8 - nx * 9, cy - e.dy * 8 - ny * 9);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}

// 낙석 예고: 떨어질 칸마다 땅에 그림자 원이 점점 커지고 붉은 테두리가 깜박인다(남은 시간 기준이라 일시정지에 멈춘다).
function drawRockShadows(ctx, game, cur) {
  const ts = game.map.def.tileSize;
  const total = game.hazard.cfg.warnTime;
  const prog = 1 - Math.max(0, Math.min(1, cur.timer / total)); // 0 → 1
  const pulse = Math.floor(cur.timer * (cur.timer < 0.5 ? 14 : 6)) % 2 === 0;
  for (const c of cur.cells) {
    const cx = c.x * ts + ts / 2, cy = c.y * ts + ts / 2 + 3;
    const r = 5 + prog * 11;
    ctx.fillStyle = `rgba(25, 10, 8, ${0.25 + prog * 0.4})`;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = pulse ? 'rgba(255, 90, 70, 0.95)' : 'rgba(255, 190, 170, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, r + 3, (r + 3) * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

// 떨어지는 돌과 충돌 먼지(닌자 위에 그린다): 예고 마지막 0.35초에 위에서 내려오고, 떨어진 뒤에는 돌이 부서지며 먼지가 퍼진다.
export function drawRockfall(ctx, game, sprites) {
  const hz = game.hazard;
  const cur = hz && hz.current;
  if (!cur || hz.cfg.type !== 'rockfall') return;
  const ts = game.map.def.tileSize;
  const sheet = sprites ? tileSheet(game.map, sprites) : null;
  const drawRock = (px, py) => {
    if (sheet && ready(sheet)) { drawCell(ctx, sheet, TILE_CELL.rock, 0, px, py); return; }
    ctx.fillStyle = '#7a6a5a';
    ctx.beginPath(); ctx.ellipse(px + ts / 2, py + ts / 2, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a1d14'; ctx.lineWidth = 2; ctx.stroke();
  };
  if (cur.state === 'warn' && cur.timer < 0.35) {
    const t = cur.timer / 0.35; // 1 → 0
    for (const c of cur.cells) drawRock(c.x * ts, c.y * ts - Math.pow(t, 1.5) * 110);
  } else if (cur.state === 'fall') {
    const f = Math.min(1, cur.fallTime / hz.cfg.fallTime); // 0 → 1
    for (const c of cur.cells) {
      const px = c.x * ts, py = c.y * ts;
      if (f < 0.5) { ctx.globalAlpha = 1 - f * 2; drawRock(px, py); ctx.globalAlpha = 1; } // 부서지며 사라짐
      ctx.globalAlpha = 0.85 * (1 - f);
      ctx.fillStyle = '#d9c3a0';
      for (let i = 0; i < 8; i++) { // 사방으로 퍼지는 먼지
        const a = (Math.PI / 4) * i + c.x;
        const d = 6 + f * 16;
        const s = 5 - f * 3;
        ctx.fillRect(px + ts / 2 + Math.cos(a) * d - s / 2, py + ts / 2 + 3 + Math.sin(a) * d * 0.7 - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }
  }
}

// 흐르는 물살: 줄 전체를 푸르게 덮고, 흐르는 방향으로 움직이는 물결 줄무늬를 그린다. 시계는 흐른 시간 기준(일시정지에 멈춘다).
export function drawCurrent(ctx, game) {
  const cur = game.hazard && game.hazard.current;
  if (!cur || cur.state !== 'flow') return;
  const ts = game.map.def.tileSize;
  const e = entryInfo(game.map, cur.line);
  const fade = Math.max(0, Math.min(1, (cur.duration - cur.flowTime) / 0.4)); // 끝나기 0.4초 전부터 서서히 사라진다
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(60, 150, 235, 0.35)';
  for (const c of cur.path) ctx.fillRect(c.x * ts, c.y * ts, ts, ts);
  ctx.strokeStyle = 'rgba(235, 248, 255, 0.75)';
  ctx.lineWidth = 2;
  for (const c of cur.path) {
    const phase = ((cur.flowTime * 3 + (e.dx ? c.x : c.y) * 0.37) % 1 + 1) % 1; // 0..1, 칸마다 어긋나게
    const along = (phase - 0.5) * ts * 0.8;
    const cx = c.x * ts + ts / 2 + e.dx * along, cy = c.y * ts + ts / 2 + e.dy * along;
    ctx.beginPath();
    ctx.moveTo(cx - e.dx * 7, cy - e.dy * 7);
    ctx.lineTo(cx + e.dx * 7, cy + e.dy * 7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// 날아가는 수리검: 회전하는 네 갈래 별 + 짧은 꼬리. 시계는 game.time 기준.
export function drawShuriken(ctx, game) {
  const cur = game.hazard && game.hazard.current;
  if (!cur || cur.state !== 'fly' || !cur.path.length) return;
  const ts = game.map.def.tileSize;
  const e = entryInfo(game.map, cur.line);
  const first = cur.path[0];
  const p = Math.min(cur.pos, cur.path.length - 0.5);
  const x = (first.x + e.dx * p) * ts + ts / 2;
  const y = (first.y + e.dy * p) * ts + ts / 2;
  for (let i = 1; i <= 3; i++) { // 꼬리
    ctx.globalAlpha = 0.25 - i * 0.06;
    ctx.fillStyle = '#cfd6e4';
    ctx.fillRect(x - e.dx * i * 7 - 3, y - e.dy * i * 7 - 3, 6, 6);
  }
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(game.time * 22);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 11 : 4;
    const a = (Math.PI / 4) * i;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#e4e9f2';
  ctx.strokeStyle = '#1d1208';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = '#1d1208';
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function dim(ctx, alpha = 0.6) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function text(ctx, str, y, size, color = '#f2e9d0') {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.fillText(str, ctx.canvas.width / 2, y);
}

// 3·2·1 카운트다운
export function drawCountdown(ctx, game) {
  dim(ctx, 0.45);
  text(ctx, '수련 개시!', 150, 24);
  text(ctx, String(Math.ceil(game.countdown)), ctx.canvas.height / 2 + 30, 96, '#f9e44a');
}

// 시작 직후 잠깐 '시작!' 표시
export function drawStartBanner(ctx, game) {
  if (game.time >= 0.6) return;
  text(ctx, '시작!', ctx.canvas.height / 2 + 14, 56, '#f9e44a');
}

// ---------- 온라인 대전: 내 닌자 표시 ----------

// 내 닌자 머리 위에 위아래로 움직이는 화살표와 '나' 글자를 그린다.
export function drawYouMarker(ctx, game, playerId) {
  const p = game.players[playerId];
  if (!p || p.state === 'ELIMINATED') return;
  const ts = game.map.def.tileSize;
  const v = visualPos(p);
  const cx = Math.round(v.x * ts + ts / 2);
  const bob = Math.round(Math.sin(performance.now() / 160) * 2);
  const top = Math.round(v.y * ts) - 12 + bob;
  const color = p.uiColor ?? '#ffd45a';
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1d1208';
  ctx.strokeText('나', cx, top - 4);
  ctx.fillStyle = '#fff4c2';
  ctx.fillText('나', cx, top - 4);
  ctx.beginPath(); // 아래를 가리키는 삼각형
  ctx.moveTo(cx - 6, top);
  ctx.lineTo(cx + 6, top);
  ctx.lineTo(cx, top + 8);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// 카운트다운과 시작 직후에 "당신은 ○○ 닌자" 안내를 크게 보여 준다.
export function drawYouBanner(ctx, game, playerId) {
  if (game.phase === 'PLAYING' && game.time >= 2.5) return;
  const p = game.players[playerId];
  if (!p) return;
  const W = ctx.canvas.width, y = 272;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(40, y - 30, W - 80, 42);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#1d1208';
  ctx.font = `bold 24px ${FONT}`;
  const msg = p.name; // 흑영 닌자 / 녹림 닌자
  ctx.strokeText(msg, W / 2, y);
  ctx.fillStyle = p.uiColor ?? '#fff4c2';
  ctx.fillText(msg, W / 2, y);
  ctx.restore();
}
