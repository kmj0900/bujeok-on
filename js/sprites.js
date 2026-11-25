// 스프라이트 시트 로더. 이미지가 없거나 로딩에 실패하면 해당 시트만 null처럼 취급되어
// 렌더러가 임시 도형으로 대체한다(게임은 항상 실행된다).
// 시트 구성은 tools/make_sprites.py와 반드시 일치해야 한다.
export const CELL = 32;

export const TILE_CELL = Object.freeze({ grassA: 0, grassB: 1, rock: 2, crate: 3, treeA: 4, treeB: 5, treeC: 6 });
export const EFFECT_CELL = Object.freeze({ bomb0: 0, bomb1: 1, flame0: 2, flame1: 3, flame2: 4, crystal: 5, stars0: 6, stars1: 7 });
export const ITEM_CELL = Object.freeze({ speed: 0, range: 1, bomb: 2 });
export const NINJA_ROW = Object.freeze({ down: 0, up: 1, left: 2, right: 3 });
export const NINJA_FRAMES = 4;

const FILES = {
  tiles: 'tiles.png',
  tilesWaterfall: 'tiles_waterfall.png', // 폭포 계곡 맵용. 칸 순서는 tiles.png와 같다(돌길 2, 계곡 바위, 통나무 뗏목, 절벽 2, 폭포)
  bordersMountain: 'border_mountain.png', // 바위산 외곽 테두리(5칸×10줄, 줄 구성은 renderer.js의 MT)
  bordersWaterfall: 'border_waterfall.png', // 폭포 계곡 외곽 테두리(5칸×10줄, 줄 구성은 renderer.js의 WF)
  tilesMountain: 'tiles_mountain.png', // 바위산 맵용(7칸, 칸 순서는 tiles.png와 같다: 흙길 2, 바위, 광산 상자, 산 절벽 3)
  effects: 'effects.png',
  items: 'items.png',
  ninja: ['ninja_black.png', 'ninja_green.png'], // 플레이어 id 순서(0=흑영, 1=녹림)
};

function load(src) {
  const img = new Image();
  img.src = src;
  img.addEventListener('error', () => console.warn('스프라이트 로드 실패(도형으로 대체):', src));
  return img;
}

export function loadSprites(baseUrl = 'assets/sprites/') {
  return {
    tiles: load(baseUrl + FILES.tiles),
    tilesWaterfall: load(baseUrl + FILES.tilesWaterfall),
    bordersMountain: load(baseUrl + FILES.bordersMountain),
    bordersWaterfall: load(baseUrl + FILES.bordersWaterfall),
    tilesMountain: load(baseUrl + FILES.tilesMountain),
    effects: load(baseUrl + FILES.effects),
    items: load(baseUrl + FILES.items),
    ninja: FILES.ninja.map((f) => load(baseUrl + f)),
  };
}

// 로딩이 끝났고 깨지지 않은 이미지인지
export function ready(img) {
  return !!img && img.complete && img.naturalWidth > 0;
}

// 시트의 (col,row) 셀을 캔버스 (dx,dy)에 그린다.
export function drawCell(ctx, img, col, row, dx, dy) {
  ctx.drawImage(img, col * CELL, row * CELL, CELL, CELL, Math.round(dx), Math.round(dy), CELL, CELL);
}
