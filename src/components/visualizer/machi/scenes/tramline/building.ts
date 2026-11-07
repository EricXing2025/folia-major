import * as THREE from 'three';
import { boxAt, boxSpan, cylinderAt, group, mesh, tubeBetween } from '../../engine/geometry/shapes';
import type { MachiMaterials } from '../../engine/materials';
import { BOARD, BUILDING, FASCIA, LEVEL } from './layout';
import type { TramlineVariation } from './tramlineSeed';

// src/components/visualizer/machi/scenes/tramline/building.ts
// 三层唐楼与一层骑楼茶餐厅：前墙与右墙是镜头看得到的两个面。一层店面退缩在柱廊后面（骑楼），柱头出挑
// 的门头雨篷兼做店招（字面另挂）；二层转角挂歌词灯箱，钢架从前后两墙伸出去托住它；三层住宅窗带小阳台、
// 窗式空调与排水管。转角再挑一支竖的「茶餐廳」霓虹。亮灯窗是一整批实例，亮哪几扇按歌定。

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 一块招牌/屏幕面：中心、朝向（绕 y）与宽高。 */
export interface TramlineFace {
    position: THREE.Vector3;
    rotationY: number;
    width: number;
    height: number;
}

/** 住宅窗（在墙上开洞的洞口，亮灯实例也按它排）。 */
interface WindowSlot {
    x: number;
    z: number;
    /** 窗面朝哪：0 朝 +z（前墙），1 朝 +x（右墙）。 */
    face: 0 | 1;
    floor: 2 | 3;
}

const B = BUILDING;
const FRONT_Z = B.z1 - B.wall; // 前墙内皮（窗外皮在 B.z1）
const RIGHT_X = B.x1 - B.wall; // 右墙内皮（窗外皮在 B.x1）

/** 窗洞位置：前墙每樘、右墙每樘，转角被灯箱挡住的位置不开窗。 */
const WINDOW_SLOTS: WindowSlot[] = [
    // 前墙二楼三扇（都被镜头看得到，灯箱只盖转角）。
    { x: -5.05, z: FRONT_Z, face: 0, floor: 2 },
    { x: -4.15, z: FRONT_Z, face: 0, floor: 2 },
    { x: -3.25, z: FRONT_Z, face: 0, floor: 2 },
    // 前墙三楼两扇（靠左，转角让给灯箱）。
    { x: -5.05, z: FRONT_Z, face: 0, floor: 3 },
    { x: -4.15, z: FRONT_Z, face: 0, floor: 3 },
    // 右墙二楼一扇、三楼两扇（前段被灯箱挡住）。
    { x: RIGHT_X, z: -4.6, face: 1, floor: 2 },
    { x: RIGHT_X, z: -4.6, face: 1, floor: 3 },
    { x: RIGHT_X, z: -3.5, face: 1, floor: 3 },
];

/** 窗式空调的候选位（窗洞下缘外墙上）。 */
const AC_SLOTS = [
    { x: -5.05, z: B.z1 + 0.1, y: 2.66, face: 0 as const },
    { x: -3.25, z: B.z1 + 0.1, y: 2.66, face: 0 as const },
    { x: -5.05, z: B.z1 + 0.1, y: 4.06, face: 0 as const },
    { x: -4.15, z: B.z1 + 0.1, y: 4.06, face: 0 as const },
    { x: B.x1 + 0.1, z: -4.6, y: 4.06, face: 1 as const },
    { x: B.x1 + 0.1, z: -3.5, y: 4.06, face: 1 as const },
];

export interface TramlineBuildingParts {
    group: THREE.Object3D;
    /** 门头雨篷前沿的店招面（曲名）。 */
    fasciaFace: TramlineFace;
    /** 转角霓虹的两个侧面（「茶餐廳」）。 */
    neonFaces: TramlineFace[];
    /** 亮灯窗实例：亮不亮写在实例色里（暗的留暗色）。 */
    windowGlow: THREE.InstancedMesh;
    windowSlots: WindowSlot[];
    /** 灯箱正面中心（对焦与倒影用）。 */
    boardFace: TramlineFace;
}

/** 唐楼主体：三面外墙、楼板、骑楼柱廊与退缩玻璃店面、天台女儿墙。返回会亮的窗与各招牌面。 */
export const buildTangLau = (materials: MachiMaterials, variation: TramlineVariation): TramlineBuildingParts => {
    const parts: THREE.Object3D[] = [];
    const wall = materials.toon('tangWall');
    const trim = materials.toon('tangTrim');
    const frame = materials.toon('windowFrame');

    // 楼板与女儿墙：一层顶（骑楼底）是二层的地，天台一圈矮墙。
    parts.push(boxSpan(materials.toon('tangWall'), B.x0, B.x1, B.cafeTop, B.cafeTop + 0.14, B.z0, B.z1, { radius: 0.02, name: 'Slab/f2' }));
    parts.push(boxSpan(trim, B.x0 - 0.02, B.x1 + 0.02, B.f2Top, B.f2Top + 0.12, B.z0 - 0.02, B.z1 + 0.02, { radius: 0.02, name: 'Slab/f3' }));
    parts.push(boxSpan(materials.toon('roofTar'), B.x0, B.x1, B.wallTop, B.wallTop + 0.1, B.z0, B.z1, { radius: 0.02, name: 'Roof' }));
    // 女儿墙（四面矮墙）。
    const p = B.parapetTop;
    parts.push(boxSpan(wall, B.x0 - 0.05, B.x1 + 0.05, B.wallTop + 0.06, p, B.z1 - 0.1, B.z1 + 0.05, { radius: 0.01, name: 'Parapet' }));
    parts.push(boxSpan(wall, B.x0 - 0.05, B.x1 + 0.05, B.wallTop + 0.06, p, B.z0 - 0.05, B.z0 + 0.1, { radius: 0.01, name: 'Parapet' }));
    parts.push(boxSpan(wall, B.x0 - 0.05, B.x0 + 0.1, B.wallTop + 0.06, p, B.z0, B.z1, { radius: 0.01, name: 'Parapet' }));
    parts.push(boxSpan(wall, B.x1 - 0.1, B.x1 + 0.05, B.wallTop + 0.06, p, B.z0, B.z1, { radius: 0.01, name: 'Parapet' }));
    // 天台小物：水箱与一条排气管。
    parts.push(boxAt(materials.toon('concrete'), [0.7, 0.5, 0.55], [B.x0 + 0.7, B.wallTop + 0.1, B.z0 + 0.7], { radius: 0.05, name: 'Roof/tank' }));
    parts.push(cylinderAt(materials.toon('pipe'), 0.05, 0.5, [B.x1 - 0.8, B.wallTop + 0.1, B.z0 + 0.6], { segments: 8, name: 'Roof/vent' }));

    // 前墙（二层到檐口，窗洞开在实墙上）、右墙、背墙与左墙。一层前段是骑楼柱廊，店面退进去。
    parts.push(boxSpan(wall, B.x0, B.x1, B.cafeTop + 0.14, B.wallTop, B.z1 - B.wall, B.z1, { radius: 0.01, name: 'Wall/front' }));
    parts.push(boxSpan(wall, B.x1 - B.wall, B.x1, B.cafeTop + 0.14, B.wallTop, B.z0, B.z1, { radius: 0.01, name: 'Wall/right' }));
    parts.push(boxSpan(wall, B.x0, B.x1, LEVEL.floor, B.wallTop, B.z0, B.z0 + B.wall, { radius: 0.01, name: 'Wall/back' }));
    parts.push(boxSpan(wall, B.x0, B.x0 + B.wall, LEVEL.floor, B.wallTop, B.z0, B.z1, { radius: 0.01, name: 'Wall/left' }));
    // 右墙一层与后墙一层（柱廊段之外的实墙）。
    parts.push(boxSpan(wall, B.x1 - B.wall, B.x1, LEVEL.floor, B.cafeTop, B.z0, B.z1 - B.arcade + 0.12, { radius: 0.01, name: 'Wall/rightGf' }));
    parts.push(boxSpan(wall, B.x0, B.x0 + B.wall, LEVEL.floor, B.cafeTop, B.z0, B.z1, { radius: 0.01, name: 'Wall/leftGf' }));
    parts.push(boxSpan(wall, B.x0, B.x1, LEVEL.floor, B.cafeTop, B.z0, B.z0 + B.wall, { radius: 0.01, name: 'Wall/backGf' }));

    // 骑楼柱廊：前缘两根柱加转角柱，撑起上面的墙。
    const column = materials.toon('tangTrim');
    [[B.x0 + 0.35], [B.x1 - 0.35]].forEach(([x]) => {
        parts.push(boxAt(column, [0.3, B.cafeTop - LEVEL.lot, 0.3], [x, LEVEL.lot, B.z1 - 0.15], { radius: 0.03, name: 'Arcade/column' }));
    });
    // 退缩的玻璃店面：整面玻璃、门框与右侧敞开的门洞。
    const glassZ = B.z1 - B.arcade;
    parts.push(boxSpan(materials.toon('cafeWall'), B.x0 + B.wall, B.x1 - B.wall, LEVEL.floor, LEVEL.floor + 0.12, glassZ - 0.06, glassZ + 0.06, { radius: 0.01, name: 'Shop/plinth' }));
    parts.push(boxSpan(materials.toon('cafeWall'), B.x0 + B.wall, B.x1 - B.wall, B.cafeTop - 0.34, B.cafeTop, glassZ - 0.06, glassZ + 0.06, { radius: 0.01, name: 'Shop/header' }));
    // 门洞开在右端：玻璃面从右端留 0.9m 不做。
    const doorX0 = B.x1 - B.wall - 0.95;
    const glass = mesh(new THREE.PlaneGeometry(doorX0 - (B.x0 + B.wall), B.cafeTop - 0.34 - LEVEL.floor - 0.12), materials.glass, { name: 'Shop/glass', castShadow: false, receiveShadow: false });
    glass.position.set((B.x0 + B.wall + doorX0) / 2, (LEVEL.floor + 0.12 + B.cafeTop - 0.34) / 2, glassZ + 0.005);
    parts.push(glass);
    // 门框与玻璃分格。
    for (let x = B.x0 + B.wall + 0.75; x < doorX0; x += 0.75) {
        parts.push(boxAt(frame, [0.05, B.cafeTop - 0.34 - LEVEL.floor - 0.12, 0.09], [x, LEVEL.floor + 0.12, glassZ], { radius: 0.005, name: 'Shop/mullion' }));
    }
    parts.push(boxAt(frame, [0.07, B.cafeTop - LEVEL.floor - 0.34, 0.09], [doorX0 + 0.06, LEVEL.floor + 0.12, glassZ], { radius: 0.005, name: 'Shop/doorPost' }));

    // 门头雨篷（兼店招底座）：柱头出挑的斜檐，前沿一条深绿金属包边，字面另挂。
    parts.push(boxSpan(materials.toon('awning'), FASCIA.x0, FASCIA.x1, FASCIA.y0, FASCIA.y1, FASCIA.z0, FASCIA.z1, { radius: 0.02, name: 'Fascia/canopy' }));
    parts.push(boxSpan(materials.toon('windowFrame'), FASCIA.x0 - 0.02, FASCIA.x1 + 0.02, FASCIA.y1 - 0.06, FASCIA.y1 + 0.02, FASCIA.z1 - 0.06, FASCIA.z1, { radius: 0.01, name: 'Fascia/edge' }));
    const fasciaFace: TramlineFace = {
        position: v((FASCIA.x0 + FASCIA.x1) / 2, (FASCIA.y0 + FASCIA.y1) / 2 - 0.02, FASCIA.z1 + 0.005),
        rotationY: 0,
        width: FASCIA.x1 - FASCIA.x0 - 0.15,
        height: FASCIA.y1 - FASCIA.y0 - 0.06,
    };

    // 转角歌词灯箱：深绿金属框、奶油字面（ledScreen 给字），底部两根钢臂斜撑回前后墙。
    const n = { x: Math.sin(BOARD.azimuth), z: Math.cos(BOARD.azimuth) };
    const across = { x: Math.cos(BOARD.azimuth), z: -Math.sin(BOARD.azimuth) };
    const board = new THREE.Group();
    board.name = 'Board';
    board.position.set(BOARD.cx, BOARD.cy, BOARD.cz);
    board.rotation.y = BOARD.azimuth;
    const frameMat = materials.toon('boardFrame');
    board.add(
        boxAt(frameMat, [BOARD.width + 0.16, BOARD.height + 0.16, BOARD.depth], [0, 0, -BOARD.depth / 2], { radius: 0.05, name: 'Board/frame' }),
        boxAt(materials.toon('boardRim'), [BOARD.width + 0.2, 0.06, BOARD.depth + 0.04], [0, BOARD.height / 2 + 0.06, -BOARD.depth / 2], { radius: 0.01, name: 'Board/cap' }),
        boxAt(frameMat, [BOARD.width + 0.2, 0.07, BOARD.depth + 0.04], [0, -BOARD.height / 2 - 0.05, -BOARD.depth / 2], { radius: 0.01, name: 'Board/sill' }),
    );
    // 底部两根斜撑：从板底边回到前墙与右墙。
    const railLocalY = BOARD.cy - BOARD.height / 2 + 0.04;
    const railA = v(BOARD.cx - across.x * 1.15, railLocalY, BOARD.cz - across.z * 1.15);
    const railB = v(BOARD.cx + across.x * 1.15, railLocalY, BOARD.cz + across.z * 1.15);
    parts.push(board);
    const support = materials.toon('darkMetal');
    parts.push(tubeBetween(support, railA, v(-2.0, FASCIA.y1 + 0.02, B.z1 - 0.05), 0.045, { name: 'Board/strut' }));
    parts.push(tubeBetween(support, railB, v(B.x1 - 0.05, FASCIA.y1 + 0.02, -2.1), 0.045, { name: 'Board/strut' }));
    parts.push(tubeBetween(support, v(BOARD.cx - n.x * 0.1, railLocalY, BOARD.cz - n.z * 0.1), v(B.x1 - 0.06, railLocalY - 0.02, B.z1 - 0.06), 0.04, { name: 'Board/strut' }));
    // 字面沿法线探出框架盒前面 2cm，避免共面闪。
    const boardFace: TramlineFace = {
        position: v(BOARD.cx + n.x * 0.02, BOARD.cy, BOARD.cz + n.z * 0.02),
        rotationY: BOARD.azimuth,
        width: BOARD.width,
        height: BOARD.height,
    };

    // 转角竖霓虹「茶餐廳」：门头雨篷下面，骑楼柱头往外挑的一支双面竖灯箱。
    const neonX = B.x1 - 0.1;
    const neonZ = B.z1 + 0.28;
    const neon = new THREE.Group();
    neon.name = 'CornerNeon';
    neon.add(boxAt(materials.toon('signBox'), [0.42, 1.5, 0.2], [0, 0, 0], { radius: 0.03, name: 'Neon/box' }));
    neon.add(boxAt(materials.toon('darkMetal'), [0.06, 0.5, 0.06], [0, 1.0, -0.16], { radius: 0.01, name: 'Neon/arm', rotationY: Math.PI / 4 }));
    neon.position.set(neonX + 0.2, 1.55, neonZ);
    neon.rotation.y = Math.PI / 4;
    parts.push(neon);
    // 字面贴在盒体前后两个薄面上（局部 ±z，半深 0.1，外探 5mm）。
    const neonFaces: TramlineFace[] = [1, -1].map(side => ({
        position: v(neonX + 0.2 + Math.sin(Math.PI / 4) * side * 0.105, 1.55, neonZ + Math.cos(Math.PI / 4) * side * 0.105),
        rotationY: Math.PI / 4 + (side < 0 ? Math.PI : 0),
        width: 0.34,
        height: 1.42,
    }));

    // 住宅窗：窗框、窗台、玻璃；亮灯是贴着玻璃的实例面。空调外机在窗下。
    const windowGlass: THREE.Vector3[] = [];
    WINDOW_SLOTS.forEach(slot => {
        const win = slot.floor === 2 ? B.win2 : B.win3;
        const wy = (win.y0 + win.y1) / 2;
        const w = 0.62;
        const h = win.y1 - win.y0;
        if (slot.face === 0) {
            parts.push(boxAt(frame, [w + 0.12, h + 0.1, 0.1], [slot.x, wy - h / 2 - 0.02, slot.z + B.wall / 2], { radius: 0.01, name: 'Win/frame' }));
            parts.push(boxAt(trim, [w + 0.18, 0.07, 0.2], [slot.x, win.y0 - 0.05, slot.z + B.wall / 2 + 0.04], { radius: 0.01, name: 'Win/sill' }));
            windowGlass.push(v(slot.x, wy, B.z1 + 0.015));
        } else {
            parts.push(boxAt(frame, [0.1, h + 0.1, w + 0.12], [slot.x + B.wall / 2, wy - h / 2 - 0.02, slot.z], { radius: 0.01, name: 'Win/frame' }));
            parts.push(boxAt(trim, [0.2, 0.07, w + 0.18], [slot.x + B.wall / 2 + 0.04, win.y0 - 0.05, slot.z], { radius: 0.01, name: 'Win/sill' }));
            windowGlass.push(v(B.x1 + 0.015, wy, slot.z));
        }
    });
    // 三楼前墙两个小阳台：出挑的台板、三面的细栏杆，盆栽按歌放。
    const balconyAt = (x: number, plants: boolean) => {
        const z = B.z1;
        const y = B.win3.y0 - 0.12;
        const bg = new THREE.Group();
        bg.name = 'Balcony';
        bg.add(
            boxAt(trim, [0.95, 0.08, 0.42], [0, 0, 0.21], { radius: 0.02, name: 'Slab' }),
            tubeBetween(materials.toon('metal'), v(-0.44, 0.72, 0.4), v(0.44, 0.72, 0.4), 0.02, { name: 'Rail' }),
            tubeBetween(materials.toon('metal'), v(-0.44, 0.38, 0.4), v(0.44, 0.38, 0.4), 0.015, { name: 'Rail' }),
            tubeBetween(materials.toon('metal'), v(-0.44, 0.72, 0.05), v(-0.44, 0.72, 0.4), 0.02, { name: 'Rail' }),
            tubeBetween(materials.toon('metal'), v(0.44, 0.72, 0.05), v(0.44, 0.72, 0.4), 0.02, { name: 'Rail' }),
        );
        for (let index = 0; index < 4; index += 1) {
            bg.add(cylinderAt(materials.toon('metal'), 0.014, 0.72, [-0.44 + index * 0.29, 0.08, 0.4], { segments: 6, name: 'Rail/post' }));
        }
        if (plants) {
            bg.add(
                cylinderAt(materials.toon('potColor'), 0.1, 0.16, [-0.2, 0.08, 0.25], { segments: 8, name: 'Plant/pot' }),
                mesh(new THREE.SphereGeometry(0.14, 10, 8), materials.toon('planterGreen'), { name: 'Plant' }),
            );
            bg.children[bg.children.length - 1]!.position.set(-0.2, 0.32, 0.25);
        }
        bg.position.set(x, y, z);
        return bg;
    };
    parts.push(balconyAt(-4.85, variation.balconyPlants[0]), balconyAt(-3.75, variation.balconyPlants[1]));

    // 窗式空调（按歌装哪几台）。
    const ac = materials.toon('acUnit');
    const acGrille = materials.toon('acGrille');
    variation.acSpots.forEach(spot => {
        const s = AC_SLOTS[spot]!;
        if (s.face === 0) {
            parts.push(boxAt(ac, [0.42, 0.3, 0.3], [s.x, s.y, s.z + 0.05], { radius: 0.02, name: 'AC' }));
            parts.push(boxAt(acGrille, [0.3, 0.18, 0.02], [s.x, s.y + 0.03, s.z + 0.21], { radius: 0, name: 'AC/grille' }));
        } else {
            parts.push(boxAt(ac, [0.3, 0.3, 0.42], [s.x + 0.05, s.y, s.z], { radius: 0.02, name: 'AC' }));
            parts.push(boxAt(acGrille, [0.02, 0.18, 0.3], [s.x + 0.21, s.y + 0.03, s.z], { radius: 0, name: 'AC/grille' }));
        }
    });

    // 排水管：右墙前段，从女儿墙一路下来，底部拐个弯（滴水点在 weather.drips）。
    const pipe = materials.toon('pipe');
    parts.push(tubeBetween(pipe, v(B.x1 + 0.09, B.parapetTop - 0.1, -2.4), v(B.x1 + 0.09, LEVEL.lot + 0.35, -2.4), 0.045, { name: 'Pipe' }));
    parts.push(tubeBetween(pipe, v(B.x1 + 0.09, LEVEL.lot + 0.35, -2.4), v(B.x1 + 0.3, LEVEL.lot + 0.18, -2.4), 0.045, { name: 'Pipe/bend' }));

    // 亮灯窗：一批实例贴在玻璃面上（亮 → 暖白，暗 → 很暗的窗玻璃），亮度走 windowLit 这个 glow role。
    const windowGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), materials.glow('windowLit'), WINDOW_SLOTS.length);
    windowGlow.name = 'Win/lit';
    windowGlow.castShadow = false;
    windowGlow.receiveShadow = false;
    windowGlow.userData.dynamic = true;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    WINDOW_SLOTS.forEach((slot, index) => {
        const win = slot.floor === 2 ? B.win2 : B.win3;
        const wy = (win.y0 + win.y1) / 2;
        quat.setFromEuler(new THREE.Euler(0, slot.face === 0 ? 0 : Math.PI / 2, 0));
        scale.set(slot.face === 0 ? 0.56 : 0.56, win.y1 - win.y0 - 0.06, 1);
        const pos = windowGlass[index]!;
        matrix.compose(pos, quat, scale);
        windowGlow.setMatrixAt(index, matrix);
        windowGlow.setColorAt(index, new THREE.Color(variation.litWindows[index] ? 1 : 0.055));
    });
    windowGlow.instanceMatrix.needsUpdate = true;
    if (windowGlow.instanceColor) windowGlow.instanceColor.needsUpdate = true;

    return {
        group: group('Building', ...parts, windowGlow),
        fasciaFace,
        neonFaces,
        windowGlow,
        windowSlots: WINDOW_SLOTS,
        boardFace,
    };
};

/**
 * 茶餐厅内景：花砖地、卡座、圆台折凳、吧台、吊灯与吊扇——只有骑楼底下这一层，透过玻璃与门洞看得到。
 * 按 recordstore 的室内做法：大件用普通几何，重复小件（凳子）走 InstancedMesh。
 */
export const buildCafeInterior = (materials: MachiMaterials): { group: THREE.Object3D; fan: THREE.Object3D; lamps: THREE.Vector3[]; steam: THREE.Vector3; menuFaces: TramlineFace[]; decalFaces: TramlineFace[] } => {
    const parts: THREE.Object3D[] = [];
    const x0 = B.x0 + B.wall;
    const x1 = B.x1 - B.wall;
    const z0 = B.z0 + B.wall;
    const z1 = B.z1 - B.arcade; // 店面玻璃一线
    const floor = LEVEL.floor;

    // 花砖地与内墙裙：地面一格深绿花砖沿口。
    parts.push(boxSpan(materials.toon('cafeFloor'), x0 + 0.01, x1 - 0.01, floor - 0.05, floor + 0.01, z0 + 0.01, z1 - 0.01, { radius: 0.01, name: 'Cafe/floor' }));
    parts.push(boxSpan(materials.toon('cafeWall'), x0 + 0.01, x1 - 0.01, floor, floor + 0.5, z0 + 0.01, z0 + 0.1, { radius: 0.01, name: 'Cafe/wainscot' }));

    // 吧台：沿后墙，前面一条不锈钢边，台面上玻璃饼柜与两只热水壶。
    const counter = { x0: x0 + 0.35, x1: x1 - 1.3, z: z0 + 0.75 };
    parts.push(boxAt(materials.toon('counterBody'), [counter.x1 - counter.x0, 0.98, 0.55], [(counter.x0 + counter.x1) / 2, floor, counter.z], { radius: 0.03, name: 'Counter' }));
    parts.push(boxAt(materials.toon('chrome'), [counter.x1 - counter.x0 + 0.04, 0.06, 0.6], [(counter.x0 + counter.x1) / 2, floor + 0.98, counter.z], { radius: 0.01, name: 'Counter/top' }));
    parts.push(boxAt(materials.toon('glassCase'), [0.7, 0.42, 0.42], [counter.x0 + 0.55, floor + 1.04, counter.z], { radius: 0.02, name: 'Counter/case' }));
    for (let index = 0; index < 2; index += 1) {
        parts.push(cylinderAt(materials.toon('kettle'), 0.09, 0.24, [counter.x1 - 0.35 - index * 0.28, floor + 1.04, counter.z - 0.1], { segments: 10, name: 'Kettle' }));
    }

    // 靠左墙一排卡座：长凳加两张小方台。
    const bench = materials.toon('benchSeat');
    parts.push(boxAt(bench, [0.5, 0.5, 1.9], [x0 + 0.42, floor, z1 - 1.75], { radius: 0.05, name: 'Bench' }));
    parts.push(boxAt(bench, [0.5, 0.95, 1.9], [x0 + 0.2, floor, z1 - 1.75], { radius: 0.05, name: 'Bench/back' }));
    const tableTop = materials.toon('tableTop');
    [[x0 + 0.95, z1 - 1.25], [x0 + 0.95, z1 - 2.35]].forEach(([x, z]) => {
        parts.push(boxAt(tableTop, [0.62, 0.06, 0.62], [x, floor + 0.68, z], { radius: 0.02, name: 'Table' }));
        parts.push(cylinderAt(materials.toon('darkMetal'), 0.04, 0.68, [x, floor, z], { segments: 8, name: 'Table/leg' }));
    });
    // 折凳：一批实例（凳面圆板加四条腿合成一个几何会麻烦，就用圆凳加底座环）。
    const stoolGeometry = new THREE.CylinderGeometry(0.15, 0.13, 0.46, 10);
    const stools = new THREE.InstancedMesh(stoolGeometry, materials.toon('stoolSeat'), 5);
    stools.name = 'Stools';
    const matrix = new THREE.Matrix4();
    const stoolAt = [
        [x0 + 1.5, z1 - 1.25], [x0 + 1.5, z1 - 2.35],
        [x0 + 2.6, z1 - 1.15], [x0 + 3.0, z1 - 1.65], [x0 + 2.5, z1 - 2.2],
    ];
    stoolAt.forEach(([x, z], index) => {
        matrix.makeTranslation(x, floor + 0.23, z);
        stools.setMatrixAt(index, matrix);
    });
    parts.push(stools);
    // 中间一张圆台。
    parts.push(cylinderAt(tableTop, 0.45, 0.05, [x0 + 2.75, floor + 0.68, z1 - 1.6], { segments: 18, name: 'Table/round' }));
    parts.push(cylinderAt(materials.toon('darkMetal'), 0.05, 0.68, [x0 + 2.75, floor, z1 - 1.6], { segments: 8, name: 'Table/roundLeg' }));

    // 吊灯：两只绿搪瓷灯罩，灯口一圈暖光（glow 件），位置留给真实点光。
    const lamps: THREE.Vector3[] = [];
    [[x0 + 1.6, z1 - 1.3], [x0 + 3.0, z1 - 1.7]].forEach(([x, z], index) => {
        const y = B.cafeTop - 0.62;
        parts.push(tubeBetween(materials.toon('darkMetal'), v(x, B.cafeTop - 0.02, z), v(x, y + 0.16, z), 0.015, { name: 'Lamp/cord' }));
        parts.push(mesh(new THREE.CylinderGeometry(0.05, 0.19, 0.14, 14, 1, true), materials.toon('lampShade'), { name: `Lamp${index}` }));
        parts[parts.length - 1]!.position.set(x, y + 0.1, z);
        const bulb = mesh(new THREE.SphereGeometry(0.05, 10, 8), materials.glow('cafeLamp'), { name: 'Lamp/bulb', castShadow: false, receiveShadow: false });
        bulb.position.set(x, y, z);
        parts.push(bulb);
        lamps.push(v(x, y - 0.02, z));
    });

    // 吊扇：天花中央，三叶，每帧转。
    const fan = new THREE.Group();
    fan.name = 'Fan';
    const fanMat = materials.toon('fanBlade');
    for (let index = 0; index < 3; index += 1) {
        const blade = boxAt(fanMat, [0.52, 0.02, 0.12], [0.3, 0, 0], { radius: 0.02, name: 'Blade' });
        const arm = new THREE.Group();
        arm.rotation.y = (index * Math.PI * 2) / 3;
        arm.add(blade);
        fan.add(arm);
    }
    fan.add(cylinderAt(materials.toon('darkMetal'), 0.04, 0.3, [0, 0, 0], { segments: 8, name: 'Fan/rod' }));
    fan.position.set(x0 + 2.2, B.cafeTop - 0.32, z1 - 1.7);
    fan.userData.dynamic = true;
    parts.push(fan);

    // 菜单牌位（后墙两块，字另画）与玻璃圆贴纸位。
    const menuFaces: TramlineFace[] = [
        { position: v(x0 + 1.15, floor + 1.75, z0 + 0.11), rotationY: 0, width: 0.9, height: 0.55 },
        { position: v(x0 + 2.2, floor + 1.75, z0 + 0.11), rotationY: 0, width: 0.9, height: 0.55 },
    ];
    const glassZ = z1;
    const decalFaces: TramlineFace[] = [
        { position: v(x0 + 0.9, floor + 1.35, glassZ + 0.01), rotationY: 0, width: 0.3, height: 0.3 },
        { position: v(x0 + 1.5, floor + 1.05, glassZ + 0.01), rotationY: 0, width: 0.3, height: 0.3 },
    ];

    return {
        group: group('Cafe', ...parts),
        fan,
        lamps,
        steam: v(x0 + 0.75, floor + 1.15, z0 + 0.5),
        menuFaces,
        decalFaces,
    };
};
