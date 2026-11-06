import * as THREE from 'three';
import { createVisualizerRng } from '../../../visualizerSeedHash';
import type { MachiMaterials } from '../../engine/materials';
import { LEVEL, STORE } from './layout';
import { boxSpan, cylinderAt, group, mesh, roundedBox, tubeBetween } from '../../engine/geometry/shapes';

// src/components/visualizer/machi/scenes/recordstore/interior.ts
// 唱片店店内 Group "Store/Interior"：后墙一整面黑胶货架（封脊朝外）、两排翻唱片的木箱岛（含窗前的一排矮箱）、
// 左墙的唱片封面墙、右前的试听角（唱机 + 耳机架，唱盘会转）、门口左侧的柜台、吊灯。
// 封脊、箱里的唱片、封面墙上的封面都是 InstancedMesh，颜色走实例色（调色板商品色按歌变），
// 换主题时由运行时按 colorIndex 重写。动线：门口 → 柜台 → 两排翻箱 → 后墙货架 → 右边试听角。

export interface RecordstoreProductBatch {
    mesh: THREE.InstancedMesh;
    /** 每个实例用调色板第几个商品色，以及明暗抖动。 */
    colorIndex: Uint8Array;
    shade: Float32Array;
}

export interface RecordstoreInteriorParts {
    group: THREE.Group;
    productBatches: RecordstoreProductBatch[];
    /** 试听角会转的唱盘（连唱片标签），按氛围时钟转，暂停时停。 */
    platter: THREE.Object3D;
}

const WALL_X = STORE.x0 + STORE.wall;
const WALL_Z = STORE.z0 + STORE.wall;

/** 后墙货架：底座到屋顶，四层封脊朝外的黑胶。 */
const SHELVES = { x0: -5.2, x1: 0.28, z0: WALL_Z, depth: 0.34, levels: [0.1, 0.55, 1.0, 1.45] as const, top: 1.92 };

/** 翻唱片木箱（岛）：四个箱子，两排；窗前还有一排矮箱贴着落地玻璃，路人从外面也看得见彩色封脊。 */
const CRATES = [
    { x: -4.5, z: -3.0 }, { x: -3.72, z: -3.0 },
    { x: -4.5, z: -1.35 }, { x: -3.72, z: -1.35 },
] as const;
const CRATE = { w: 0.62, d: 1.15, h: 0.58 };
const WINDOW_BIN = { x0: -4.55, x1: -1.35, z0: -0.32, z1: 0.1, h: 0.42 };

/** 左墙的唱片封面墙：方封面排成网格。 */
const COVER_WALL = { z0: -5.0, z1: -0.75, step: 0.47, rows: [0.62, 1.1, 1.58] as const, size: 0.36 };

/** 试听角：柜台式的唱机柜与旁边的耳机架。 */
const TURNTABLE = { x0: -0.42, x1: 0.28, z0: -1.62, z1: -0.92, top: 0.84 };

/** 柜台：门口左边，对着自动门。 */
const COUNTER = { x0: -2.95, x1: -1.55, z0: -0.95, z1: -0.32, h: 0.9 };

interface ProductSlot {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    d: number;
    /** 绕 x 的后仰（箱里的唱片）。 */
    tilt?: number;
    color: number;
    shade: number;
}

/** 后墙货架骨架：两侧端板、顶板、踢脚、四层隔板（唱片封脊站在这上面）。 */
const buildShelves = (materials: MachiMaterials) => {
    const shelf = materials.toon('shelf');
    const dark = materials.toon('darkMetal');
    const { x0, x1, z0, depth, levels, top } = SHELVES;
    const z1 = z0 + depth;
    const y = LEVEL.floor;
    const parts: THREE.Object3D[] = [
        boxSpan(dark, x0, x1, y, y + 0.08, z0, z1, { radius: 0.01, name: 'Kick' }),
        boxSpan(shelf, x0 - 0.03, x0, y, y + top, z0, z1, { radius: 0.01, name: 'End' }),
        boxSpan(shelf, x1, x1 + 0.03, y, y + top, z0, z1, { radius: 0.01, name: 'End' }),
        boxSpan(shelf, x0, x1, y + top, y + top + 0.04, z0, z1, { radius: 0.01, name: 'Top' }),
        boxSpan(shelf, x0, x1, y, y + top, z0, z0 + 0.025, { radius: 0.005, name: 'Back' }),
    ];
    levels.slice(1).forEach(level => {
        parts.push(boxSpan(shelf, x0, x1, y + level - 0.025, y + level, z0, z1, { radius: 0.006, name: 'Board' }));
    });
    // 隔板前缘的价签条（暖黄铜的一条）。
    levels.forEach(level => {
        parts.push(boxSpan(materials.toon('brass'), x0, x1, y + level - 0.015, y + level + 0.035, z1 - 0.012, z1, { radius: 0.004, name: 'TagStrip' }));
    });
    return group('RecordShelves', ...parts);
};

/** 货架上的封脊槽位：每张黑胶一片薄板，厚度、颜色、缺口都按 seed 抖。 */
const fillShelves = (random: () => number, into: ProductSlot[]) => {
    const { x0, x1, z0, depth, levels } = SHELVES;
    const front = z0 + depth;
    levels.forEach(level => {
        let x = x0 + 0.05;
        while (x < x1 - 0.06) {
            const w = 0.026 + random() * 0.02;
            if (random() > 0.06) {
                into.push({
                    x: x + w / 2,
                    y: LEVEL.floor + level,
                    z: front - depth / 2 - 0.02,
                    w,
                    h: 0.31 + random() * 0.035,
                    d: depth - 0.05,
                    color: Math.floor(random() * 8),
                    shade: 0.72 + random() * 0.42,
                });
            }
            x += w + 0.004 + random() * 0.012;
        }
    });
};

/** 一只翻唱片木箱：木框、底板、里面的唱片槽位（封套面朝着翻的方向，一列列排着）。 */
const buildCrate = (materials: MachiMaterials, at: { x: number; z: number }, name: string, random: () => number, into: ProductSlot[]) => {
    const wood = materials.toon('wood');
    const { w, d, h } = CRATE;
    const y = LEVEL.floor;
    const x0 = at.x - w / 2;
    const x1 = at.x + w / 2;
    const z0 = at.z - d / 2;
    const z1 = at.z + d / 2;
    const parts: THREE.Object3D[] = [
        boxSpan(wood, x0, x1, y + 0.05, y + h, z0, z0 + 0.04, { radius: 0.01, name: 'Side' }),
        boxSpan(wood, x0, x1, y + 0.05, y + h, z1 - 0.04, z1, { radius: 0.01, name: 'Side' }),
        boxSpan(wood, x0, x0 + 0.04, y + 0.05, y + h, z0, z1, { radius: 0.01, name: 'Side' }),
        boxSpan(wood, x1 - 0.04, x1, y + 0.05, y + h, z0, z1, { radius: 0.01, name: 'Side' }),
        boxSpan(wood, x0 + 0.04, x1 - 0.04, y + 0.02, y + 0.08, z0 + 0.04, z1 - 0.04, { radius: 0.008, name: 'Bottom' }),
        boxSpan(materials.toon('darkMetal'), x0 - 0.02, x1 + 0.02, y, y + 0.05, z0 - 0.02, z1 + 0.02, { radius: 0.01, name: 'Feet' }),
    ];
    // 唱片：面在 x、z 平面里站直，沿 z 一列排开，各自后仰一点点（翻的时候往后倒）。
    const count = Math.floor((d - 0.16) / 0.034);
    for (let index = 0; index < count; index += 1) {
        if (random() < 0.08) continue;
        into.push({
            x: at.x,
            y: y + 0.1,
            z: z0 + 0.1 + index * 0.034,
            w: w - 0.14,
            h: 0.3,
            d: 0.014,
            tilt: -0.1 - random() * 0.1 + (index / count) * 0.16,
            color: Math.floor(random() * 8),
            shade: 0.75 + random() * 0.4,
        });
    }
    return group(name, ...parts);
};

/** 窗前的矮翻箱：一整条，里面三格。 */
const buildWindowBin = (materials: MachiMaterials, random: () => number, into: ProductSlot[]) => {
    const wood = materials.toon('wood');
    const { x0, x1, z0, z1, h } = WINDOW_BIN;
    const y = LEVEL.floor;
    const parts: THREE.Object3D[] = [
        boxSpan(wood, x0, x1, y + 0.04, y + h, z0, z0 + 0.035, { radius: 0.01, name: 'Back' }),
        boxSpan(wood, x0, x1, y + 0.04, y + h * 0.72, z1 - 0.035, z1, { radius: 0.01, name: 'Front' }),
        boxSpan(wood, x0, x0 + 0.035, y + 0.04, y + h, z0, z1, { radius: 0.01, name: 'End' }),
        boxSpan(wood, x1 - 0.035, x1, y + 0.04, y + h, z0, z1, { radius: 0.01, name: 'End' }),
        boxSpan(wood, x0 + 0.035, x1 - 0.035, y + 0.045, y + 0.095, z0 + 0.035, z1 - 0.035, { radius: 0.008, name: 'Bottom' }),
        boxSpan(materials.toon('darkMetal'), x0 - 0.015, x1 + 0.015, y, y + 0.045, z0 - 0.015, z1 + 0.015, { radius: 0.008, name: 'Feet' }),
    ];
    for (let divider = 1; divider < 3; divider += 1) {
        const x = x0 + ((x1 - x0) * divider) / 3;
        parts.push(boxSpan(wood, x - 0.015, x + 0.015, y + 0.04, y + h * 0.86, z0, z1, { radius: 0.006, name: 'Divider' }));
    }
    // 每格一列唱片，面朝 +z（对着窗外的街）。
    for (let cell = 0; cell < 3; cell += 1) {
        const cx = x0 + ((x1 - x0) * (cell + 0.5)) / 3;
        const count = 11 + Math.floor(random() * 3);
        for (let index = 0; index < count; index += 1) {
            into.push({
                x: cx,
                y: y + 0.09,
                z: z0 + 0.07 + index * ((z1 - z0 - 0.14) / count),
                w: (x1 - x0) / 3 - 0.16,
                h: 0.3,
                d: 0.014,
                tilt: -0.08 - random() * 0.12 + (index / count) * 0.14,
                color: Math.floor(random() * 8),
                shade: 0.75 + random() * 0.4,
            });
        }
    }
    return group('WindowBin', ...parts);
};

/** 封面墙：左墙内面上的木条挂轨，封面一张张挂上去（槽位在 fillCoverWall 里）。 */
const buildCoverWall = (materials: MachiMaterials) => {
    const parts: THREE.Object3D[] = COVER_WALL.rows.map(row =>
        boxSpan(materials.toon('wood'), WALL_X + 0.02, WALL_X + 0.055, LEVEL.floor + row - 0.02, LEVEL.floor + row, COVER_WALL.z0 - 0.06, COVER_WALL.z1 + 0.06, { radius: 0.005, name: 'Rail' }));
    return group('CoverWall', ...parts);
};

/** 封面墙上的封面槽位。 */
const fillCoverWall = (random: () => number, into: ProductSlot[]) => {
    const cols = Math.floor((COVER_WALL.z1 - COVER_WALL.z0) / COVER_WALL.step);
    COVER_WALL.rows.forEach(row => {
        for (let index = 0; index <= cols; index += 1) {
            if (random() < 0.06) continue;
            into.push({
                x: WALL_X + 0.02 + 0.012,
                y: LEVEL.floor + row,
                z: COVER_WALL.z0 + index * COVER_WALL.step,
                w: 0.024,
                h: COVER_WALL.size,
                d: COVER_WALL.size,
                color: Math.floor(random() * 8),
                shade: 0.78 + random() * 0.4,
            });
        }
    });
};

/** 试听角：唱机柜（木柜，转盘 + 唱臂 + 一小条「试听中」的灯）、旁边的耳机架。唱盘是会动的件。 */
const buildListeningCorner = (materials: MachiMaterials) => {
    const wood = materials.toon('wood');
    const dark = materials.toon('darkMetal');
    const { x0, x1, z0, z1, top } = TURNTABLE;
    const y = LEVEL.floor;
    const platterX = (x0 + x1) / 2 - 0.14;
    const platterZ = (z0 + z1) / 2;
    const parts: THREE.Object3D[] = [
        boxSpan(wood, x0, x1, y, y + top - 0.04, z0, z1, { radius: 0.025, name: 'Cabinet' }),
        boxSpan(dark, x0 - 0.015, x1 + 0.015, y + top - 0.04, y + top, z0 - 0.015, z1 + 0.015, { radius: 0.01, name: 'Deck' }),
        // 唱臂：枢轴在右后，唱头搭在唱片边上。
        cylinderAt(dark, 0.035, 0.07, [x1 - 0.12, y + top, z0 + 0.14], { segments: 10, name: 'Pivot' }),
        tubeBetween(materials.toon('metal'), new THREE.Vector3(x1 - 0.12, y + top + 0.06, z0 + 0.14), new THREE.Vector3(platterX + 0.12, y + top + 0.03, platterZ - 0.02), 0.012, { name: 'Tonearm' }),
        // 柜面上一小排按钮灯。
        boxSpan(materials.glow('screen'), x1 - 0.3, x1 - 0.06, y + top - 0.02, y + top - 0.005, z1 - 0.06, z1 - 0.03, { radius: 0.003, name: 'Display', castShadow: false }),
    ];
    // 唱盘：盘 + 黑胶 + 标签，整只会转（dynamic，不合批）。
    const disc = mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.014, 28), materials.toon('vinyl'), { name: 'Disc', castShadow: false });
    disc.position.y = 0.028;
    const label = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 16), materials.toon('brand0'), { name: 'Label', castShadow: false });
    label.position.y = 0.03;
    const spindle = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 6), materials.toon('metal'), { name: 'Spindle', castShadow: false });
    spindle.position.y = 0.035;
    const platterBase = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 28), dark, { name: 'Platter' });
    platterBase.position.y = 0.012;
    const platter = group('Turntable/platter', platterBase, disc, label, spindle);
    platter.userData.dynamic = true;
    platter.position.set(platterX, y + top, platterZ);
    parts.push(platter);
    // 耳机架：一根立杆、顶上一条横梁、两只耳罩，立在唱机柜左边（右边就是墙了）。
    const hx = x0 - 0.26;
    const hz = z1 - 0.1;
    parts.push(
        cylinderAt(dark, 0.025, 0.86, [hx, y, hz], { segments: 8, name: 'Stand' }),
        boxSpan(dark, hx - 0.13, hx + 0.13, y + 0.84, y + 0.88, hz - 0.025, hz + 0.025, { radius: 0.01, name: 'Bar' }),
        boxSpan(dark, hx - 0.16, hx - 0.1, y + 0.68, y + 0.84, hz - 0.06, hz + 0.06, { radius: 0.025, name: 'Cup' }),
        boxSpan(dark, hx + 0.1, hx + 0.16, y + 0.68, y + 0.84, hz - 0.06, hz + 0.06, { radius: 0.025, name: 'Cup' }),
        cylinderAt(dark, 0.09, 0.03, [hx, y, hz], { segments: 12, name: 'Foot' }),
    );
    return { group: group('ListeningCorner', ...parts), platter };
};

/** 柜台：木台身、台面、收银机、一台斜放的新碟展示架（封面进批次）。 */
const buildCounter = (materials: MachiMaterials, random: () => number, into: ProductSlot[]) => {
    const wood = materials.toon('counter');
    const dark = materials.toon('darkMetal');
    const { x0, x1, z0, z1, h } = COUNTER;
    const y = LEVEL.floor;
    const parts: THREE.Object3D[] = [
        boxSpan(wood, x0, x1, y, y + h, z0, z1, { radius: 0.03, name: 'Body' }),
        boxSpan(materials.toon('brass'), x0 - 0.01, x0 + 0.012, y + 0.6, y + 0.7, z0 + 0.05, z1 - 0.05, { radius: 0.004, name: 'Stripe' }),
        boxSpan(materials.toon('trim'), x0 - 0.03, x1 + 0.02, y + h, y + h + 0.04, z0 - 0.02, z1 + 0.02, { radius: 0.012, name: 'Top' }),
        boxSpan(dark, x0 + 0.12, x0 + 0.44, y + h + 0.04, y + h + 0.18, z0 + 0.12, z0 + 0.4, { radius: 0.02, name: 'Register' }),
        boxSpan(dark, x0 + 0.4, x0 + 0.43, y + h + 0.16, y + h + 0.38, z0 + 0.16, z0 + 0.36, { radius: 0.01, name: 'Display' }),
        // 台面上斜靠一排「本日推荐」的唱片。
        boxSpan(dark, x1 - 0.42, x1 - 0.1, y + h + 0.04, y + h + 0.08, z1 - 0.42, z1 - 0.1, { radius: 0.01, name: 'StandBase' }),
    ];
    for (let index = 0; index < 5; index += 1) {
        into.push({
            x: x1 - 0.38 + index * 0.055,
            y: y + h + 0.08,
            z: z1 - 0.28 + (index % 2) * 0.012,
            w: 0.2,
            h: 0.24,
            d: 0.014,
            tilt: -0.3 - random() * 0.08,
            color: Math.floor(random() * 8),
            shade: 0.8 + random() * 0.35,
        });
    }
    return group('Counter', ...parts);
};

/** 吊灯：两排吊下来的暖灯（灯罩是暗的、灯芯自发光），实例化。 */
const buildPendants = (materials: MachiMaterials) => {
    const positions: [number, number][] = [];
    [-4.3, -2.6, -0.9].forEach(z => {
        [-4.4, -2.3, -0.2].forEach(x => positions.push([x, z]));
    });
    const shades = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 0.14, 12, 1, true), materials.toon('darkMetal'), positions.length);
    shades.name = 'PendantShades';
    shades.castShadow = false;
    const bulbs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 0.06, 8), materials.glow('ceilingLight'), positions.length);
    bulbs.name = 'PendantBulbs';
    bulbs.castShadow = false;
    const cords = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 5), materials.toon('darkMetal'), positions.length);
    cords.name = 'PendantCords';
    cords.castShadow = false;
    const matrix = new THREE.Matrix4();
    const hang = STORE.wallHeight - 0.62;
    positions.forEach(([x, z], index) => {
        matrix.makeTranslation(x, hang, z);
        shades.setMatrixAt(index, matrix);
        matrix.makeTranslation(x, hang - 0.07, z);
        bulbs.setMatrixAt(index, matrix);
        matrix.makeScale(1, STORE.wallHeight - hang, 1);
        matrix.setPosition(x, (STORE.wallHeight + hang + 0.07) / 2, z);
        cords.setMatrixAt(index, matrix);
        matrix.makeScale(1, 1, 1);
    });
    return group('Pendants', shades, bulbs, cords);
};

/** 槽位 → 一批 InstancedMesh（单位盒按槽位缩放，可选绕 x 后仰）。 */
const productBatch = (materials: MachiMaterials, slots: ProductSlot[], geometry: THREE.BufferGeometry, name: string): RecordstoreProductBatch => {
    const batch = new THREE.InstancedMesh(geometry, materials.product, slots.length);
    batch.name = name;
    batch.castShadow = false;
    batch.receiveShadow = true;
    const colorIndex = new Uint8Array(slots.length);
    const shade = new Float32Array(slots.length);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Matrix4();
    slots.forEach((slot, index) => {
        rotation.makeRotationX(slot.tilt ?? 0);
        matrix.makeScale(slot.w, slot.h, slot.d).premultiply(rotation);
        matrix.setPosition(slot.x, slot.y + slot.h / 2, slot.z);
        batch.setMatrixAt(index, matrix);
        colorIndex[index] = slot.color;
        shade[index] = slot.shade;
        batch.setColorAt(index, new THREE.Color(1, 1, 1));
    });
    return { mesh: batch, colorIndex, shade };
};

export const buildRecordstoreInterior = (materials: MachiMaterials, shelfSeed: number): RecordstoreInteriorParts => {
    const random = createVisualizerRng(shelfSeed);
    const spineSlots: ProductSlot[] = [];
    const crateSlots: ProductSlot[] = [];
    const coverSlots: ProductSlot[] = [];
    fillShelves(random, spineSlots);
    fillCoverWall(random, coverSlots);
    const crates = CRATES.map((at, index) => buildCrate(materials, at, `Crate${index}`, random, crateSlots));
    const windowBin = buildWindowBin(materials, random, crateSlots);
    const counter = buildCounter(materials, random, coverSlots);
    const listening = buildListeningCorner(materials);
    const spines = productBatch(materials, spineSlots, roundedBox(1, 1, 1, 0), 'Spines');
    const crateRecords = productBatch(materials, crateSlots, roundedBox(1, 1, 1, 0), 'CrateRecords');
    const covers = productBatch(materials, coverSlots, roundedBox(1, 1, 1, 0), 'Covers');
    const interior = group(
        'Store/Interior',
        buildShelves(materials),
        ...crates,
        windowBin,
        buildCoverWall(materials),
        listening.group,
        counter,
        buildPendants(materials),
        spines.mesh,
        crateRecords.mesh,
        covers.mesh,
    );
    return { group: interior, productBatches: [spines, crateRecords, covers], platter: listening.platter };
};
