import * as THREE from 'three';
import type { MachiMaterials } from '../../engine/materials';
import { BOARD, CHAMFER_CENTER, EQ, LEVEL, PAGODA, PROPS, STAIR, TERRACE } from './layout';
import { boxAt, boxSpan, cylinderAt, group, mesh, roundedBox, tubeBetween } from '../../engine/geometry/shapes';

// src/components/visualizer/machi/scenes/changan/terrace.ts
// 后中主体 Group "Terrace"：石砌高台（前右角斜面+中央台阶+一圈栏板）、台面上的七层大雁塔
// （青砖塔身、逐层收分、叠涩出檐带翘角、四面暖光拱窗、塔刹）、台阶旁一尊小陶俑，
// 台基前墙上的歌词屏木框与屏下的 EQ 光柱条带（InstancedMesh，高低每帧由招牌组改）。

/** 台帮顶面高度（压顶石上表面）。 */
export const TERRACE_TOP = TERRACE.top + 0.05;

export interface ChanganTerraceParts {
    group: THREE.Group;
    /** 歌词屏面：贴在台基前墙上，朝 +z。 */
    boardFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    /** EQ 光柱条带：几何与原位参数，update 里按节拍改每根的 scale.y。 */
    eq: {
        mesh: THREE.InstancedMesh;
        count: number;
        x0: number;
        spacing: number;
        y0: number;
        z: number;
        maxHeight: number;
        phases: Float32Array;
    };
    /** 塔尖顶的世界坐标（构图取景用）。 */
    pagodaTop: THREE.Vector3;
}

/** 石砌高台：两个角上的主体盒 + 前右角的 45° 斜面墙 + 压顶铺地 + 沿边栏板。 */
const buildTerraceBody = (materials: MachiMaterials) => {
    const stone = materials.toon('terraceStone');
    const cap = materials.toon('stoneCap');
    const dark = materials.toon('stoneDark');
    const { x0, x1, z0, z1, top, chamfer, railTop } = TERRACE;
    const parts: THREE.Object3D[] = [];

    // 主体：后段整宽 + 前段左侧（前右角空出来装斜面）。
    parts.push(boxSpan(stone, x0, x1, 0, top, z0, z1 - chamfer, { radius: 0.03, name: 'Terrace/bodyBack' }));
    parts.push(boxSpan(stone, x0, x1 - chamfer, 0, top, z1 - chamfer, z1, { radius: 0.03, name: 'Terrace/bodyFront' }));
    // 斜面墙：沿前右角斜边立着的一块，从场地升到台帮顶。
    const diagonal = Math.hypot(chamfer, chamfer);
    parts.push(boxAt(stone, [diagonal + 0.1, top, 0.2], [CHAMFER_CENTER.x, 0, CHAMFER_CENTER.z], { rotationY: STAIR.yaw, name: 'Terrace/chamfer' }));
    // 台帮上沿一圈勾边（压顶下的一道线脚）。
    parts.push(boxSpan(dark, x0 - 0.02, x1 + 0.02, top - 0.1, top, z0 - 0.02, z1 - chamfer + 0.02, { radius: 0.015, name: 'Terrace/trimBack' }));
    parts.push(boxSpan(dark, x0 - 0.02, x1 - chamfer + 0.02, top - 0.1, top, z1 - chamfer, z1 + 0.02, { radius: 0.015, name: 'Terrace/trimFront' }));
    // 压顶铺地：比台帮出挑一点。
    parts.push(boxSpan(cap, x0 - 0.07, x1 + 0.07, top, TERRACE_TOP, z0 - 0.07, z1 - chamfer + 0.07, { radius: 0.02, name: 'Terrace/capBack' }));
    parts.push(boxSpan(cap, x0 - 0.07, x1 - chamfer + 0.07, top, TERRACE_TOP, z1 - chamfer, z1 + 0.07, { radius: 0.02, name: 'Terrace/capFront' }));
    parts.push(boxAt(cap, [diagonal * 0.72, TERRACE_TOP - top, 0.28], [CHAMFER_CENTER.x + Math.sin(STAIR.yaw) * 0.02, top, CHAMFER_CENTER.z + Math.cos(STAIR.yaw) * 0.02], { rotationY: STAIR.yaw, name: 'Terrace/capChamfer' }));

    // 栏板：台帮四条边的矮墙（斜面留空——那里是台阶），柱头按间距一根根插出来。
    const railBottom = TERRACE_TOP;
    const railThickness = 0.14;
    const runs: { x0: number; z0: number; x1: number; z1: number }[] = [
        { x0, z0: z1, x1: x1 - chamfer, z1 }, // 前墙（斜面之前那段）
        { x0: x1, z0: z1 - chamfer, x1, z1: z0 }, // 右墙
        { x0: x1, z0, x1: x0, z1: z0 }, // 后墙
        { x0, z0, x1: x0, z1 }, // 左墙
    ];
    const posts: THREE.Vector3[] = [];
    runs.forEach((run, index) => {
        const length = Math.hypot(run.x1 - run.x0, run.z1 - run.z0);
        const yaw = Math.atan2(run.x1 - run.x0, run.z1 - run.z0) + Math.PI / 2;
        parts.push(boxAt(dark, [length, railTop, railThickness], [(run.x0 + run.x1) / 2, railBottom, (run.z0 + run.z1) / 2], { rotationY: yaw, radius: 0.02, name: `Terrace/rail${index}` }));
        const count = Math.floor(length / 0.62);
        for (let k = 0; k <= count; k += 1) {
            const t = count === 0 ? 0.5 : k / count;
            posts.push(new THREE.Vector3(run.x0 + (run.x1 - run.x0) * t, railBottom, run.z0 + (run.z1 - run.z0) * t));
        }
    });
    const postGeometry = roundedBox(0.15, railTop + 0.12, 0.15, 0.02);
    const postMesh = new THREE.InstancedMesh(postGeometry, cap, posts.length);
    postMesh.name = 'Terrace/railPosts';
    const matrix = new THREE.Matrix4();
    posts.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y + (railTop + 0.12) / 2, position.z);
        postMesh.setMatrixAt(index, matrix);
    });
    parts.push(postMesh);
    return group('Terrace/body', ...parts);
};

/** 中央台阶：从斜面中点朝镜头下来的整段实心台阶 + 两侧栏板柱与扶手。 */
const buildStair = (materials: MachiMaterials) => {
    const stone = materials.toon('terraceStone');
    const cap = materials.toon('stoneCap');
    const dark = materials.toon('stoneDark');
    const parts: THREE.Object3D[] = [];
    const dirX = Math.sin(STAIR.yaw);
    const dirZ = Math.cos(STAIR.yaw);
    const rise = TERRACE_TOP - STAIR.base;
    const tread = STAIR.run / STAIR.steps;
    // 每步都是落地的一块（前低后高的实心梯段，侧面看是对的）。
    for (let index = 0; index < STAIR.steps; index += 1) {
        const top = TERRACE_TOP - ((index + 1) * rise) / STAIR.steps;
        const d = (index + 0.5) * tread;
        parts.push(boxAt(
            stone,
            [STAIR.width, top - 0.06, tread + 0.05],
            [CHAMFER_CENTER.x + dirX * d, 0.06, CHAMFER_CENTER.z + dirZ * d],
            { rotationY: STAIR.yaw, radius: 0.015, name: `Stair/step${index}` },
        ));
    }
    // 两侧：栏板矮柱 + 顺坡扶手管。
    const side = { x: dirZ, z: -dirX }; // 台阶横向单位向量
    [-1, 1].forEach(sign => {
        const offset = (STAIR.width / 2 + 0.07) * sign;
        for (const t of [0.12, 0.55, 0.95]) {
            const d = t * STAIR.run;
            const y = TERRACE_TOP - t * rise;
            parts.push(boxAt(cap, [0.13, 0.42, 0.13], [CHAMFER_CENTER.x + dirX * d + side.x * offset, y - 0.05, CHAMFER_CENTER.z + dirZ * d + side.z * offset], { rotationY: STAIR.yaw, name: 'Stair/railPost' }));
        }
        const from = new THREE.Vector3(CHAMFER_CENTER.x + dirX * 0.12 * STAIR.run + side.x * offset, TERRACE_TOP - 0.12 * rise + 0.36, CHAMFER_CENTER.z + dirZ * 0.12 * STAIR.run + side.z * offset);
        const to = new THREE.Vector3(CHAMFER_CENTER.x + dirX * 0.95 * STAIR.run + side.x * offset, TERRACE_TOP - 0.95 * rise + 0.36, CHAMFER_CENTER.z + dirZ * 0.95 * STAIR.run + side.z * offset);
        parts.push(tubeBetween(dark, from, to, 0.035, { name: 'Stair/rail' }));
    });
    return group('Terrace/stair', ...parts);
};

/** 七层大雁塔：青砖塔身逐层收分，每层叠涩出檐、四面暖光拱窗，顶上塔刹。 */
const buildPagoda = (materials: MachiMaterials) => {
    const brick = materials.toon('pagodaBrick');
    const eave = materials.toon('pagodaEave');
    const trim = materials.glow('eaveTrim');
    const arch = materials.glow('pagodaArch');
    const parts: THREE.Object3D[] = [];
    const { cx, cz, baseWidth, taper, levelHeights, eaveOverhang, eaveThickness, underEave, spire } = PAGODA;
    let y = TERRACE_TOP;
    let width = baseWidth;
    levelHeights.forEach((height, level) => {
        const taller = level === 0;
        // 塔身 + 面阔收分线脚。
        parts.push(boxAt(brick, [width, height, width], [cx, y, cz], { radius: 0.03, name: `Pagoda/body${level}` }));
        parts.push(boxAt(eave, [width + 0.1, 0.09, width + 0.1], [cx, y + height - 0.09, cz], { radius: 0.02, name: `Pagoda/band${level}` }));
        // 叠涩出檐：檐下先出半层，再出整檐，檐角微翘。
        const eaveY = y + height;
        parts.push(boxAt(eave, [width + underEave * 2, eaveThickness * 0.6, width + underEave * 2], [cx, eaveY, cz], { radius: 0.015, name: `Pagoda/underEave${level}` }));
        const eaveW = width + eaveOverhang * 2;
        parts.push(boxAt(eave, [eaveW, eaveThickness * 0.5, eaveW], [cx, eaveY + eaveThickness * 0.6, cz], { radius: 0.015, name: `Pagoda/eave${level}` }));
        // 四角微翘的小檐角。
        const corner = eaveW / 2 - 0.1;
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {
            const tip = mesh(roundedBox(0.24, 0.045, 0.24, 0.02), eave, { name: 'Pagoda/eaveTip' });
            tip.position.set(cx + sx! * corner, eaveY + eaveThickness + 0.05, cz + sz! * corner);
            tip.rotation.y = -Math.atan2(sz!, sx!);
            tip.rotation.z = 0.34;
            parts.push(tip);
        });
        // 檐口下沿一圈受光的金线（泛光照到檐口的暗示）。
        parts.push(boxAt(trim, [eaveW + 0.01, 0.025, eaveW + 0.01], [cx, eaveY - 0.02, cz], { radius: 0.01, name: `Pagoda/eaveTrim${level}` }));
        // 四面拱窗：暖光的小洞口，底层的高大些；每层比塔身往外探一点点避免 z-fight。
        const archW = taller ? 0.55 : 0.34;
        const archH = taller ? 0.85 : 0.5;
        const archY = y + (taller ? 0.35 : height * 0.32);
        const archR = archW / 2;
        [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dz], face) => {
            const faceDist = width / 2 + 0.015;
            const ax = cx + dx! * faceDist;
            const az = cz + dz! * faceDist;
            const yaw = dx !== 0 ? Math.PI / 2 : 0;
            parts.push(boxAt(arch, [archW, archH - archR, 0.035], [ax, archY, az], { rotationY: yaw, radius: 0.02, name: `Pagoda/arch${level}:${face}` }));
            // 拱顶：轴沿面法线的一张圆盘，下半与矩形重合，露出的上半正好是圆拱。
            const capCylinder = mesh(new THREE.CylinderGeometry(archR, archR, 0.035, 12), arch, { name: `Pagoda/archTop${level}:${face}` });
            capCylinder.position.set(ax, archY + archH - archR, az);
            if (dx !== 0) capCylinder.rotation.z = Math.PI / 2;
            else capCylinder.rotation.x = Math.PI / 2;
            parts.push(capCylinder);
        });
        y += height + eaveThickness;
        width *= taper;
    });
    // 塔刹：基座圆盘、刹杆、相轮宝珠、尖顶。
    parts.push(cylinderAt(eave, 0.3, 0.1, [cx, y, cz], { name: 'Pagoda/spireBase' }));
    parts.push(cylinderAt(brick, 0.055, spire, [cx, y + 0.06, cz], { radiusTop: 0.022, name: 'Pagoda/spireRod' }));
    [[0.1, 0.28], [0.08, 0.45], [0.055, 0.6]].forEach(([r, at], index) => {
        const orb = mesh(new THREE.SphereGeometry(r!, 12, 8), trim, { name: `Pagoda/orb${index}` });
        orb.position.set(cx, y + 0.06 + at!, cz);
        parts.push(orb);
    });
    const tip = mesh(new THREE.ConeGeometry(0.05, 0.18, 10), trim, { name: 'Pagoda/spireTip' });
    tip.position.set(cx, y + 0.06 + spire, cz);
    parts.push(tip);
    return { parts, top: new THREE.Vector3(cx, y + 0.06 + spire + 0.12, cz) };
};

/** 歌词屏的木框与背板 + 屏下一排 EQ 光柱（InstancedMesh）。 */
const buildBoardMount = (materials: MachiMaterials) => {
    const wood = materials.toon('wood');
    const panel = materials.toon('boardPanel');
    const eqGlow = materials.glow('eqBar');
    const parts: THREE.Object3D[] = [];
    const { cx, width, height, y0, depth } = BOARD;
    const faceZ = TERRACE.z1;
    // 屏箱：深色背板贴出台面一点点，四周唐风木框。
    parts.push(boxAt(panel, [width + 0.14, height + 0.14, depth], [cx, y0 - 0.07, faceZ - depth / 2 + 0.02], { radius: 0.02, name: 'Board/case' }));
    const frameZ = faceZ + 0.015;
    parts.push(boxAt(wood, [width + 0.26, 0.12, 0.07], [cx, y0 + height + 0.02, frameZ], { radius: 0.02, name: 'Board/frameTop' }));
    parts.push(boxAt(wood, [width + 0.26, 0.12, 0.07], [cx, y0 - 0.1, frameZ], { radius: 0.02, name: 'Board/frameBottom' }));
    parts.push(boxAt(wood, [0.12, height + 0.14, 0.07], [cx - width / 2 - 0.07, y0 - 0.02, frameZ], { radius: 0.02, name: 'Board/frameL' }));
    parts.push(boxAt(wood, [0.12, height + 0.14, 0.07], [cx + width / 2 + 0.07, y0 - 0.02, frameZ], { radius: 0.02, name: 'Board/frameR' }));
    // 框顶一条小檐口（呼应塔檐）。
    parts.push(boxAt(wood, [width + 0.42, 0.06, 0.16], [cx, y0 + height + 0.14, frameZ - 0.03], { radius: 0.015, name: 'Board/frameCap' }));

    // EQ 光柱：屏下墙上一排小竖柱，高低随节拍（场景帧里改 scale.y）。
    const spacing = EQ.width / EQ.count;
    const barGeometry = roundedBox(spacing * 0.62, 1, 0.05, 0.015);
    const eqMesh = new THREE.InstancedMesh(barGeometry, eqGlow, EQ.count);
    eqMesh.name = 'Board/eq';
    const x0 = EQ.cx - EQ.width / 2 + spacing / 2;
    const phases = new Float32Array(EQ.count);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < EQ.count; index += 1) {
        phases[index] = index / EQ.count;
        matrix.makeTranslation(x0 + spacing * index, EQ.y0 + EQ.maxHeight * 0.3, TERRACE.z1 + 0.02);
        matrix.scale(new THREE.Vector3(1, EQ.maxHeight * 0.6, 1));
        eqMesh.setMatrixAt(index, matrix);
    }
    eqMesh.userData.dynamic = true;
    parts.push(eqMesh);
    return { parts, eq: { mesh: eqMesh, count: EQ.count, x0, spacing, y0: EQ.y0, z: TERRACE.z1 + 0.02, maxHeight: EQ.maxHeight, phases } };
};

/** 台阶旁的陶俑：砖台座上一尊小立俑（腿、身、肩、双臂、头与冠）。 */
const buildWarrior = (materials: MachiMaterials) => {
    const clay = materials.toon('terracotta');
    const dark = materials.toon('warriorDark');
    const plinth = materials.toon('stoneDark');
    const figure = new THREE.Group();
    figure.name = 'Warrior';
    const h = 1.05;
    figure.add(boxAt(clay, [0.3, 0.42, 0.22], [0, 0, 0], { radius: 0.04, name: 'legs' }));
    figure.add(boxAt(clay, [0.34, 0.34, 0.24], [0, 0.4, 0], { radius: 0.05, name: 'torso' }));
    figure.add(boxAt(clay, [0.42, 0.12, 0.26], [0, 0.68, 0], { radius: 0.04, name: 'shoulders' }));
    figure.add(boxAt(clay, [0.09, 0.34, 0.12], [-0.2, 0.42, 0.04], { radius: 0.03, name: 'armL' }));
    figure.add(boxAt(clay, [0.09, 0.34, 0.12], [0.2, 0.42, 0.04], { radius: 0.03, name: 'armR' }));
    figure.add(boxAt(clay, [0.17, 0.2, 0.17], [0, 0.8, 0.02], { radius: 0.05, name: 'head' }));
    figure.add(boxAt(dark, [0.2, 0.07, 0.2], [0, 0.97, 0.02], { radius: 0.02, name: 'hat' }));
    figure.add(boxAt(dark, [0.36, 0.05, 0.26], [0, 0.35, 0.13], { radius: 0.015, name: 'belt' }));
    figure.scale.setScalar(h / 1.02);
    figure.position.set(PROPS.warrior.x, LEVEL.lot + 0.34, PROPS.warrior.z);
    figure.rotation.y = PROPS.warrior.yaw;
    const base = boxAt(plinth, [0.5, 0.34, 0.5], [PROPS.warrior.x, LEVEL.lot, PROPS.warrior.z], { radius: 0.03, name: 'Warrior/base' });
    return group('Terrace/warrior', base, figure);
};

export const buildChanganTerrace = (materials: MachiMaterials): ChanganTerraceParts => {
    const pagoda = buildPagoda(materials);
    const mount = buildBoardMount(materials);
    const group2 = group(
        'Terrace',
        buildTerraceBody(materials),
        buildStair(materials),
        group('Terrace/pagoda', ...pagoda.parts),
        group('Terrace/board', ...mount.parts),
        buildWarrior(materials),
    );
    const faceZ = TERRACE.z1 + 0.028;
    return {
        group: group2,
        boardFace: {
            position: new THREE.Vector3(BOARD.cx, BOARD.y0 + BOARD.height / 2 - 0.02, faceZ),
            rotationY: 0,
            width: BOARD.width - 0.14,
            height: BOARD.height - 0.12,
        },
        eq: mount.eq,
        pagodaTop: pagoda.top,
    };
};
