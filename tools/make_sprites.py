#!/usr/bin/env python3
"""부적소동 도트 스프라이트 생성기 (Pillow 필요, 게임 실행에는 불필요).

모든 그림은 이 스크립트가 직접 찍는 도트로 만든다(원작·AI 생성 이미지를 복사하지 않음).
사용: python tools/make_sprites.py [출력 폴더, 기본 assets/sprites]
셀 크기는 32x32. 시트 구성은 js/sprites.js와 반드시 일치해야 한다.
  tiles.png        : 가로 7칸  grassA, grassB, rock, crate, treeA, treeB, treeC
  tiles_waterfall.png : 가로 10칸  같은 순서 + (7,8 물웅덩이 바닥, 9 폭포 물보라 오버레이). 폭포 계곡 맵용
  border_mountain.png : 5칸 x 10줄 바위산 외곽 테두리·절벽·구름·깃발·석등·바닥 암석(줄 구성은 코드 주석 참고)
  border_waterfall.png : 5칸 x 10줄 폭포 계곡 외곽 테두리(줄별 구성은 코드 주석 참고)
  tiles_mountain.png : 가로 7칸  dirtA, dirtB, boulder, mineCrate, cliffA, cliffB, cliffC. 바위산 맵용
  effects.png      : 가로 8칸  bomb0, bomb1, flame0, flame1, flame2, crystal, stars0, stars1
  items.png        : 가로 3칸  speed(경공술), range(화약 강화), bomb(부적 두루마리)
  ninja_black.png  : 4x4  행 = down, up, left, right / 열 = 걷기 프레임 0~3 (0=정지)
  ninja_green.png  : 같은 구성
"""
import math
import os
import random
import sys
from PIL import Image

S = 32


def C(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class Cv:
    def __init__(self, w=S, h=S):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.p = self.im.load()
        self.w, self.h = w, h

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.p[x, y] = c

    def get(self, x, y):
        return self.p[x, y] if 0 <= x < self.w and 0 <= y < self.h else (0, 0, 0, 0)

    def rect(self, x0, y0, x1, y1, c):  # x1, y1 포함
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c)

    def ell(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.px(x, y, c)

    def outline(self, c, min_alpha=1):
        src = [[self.p[x, y] for x in range(self.w)] for y in range(self.h)]
        for y in range(self.h):
            for x in range(self.w):
                if src[y][x][3] >= min_alpha:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and src[ny][nx][3] >= 200:
                        self.p[x, y] = c
                        break


def mix(base, line, a):
    """바닥 픽셀(base)에 선 색(line)을 a(0~1)만큼 섞은 불투명 색. 반투명 픽셀은 캔버스 뒤 배경이 비쳐 검은 격자선이 되므로 쓰지 않는다."""
    return tuple(int(base[i] * (1 - a) + line[i] * a) for i in range(3)) + (255,)


OUT = C('#16121f')

# ---------------------------------------------------------------- 닌자
THEMES = {
    'black': dict(suit=C('#33364a'), hi=C('#51566f'), lo=C('#21232f'),
                  scarf=C('#d9362b'), scarf_hi=C('#f26b4f'), scarf_lo=C('#9c211b'),
                  plate=C('#cfd3df'), plate_lo=C('#8f95a8')),
    'green': dict(suit=C('#3f8a49'), hi=C('#6cbf5c'), lo=C('#2a5c33'),
                  scarf=C('#ead29d'), scarf_hi=C('#fbeabf'), scarf_lo=C('#b7956a'),
                  plate=C('#ead29d'), plate_lo=C('#b7956a')),
}
SKIN, SKIN_LO, EYE, WHITE = C('#f6d3ab'), C('#dba67d'), C('#1a1522'), C('#ffffff')
BLUSH = C('#f0a08a')


def ninja_front(t, frame, back=False):
    """정면(아래) 또는 뒷모습(위)."""
    cv = Cv()
    bob = -1 if frame in (1, 3) else 0
    swing = {0: 0, 1: 1, 2: 0, 3: -1}[frame]  # 팔·발 흔들림
    # 발
    lf = 26 + (1 if swing > 0 else 0) + (-1 if swing < 0 else 0) * 0
    rf = 26 + (1 if swing < 0 else 0)
    ly = 26 - (1 if swing < 0 else 0)
    ry = 26 - (1 if swing > 0 else 0)
    cv.rect(10, ly, 14, ly + 2, t['lo'])
    cv.rect(17, ry, 21, ry + 2, t['lo'])
    cv.rect(10, ly, 14, ly, t['suit'])
    cv.rect(17, ry, 21, ry, t['suit'])
    # 몸통
    cv.rect(11, 19 + bob, 21, 26 + bob, t['suit'])
    cv.rect(11, 19 + bob, 13, 26 + bob, t['hi'])
    cv.rect(19, 19 + bob, 21, 26 + bob, t['lo'])
    # 허리띠
    cv.rect(11, 24 + bob, 21, 25 + bob, t['scarf_lo'])
    # 팔
    la = 20 + bob + (1 if swing > 0 else 0)
    ra = 20 + bob + (1 if swing < 0 else 0)
    cv.rect(8, la, 10, la + 4, t['suit'])
    cv.rect(22, ra, 24, ra + 4, t['suit'])
    cv.rect(8, la + 4, 10, la + 5, SKIN)
    cv.rect(22, ra + 4, 24, ra + 5, SKIN)
    # 목도리
    cv.rect(10, 17 + bob, 22, 20 + bob, t['scarf'])
    cv.rect(10, 17 + bob, 22, 17 + bob, t['scarf_hi'])
    cv.rect(10, 20 + bob, 22, 20 + bob, t['scarf_lo'])
    cv.rect(15, 21 + bob, 17, 23 + bob, t['scarf'])      # 매듭 끝자락
    cv.rect(15, 23 + bob, 17, 23 + bob, t['scarf_lo'])
    # 머리(후드)
    cv.ell(16, 11 + bob, 11, 9.5, t['suit'])
    cv.ell(13, 8 + bob, 6, 4, t['hi'])
    if not back:
        cv.ell(21, 15 + bob, 8, 5, t['lo'])
    if not back:
        # 얼굴
        cv.ell(16, 13 + bob, 8, 5.6, SKIN)
        cv.rect(9, 9 + bob, 23, 10 + bob, SKIN_LO)  # 이마 그림자
        cv.rect(8, 11 + bob, 24, 14 + bob, SKIN)
        # 눈
        for ex in (11, 19):
            cv.rect(ex, 11 + bob, ex + 2, 14 + bob, EYE)
            cv.px(ex, 11 + bob, WHITE)
            cv.px(ex + 1, 11 + bob, WHITE)
        cv.px(10, 15 + bob, BLUSH)
        cv.px(22, 15 + bob, BLUSH)
        cv.px(15, 16 + bob, SKIN_LO)
        cv.px(16, 16 + bob, SKIN_LO)
        # 이마 보호대
        cv.rect(7, 6 + bob, 25, 8 + bob, t['plate'])
        cv.rect(7, 8 + bob, 25, 8 + bob, t['plate_lo'])
        cv.rect(14, 6 + bob, 18, 8 + bob, t['plate_lo'])
        cv.rect(15, 7 + bob, 17, 7 + bob, t['plate'])
    else:
        cv.rect(7, 8 + bob, 25, 10 + bob, t['scarf'])
        cv.rect(7, 8 + bob, 25, 8 + bob, t['scarf_hi'])
        cv.rect(7, 10 + bob, 25, 10 + bob, t['scarf_lo'])
        sway = 1 if frame in (1, 3) else 0
        cv.rect(14, 11 + bob, 18, 12 + bob, t['scarf'])          # 매듭
        cv.rect(12, 12 + bob, 14, 17 + bob + sway, t['scarf'])     # 늘어진 끈 두 가닥
        cv.rect(18, 12 + bob, 20, 16 + bob - sway + 1, t['scarf_lo'])
        cv.rect(12, 17 + bob + sway, 14, 17 + bob + sway, t['scarf_lo'])
        cv.rect(15, 13 + bob, 17, 16 + bob, t['hi'])                # 뒤통수 하이라이트
    cv.outline(OUT)
    return cv.im


def ninja_side(t, frame):
    """왼쪽을 바라보는 옆모습. 오른쪽은 좌우 반전."""
    cv = Cv()
    bob = -1 if frame in (1, 3) else 0
    swing = {0: 0, 1: 1, 2: 0, 3: -1}[frame]
    # 발(앞뒤로)
    fx = 12 - swing * 2
    bx = 17 + swing * 2
    cv.rect(bx, 26, bx + 4, 28, t['lo'])
    cv.rect(fx, 26 - (1 if swing > 0 else 0), fx + 4, 28 - (1 if swing > 0 else 0), t['suit'])
    cv.rect(fx, 26 - (1 if swing > 0 else 0), fx + 4, 26 - (1 if swing > 0 else 0), t['hi'])
    # 몸통
    cv.rect(12, 19 + bob, 20, 26 + bob, t['suit'])
    cv.rect(12, 19 + bob, 14, 26 + bob, t['hi'])
    cv.rect(18, 19 + bob, 20, 26 + bob, t['lo'])
    cv.rect(12, 23 + bob, 20, 24 + bob, t['scarf_lo'])
    # 팔(앞팔)
    ax = 13 + swing
    cv.rect(ax, 20 + bob, ax + 3, 24 + bob, t['hi'])
    cv.rect(ax, 24 + bob, ax + 3, 25 + bob, SKIN)
    # 목도리와 꼬리(뒤로 휘날림)
    cv.rect(11, 17 + bob, 21, 20 + bob, t['scarf'])
    cv.rect(11, 17 + bob, 21, 17 + bob, t['scarf_hi'])
    cv.rect(11, 20 + bob, 21, 20 + bob, t['scarf_lo'])
    ty = 18 + bob + (1 if frame in (1, 3) else 0)
    cv.rect(21, ty, 26, ty + 2, t['scarf'])
    cv.rect(25, ty + 1, 28, ty + 3, t['scarf'])
    cv.rect(27, ty + 2, 28, ty + 3, t['scarf_lo'])
    # 머리
    cv.ell(17, 11 + bob, 10.5, 9.5, t['suit'])
    cv.ell(14, 8 + bob, 5, 4, t['hi'])
    cv.ell(22, 14 + bob, 6, 5, t['lo'])
    # 얼굴(왼쪽)
    cv.ell(12, 13 + bob, 6, 5.4, SKIN)
    cv.rect(7, 11 + bob, 14, 14 + bob, SKIN)
    cv.rect(8, 9 + bob, 15, 10 + bob, SKIN_LO)
    cv.rect(10, 11 + bob, 12, 14 + bob, EYE)
    cv.px(10, 11 + bob, WHITE)
    cv.px(11, 11 + bob, WHITE)
    cv.px(8, 15 + bob, BLUSH)
    cv.px(9, 16 + bob, SKIN_LO)
    # 이마 보호대와 뒤통수 매듭
    cv.rect(6, 6 + bob, 24, 8 + bob, t['plate'])
    cv.rect(6, 8 + bob, 24, 8 + bob, t['plate_lo'])
    cv.rect(8, 6 + bob, 11, 8 + bob, t['plate_lo'])
    ky = 9 + bob + (1 if frame in (1, 3) else 0)
    cv.rect(24, 7 + bob, 27, 9 + bob, t['scarf'])
    cv.rect(26, ky + 2, 29, ky + 4, t['scarf'])
    cv.rect(28, ky + 3, 29, ky + 4, t['scarf_lo'])
    cv.outline(OUT)
    return cv.im


def ninja_sheet(name):
    t = THEMES[name]
    sheet = Image.new('RGBA', (S * 4, S * 4), (0, 0, 0, 0))
    for f in range(4):
        sheet.paste(ninja_front(t, f, False), (f * S, 0))
        sheet.paste(ninja_front(t, f, True), (f * S, S))
        left = ninja_side(t, f)
        sheet.paste(left, (f * S, 2 * S))
        sheet.paste(left.transpose(Image.FLIP_LEFT_RIGHT), (f * S, 3 * S))
    return sheet


# ---------------------------------------------------------------- 타일
def grass(variant):
    rnd = random.Random(100 + variant)
    base = [C('#7dbd5a'), C('#75b553')][variant]
    cv = Cv()
    cv.rect(0, 0, S - 1, S - 1, base)
    for _ in range(16):
        x, y = rnd.randrange(1, S - 2), rnd.randrange(2, S - 1)
        c = rnd.choice([C('#62a548'), C('#62a548'), C('#97d46c')])
        cv.px(x, y, c)
        cv.px(x, y - 1, c)
    for _ in range(3):
        x, y = rnd.randrange(2, S - 3), rnd.randrange(2, S - 3)
        cv.px(x, y, C('#fff3b0'))
        cv.px(x + 1, y, C('#fff3b0'))
        cv.px(x, y + 1, C('#f4a6c0') if rnd.random() < 0.5 else C('#ffffff'))
    # 은은한 격자(칸 구분)
    for i in range(S):
        cv.px(i, 0, C('#6aa84c', 120))
        cv.px(0, i, C('#6aa84c', 120))
    return cv.im


def rock():
    cv = Cv()
    cv.ell(16, 28, 12, 3, C('#2b4d21', 110))  # 바닥 그림자
    cv.ell(16, 18, 13, 11, C('#8c92a1'))
    cv.ell(16, 20, 13, 9, C('#7d8392'))
    cv.ell(11, 13, 8, 5, C('#b8becb'))
    cv.ell(10, 12, 4, 2, C('#dfe3ea'))
    for y in range(14, 30):  # 오른쪽 아래 음영
        for x in range(4, 30):
            if cv.get(x, y)[3] and (x - 16) + (y - 18) > 11:
                cv.px(x, y, C('#626877'))
    # 이끼
    for (mx, my, rx, ry) in ((20, 9, 6, 3), (14, 8, 4, 2), (25, 14, 3, 2)):
        cv.ell(mx, my, rx, ry, C('#5ca43f'))
    cv.ell(19, 8, 3, 1.5, C('#86cf5a'))
    cv.px(8, 20, C('#4a4f5c')); cv.px(9, 21, C('#4a4f5c')); cv.px(10, 22, C('#4a4f5c'))
    cv.px(22, 19, C('#4a4f5c')); cv.px(22, 20, C('#4a4f5c')); cv.px(23, 21, C('#4a4f5c'))
    cv.outline(OUT)
    return cv.im


def crate():
    cv = Cv()
    cv.ell(16, 29, 12, 2.5, C('#2b4d21', 110))
    cv.rect(3, 5, 28, 28, C('#a9722f'))
    cv.rect(3, 5, 28, 9, C('#d99c52'))      # 윗면
    cv.rect(3, 9, 28, 9, C('#8a5722'))
    for y in (15, 21):                       # 판자 틈
        cv.rect(4, y, 27, y, C('#7a4a1c'))
    cv.rect(3, 5, 4, 28, C('#d09048'))      # 왼쪽 하이라이트
    cv.rect(27, 5, 28, 28, C('#7a4a1c'))    # 오른쪽 그림자
    cv.rect(3, 27, 28, 28, C('#6e4620'))
    for i in range(0, 18):                   # 가새
        cv.px(6 + i, 11 + i, C('#8a5722'))
        cv.px(7 + i, 11 + i, C('#8a5722'))
        cv.px(25 - i, 11 + i, C('#8a5722'))
        cv.px(24 - i, 11 + i, C('#8a5722'))
    for (nx, ny) in ((5, 7), (26, 7), (5, 26), (26, 26)):
        cv.px(nx, ny, C('#f0e2b6'))
    cv.outline(OUT)
    return cv.im


def tree(variant):
    rnd = random.Random(300 + variant)
    cv = Cv()
    cv.rect(0, 0, S - 1, S - 1, C('#2a5a33'))   # 불투명 바닥(테두리 칸이 비지 않게)
    for _ in range(10):
        cv.px(rnd.randrange(S), rnd.randrange(S), C('#234b2b'))
    cv.ell(16, 16, 15, 14, C('#2f6b3a'))
    cv.ell(15, 14, 12.5, 11.5, C('#3b8444'))
    for _ in range(9):                        # 잎 덩어리
        cx, cy = rnd.randrange(6, 26), rnd.randrange(5, 24)
        cv.ell(cx, cy, rnd.randint(3, 5), rnd.randint(2, 4), C('#4a9b4d'))
    for _ in range(7):
        cx, cy = rnd.randrange(6, 22), rnd.randrange(4, 18)
        cv.ell(cx, cy, rnd.randint(2, 3), rnd.randint(1, 2), C('#76c768'))
    for _ in range(6):
        cv.px(rnd.randrange(6, 26), rnd.randrange(6, 26), C('#255a2d'))
    if variant == 2:
        for (fx, fy) in ((10, 20), (21, 11)):
            cv.px(fx, fy, C('#ff8fa3')); cv.px(fx + 1, fy, C('#ff8fa3')); cv.px(fx, fy + 1, C('#ffd2dc'))
    cv.ell(16, 29, 8, 2, C('#1c3d23', 120))
    return cv.im


# ---------------------------------------------------------------- 폭포 계곡 타일 (앞 7칸은 tiles.png와 같은 순서, 뒤 3칸은 웅덩이 2·물보라)
def stone_path(variant):
    """폭포 계곡 바닥(이름은 예전 돌길 그대로): 숲보다 청록 기가 도는 밝은 풀밭. 참고 그림처럼 물가 풀밭 느낌."""
    rnd = random.Random(500 + variant)
    base = [C('#68ab70'), C('#62a46a')][variant]
    cv = Cv()
    cv.rect(0, 0, S - 1, S - 1, base)
    for _ in range(18):                      # 풀잎
        x, y = rnd.randrange(1, S - 2), rnd.randrange(2, S - 1)
        c = rnd.choice([C('#5aa65a'), C('#5aa65a'), C('#9bdc84')])
        cv.px(x, y, c); cv.px(x, y - 1, c)
    for _ in range(4):                       # 물가 클로버 점
        x, y = rnd.randrange(2, S - 3), rnd.randrange(2, S - 3)
        cv.px(x, y, C('#3f8f58')); cv.px(x + 1, y, C('#3f8f58')); cv.px(x, y + 1, C('#56ad6e'))
    for _ in range(2):                       # 작은 흰꽃·푸른꽃
        x, y = rnd.randrange(3, S - 4), rnd.randrange(3, S - 4)
        cv.px(x, y, C('#ffffff') if rnd.random() < 0.5 else C('#bfe3ff')); cv.px(x, y + 1, C('#f4e7a1'))
    for i in range(S):                       # 은은한 칸 구분
        cv.px(i, 0, mix(cv.get(i, 0), C('#5a9f5a'), 0.14))
        cv.px(0, i, mix(cv.get(0, i), C('#5a9f5a'), 0.14))
    return cv.im


def valley_rock():
    """계곡 바위: 물에 젖은 푸른 회색. 숲의 이끼 바위보다 어둡고 푸르다."""
    cv = Cv()
    cv.ell(16, 28, 12, 3, C('#3b362b', 120))
    cv.ell(16, 18, 13, 11, C('#6a7f98'))
    cv.ell(16, 20, 13, 9, C('#5d7189'))
    cv.ell(11, 13, 8, 5, C('#9fb3c8'))
    cv.ell(10, 12, 4, 2, C('#d5e3f0'))
    for y in range(14, 30):                  # 오른쪽 아래 음영
        for x in range(4, 30):
            if cv.get(x, y)[3] and (x - 16) + (y - 18) > 11:
                cv.px(x, y, C('#47586d'))
    for (mx, my, rx, ry) in ((21, 9, 5, 2.5), (25, 15, 3, 2)):   # 청록 이끼
        cv.ell(mx, my, rx, ry, C('#3f9484'))
    cv.ell(20, 8, 2.5, 1.2, C('#6cc4ad'))
    for (dx, dy) in ((7, 18), (22, 22), (13, 24)):               # 물방울 반짝임
        cv.px(dx, dy, C('#e6f6ff')); cv.px(dx + 1, dy, C('#bfe4f5'))
    cv.px(8, 20, C('#3a495b')); cv.px(9, 21, C('#3a495b')); cv.px(22, 19, C('#3a495b')); cv.px(22, 20, C('#3a495b'))
    cv.outline(OUT)
    return cv.im


def raft():
    """통나무 뗏목 묶음(부서지는 상자 대신): 윗면은 세로 통나무 줄무늬와 밧줄, 앞면은 통나무 단면."""
    cv = Cv()
    cv.ell(16, 29, 12, 2.5, C('#3b362b', 120))
    cv.rect(3, 5, 28, 28, C('#8a5a2a'))
    # 윗면: 세로 통나무 4개
    logs = [(3, 9), (10, 15), (16, 21), (22, 28)]
    tones = [C('#d19a55'), C('#c08848'), C('#d6a05c'), C('#c28a4a')]
    for (x0, x1), t in zip(logs, tones):
        cv.rect(x0, 5, x1, 21, t)
        cv.rect(x0, 5, x0 + 1, 21, C('#e8b878'))          # 왼쪽 하이라이트
        cv.rect(x1, 5, x1, 21, C('#8d5c2a'))              # 오른쪽 그림자
    for x in (9, 15, 21):                                   # 통나무 사이 틈
        cv.rect(x, 5, x, 21, C('#5e3a18'))
    for (x, y) in ((6, 9), (12, 14), (18, 8), (25, 13), (7, 17), (24, 19)):   # 나뭇결
        cv.px(x, y, C('#a8703a')); cv.px(x, y + 1, C('#a8703a'))
    # 앞면: 통나무 단면(나이테)
    cv.rect(3, 22, 28, 28, C('#6e4620'))
    for cx in (6, 12, 19, 25):
        cv.ell(cx, 25, 3.2, 3.2, C('#e0b070'))
        cv.ell(cx, 25, 2.0, 2.0, C('#c58a4c'))
        cv.px(cx, 25, C('#8a5722'))
    # 밧줄 두 줄(윗면 가로) + 매듭
    for y in (10, 17):
        cv.rect(3, y, 28, y + 1, C('#ece0b4'))
        for x in range(4, 28, 3):
            cv.px(x, y + 1, C('#a08c52'))
    cv.px(15, 9, C('#ece0b4')); cv.px(16, 9, C('#ece0b4')); cv.px(15, 18, C('#a08c52'))
    # 젖은 이끼·물방울
    for (mx, my) in ((5, 6), (11, 20), (26, 7)):
        cv.px(mx, my, C('#3f9484')); cv.px(mx + 1, my, C('#6cc4ad'))
    for (dx, dy) in ((14, 7), (8, 13), (23, 16)):
        cv.px(dx, dy, C('#e6f6ff'))
    cv.outline(OUT)
    return cv.im


def cliff(variant):
    """바깥 테두리(불투명): 변형 0 = 이끼 낀 어두운 절벽, 변형 1 = 짙은 나무 수관. 참고 그림의 어두운 바깥 띠."""
    rnd = random.Random(700 + variant)
    cv = Cv()
    if variant == 0:
        cv.rect(0, 0, S - 1, S - 1, C('#25393b'))
        for y in range(0, S, 8):                   # 가로 층리
            off = rnd.randrange(0, 6)
            cv.rect(0, y + off, S - 1, y + off + 2, C('#3b5558'))
            cv.rect(0, y + off + 3, S - 1, y + off + 3, C('#1b2a2c'))
        for _ in range(12):                        # 균열
            x, y = rnd.randrange(1, S - 3), rnd.randrange(1, S - 3)
            cv.rect(x, y, x + rnd.randint(1, 3), y, C('#18262a'))
        for _ in range(5):                         # 이끼
            x, y = rnd.randrange(3, S - 6), rnd.randrange(2, S - 6)
            cv.ell(x, y, rnd.randint(2, 4), rnd.randint(1, 2), C('#2f6b4c'))
            cv.px(x, y - 1, C('#4f9a68'))
        for _ in range(6):
            cv.px(rnd.randrange(S), rnd.randrange(S), C('#55797c'))
    else:
        cv.rect(0, 0, S - 1, S - 1, C('#173a2a'))
        for _ in range(9):                         # 겹친 나뭇잎 덩이
            x, y = rnd.randrange(0, S), rnd.randrange(0, S)
            cv.ell(x, y, rnd.randint(5, 8), rnd.randint(4, 6), rnd.choice([C('#215036'), C('#27603f'), C('#1d4630')]))
            cv.ell(x - 1, y - 2, 3, 2, C('#357a4d'))
            cv.px(x - 2, y - 3, C('#5eb274'))
        for _ in range(10):
            cv.px(rnd.randrange(S), rnd.randrange(S), C('#0f2a1e'))
    return cv.im


def waterfall_tile():
    """폭포 칸(불투명): 세로로 이어지는(주기 8px) 물줄기. 게임에서 아래로 흘러가게 스크롤한다."""
    rnd = random.Random(900)
    cv = Cv()
    cv.rect(0, 0, S - 1, S - 1, C('#6bb8e8'))
    # 칸마다 폭이 다른 세로 물줄기: 열마다 위상이 다른 8px 주기 줄무늬
    cols = [C('#ffffff'), C('#e8f7ff'), C('#bfe6f8'), C('#8fcdf0'), C('#6bb8e8')]
    for x in range(0, S):
        ph = (x * 3 + (x // 5) * 2) % 8
        base = [C('#8fcdf0'), C('#a9dcf5'), C('#7cc3ec')][(x // 3) % 3]
        for y in range(S):
            k = (y + ph) % 8
            if k < 3:
                cv.px(x, y, C('#e8f7ff') if k < 2 else C('#ffffff'))
            elif k < 6:
                cv.px(x, y, base)
            else:
                cv.px(x, y, C('#6bb8e8'))
    for _ in range(9):                             # 흰 거품 줄(주기에 맞춰 8의 배수 길이)
        x = rnd.randrange(3, S - 3)
        y0 = rnd.randrange(0, 4) * 8
        for y in range(y0, y0 + 8):
            cv.px(x, y % S, C('#ffffff'))
    return cv.im


def puddle(variant):
    """바닥 물웅덩이(통과 가능한 장식): 풀밭 위 청록빛 얕은 물. 푸른 물살과 헷갈리지 않게 녹색 기를 준다."""
    rnd = random.Random(1100 + variant)
    cv = Cv()
    cv.im.paste(stone_path(variant), (0, 0))
    pools = [(16, 18, 11, 7)] if variant == 0 else [(10, 13, 6, 4), (22, 21, 7, 5)]
    for (cx, cy, rx, ry) in pools:
        cv.ell(cx, cy + 1, rx + 2, ry + 2, C('#4f8a56'))           # 둘레 젖은 풀
        cv.ell(cx, cy, rx + 1, ry + 1, C('#4b7f80'))               # 물가 그늘
        cv.ell(cx, cy, rx, ry, C('#4fa3a0'))                       # 물
        cv.ell(cx, cy + 1, rx - 2, ry - 2, C('#3f8f90'))           # 깊은 곳
        cv.ell(cx - rx // 3, cy - ry // 2, max(2, rx // 3), 1, C('#a8e0dc'))  # 하이라이트
        for _ in range(5):                                         # 물결 점
            x = cx + rnd.randint(-rx + 2, rx - 2); y = cy + rnd.randint(-ry + 2, ry - 2)
            cv.px(x, y, C('#bfeee8'))
    # 연잎 + 작은 꽃(변형 0), 물풀(변형 1)
    if variant == 0:
        cv.ell(20, 17, 3, 2, C('#4f9a5c')); cv.px(22, 16, C('#4f9a5c', 0)); cv.px(20, 16, C('#7cc486'))
        cv.px(11, 20, C('#ffd2dc')); cv.px(12, 20, C('#ff8fa3')); cv.px(11, 21, C('#ff8fa3'))
    else:
        for (x, y) in ((27, 17), (28, 16), (29, 17), (5, 11), (6, 10)):
            cv.px(x, y, C('#5fae6e')); cv.px(x, y - 1, C('#8fd49a')); cv.px(x, y - 2, C('#5fae6e'))
    return cv.im


def splash():
    """폭포 아래 물보라(투명 오버레이): 폭포가 닿는 바닥 위쪽에 흰 거품과 물안개."""
    rnd = random.Random(1300)
    cv = Cv()
    for y in range(0, 14):
        a = int(150 * (1 - y / 14) ** 1.3)
        for x in range(S):
            if rnd.random() < 0.85:
                cv.px(x, y, C('#f4fbff', a))
    for _ in range(14):                            # 튀는 물방울
        x, y = rnd.randrange(1, S - 1), rnd.randrange(0, 9)
        cv.px(x, y, C('#ffffff', 230)); cv.px(x + 1, y, C('#d5eefa', 200))
    for x in range(S):                             # 바닥에 닿는 거품 띠
        if (x * 7) % 5 < 3:
            cv.px(x, 0, C('#ffffff', 245))
    return cv.im



# ---------------------------------------------------------------- 폭포 계곡 외곽 테두리 시트 (border_waterfall.png, 5칸 x 10줄)
#  0줄: 위쪽 암벽 4종 | 1줄: 왼쪽 암벽(고사리) 4종 | 2줄: 아래쪽 수풀 4종
#  3줄: 계곡 물길 4프레임 | 4줄: 물가 바위가 있는 물길 4프레임
#  5줄: 폭포 왼쪽·가운데A·가운데B·오른쪽(세로 8px 주기, 게임에서 흘려 그림)
#  6줄: 폭포 아래 물보라·물가(투명) 가운데 3종, 왼쪽 끝, 오른쪽 끝
#  7줄: 모서리 왼위(불투명)·오른위(투명, 물 위에 겹침)·왼아래(불투명)·오른아래(투명, 물 위에 겹침)
#  8줄: 오른쪽 물가 경계 오버레이(투명, 안쪽 바닥 위) 3종 | 9줄: 추가 풀밭 2종
ROCK_PAL = dict(dark=C('#1f2b2d'), a=C('#3a4d50'), b=C('#44585b'), c=C('#334548'), top=C('#7f9a9a'), low=C('#26363a'), spot=C('#2b3c3f'))
MOSS = [C('#3f7a4a'), C('#5aa05a'), C('#86c36a')]


def rock_face(seed, big=False, fern_side=None):
    """이끼 낀 어두운 암벽 한 칸(불투명). 덩어리를 어긋나게 쌓고 위에 이끼, 필요하면 한쪽 가장자리에 고사리."""
    rnd = random.Random(seed)
    cv = Cv()
    cv.rect(0, 0, S - 1, S - 1, ROCK_PAL['dark'])
    shades = [ROCK_PAL['a'], ROCK_PAL['b'], ROCK_PAL['c'], ROCK_PAL['a']]
    y = 0
    while y < S:
        h = rnd.choice([6, 8, 11]) if not big else rnd.choice([9, 12])
        x = -rnd.randrange(0, 9)
        while x < S:
            w = rnd.randint(8, 16)
            x0, x1 = max(0, x + 1), min(S - 1, x + w - 1)
            y1 = min(S - 1, y + h - 1)
            cv.rect(x0, y + 1, x1, y1, rnd.choice(shades))
            cv.rect(x0, y + 1, x1, y + 1, ROCK_PAL['top'])
            cv.rect(x0, y1, x1, y1, ROCK_PAL['low'])
            if x1 - x0 > 3 and y1 - y > 4:
                cv.px(rnd.randrange(x0 + 1, x1), rnd.randrange(y + 3, y1), ROCK_PAL['spot'])
            x += w
        y += h
    for _ in range(rnd.randint(3, 5)):               # 이끼 덩이(바위 윗면에 걸친 느낌)
        mx, my = rnd.randrange(1, S - 5), rnd.randrange(0, S - 4)
        for i in range(rnd.randint(3, 6)):
            cv.px(mx + i, my, MOSS[1]); cv.px(mx + i, my - 1, MOSS[2]) if rnd.random() < 0.5 else None
            cv.px(mx + i, my + 1, MOSS[0])
    if fern_side:                                    # 가장자리에서 뻗은 고사리 잎
        fx = S - 1 if fern_side == 'right' else 0
        d = -1 if fern_side == 'right' else 1
        for _ in range(2):
            fy = rnd.randrange(4, S - 6)
            for i in range(1, 7):
                cv.px(fx + d * i, fy - (i // 3), MOSS[1])
                cv.px(fx + d * i, fy - (i // 3) + 1, MOSS[0])
                if i % 2:
                    cv.px(fx + d * i, fy - (i // 3) - 1, MOSS[2])
            cv.px(fx + d * 7, fy - 3, MOSS[2])
    return cv


def hedge(seed):
    """아래쪽 테두리(불투명): 짙은 땅 위에 낮은 수풀 덩이, 작은 바위, 풀꽃."""
    rnd = random.Random(seed)
    cv = Cv()
    cv.rect(0, 0, S - 1, S - 1, C('#2a5636'))
    for _ in range(6):                                # 먼 수풀
        cv.ell(rnd.randrange(0, S), rnd.randrange(4, 14), rnd.randint(5, 8), rnd.randint(4, 6), rnd.choice([C('#2f6440'), C('#356f47')]))
    for _ in range(4):                                # 앞 수풀
        x, y = rnd.randrange(2, S - 2), rnd.randrange(12, 28)
        cv.ell(x, y, rnd.randint(6, 9), rnd.randint(5, 7), rnd.choice([C('#3f8049'), C('#4a8f52')]))
        cv.ell(x - 2, y - 3, 3, 2, C('#7cc16a'))
        cv.px(x - 3, y - 4, C('#b4e58c'))
    if seed % 2 == 0:                                 # 작은 바위
        rx, ry = rnd.randrange(8, 24), rnd.randrange(18, 26)
        cv.ell(rx, ry, 5, 3, C('#6a7a80')); cv.ell(rx - 1, ry - 1, 3, 1.5, C('#a7b6ba'))
        cv.ell(rx, ry + 3, 5, 1, C('#1d3a27'))
    for _ in range(rnd.randint(3, 5)):                # 풀꽃
        fx, fy = rnd.randrange(2, S - 2), rnd.randrange(6, S - 3)
        col = rnd.choice([C('#ffffff'), C('#ffd2dc'), C('#fff1a6'), C('#cfe6ff')])
        cv.px(fx, fy, col); cv.px(fx + 1, fy, col); cv.px(fx, fy + 1, C('#f4c64a'))
    cv.rect(0, 0, S - 1, 1, C('#1d3a27'))             # 안쪽(위)과 구분되는 어두운 선
    return cv


def stream(frame, rock=False, seed=0):
    """오른쪽 계곡 물길(불투명): 아래로 흐르는 물. frame 0~3 = 2px씩 내려가 8px 주기로 이어진다. 왼쪽 가장자리는 젖은 물가."""
    rnd = random.Random(seed)
    cv = Cv()
    for y in range(S):
        for x in range(S):
            k = (y - frame * 2 + (x * 3) % 8) % 8
            col = C('#3f7f93')
            if k < 2: col = C('#6fb0bf')
            elif k < 4: col = C('#4f93a6')
            elif k < 6: col = C('#397a8e')
            cv.px(x, y, col)
    for x in range(8, 28, 9):                          # 잔잔한 밝은 물살 줄(폭포보다 어둡고 차분하게)
        for y in range(S):
            if (y - frame * 2 + x) % 8 < 1:
                cv.px(x, y, C('#b6e0e6'))
    shore = [C('#365546'), C('#5f7a62'), C('#8fa57a')]  # 왼쪽 물가(젖은 흙·돌)
    for y in range(S):
        wob = (1 if (y * 5 + seed) % 7 < 3 else 0)
        cv.rect(0, y, 2 + wob, y, shore[0])
        cv.px(3 + wob, y, shore[1])
    for (px_, py_) in ((1, 5), (2, 13), (1, 22), (3, 28)):
        cv.px(px_, py_, shore[2]); cv.px(px_ + 1, py_, C('#c5d2aa'))
    if rock:                                           # 물 속 바위와 물거품 고리
        cv.ell(20, 17, 8, 5, C('#dff3f8'))
        cv.ell(20, 17, 6, 3.5, C('#74b4cc'))
        cv.ell(20, 16, 5, 4, C('#59676d'))
        cv.ell(19, 14, 3, 2, C('#97a6ac'))
        cv.outline(OUT, 255)
    return cv


def fall_edge(side):
    """폭포 가장자리(불투명): 물줄기에 이끼 낀 암벽이 붙어 있다. 세로로 같은 모양이라 흘려도 이어진다."""
    cv = Cv()
    cv.im.paste(waterfall_tile(), (0, 0))
    for x in range(0, 7):
        xx = x if side == 'left' else S - 1 - x
        col = [ROCK_PAL['dark'], ROCK_PAL['a'], ROCK_PAL['b'], MOSS[0], MOSS[1], C('#7fb0a4'), C('#bfe6f8')][x] if x < 7 else None
        for y in range(S):
            if x < 5 or (y % 8) < 4:
                cv.px(xx, y, col)
    return cv


def foam(kind):
    """폭포 아래 물보라·얕은 물가(투명 오버레이, 바닥 위). kind 0~2 = 가운데, 3 = 왼쪽 끝, 4 = 오른쪽 끝."""
    rnd = random.Random(2600 + kind)
    cv = Cv()
    x0, x1 = (0, S) if kind < 3 else ((10, S) if kind == 3 else (0, 22))
    for (cx, cy, rx, ry) in [(16, 24, 15, 6)]:        # 얕은 물웅덩이
        for y in range(S):
            for x in range(S):
                if x0 <= x < x1 and ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0 and (kind < 3 or ((x - 16) / 15) ** 2 + ((y - 24) / 6) ** 2 <= 1.0):
                    cv.px(x, y, C('#5db0c8', 200))
    for _ in range(14):                                # 흰 거품 덩이
        x, y = rnd.randrange(max(x0, 2), min(x1, S - 2)), rnd.randrange(0, 26)
        r = rnd.choice([1, 2, 2, 3])
        cv.ell(x, y, r + 1, r, C('#f4fcff', 215))
    for _ in range(8):                                 # 물안개 점
        cv.px(rnd.randrange(max(x0, 1), min(x1, S - 1)), rnd.randrange(0, 12), C('#ffffff', 170))
    for y in (27, 28):                                 # 물가 젖은 가장자리
        for x in range(max(x0, 3), min(x1, S - 3)):
            if rnd.random() < 0.55:
                cv.px(x, y, C('#8fa57a', 190))
    for _ in range(4):                                 # 작은 조약돌
        px_, py_ = rnd.randrange(max(x0, 3), min(x1, S - 3)), rnd.randrange(27, 31)
        cv.ell(px_, py_, 1.5, 1, C('#a7b0aa'))
    return cv


def corner(which):
    """모서리. tl, bl = 불투명 / tr, br = 물길 위에 겹치는 투명 오버레이(암벽·수풀이 물길 모서리를 덮는다)."""
    if which == 'tl':
        cv = rock_face(3100, big=True, fern_side='right')
        cv.rect(0, 0, 2, S - 1, ROCK_PAL['dark']); cv.rect(0, 0, S - 1, 2, ROCK_PAL['dark'])
        return cv
    if which == 'bl':
        cv = hedge(3101)
        for i in range(10):
            cv.rect(0, 0, 1 + (10 - i) // 3, i + 8, ROCK_PAL['a'])
        for (x, y) in ((1, 4), (2, 9), (3, 14)):
            cv.px(x, y, MOSS[2])
        return cv
    cv = Cv()
    if which == 'tr':                                  # 암벽이 위와 왼쪽을 덮고 물길 입구만 남는다
        base = rock_face(3102, big=True)
        for y in range(S):
            for x in range(S):
                edge = 22 + (x * 5 + 2) % 4                     # 아래 가장자리를 들쭉날쭉하게: 암벽 밑에서 물이 흘러나오는 모양
                if y < edge or x < 4:
                    cv.px(x, y, base.get(x, y))
        for x in range(4, S):                                   # 물이 나오는 가장자리의 어두운 그림자 선
            cv.px(x, 22 + (x * 5 + 2) % 4, ROCK_PAL['dark'])
    else:                                              # br: 수풀이 아래와 왼쪽을 덮고 물이 가장자리에서 끝난다
        base = hedge(3103)
        for y in range(S):
            for x in range(S):
                if y > 16 or x < 8 or (y > 10 and x < 8 + (y - 10) * 1):
                    cv.px(x, y, base.get(x, y))
        cv.rect(0, S - 3, S - 1, S - 1, C('#1d3a27'))
    return cv


def shore_overlay(variant):
    """오른쪽 물가 경계(투명 오버레이, 안쪽 풀밭의 오른쪽 가장자리): 젖은 흙과 조약돌, 풀 끝이 물가로 번진다."""
    rnd = random.Random(3300 + variant)
    cv = Cv()
    for y in range(S):
        wob = 1 if (y * 3 + variant * 5) % 8 < 3 else 0
        for x in range(S - 5 - wob, S):
            d = x - (S - 5 - wob)
            cv.px(x, y, [C('#5b8a54', 150), C('#6f946b', 190), C('#8fa57a', 230), C('#6f8a68', 255), C('#5f7a62', 255), C('#4f6f5a', 255)][min(d, 5)])
    for _ in range(5):                                 # 조약돌
        y = rnd.randrange(1, S - 2); x = S - rnd.randint(3, 5)
        cv.px(x, y, C('#c5d2aa')); cv.px(x + 1, y, C('#a7b6a0'))
    for _ in range(4):                                 # 풀 끝
        y = rnd.randrange(2, S - 3); x = S - rnd.randint(7, 9)
        cv.px(x, y, C('#4f9a58')); cv.px(x, y - 1, C('#86c36a'))
    return cv


def grass_extra(variant):
    """풀밭 변형 2종(폭포 계곡): 기본 풀밭 2종과 섞어 4종이 반복되지 않게 한다. 격자선은 거의 보이지 않게."""
    rnd = random.Random(3400 + variant)
    base = [C('#6ab072'), C('#66ac6c')][variant]
    cv = Cv()
    cv.rect(0, 0, S - 1, S - 1, base)
    for _ in range(14):
        x, y = rnd.randrange(1, S - 2), rnd.randrange(2, S - 1)
        c = rnd.choice([C('#5aa65a'), C('#9bdc84'), C('#5aa65a')])
        cv.px(x, y, c); cv.px(x, y - 1, c)
    if variant == 0:                                   # 클로버 무리
        x, y = rnd.randrange(6, S - 8), rnd.randrange(6, S - 8)
        for (dx, dy) in ((0, 0), (2, 1), (1, 3)):
            cv.px(x + dx, y + dy, C('#3f8f58')); cv.px(x + dx + 1, y + dy, C('#56ad6e'))
    else:                                              # 작은 꽃
        for _ in range(2):
            x, y = rnd.randrange(4, S - 5), rnd.randrange(4, S - 5)
            cv.px(x, y, C('#ffffff')); cv.px(x + 1, y, C('#cfe6ff')); cv.px(x, y + 1, C('#f4e7a1'))
    for i in range(S):
        cv.px(i, 0, mix(cv.get(i, 0), C('#5a9f5a'), 0.14)); cv.px(0, i, mix(cv.get(0, i), C('#5a9f5a'), 0.14))
    return cv


def border_waterfall_sheet():
    cols, rows = 5, 10
    im = Image.new('RGBA', (S * cols, S * rows), (0, 0, 0, 0))
    def put(c, r, cv):
        im.paste(cv.im if isinstance(cv, Cv) else cv, (c * S, r * S))
    for v in range(4):
        put(v, 0, rock_face(2000 + v * 7))
        put(v, 1, rock_face(2100 + v * 5, fern_side='right'))
        put(v, 2, hedge(2200 + v))
        put(v, 3, stream(v, False, 1))
        put(v, 4, stream(v, True, 2))
    put(0, 5, fall_edge('left'))
    put(1, 5, waterfall_tile())
    mirror = waterfall_tile().transpose(Image.FLIP_LEFT_RIGHT)
    put(2, 5, mirror)
    put(3, 5, fall_edge('right'))
    for k in range(5):
        put(k, 6, foam(k))
    for c, w in enumerate(('tl', 'tr', 'bl', 'br')):
        put(c, 7, corner(w))
    for v in range(3):
        put(v, 8, shore_overlay(v))
    for v in range(2):
        put(v, 9, grass_extra(v))
    return im


# ---------------------------------------------------------------- 바위산 타일 (tiles.png와 같은 7칸 순서: 흙길 2, 바위, 광산 상자, 산 절벽 3)
def dirt(variant):
    """바위산 바닥(이름은 예전 흙길 그대로): 갈라진 평평한 암석(회갈색). 새 시트를 못 불러올 때의 대체 그림이기도 하다."""
    return rock_floor(variant).im


def boulder():
    """바위산의 고정 바위: 짙은 청회색 큰 바위. 밝은 판석 바닥 위에서 어둡고 윤곽이 뚜렷하게 보인다."""
    cv = Cv()
    cv.ell(16, 28, 12, 3, C('#23242f', 120))
    cv.ell(16, 18, 13, 11, C('#68676c'))
    cv.ell(16, 20, 13, 9, C('#58575e'))
    cv.ell(11, 13, 8, 5, C('#8a8890'))
    cv.ell(10, 12, 4, 2, C('#b9b7c0'))
    for y in range(14, 30):
        for x in range(4, 30):
            if cv.get(x, y)[3] and (x - 16) + (y - 18) > 11:
                cv.px(x, y, C('#413f46'))
    for (x, y) in ((8, 20), (9, 21), (10, 22), (22, 19), (22, 20), (23, 21), (15, 12), (16, 13), (17, 14)):
        cv.px(x, y, C('#2e2d33'))                 # 갈라진 틈
    for (x, y) in ((20, 10), (21, 10), (19, 11)):  # 밝은 얼룩
        cv.px(x, y, C('#c9c6cf'))
    cv.outline(OUT)
    return cv.im


def mine_crate():
    """광산 상자(부서지는 칸): 짙은 갈색 나무 + 쇠띠. 갈색 바위와 구별되도록 쇠띠·못이 보이게 한다."""
    cv = Cv()
    cv.ell(16, 29, 12, 2.5, C('#3a2a1a', 110))
    cv.rect(3, 5, 28, 28, C('#8a5a30'))
    cv.rect(3, 5, 28, 9, C('#b9824a'))
    cv.rect(3, 9, 28, 9, C('#6b4423'))
    for y in (15, 21):
        cv.rect(4, y, 27, y, C('#5f3c1e'))
    cv.rect(3, 5, 4, 28, C('#a8743d'))
    cv.rect(27, 5, 28, 28, C('#5f3c1e'))
    cv.rect(3, 27, 28, 28, C('#4f321a'))
    for x in (8, 22):                            # 세로 쇠띠
        cv.rect(x, 5, x + 2, 28, C('#565b69'))
        cv.rect(x, 5, x, 28, C('#8d93a3'))
    for (nx, ny) in ((9, 8), (23, 8), (9, 24), (23, 24)):  # 못
        cv.px(nx, ny, C('#e6e9f0'))
    cv.outline(OUT)
    return cv.im


def mountain_cliff(variant):
    """바깥 테두리 산 절벽(불투명): 어두운 청회색 바위 덩어리를 어긋나게 쌓은 벽. 참고 그림의 어두운 바깥 띠."""
    rnd = random.Random(1700 + variant)
    cv = Cv()
    cv.rect(0, 0, S - 1, S - 1, C('#22232e'))
    shades = [C('#4a4d60'), C('#42455a'), C('#525568'), C('#464a5d')]
    y = 0
    while y < S:
        h = rnd.choice([7, 9, 10])
        x = -rnd.randrange(0, 8)
        while x < S:
            w = rnd.randint(9, 17)
            col = rnd.choice(shades)
            cv.rect(max(0, x + 1), y + 1, min(S - 1, x + w - 1), min(S - 1, y + h - 1), col)
            cv.rect(max(0, x + 1), y + 1, min(S - 1, x + w - 1), y + 1, C('#6e7290'))      # 윗면 하이라이트
            cv.rect(max(0, x + 1), min(S - 1, y + h - 1), min(S - 1, x + w - 1), min(S - 1, y + h - 1), C('#2f313f'))  # 아랫면 그림자
            for _ in range(2):
                px0, px1 = max(0, x + 2), min(S - 1, x + w - 2)
                py0, py1 = y + 2, min(S - 1, y + h - 2)
                if px0 < px1 and py0 < py1:
                    cv.px(rnd.randrange(px0, px1), rnd.randrange(py0, py1), C('#363849'))
            x += w
        y += h
    for _ in range(8):
        cv.px(rnd.randrange(S), rnd.randrange(S), C('#7d819c'))
    for _ in range(variant):                     # 드문 이끼 점
        bx, by = rnd.randrange(4, S - 6), rnd.randrange(4, S - 6)
        cv.ell(bx, by, 2, 1, C('#4d6b58')); cv.px(bx, by - 1, C('#6f9a7d'))
    return cv.im



# ---------------------------------------------------------------- 바위산 외곽 테두리 시트 (border_mountain.png, 5칸 x 10줄)
#  0줄: 위쪽 자연 암벽 4종 | 1줄: 왼쪽(크기 다른 바위·이끼·풀) 4종 | 2줄: 오른쪽 자연 암벽 4종
#  3줄: 오른쪽 장식 — 0·1 = 붉은 수련 깃발, 2·3 = 석등
#  4줄: 절벽 가장자리(아래 투명, 하늘·구름 위에 겹침) 4종
#  5줄: 0 = 하늘·안개 바탕(불투명), 1·2 = 구름 띠(투명, 가로 32px 주기 → 게임에서 옆으로 흘림)
#  6줄: 모서리 0 = 왼위, 1 = 오른위(불투명), 2 = 왼아래, 3 = 오른아래(투명, 하늘 위에 겹침)
#  7줄: 추가 바닥 암석 4종(바닥 4종 = 시트 기본 2 + 추가 2, 여분 2는 예비)
#  8줄: 위쪽 절벽 가장자리 4종(아래쪽을 뒤집은 것, 위가 투명 아님: 아래 투명·위 하늘) + 4열 = 위쪽 하늘 바탕 | 9줄: 위쪽 모서리 오버레이 0 = 왼위, 1 = 오른위
ROCKS = dict(dark=C('#2f3036'), wall=C('#45474d'), mid=C('#5b5a60'), big=C('#68676c'), hi=C('#8a8890'), hi2=C('#a9a7b0'), low=C('#3a3b42'))
FLOOR_BASE = [C('#aaa397'), C('#a39d8f'), C('#a8a190'), C('#a29c8e')]
DRY = [C('#899260'), C('#a3ac72'), C('#6f7850')]


def blob(cv, cx, cy, rx, ry, rnd, body, hi, low, rim=None):
    """불규칙한 바위 덩이: 가장자리를 흔들고 왼위는 밝게·오른아래는 어둡게 칠한다."""
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    for y in range(int(cy - ry) - 2, int(cy + ry) + 3):
        for x in range(int(cx - rx) - 2, int(cx + rx) + 3):
            dx, dy = (x - cx) / rx, (y - cy) / ry
            ang = math.atan2(dy, dx)
            wob = 1 + 0.12 * math.sin(ang * 3 + ph[0]) + 0.07 * math.sin(ang * 5 + ph[1])
            d = math.hypot(dx, dy)
            if d <= wob:
                c = body
                if (dx + dy) > 0.55: c = low
                elif (dx + dy) < -0.7 and d < 0.9: c = hi
                if rim and d > wob - 0.14: c = rim
                cv.px(x, y, c)


def crack(cv, x, y, rnd, length, col, light=None):
    """갈라진 틈: 한 칸씩 임의로 꺾이며 이어지는 선."""
    for _ in range(length):
        cv.px(x, y, col)
        if light:
            cv.px(x + 1, y + 1, light)
        x += rnd.choice([-1, 0, 1, 1]) if rnd.random() < 0.7 else 0
        y += rnd.choice([0, 1, 1])


def nat_rock(seed, kind='top'):
    """자연 암벽 한 칸(불투명, 벽돌 패턴 없음): 큰 바위 덩이 겹침 + 균열 + 이끼. kind = top / left / right."""
    rnd = random.Random(seed)
    cv = Cv()
    cv.rect(0, 0, S - 1, S - 1, ROCKS['wall'])
    for _ in range(4):                               # 뒤쪽 어두운 덩이
        blob(cv, rnd.randrange(0, S), rnd.randrange(0, S), rnd.randint(8, 13), rnd.randint(6, 10), rnd, ROCKS['mid'], ROCKS['big'], ROCKS['low'])
    if kind == 'left':                               # 크기가 다양한 바위
        sizes = [(rnd.randint(11, 14), rnd.randint(8, 10)), (rnd.randint(5, 7), rnd.randint(4, 5)), (rnd.randint(7, 9), rnd.randint(5, 7))]
        rnd.shuffle(sizes)
        ys = [6, 16, 25]
        for (rx, ry), cy in zip(sizes, ys):
            blob(cv, rnd.randint(rx, S - rx), cy + rnd.randint(-2, 2), rx, ry, rnd, ROCKS['big'], ROCKS['hi'], ROCKS['low'], rim=ROCKS['dark'])
    else:
        for _ in range(3):
            blob(cv, rnd.randrange(2, S - 2), rnd.randrange(3, S - 3), rnd.randint(9, 14), rnd.randint(7, 10), rnd, ROCKS['big'], ROCKS['hi'], ROCKS['low'], rim=ROCKS['dark'])
    for _ in range(rnd.randint(2, 4)):               # 바위 균열
        crack(cv, rnd.randrange(3, S - 3), rnd.randrange(1, S - 12), rnd, rnd.randint(6, 12), ROCKS['dark'], ROCKS['hi'])
    for _ in range(rnd.randint(3, 6)):               # 밝은 점
        cv.px(rnd.randrange(S), rnd.randrange(S), ROCKS['hi2'])
    if kind == 'left':                               # 이끼와 작은 풀
        for _ in range(3):
            mx, my = rnd.randrange(2, S - 6), rnd.randrange(2, S - 4)
            for i in range(rnd.randint(3, 5)):
                cv.px(mx + i, my, C('#6f8a58')); cv.px(mx + i, my - 1, C('#8fae6a'))
        for _ in range(3):
            gx, gy = rnd.randrange(2, S - 3), rnd.randrange(8, S - 1)
            cv.px(gx, gy, DRY[0]); cv.px(gx, gy - 1, DRY[1]); cv.px(gx + 1, gy, DRY[0]); cv.px(gx - 1, gy - 1, DRY[1])
    else:
        for _ in range(rnd.randint(1, 2)):
            mx, my = rnd.randrange(2, S - 6), rnd.randrange(2, S - 4)
            for i in range(rnd.randint(2, 4)):
                cv.px(mx + i, my, C('#6f8a58'))
    return cv


def banner_tile(variant):
    """오른쪽 벽의 붉은 수련 깃발(불투명): 바위 위에 나무 기둥과 붉은 천. 천 끝이 갈라져 흔들린다(변형 1은 약간 기운 천)."""
    cv = nat_rock(4000 + variant, 'right')
    cv.rect(15, 1, 16, 30, C('#5b3a22')); cv.rect(15, 1, 15, 30, C('#7d5330'))        # 기둥
    cv.rect(11, 1, 20, 3, C('#7d5330')); cv.rect(11, 3, 20, 3, C('#4a2f1a'))          # 가로대
    sway = variant
    for y in range(4, 22):
        for x in range(12 + sway, 20 + sway):
            cv.px(x, y, C('#b34d3d'))
        cv.px(12 + sway, y, C('#d96b55')); cv.px(19 + sway, y, C('#8e3328'))
    for x in range(12 + sway, 20 + sway, 2):                                         # 천 끝 갈라짐
        cv.rect(x, 20, x + 1, 22, C('#8e3328'))
    cv.rect(14 + sway, 9, 17 + sway, 14, C('#f2d98a')); cv.rect(15 + sway, 10, 16 + sway, 13, C('#b34d3d'))  # 금빛 문양
    cv.outline(OUT, 255) if False else None
    return cv


def lantern_tile(variant):
    """오른쪽 벽의 석등(불투명): 회색 돌 받침·기둥·불 켜진 상자·지붕. 변형 1은 불빛이 약간 더 밝다."""
    cv = nat_rock(4100 + variant, 'right')
    st, st_hi, st_lo = C('#8a8890'), C('#b5b3bb'), C('#5b5a60')
    cv.rect(9, 27, 22, 30, st_lo); cv.rect(9, 27, 22, 27, st)            # 받침
    cv.rect(13, 18, 18, 26, st); cv.rect(13, 18, 13, 26, st_hi); cv.rect(18, 18, 18, 26, st_lo)  # 기둥
    cv.rect(10, 14, 21, 18, st); cv.rect(10, 14, 21, 14, st_hi)          # 받침대
    glow = C('#ffd98a') if variant == 0 else C('#ffe9a8')
    cv.rect(12, 7, 19, 13, C('#4a3a2a')); cv.rect(13, 8, 18, 12, glow)    # 불 켜진 상자
    cv.px(15, 10, C('#fff7d6')); cv.px(16, 10, C('#fff7d6'))
    cv.rect(8, 4, 23, 6, st_lo); cv.rect(8, 4, 23, 4, st_hi); cv.rect(11, 2, 20, 3, st)  # 지붕
    cv.px(15, 1, st_hi); cv.px(16, 1, st_hi)
    return cv


def sky_tile():
    """절벽 아래 하늘·안개 바탕(불투명): 위는 옅은 푸른 회색, 아래로 갈수록 밝은 안개."""
    cv = Cv()
    for y in range(S):
        t = y / (S - 1)
        r = int(0xb4 + (0xe4 - 0xb4) * t); g = int(0xc4 + (0xea - 0xc4) * t); b = int(0xd0 + (0xf0 - 0xd0) * t)
        cv.rect(0, y, S - 1, y, (r, g, b, 255))
    return cv


def cloud_strip(variant):
    """구름 띠(투명): 가로 32px 주기로 이어지는 흰 구름 덩이. 게임에서 옆으로 흘려 그린다."""
    rnd = random.Random(4200 + variant)
    cv = Cv()
    n = 3 if variant == 0 else 2
    for _ in range(n):
        cx, cy = rnd.randrange(0, S), rnd.randrange(8, 24)
        for k in (-S, 0, S):                        # 좌우로 한 번 더 찍어 주기 경계가 이어지게
            for (dx, dy, rx, ry) in ((0, 0, 8, 4), (-6, 1, 5, 3), (6, 1, 6, 3), (1, -3, 5, 3)):
                for y in range(int(cy + dy - ry) - 1, int(cy + dy + ry) + 2):
                    for x in range(int(cx + dx - rx + k) - 1, int(cx + dx + rx + k) + 2):
                        if ((x - cx - dx - k) / rx) ** 2 + ((y - cy - dy) / ry) ** 2 <= 1.0 and 0 <= x < S and 0 <= y < S:
                            cv.px(x, y, C('#ffffff', 235) if y < cy + dy + 1 else C('#e8eef4', 235))
    return cv


def lip_tile(variant):
    """절벽 가장자리(위쪽만 불투명): 산 정상 바닥 끝과 아래로 이어지는 들쭉날쭉한 암벽. 아래는 투명(하늘·구름이 보인다)."""
    rnd = random.Random(4300 + variant)
    cv = Cv()
    heights = [15] * S                              # 좌우 끝 높이를 같게 해 옆 칸과 이어지게 한다
    for x in range(2, S - 2):
        heights[x] = 12 + int(4 * math.sin(x * 0.45 + variant * 1.7) + rnd.choice([-1, 0, 1]))
    for x in range(S):
        h = heights[x]
        for y in range(0, h):
            col = ROCKS['wall'] if y > 3 else C('#a8a190')           # 맨 위 가장자리는 바닥 암석색
            if 3 <= y <= 4: col = C('#7d7868')
            elif y > h - 3: col = ROCKS['low']
            elif (x // 5 + y // 4 + variant) % 3 == 0: col = ROCKS['mid']
            cv.px(x, y, col)
        if h >= 3:
            cv.px(x, h - 1, ROCKS['dark'])
    for _ in range(3):
        crack(cv, rnd.randrange(3, S - 3), rnd.randrange(3, 6), rnd, rnd.randint(4, 7), ROCKS['dark'])
    for _ in range(2):                              # 매달린 작은 바위·풀
        x = rnd.randrange(3, S - 3)
        h = heights[x]
        cv.px(x, h, ROCKS['mid']); cv.px(x, h + 1, ROCKS['low'])
        cv.px(x + 1, 1, DRY[0]); cv.px(x + 1, 0, DRY[1])
    return cv


def mountain_corner(which):
    """모서리. tl, tr = 불투명 자연 암벽 / bl, br = 하늘 위에 겹치는 투명 오버레이(절벽 가장자리 + 옆 암벽)."""
    if which in ('tl', 'tr'):
        cv = nat_rock(4400 if which == 'tl' else 4401, 'top')
        cv.rect(0 if which == 'tl' else S - 3, 0, 2 if which == 'tl' else S - 1, S - 1, ROCKS['dark']); cv.rect(0, 0, S - 1, 1, ROCKS['dark'])
        return cv
    cv = lip_tile(5 if which == 'bl' else 6)
    base = nat_rock(4410 if which == 'bl' else 4411, 'left' if which == 'bl' else 'right')
    side = range(0, 11) if which == 'bl' else range(S - 11, S)
    for x in side:
        for y in range(S):
            if y < 28 - (abs(x - (0 if which == 'bl' else S - 1)) // 2) * 1:
                cv.px(x, y, base.get(x, y))
    return cv


def rock_floor(seed):
    """갈라진 평평한 암석 바닥(불투명): 회색·회갈색 판에 불규칙한 균열, 잔돌, 마른 풀. 격자선은 바닥과 섞은 옅은 색."""
    rnd = random.Random(seed)
    base = FLOOR_BASE[seed % 4]
    cv = Cv()
    cv.rect(0, 0, S - 1, S - 1, base)
    for _ in range(36):                              # 얼룩
        x, y = rnd.randrange(1, S - 1), rnd.randrange(1, S - 1)
        cv.px(x, y, rnd.choice([C('#b8b2a3'), C('#97917f'), C('#b8b2a3'), C('#9d9786')]))
        if rnd.random() < 0.3:
            cv.px(x + 1, y, C('#97917f'))
    for _ in range(rnd.randint(2, 3)):               # 균열(어두운 선 + 한 칸 아래 밝은 선)
        crack(cv, rnd.randrange(3, S - 12), rnd.randrange(3, S - 10), rnd, rnd.randint(10, 17), C('#665f50'), C('#c4bfae'))
    for _ in range(rnd.randint(2, 4)):               # 잔돌
        x, y = rnd.randrange(3, S - 4), rnd.randrange(3, S - 4)
        cv.px(x, y, C('#8f8a7b')); cv.px(x + 1, y, C('#b8b2a3')); cv.px(x, y + 1, C('#7a7566'))
    if seed % 2 == 0:                                # 마른 풀(드물게)
        x, y = rnd.randrange(4, S - 5), rnd.randrange(8, S - 3)
        for dx in (-1, 0, 1):
            cv.px(x + dx, y - 1, DRY[0]); cv.px(x + dx, y - 2 - (dx == 0), DRY[1])
    for i in range(S):
        cv.px(i, 0, mix(cv.get(i, 0), C('#7a7566'), 0.16)); cv.px(0, i, mix(cv.get(0, i), C('#7a7566'), 0.16))
    return cv


def border_mountain_sheet():
    cols, rows = 5, 10
    im = Image.new('RGBA', (S * cols, S * rows), (0, 0, 0, 0))
    def put(c, r, cv):
        im.paste(cv.im if isinstance(cv, Cv) else cv, (c * S, r * S))
    for v in range(4):
        put(v, 0, nat_rock(3000 + v * 11, 'top'))
        put(v, 1, nat_rock(3100 + v * 13, 'left'))
        put(v, 2, nat_rock(3200 + v * 17, 'right'))
        put(v, 4, lip_tile(v))
    put(0, 3, banner_tile(0)); put(1, 3, banner_tile(1))
    put(2, 3, lantern_tile(0)); put(3, 3, lantern_tile(1))
    put(0, 5, sky_tile()); put(1, 5, cloud_strip(0)); put(2, 5, cloud_strip(1))
    for c, w in enumerate(('tl', 'tr', 'bl', 'br')):
        put(c, 6, mountain_corner(w))
    for v in range(4):
        put(v, 7, rock_floor(2 + v))
    flip = lambda t: (t.im if isinstance(t, Cv) else t).transpose(Image.FLIP_TOP_BOTTOM)
    for v in range(4):                               # 8줄: 위쪽 절벽 가장자리 = 아래쪽 것을 위아래로 뒤집은 것
        put(v, 8, flip(lip_tile(v)))
    put(4, 8, flip(sky_tile()))                      # 위쪽 하늘 바탕(안개가 위쪽으로 짙다)
    put(0, 9, flip(mountain_corner('bl'))); put(1, 9, flip(mountain_corner('br')))  # 9줄: 위쪽 모서리 오버레이
    return im


# ---------------------------------------------------------------- 이펙트
def bomb(frame):
    cv = Cv()
    cv.ell(16, 27, 8, 2.5, C('#1d2b1f', 90))
    off = -1 if frame == 1 else 0
    cv.rect(10, 5 + off, 22, 24 + off, C('#f4e3a1'))
    cv.rect(10, 5 + off, 22, 6 + off, C('#fff4c2'))
    cv.rect(10, 23 + off, 22, 24 + off, C('#d4b66a'))
    cv.rect(10, 5 + off, 10, 24 + off, C('#d8bd6e'))
    cv.rect(22, 5 + off, 22, 24 + off, C('#c9a85a'))
    cv.ell(16, 12 + off, 4.5, 4.5, C('#c0392b'))
    cv.ell(15, 11 + off, 2, 2, C('#ee6a52'))
    for x in (13, 16, 19):                   # 아래 문양
        cv.rect(x, 18 + off, x + 1, 21 + off, C('#c0392b'))
    cv.rect(12, 17 + off, 20, 17 + off, C('#c0392b'))
    cv.rect(14, 2 + off, 15, 5 + off, C('#8a5a2b'))   # 끈
    cv.rect(17, 3 + off, 18, 5 + off, C('#8a5a2b'))
    cv.outline(OUT)
    if frame == 1:  # 깜박임: 바깥에 금빛 테두리
        src = cv.im.copy()
        sp = src.load()
        for y in range(S):
            for x in range(S):
                if sp[x, y][3] == 0:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < S and 0 <= ny < S and sp[nx, ny][3] == 255 and sp[nx, ny][:3] == OUT[:3]:
                            cv.px(x, y, C('#ffd45a', 170))
                            break
    return cv.im


def flame(frame):
    rnd = random.Random(500 + frame)
    cv = Cv()
    layers = [(C('#e8590c'), 15.0), (C('#f98a1f'), 12.5), (C('#ffd43b'), 9.0), (C('#fff3bf'), 4.5)]
    for col, r in layers:
        cv.ell(16, 16, r, r, col)
        for _ in range(5):
            a = rnd.random() * math.tau
            d = r * 0.75
            cv.ell(16 + math.cos(a) * d, 16 + math.sin(a) * d, r * 0.38, r * 0.38, col)
    for _ in range(6):
        cv.px(rnd.randrange(3, 29), rnd.randrange(3, 29), C('#fff8d6'))
    for y in range(S):  # 모서리를 둥글게 깎아 십자가 도드라지게
        for x in range(S):
            if (x - 15.5) ** 2 + (y - 15.5) ** 2 > 17.5 ** 2:
                cv.px(x, y, (0, 0, 0, 0))
    return cv.im


def crystal():
    cv = Cv()
    body = C('#b07cff', 105)
    cv.rect(5, 6, 26, 26, body)
    cv.ell(15.5, 6, 11, 3.5, C('#d3b0ff', 150))
    cv.ell(15.5, 26, 11, 3.5, C('#8a4fe0', 170))
    cv.rect(8, 7, 10, 24, C('#f0e3ff', 140))   # 유리 하이라이트
    cv.rect(11, 9, 11, 16, C('#ffffff', 170))
    cv.rect(21, 8, 23, 25, C('#7b3fd0', 120))
    for i in range(S):
        pass
    cv.outline(C('#4b1d7a', 230), min_alpha=1)
    # 위아래 테두리
    for x in range(5, 27):
        cv.px(x, 3, C('#6a2fb0', 220)) if cv.get(x, 4)[3] else None
    return cv.im


def stars(frame):
    cv = Cv()
    pts = [(7, 3), (16, 1), (25, 3)] if frame == 0 else [(10, 2), (20, 2), (15, 5)]
    for (x, y) in pts:
        cv.px(x, y, C('#ffe14a'))
        cv.px(x - 1, y, C('#ffe14a')); cv.px(x + 1, y, C('#ffe14a'))
        cv.px(x, y - 1, C('#ffe14a')); cv.px(x, y + 1, C('#ffe14a'))
        cv.px(x, y, C('#fff7c2'))
    return cv.im


def item(kind):
    """능력 두루마리: 양쪽 나무 축 + 양피지 + 종류별 색 띠·표식."""
    col = {'speed': (C('#3aa6d8'), C('#8fd8f5'), C('#1f6f99')),
           'range': (C('#e8590c'), C('#ffb066'), C('#a33c06')),
           'bomb': (C('#8a4fe0'), C('#c9a5ff'), C('#5a2fa0'))}[kind]
    cv = Cv()
    cv.ell(16, 26, 9, 2.5, C('#1d2b1f', 90))
    cv.ell(16, 16, 12, 12, col[0][:3] + (60,))          # 은은한 빛
    cv.rect(8, 11, 23, 22, C('#f4e3a1'))                 # 양피지
    cv.rect(8, 11, 23, 12, C('#fff4c2'))
    cv.rect(8, 21, 23, 22, C('#d4b66a'))
    cv.rect(13, 11, 18, 22, col[0])                      # 색 띠
    cv.rect(13, 11, 14, 22, col[1])
    cv.rect(17, 11, 18, 22, col[2])
    for x in (5, 24):                                    # 나무 축
        cv.rect(x, 8, x + 2, 25, C('#8a5a2b'))
        cv.rect(x, 8, x, 25, C('#c58b45'))
        cv.rect(x + 2, 8, x + 2, 25, C('#5b3a1e'))
    W = C('#ffffff')
    if kind == 'speed':      # 바람 줄무늬
        for y, x0, x1 in ((14, 9, 12), (16, 10, 12), (18, 9, 12)):
            cv.rect(x0, y, x1, y, col[0])
        for y, x0, x1 in ((14, 19, 22), (16, 19, 21), (18, 19, 22)):
            cv.rect(x0, y, x1, y, col[0])
    elif kind == 'range':    # 십자 표식
        cv.rect(15, 13, 16, 20, W)
        cv.rect(14, 16, 17, 17, W)
        cv.px(9, 16, col[0]); cv.px(10, 16, col[0]); cv.px(21, 16, col[0]); cv.px(22, 16, col[0])
    else:                    # 작은 부적 표식
        cv.rect(14, 13, 17, 20, W)
        cv.rect(15, 14, 16, 15, C('#c0392b'))
        cv.rect(15, 17, 16, 19, C('#c0392b'))
    cv.outline(OUT)
    return cv.im


def sheet(cells):
    s = Image.new('RGBA', (S * len(cells), S), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        s.paste(c, (i * S, 0))
    return s


def main(out):
    os.makedirs(out, exist_ok=True)
    sheet([grass(0), grass(1), rock(), crate(), tree(0), tree(1), tree(2)]).save(os.path.join(out, 'tiles.png'))
    sheet([stone_path(0), stone_path(1), valley_rock(), raft(), cliff(0), cliff(1), waterfall_tile(), puddle(0), puddle(1), splash()]).save(os.path.join(out, 'tiles_waterfall.png'))
    border_waterfall_sheet().save(os.path.join(out, 'border_waterfall.png'))
    border_mountain_sheet().save(os.path.join(out, 'border_mountain.png'))
    sheet([dirt(0), dirt(1), boulder(), mine_crate(), mountain_cliff(0), mountain_cliff(1), mountain_cliff(2)]).save(os.path.join(out, 'tiles_mountain.png'))
    sheet([bomb(0), bomb(1), flame(0), flame(1), flame(2), crystal(), stars(0), stars(1)]).save(os.path.join(out, 'effects.png'))
    sheet([item('speed'), item('range'), item('bomb')]).save(os.path.join(out, 'items.png'))
    ninja_sheet('black').save(os.path.join(out, 'ninja_black.png'))
    ninja_sheet('green').save(os.path.join(out, 'ninja_green.png'))
    print('생성 완료:', out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join('assets', 'sprites'))
