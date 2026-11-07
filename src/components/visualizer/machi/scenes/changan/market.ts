import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MachiMaterials } from '../../engine/materials';
import { BOARD, EQ, LEVEL, LYRIC_HOUSE, PAIFANG, PALACE_LAMP, PALACE_LAMPS, PROPS, STALL, STALLS, STRING_SPANS } from './layout';
import { boxAt, boxSpan, cylinderAt, group, mesh, roundedBox, sagWire, tubeBetween } from '../../engine/geometry/shapes';
import type { ChanganVariation } from './changanSeed';

// src/components/visualizer/machi/scenes/changan/market.ts
// 夜市广场 Group "Market"——市集才是这场戏的主角：前左一座正对镜头的唐式牌坊（两根立柱、横梁、
// 斗拱小屋顶、横匾与柱上竖幡、一对石狮），右列三个食摊、左列两个（牌坊后面）加中景一个伞棚，
// 柜台、斜棚/伞棚两种顶、幌子、蒸笼白气、挂灯、旁边码着货箱；广场小桌椅、三盏宫灯柱兼作灯串锚点，
// 灯串从牌坊顶拉过广场、摊间再补灯珠串；后右一座二层市楼，楼面挂宽幅歌词屏、屏下一排 EQ 光柱、
// 上层一排亮窗、右角紫色小霓虹；背景是后左带两座城楼的城墙、塔后一排亮窗屋脊带，两株粉花树一边
// 一角，天上三盏慢慢升起的天灯。
// 灯笼、花球、雉堞、凳、亮窗这类重复件都是 InstancedMesh；会动的天灯单独留在小 Group 里。

/** 每只灯笼用到的调色板键（配色方案按 seed 换，实例色在 syncColors 里写）。 */
export const LANTERN_KEYS = ['lanternRed', 'lanternAmber', 'blossom'] as const;

/** 一组成批实例件：每个实例各自的调色板键与明暗系数（主题换色时一起写）。 */
export interface ChanganColorBatch {
    mesh: THREE.InstancedMesh;
    /** 实例 i 的调色板键（LANTERN_KEYS / 花键之一）。 */
    keys: string[];
    /** 实例 i 的明暗系数（1 是本色）。 */
    shade: Float32Array;
}

/** EQ 光柱条带：几何与原位参数（update 里按节拍改每根的 scale.y，沿墙面局部 x 排开）。 */
export interface ChanganEqSpec {
    mesh: THREE.InstancedMesh;
    count: number;
    /** 第一根柱的世界 x / z；第 i 根在 (x0 + sx·i, z0 + sz·i)。 */
    x0: number;
    z0: number;
    sx: number;
    sz: number;
    y0: number;
    maxHeight: number;
    phases: Float32Array;
}

export interface ChanganMarketParts {
    group: THREE.Group;
    /** 牌坊横匾（曲名）的安装面。 */
    plaqueFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    /** 牌坊两柱上挂的竖幡灯箱（歌手）的安装面。 */
    bannerFaces: { position: THREE.Vector3; rotationY: number; width: number; height: number }[];
    /** 各食摊的幌子面。 */
    stallSignFaces: { position: THREE.Vector3; rotationY: number; width: number; height: number }[];
    /** 市楼角的紫色小霓虹面。 */
    teaNeonFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    /** 市楼楼面歌词屏的安装面（正对默认镜头）。 */
    boardFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    /** 歌词屏下的 EQ 光柱条带。 */
    eq: ChanganEqSpec;
    /** 灯笼串 + 摊挂灯 + 牌坊挂灯的灯笼批（实例色按 seed 方案）。 */
    lanternBatch: ChanganColorBatch;
    /** 花树花球批（两株树共用一批，实例色在花键之间）。 */
    blossomBatch: ChanganColorBatch;
    /** 三盏宫灯灯头的世界坐标（光柱、点光、光斑用）。 */
    lampHeads: THREE.Vector3[];
    /** 三盏天灯（direct 里慢慢升起）。 */
    skyLanterns: THREE.Object3D[];
    /** 食摊蒸笼的白气源。 */
    steamSources: { position: THREE.Vector3; puffs: number; period: number; size: number }[];
    /** 灯串的锚点（构图取景用）。 */
    stringAnchors: THREE.Vector3[];
}

/** 绕 yaw 的局部→世界（y 不变）：局部的 +x 向右、+z 向前。 */
export const localXZ = (cx: number, cz: number, yaw: number, lx: number, lz: number) => ({
    x: cx + lx * Math.cos(yaw) + lz * Math.sin(yaw),
    z: cz - lx * Math.sin(yaw) + lz * Math.cos(yaw),
});

const toWorld = (cx: number, cz: number, yaw: number, lx: number, ly: number, lz: number) => {
    const p = localXZ(cx, cz, yaw, lx, lz);
    return new THREE.Vector3(p.x, ly, p.z);
};

/** 一个灯笼的合并几何：身子 + 上下小盖（全部转成非索引才能合）。 */
const lanternGeometry = () => {
    const body = roundedBox(0.15, 0.18, 0.15, 0.06);
    const top = new THREE.CylinderGeometry(0.05, 0.06, 0.04, 8).toNonIndexed();
    top.translate(0, 0.11, 0);
    const bottom = new THREE.CylinderGeometry(0.055, 0.045, 0.03, 8).toNonIndexed();
    bottom.translate(0, -0.105, 0);
    const merged = mergeGeometries([body, top, bottom], false)!;
    body.dispose();
    top.dispose();
    bottom.dispose();
    return merged;
};

/** 灯笼批：按 seed 方案给每只灯笼挑一个调色板键。 */
const pickLanternKey = (scheme: number, index: number) => {
    if (scheme === 1) return LANTERN_KEYS[index % 2]!;
    if (scheme === 2) return index % 5 === 4 ? LANTERN_KEYS[2]! : (index % 3 === 2 ? LANTERN_KEYS[1]! : LANTERN_KEYS[0]!);
    return LANTERN_KEYS[0]!;
};

/** 悬链线上均匀取点（与 sagWire 同一条抛物线）。 */
const sagPoint = (from: THREE.Vector3, to: THREE.Vector3, sag: number, t: number) => {
    const point = from.clone().lerp(to, t);
    point.y -= sag * 4 * t * (1 - t);
    return point;
};

/** 牌坊：两根立柱 + 石础，上下两道横梁、横匾、中央与两侧的小屋顶，柱身挂竖幡，前脚一对石狮。 */
const buildPaifang = (materials: MachiMaterials) => {
    const red = materials.toon('paifangRed');
    const roof = materials.toon('paifangRoof');
    const stone = materials.toon('lionStone');
    const plaque = materials.toon('plaqueBase');
    const trim = materials.toon('paifangTrim');
    const parts: THREE.Object3D[] = [];
    const { cx, cz, yaw } = PAIFANG;
    const at = (lx: number, ly: number, lz: number) => toWorld(cx, cz, yaw, lx, ly, lz);
    const groundY = LEVEL.lot;

    [-1, 1].forEach(side => {
        const lx = side * PAIFANG.pillarOffset;
        const base = at(lx, groundY, 0);
        parts.push(boxAt(stone, [0.5, 0.3, 0.5], [base.x, base.y, base.z], { rotationY: yaw, name: 'Paifang/base' }));
        const p = at(lx, groundY + 0.24, 0);
        parts.push(boxAt(red, [PAIFANG.pillarSize, PAIFANG.pillarHeight, PAIFANG.pillarSize], [p.x, p.y, p.z], { rotationY: yaw, radius: 0.025, name: 'Paifang/pillar' }));
    });
    // 上下两道横梁（小额枋 + 大额枋）与端头的花板。
    const mid = at(0, groundY + PAIFANG.midLintel.y0, 0);
    parts.push(boxAt(red, [2.95, PAIFANG.midLintel.y1 - PAIFANG.midLintel.y0, 0.26], [mid.x, mid.y, mid.z], { rotationY: yaw, radius: 0.02, name: 'Paifang/lintelMid' }));
    const topL = at(0, groundY + PAIFANG.topLintel.y0, 0);
    parts.push(boxAt(red, [2.6, PAIFANG.topLintel.y1 - PAIFANG.topLintel.y0, 0.22], [topL.x, topL.y, topL.z], { rotationY: yaw, radius: 0.02, name: 'Paifang/lintelTop' }));
    [-1, 1].forEach(side => {
        const end = at(side * 1.48, groundY + PAIFANG.midLintel.y0 + 0.01, 0);
        parts.push(boxAt(trim, [0.14, 0.42, 0.3], [end.x, end.y, end.z], { rotationY: yaw, radius: 0.02, name: 'Paifang/lintelEnd' }));
    });
    // 横匾（曲名写上去）：深色匾心 + 描金框，贴着大额枋的面鼓出来（梁面局部 z≈0.13，匾要比它靠前才看得见）。
    const plq = at(0, groundY + PAIFANG.plaque.cy - (PAIFANG.plaque.height + 0.14) / 2, 0.19);
    parts.push(boxAt(plaque, [PAIFANG.plaque.width + 0.18, PAIFANG.plaque.height + 0.14, 0.09], [plq.x, plq.y, plq.z], { rotationY: yaw, radius: 0.02, name: 'Paifang/plaque' }));
    const plqTrim = at(0, groundY + PAIFANG.plaque.cy + (PAIFANG.plaque.height + 0.14) / 2, 0.21);
    parts.push(boxAt(trim, [PAIFANG.plaque.width + 0.28, 0.06, 0.1], [plqTrim.x, plqTrim.y, plqTrim.z], { rotationY: yaw, radius: 0.015, name: 'Paifang/plaqueTrim' }));
    // 中央小屋顶与两侧夹楼：两层收檐 + 正脊 + 翘角。
    const roofs = [
        { lx: 0, y0: PAIFANG.centerRoof.y0, w: PAIFANG.centerRoof.width, up: PAIFANG.centerRoof.y1 - PAIFANG.centerRoof.y0, name: 'center' },
        { lx: -PAIFANG.pillarOffset, y0: PAIFANG.sideRoof.y0, w: PAIFANG.sideRoof.width, up: PAIFANG.sideRoof.y1 - PAIFANG.sideRoof.y0, name: 'sideL' },
        { lx: PAIFANG.pillarOffset, y0: PAIFANG.sideRoof.y0, w: PAIFANG.sideRoof.width, up: PAIFANG.sideRoof.y1 - PAIFANG.sideRoof.y0, name: 'sideR' },
    ];
    roofs.forEach(item => {
        const p = at(item.lx, groundY + item.y0, 0);
        parts.push(boxAt(roof, [item.w, 0.09, 0.6], [p.x, p.y, p.z], { rotationY: yaw, radius: 0.02, name: `Paifang/roof${item.name}` }));
        parts.push(boxAt(roof, [item.w * 0.86, item.up - 0.12, 0.46], [p.x, p.y + 0.09, p.z], { rotationY: yaw, radius: 0.02, name: `Paifang/roofUp${item.name}` }));
        parts.push(boxAt(roof, [item.w * 0.8, 0.1, 0.14], [p.x, p.y + item.up - 0.03, p.z], { rotationY: yaw, radius: 0.03, name: `Paifang/ridge${item.name}` }));
        [-1, 1].forEach(side => {
            const tip = at(item.lx + side * item.w * 0.5, p.y + 0.1, 0);
            const corner = mesh(roundedBox(0.2, 0.05, 0.3, 0.02), roof, { name: 'Paifang/eaveTip' });
            corner.position.set(tip.x, tip.y, tip.z);
            corner.rotation.order = 'YXZ';
            corner.rotation.y = yaw;
            corner.rotation.x = 0;
            corner.rotation.z = side * 0.32;
            parts.push(corner);
        });
    });
    // 柱身竖幡（歌手名写上去）：挂在柱前的小灯箱。
    const bannerFaces = [-1, 1].map(side => {
        const lx = side * PAIFANG.pillarOffset;
        const back = at(lx, groundY + PAIFANG.banner.y0, PAIFANG.pillarSize / 2 + 0.02);
        parts.push(boxAt(red, [PAIFANG.banner.width + 0.05, PAIFANG.banner.height + 0.06, 0.05], [back.x, back.y, back.z], { rotationY: yaw, radius: 0.015, name: 'Paifang/banner' }));
        const face = at(lx, groundY + PAIFANG.banner.y0 + PAIFANG.banner.height / 2 + 0.03, PAIFANG.pillarSize / 2 + 0.052);
        return { position: face, rotationY: yaw, width: PAIFANG.banner.width, height: PAIFANG.banner.height };
    });
    // 石狮一对：蹲坐在柱前础上（身、头、吻、尾的一小团）。
    [-1, 1].forEach(side => {
        const lx = side * 0.72;
        const p = at(lx, groundY, PAIFANG.lion.forward);
        parts.push(boxAt(stone, [0.34, 0.16, 0.42], [p.x, p.y, p.z], { rotationY: yaw, radius: 0.03, name: 'Lion/base' }));
        parts.push(boxAt(stone, [0.22, 0.28, 0.3], [p.x, p.y + 0.14, p.z - 0.03], { rotationY: yaw, radius: 0.06, name: 'Lion/body' }));
        const head = mesh(new THREE.SphereGeometry(0.12, 10, 8), stone, { name: 'Lion/head' });
        const headAt = at(lx, p.y + 0.4, PAIFANG.lion.forward + 0.12);
        head.position.set(headAt.x, headAt.y, headAt.z);
        parts.push(head);
        const snout = at(lx, p.y + 0.36, PAIFANG.lion.forward + 0.24);
        parts.push(boxAt(stone, [0.12, 0.1, 0.1], [snout.x, snout.y, snout.z], { rotationY: yaw, radius: 0.03, name: 'Lion/snout' }));
    });
    // 横匾的安装面（曲名）：匾心正面（匾前表面再探 3mm）。
    const plaqueFaceAt = at(0, groundY + PAIFANG.plaque.cy, 0.238);
    return {
        parts,
        plaqueFace: {
            position: plaqueFaceAt,
            rotationY: yaw,
            width: PAIFANG.plaque.width,
            height: PAIFANG.plaque.height,
        },
        bannerFaces,
        // 挂灯：横匾下沿一对 + 两座夹楼檐口下各一只。
        lanternAnchors: [
            [-0.52, groundY + 2.3, 0.16],
            [0.52, groundY + 2.3, 0.16],
            [-PAIFANG.pillarOffset, groundY + PAIFANG.sideRoof.y0 - 0.12, 0.3],
            [PAIFANG.pillarOffset, groundY + PAIFANG.sideRoof.y0 - 0.12, 0.3],
        ].map(([lx, ly, lz]) => at(lx!, ly!, lz!)),
    };
};

/** 食摊一个：柜台 + 前板、四柱、斜棚或伞棚、幌子面、蒸笼与货色、挂灯两只、旁边码货箱。 */
const buildStall = (materials: MachiMaterials, spec: (typeof STALLS)[number], index: number) => {
    const counter = materials.toon('stallCounter');
    const wood = materials.toon('wood');
    const roof = materials.toon('stallRoof');
    const cloth = materials.toon('paifangRed');
    const goods = materials.toon('brass');
    const parts: THREE.Object3D[] = [];
    const { x: cx, z: cz, yaw } = spec;
    const at = (lx: number, ly: number, lz: number) => toWorld(cx, cz, yaw, lx, ly, lz);
    const groundY = LEVEL.lot;
    const { width, depth, counterTop, postHeight, canopyY, canopySize, umbrella } = STALL;

    const c = at(0, groundY, 0);
    parts.push(boxAt(counter, [width, counterTop, depth], [c.x, c.y, c.z], { rotationY: yaw, radius: 0.03, name: `Stall${index}/counter` }));
    const front = at(0, groundY + counterTop - 0.16, depth / 2 + 0.02);
    parts.push(boxAt(wood, [width - 0.1, 0.12, 0.05], [front.x, front.y, front.z], { rotationY: yaw, radius: 0.02, name: `Stall${index}/front` }));
    const lanternAnchors: THREE.Vector3[] = [];
    if (spec.style === 'umbrella') {
        // 伞棚摊：一根中柱挑起一顶八角伞，伞沿挂一圈小布旗。
        const pole = at(0, groundY, 0);
        parts.push(cylinderAt(wood, 0.05, canopyY + umbrella.height * 0.6, [pole.x, pole.y, pole.z], { name: `Stall${index}/pole`, segments: 8 }));
        const canopyAt = at(0, groundY + canopyY + umbrella.height * 0.6, 0);
        const canopy = mesh(new THREE.ConeGeometry(umbrella.radius, umbrella.height, 8), cloth, { name: `Stall${index}/umbrella` });
        canopy.position.set(canopyAt.x, canopyAt.y, canopyAt.z);
        canopy.rotation.y = yaw;
        parts.push(canopy);
        // 伞沿下的小幌子杆（招牌面横挂在伞下前方）。
        const bar = at(0, groundY + STALL.sign.y0 + STALL.sign.height + 0.1, umbrella.radius * 0.55);
        parts.push(boxAt(wood, [STALL.sign.width + 0.1, 0.04, 0.05], [bar.x, bar.y, bar.z], { rotationY: yaw, radius: 0.01, name: `Stall${index}/signBar` }));
        lanternAnchors.push(
            at(-umbrella.radius * 0.55, groundY + canopyY - 0.1, umbrella.radius * 0.45),
            at(umbrella.radius * 0.55, groundY + canopyY - 0.1, umbrella.radius * 0.45),
        );
    } else {
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
            const p = at(sx! * (width / 2 - 0.07), groundY, sz! * (depth / 2 - 0.07));
            parts.push(cylinderAt(wood, 0.045, postHeight, [p.x, p.y, p.z], { name: `Stall${index}/post`, segments: 8 }));
        });
        // 斜顶棚：前低后高的布篷，前沿一条檐口布。
        const canopy = mesh(roundedBox(canopySize.w, 0.05, canopySize.d, 0.03), roof, { name: `Stall${index}/canopy` });
        const canopyAt = at(0, groundY + canopyY, 0.04);
        canopy.position.set(canopyAt.x, canopyAt.y, canopyAt.z);
        canopy.rotation.order = 'YXZ';
        canopy.rotation.y = yaw;
        canopy.rotation.x = -0.12;
        parts.push(canopy);
        const valance = at(0, groundY + canopyY - 0.02, depth / 2 + 0.16);
        parts.push(boxAt(cloth, [canopySize.w * 0.96, 0.13, 0.035], [valance.x, valance.y, valance.z], { rotationY: yaw, radius: 0.02, name: `Stall${index}/valance` }));
        lanternAnchors.push(
            at(-width / 2 + 0.14, groundY + canopyY - 0.26, depth / 2 + 0.12),
            at(width / 2 - 0.14, groundY + canopyY - 0.26, depth / 2 + 0.12),
        );
    }
    // 幌子（招牌面）：棚下挂在前面。
    const signBack = at(0, groundY + STALL.sign.y0 - 0.02, depth / 2 + 0.03);
    parts.push(boxAt(wood, [STALL.sign.width + 0.06, STALL.sign.height + 0.05, 0.04], [signBack.x, signBack.y, signBack.z], { rotationY: yaw, radius: 0.015, name: `Stall${index}/signBack` }));
    const signFace = at(0, groundY + STALL.sign.y0 + STALL.sign.height / 2, depth / 2 + 0.056);
    // 柜台上：一摞蒸笼 + 两三件货色。
    const steamer = at(-0.32, groundY + counterTop, -0.05);
    parts.push(cylinderAt(wood, 0.15, 0.11, [steamer.x, steamer.y, steamer.z], { name: `Stall${index}/steamer0`, segments: 10 }));
    parts.push(cylinderAt(wood, 0.14, 0.1, [steamer.x, steamer.y + 0.11, steamer.z], { name: `Stall${index}/steamer1`, segments: 10 }));
    const steamerTop = at(-0.32, groundY + counterTop + 0.23, -0.05);
    const goods1 = at(0.28, groundY + counterTop, 0.06);
    parts.push(boxAt(goods, [0.2, 0.12, 0.16], [goods1.x, goods1.y, goods1.z], { rotationY: yaw + 0.3, radius: 0.02, name: `Stall${index}/goods` }));
    const goods2 = at(0.1, groundY + counterTop, -0.12);
    parts.push(boxAt(wood, [0.16, 0.09, 0.12], [goods2.x, goods2.y, goods2.z], { rotationY: yaw - 0.2, radius: 0.02, name: `Stall${index}/goods2` }));
    // 摊旁码两件货箱、一坛罐子。
    const crate = at(-width / 2 - 0.28, groundY, depth / 2 - 0.05);
    parts.push(boxAt(wood, [0.3, 0.24, 0.3], [crate.x, crate.y, crate.z], { rotationY: yaw + 0.15, radius: 0.025, name: `Stall${index}/crate0` }));
    parts.push(boxAt(wood, [0.26, 0.2, 0.26], [crate.x, crate.y + 0.24, crate.z], { rotationY: yaw - 0.2, radius: 0.025, name: `Stall${index}/crate1` }));
    const jar = at(width / 2 + 0.26, groundY, -depth / 2 + 0.1);
    parts.push(cylinderAt(goods, 0.11, 0.3, [jar.x, jar.y, jar.z], { radiusTop: 0.07, name: `Stall${index}/jar`, segments: 10 }));
    return {
        parts,
        signFace: { position: signFace, rotationY: yaw, width: STALL.sign.width, height: STALL.sign.height },
        lanternAnchors,
        steamerTop,
    };
};

/** 广场边的小陶俑：砖台座上一尊小立俑（腿、身、肩、双臂、头与冠），站在矮台旁看塔。 */
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
    return group('Market/warrior', base, figure);
};

/** 宫灯柱：石础、立柱、六角宫灯头（顶一小檐、下一坠子）。 */
const buildPalaceLamp = (materials: MachiMaterials, spot: { x: number; z: number }, index: number) => {
    const post = materials.toon('lampPost');
    const red = materials.toon('paifangRed');
    const glow = materials.glow('palaceLamp');
    const stone = materials.toon('lionStone');
    const parts: THREE.Object3D[] = [];
    const groundY = LEVEL.lot;
    parts.push(boxAt(stone, [0.3, 0.16, 0.3], [spot.x, groundY, spot.z], { radius: 0.03, name: `Lamp${index}/base` }));
    parts.push(cylinderAt(post, 0.055, PALACE_LAMP.poleHeight, [spot.x, groundY + 0.12, spot.z], { name: `Lamp${index}/pole`, segments: 8 }));
    const headY = groundY + PALACE_LAMP.headY;
    parts.push(cylinderAt(glow, 0.24, PALACE_LAMP.headSize, [spot.x, headY - PALACE_LAMP.headSize / 2, spot.z], { name: `Lamp${index}/head`, segments: 6 }));
    parts.push(boxAt(post, [0.62, 0.08, 0.62], [spot.x, headY + PALACE_LAMP.headSize / 2, spot.z], { radius: 0.03, name: `Lamp${index}/cap` }));
    parts.push(boxAt(red, [0.1, 0.16, 0.1], [spot.x, headY - PALACE_LAMP.headSize / 2 - 0.2, spot.z], { radius: 0.02, name: `Lamp${index}/tassel` }));
    return { parts, head: new THREE.Vector3(spot.x, headY, spot.z) };
};

/**
 * 歌词楼：后右的二层市楼，楼面（+局部 z）正对默认镜头。楼下挂宽幅歌词屏（深色灯箱），
 * 屏下一排 EQ 光柱，上层檐口一条受光边、檐下一排亮窗，右角一面紫色小霓虹。
 */
const buildLyricHouse = (materials: MachiMaterials) => {
    const wall = materials.toon('houseWall');
    const roof = materials.toon('skylineRoof');
    const dark = materials.toon('boardPanel');
    const glow = materials.glow('teaEave');
    const eqGlow = materials.glow('eqBar');
    const windowGlow = materials.glow('houseWindow');
    const parts: THREE.Object3D[] = [];
    const { cx, cz, yaw, width, depth, wallHeight, roofHeight } = LYRIC_HOUSE;
    const y = LEVEL.lot;
    const at = (lx: number, ly: number, lz: number) => toWorld(cx, cz, yaw, lx, ly, lz);
    const front = depth / 2;

    // 楼身与两层收檐的屋顶。
    parts.push(boxAt(wall, [width, wallHeight, depth], [cx, y, cz], { rotationY: yaw, radius: 0.03, name: 'House/body' }));
    parts.push(boxAt(roof, [width + 0.34, 0.13, depth + 0.34], [cx, y + wallHeight, cz], { rotationY: yaw, radius: 0.03, name: 'House/roof' }));
    parts.push(boxAt(roof, [width * 0.8, roofHeight, depth * 0.74], [cx, y + wallHeight + 0.13, cz], { rotationY: yaw, radius: 0.03, name: 'House/roofUp' }));
    parts.push(boxAt(roof, [width * 0.72, 0.1, depth * 0.2], [cx, y + wallHeight + 0.13 + roofHeight - 0.02, cz], { rotationY: yaw, radius: 0.03, name: 'House/ridge' }));
    // 楼面檐口一条受光边 + 檐下一排亮窗（楼的上层，歌词屏上面）。
    const eave = at(0, y + wallHeight - 0.02, front + 0.18);
    parts.push(boxAt(glow, [width + 0.36, 0.03, 0.04], [eave.x, eave.y, eave.z], { rotationY: yaw, radius: 0.01, name: 'House/eaveGlow' }));
    const windowXs = [-0.78, -0.44, -0.1, 0.24];
    const windowMesh = new THREE.InstancedMesh(roundedBox(0.2, 0.2, 0.03, 0.01), windowGlow, windowXs.length);
    windowMesh.name = 'House/windows';
    const windowMatrix = new THREE.Matrix4();
    windowXs.forEach((lx, index) => {
        const p = at(lx, y + 2.32, front + 0.02);
        windowMatrix.makeTranslation(p.x, p.y, p.z);
        const rot = new THREE.Matrix4().makeRotationY(yaw);
        windowMatrix.multiply(rot);
        windowMesh.setMatrixAt(index, windowMatrix);
    });
    parts.push(windowMesh);
    // 歌词屏的木框与背板，贴着楼面鼓出来；屏面是安装面（正对镜头）。
    const back = at(BOARD.lx, y + BOARD.cy - (BOARD.height + 0.1) / 2, front + 0.03);
    parts.push(boxAt(dark, [BOARD.width + 0.1, BOARD.height + 0.1, 0.06], [back.x, back.y, back.z], { rotationY: yaw, radius: 0.015, name: 'Board/case' }));
    const faceAt = at(BOARD.lx, y + BOARD.cy, front + 0.065);
    const boardFace = {
        position: faceAt,
        rotationY: yaw,
        width: BOARD.width - 0.14,
        height: BOARD.height - 0.12,
    };
    // 屏下一排 EQ 光柱：沿楼面局部 x 排开，高低随节拍。
    const spacing = EQ.width / EQ.count;
    const firstLocalX = EQ.lx - EQ.width / 2 + spacing / 2;
    const first = at(firstLocalX, 0, front + 0.045);
    const step = localXZ(0, 0, yaw, spacing, 0);
    const barGeometry = roundedBox(spacing * 0.45, 1, 0.05, 0.015);
    const eqMesh = new THREE.InstancedMesh(barGeometry, eqGlow, EQ.count);
    eqMesh.name = 'Board/eq';
    const phases = new Float32Array(EQ.count);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < EQ.count; index += 1) {
        phases[index] = index / EQ.count;
        matrix.makeTranslation(first.x + step.x * index, y + EQ.y0 + EQ.maxHeight * 0.3, first.z + step.z * index);
        matrix.scale(new THREE.Vector3(1, EQ.maxHeight * 0.6, 1));
        eqMesh.setMatrixAt(index, matrix);
    }
    eqMesh.userData.dynamic = true;
    parts.push(eqMesh);
    // 楼右角的紫色小霓虹「茶」（朝镜头斜出的面）。
    const neonAt = at(width / 2 - 0.28, 0, front + 0.04);
    const neonFace = {
        position: new THREE.Vector3(neonAt.x, y + 2.3, neonAt.z),
        rotationY: yaw,
        width: 0.42,
        height: 0.42,
    };
    return {
        parts,
        boardFace,
        neonFace,
        eq: {
            mesh: eqMesh,
            count: EQ.count,
            x0: first.x,
            z0: first.z,
            sx: step.x,
            sz: step.z,
            y0: y + EQ.y0,
            maxHeight: EQ.maxHeight,
            phases,
        } satisfies ChanganEqSpec,
    };
};

/** 一座城楼：高出墙身的敌楼（收分大屋顶 + 朝场内的门洞暗示）。 */
const buildGateTower = (materials: MachiMaterials, wall: THREE.Material, roof: THREE.Material, dark: THREE.Material, gate: { z: number; width: number; height: number; roofTop: number }, name: string) => {
    const { x0, x1, top } = PROPS.cityWall;
    const y = LEVEL.lot;
    const gx = (x0 + x1) / 2 + 0.06;
    return group(`Market/${name}`,
        boxAt(wall, [x1 - x0 + 0.14, gate.height - top, gate.width], [gx, y + top, gate.z], { radius: 0.02, name: `${name}/body` }),
        boxAt(roof, [x1 - x0 + 0.4, 0.12, gate.width + 0.34], [gx, y + gate.height, gate.z], { radius: 0.02, name: `${name}/roof` }),
        boxAt(roof, [x1 - x0 + 0.2, gate.roofTop - gate.height - 0.2, gate.width * 0.72], [gx, y + gate.height + 0.12, gate.z], { radius: 0.02, name: `${name}/roofUp` }),
        boxAt(roof, [x1 - x0 + 0.1, 0.1, gate.width * 0.6], [gx, y + gate.roofTop - 0.08, gate.z], { radius: 0.02, name: `${name}/ridge` }),
        boxAt(dark, [0.04, 0.9, 0.55], [x1 + 0.12, y, gate.z], { radius: 0.02, name: `${name}/arch` }),
    );
};

/** 城墙一段 + 前后两座城楼剪影（后左，贴着底座左缘，朝场内的面受一点光）。 */
const buildCityWall = (materials: MachiMaterials) => {
    const wall = materials.toon('wallSil');
    const roof = materials.toon('skylineRoof');
    const dark = materials.toon('stoneDark');
    const parts: THREE.Object3D[] = [];
    const { x0, x1, z0, z1, top, gate, gate2 } = PROPS.cityWall;
    const y = LEVEL.lot;
    parts.push(boxSpan(wall, x0, x1, y - 0.04, y + top, z0, z1, { radius: 0.02, name: 'CityWall/body' }));
    // 顶上的雉堞：一排小垛口（InstancedMesh）。
    const crenels: number[] = [];
    for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.46) crenels.push(z);
    const crenGeometry = roundedBox(0.34, 0.15, 0.16, 0.02);
    const crenMesh = new THREE.InstancedMesh(crenGeometry, wall, crenels.length);
    crenMesh.name = 'CityWall/crenels';
    const matrix = new THREE.Matrix4();
    crenels.forEach((z, index) => {
        matrix.makeTranslation((x0 + x1) / 2, y + top + 0.08, z);
        crenMesh.setMatrixAt(index, matrix);
    });
    parts.push(crenMesh);
    parts.push(buildGateTower(materials, wall, roof, dark, gate, 'gate'));
    parts.push(buildGateTower(materials, wall, roof, dark, gate2, 'gate2'));
    return group('Market/cityWall', ...parts);
};

/** 后沿的唐屋屋脊带：一排高低错落的剪影屋顶，面朝场内的面上点几扇亮窗。 */
const buildRooftops = (materials: MachiMaterials) => {
    const wall = materials.toon('skylineWall');
    const roof = materials.toon('skylineRoof');
    const windowGlow = materials.glow('roofWindow');
    const parts: THREE.Object3D[] = [];
    const y = LEVEL.lot;
    const windowSpots: THREE.Vector3[] = [];
    PROPS.rooftops.forEach((item, index) => {
        parts.push(boxAt(wall, [item.w, item.h, item.d], [item.x, y, item.z], { radius: 0.02, name: `Rooftop${index}/body` }));
        parts.push(boxAt(roof, [item.w + 0.3, 0.14, item.d + 0.3], [item.x, y + item.h, item.z], { radius: 0.03, name: `Rooftop${index}/roof` }));
        parts.push(boxAt(roof, [item.w * 0.8, 0.22, item.d * 0.8], [item.x, y + item.h + 0.14, item.z], { radius: 0.03, name: `Rooftop${index}/roofUp` }));
        // 朝场内（+x 与 +z 两面）各点一两扇窗。
        const rows = item.h > 1 ? [0.45, 0.72] : [0.5];
        rows.forEach(fy => {
            windowSpots.push(new THREE.Vector3(item.x - item.w * 0.22, y + item.h * fy, item.z + item.d / 2 + 0.015));
            windowSpots.push(new THREE.Vector3(item.x + item.w / 2 + 0.015, y + item.h * fy, item.z + item.d * 0.15));
        });
    });
    const windowMesh = new THREE.InstancedMesh(roundedBox(0.12, 0.14, 0.03, 0.01), windowGlow, windowSpots.length);
    windowMesh.name = 'Rooftops/windows';
    const matrix = new THREE.Matrix4();
    const side = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    windowSpots.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y, position.z);
        // +x 面的窗沿 y 转 90°。
        if (index % 2 === 1) matrix.multiply(side);
        windowMesh.setMatrixAt(index, matrix);
    });
    parts.push(windowMesh);
    return group('Market/rooftops', ...parts);
};

/** 小桌椅：三张圆桌配小凳（凳是一批 InstancedMesh）。 */
const buildTables = (materials: MachiMaterials) => {
    const top = materials.toon('tableTop');
    const leg = materials.toon('lampPost');
    const parts: THREE.Object3D[] = [];
    const stools: THREE.Vector3[] = [];
    PROPS.tables.forEach((table, index) => {
        const y = LEVEL.lot;
        parts.push(cylinderAt(leg, 0.05, 0.55, [table.x, y, table.z], { name: `Table${index}/leg`, segments: 8 }));
        parts.push(cylinderAt(top, 0.3, 0.05, [table.x, y + 0.55, table.z], { name: `Table${index}/top`, segments: 12 }));
        stools.push(new THREE.Vector3(table.x + 0.42, y, table.z + 0.1), new THREE.Vector3(table.x - 0.38, y, table.z - 0.22));
    });
    const stoolGeometry = new THREE.CylinderGeometry(0.14, 0.12, 0.26, 10);
    const stoolMesh = new THREE.InstancedMesh(stoolGeometry, top, stools.length);
    stoolMesh.name = 'Market/stools';
    const matrix = new THREE.Matrix4();
    stools.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y + 0.13, position.z);
        stoolMesh.setMatrixAt(index, matrix);
    });
    parts.push(stoolMesh);
    return group('Market/tables', ...parts);
};

/** 两株粉花树：干与两杈 + 一蓬花球（两棵树的花球合进一批 InstancedMesh，密度按歌变）。 */
const buildBlossoms = (materials: MachiMaterials, density: number, rng: () => number) => {
    const trunk = materials.toon('treeTrunk');
    const parts: THREE.Object3D[] = [];
    const y = LEVEL.lot;
    const blobSpots: { center: THREE.Vector3; count: number }[] = [];
    PROPS.blossomTrees.forEach((spot, index) => {
        const { x, z } = spot;
        parts.push(cylinderAt(trunk, 0.085, 1.45, [x, y, z], { name: `Blossom${index}/trunk`, radiusTop: 0.05, segments: 8 }));
        parts.push(tubeBetween(trunk, new THREE.Vector3(x, y + 0.9, z), new THREE.Vector3(x - 0.42, y + 1.6, z - 0.1), 0.045, { name: `Blossom${index}/branch` }));
        parts.push(tubeBetween(trunk, new THREE.Vector3(x, y + 1.05, z), new THREE.Vector3(x + 0.34, y + 1.75, z + 0.14), 0.04, { name: `Blossom${index}/branch2` }));
        blobSpots.push({ center: new THREE.Vector3(x - 0.05, y + 2.05, z), count: Math.round(15 * density) });
    });
    const total = blobSpots.reduce((sum, spot) => sum + spot.count, 0);
    const blobGeometry = new THREE.IcosahedronGeometry(0.34, 1);
    const blobs = new THREE.InstancedMesh(blobGeometry, materials.product, total);
    blobs.name = 'Blossom/blobs';
    const keys: string[] = [];
    const shade = new Float32Array(total);
    const matrix = new THREE.Matrix4();
    let index = 0;
    blobSpots.forEach(({ center, count }) => {
        for (let i = 0; i < count; i += 1) {
            // 椭球状的花冠里随机落一朵：越靠边上越小。
            const theta = rng() * Math.PI * 2;
            const r = 0.25 + rng() * 0.75;
            const px = center.x + Math.cos(theta) * r * 0.85;
            const pz = center.z + Math.sin(theta) * r * 0.6;
            const py = center.y + (rng() - 0.42) * 0.85;
            const s = (0.55 + rng() * 0.5) * (1.15 - r * 0.35);
            matrix.makeScale(s, s * 0.82, s);
            matrix.setPosition(px, py, pz);
            blobs.setMatrixAt(index, matrix);
            keys[index] = index % 4 === 3 ? 'blossomDeep' : 'blossom';
            shade[index] = 0.85 + rng() * 0.3;
            index += 1;
        }
    });
    parts.push(blobs);
    return { parts, batch: { mesh: blobs, keys, shade } };
};

/** 三盏天灯：纸罩（下口一点暖光），direct 里慢慢升起、绕回。 */
const buildSkyLanterns = (materials: MachiMaterials) => {
    const glow = materials.glow('skyLantern');
    return PROPS.skyLanterns.map((spot, index) => {
        const lantern = new THREE.Group();
        lantern.name = `SkyLantern${index}`;
        lantern.add(cylinderAt(glow, 0.13, 0.2, [0, 0, 0], { radiusTop: 0.1, segments: 8, name: 'shade' }));
        lantern.add(boxAt(glow, [0.06, 0.05, 0.06], [0, -0.06, 0], { radius: 0.015, name: 'flame' }));
        lantern.position.set(spot.x, 1.6, spot.z);
        lantern.userData.dynamic = true;
        return lantern;
    });
};

export const buildChanganMarket = (materials: MachiMaterials, variation: ChanganVariation): ChanganMarketParts => {
    const parts: THREE.Object3D[] = [];
    const lanternPositions: THREE.Vector3[] = [];

    const paifang = buildPaifang(materials);
    parts.push(group('Market/paifang', ...paifang.parts));
    lanternPositions.push(...paifang.lanternAnchors);

    const stallSignFaces: ChanganMarketParts['stallSignFaces'] = [];
    const steamSources: ChanganMarketParts['steamSources'] = [];
    STALLS.forEach((spec, index) => {
        const stall = buildStall(materials, spec, index);
        parts.push(group(`Market/stall${index}`, ...stall.parts));
        stallSignFaces.push(stall.signFace);
        lanternPositions.push(...stall.lanternAnchors);
        if (spec.steam) steamSources.push({ position: stall.steamerTop, puffs: Math.max(3, Math.round(6 * variation.smokeDensity)), period: 3.6, size: 0.55 });
    });

    const lampHeads: THREE.Vector3[] = [];
    PALACE_LAMPS.forEach((spot, index) => {
        const lamp = buildPalaceLamp(materials, spot, index);
        parts.push(group(`Market/lamp${index}`, ...lamp.parts));
        lampHeads.push(lamp.head);
    });

    // 歌词楼（歌词屏、EQ、亮窗、霓虹都在它立面上）。
    const house = buildLyricHouse(materials);
    parts.push(group('Market/lyricHouse', ...house.parts));

    // 灯串：每条悬链线一根细线 + 沿线排开的灯笼 / 灯珠。
    const wire = materials.toon('wire');
    const stringParts: THREE.Object3D[] = [];
    const festoonPositions: THREE.Vector3[] = [];
    const anchors: THREE.Vector3[] = [];
    STRING_SPANS.forEach(span => {
        const from = new THREE.Vector3(span.from[0], span.from[1], span.from[2]);
        const to = new THREE.Vector3(span.to[0], span.to[1], span.to[2]);
        anchors.push(from, to);
        const sag = (span.kind === 'lantern' ? 0.3 : 0.42) * variation.stringSag;
        stringParts.push(sagWire(wire, from, to, sag, 0.008));
        const spacing = span.kind === 'lantern' ? 0.52 : 0.3;
        const count = Math.max(2, Math.floor(from.distanceTo(to) / spacing));
        for (let index = 1; index < count; index += 1) {
            const t = index / count;
            const point = sagPoint(from, to, sag, t);
            point.y -= span.kind === 'lantern' ? 0.12 : 0.04;
            if (span.kind === 'lantern') lanternPositions.push(point);
            else festoonPositions.push(point);
        }
    });
    parts.push(group('Market/strings', ...stringParts));

    // 灯笼批：实例色按 seed 方案（材质名带 machi:glow 前缀，场景的倒影层筛选认得它）；灯珠批：统一的暖色小珠。
    const lanternMaterial = materials.track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lanternMaterial.name = 'machi:glow:lantern';
    const lanternMesh = new THREE.InstancedMesh(lanternGeometry(), lanternMaterial, lanternPositions.length);
    lanternMesh.name = 'Market/lanterns';
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const lanternKeys: string[] = [];
    lanternPositions.forEach((position, index) => {
        euler.set(0, (index * 0.7) % Math.PI, 0);
        quaternion.setFromEuler(euler);
        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        lanternMesh.setMatrixAt(index, matrix);
        lanternKeys[index] = pickLanternKey(variation.lanternScheme, index);
    });
    parts.push(lanternMesh);
    const festoonMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.032, 8, 6), materials.glow('festoonBulb'), festoonPositions.length);
    festoonMesh.name = 'Market/festoon';
    festoonPositions.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y, position.z);
        festoonMesh.setMatrixAt(index, matrix);
    });
    parts.push(festoonMesh);

    // 花树、桌椅、城墙与屋脊带、天灯。
    const blossomRng = (() => { let s = 97 + Math.round(variation.blossomDensity * 100); return () => { s = (s * 16807) % 2147483647; return (s & 0xffff) / 0x10000; }; })();
    const blossom = buildBlossoms(materials, variation.blossomDensity, blossomRng);
    parts.push(group('Market/blossom', ...blossom.parts));
    parts.push(buildTables(materials));
    parts.push(buildWarrior(materials));
    parts.push(buildCityWall(materials));
    parts.push(buildRooftops(materials));
    const skyLanterns = buildSkyLanterns(materials);

    return {
        group: group('Market', ...parts, ...skyLanterns),
        plaqueFace: paifang.plaqueFace,
        bannerFaces: paifang.bannerFaces,
        stallSignFaces,
        teaNeonFace: house.neonFace,
        boardFace: house.boardFace,
        eq: house.eq,
        lanternBatch: { mesh: lanternMesh, keys: lanternKeys, shade: new Float32Array(lanternKeys.length).fill(1) },
        blossomBatch: blossom.batch,
        lampHeads,
        skyLanterns,
        steamSources,
        stringAnchors: anchors,
    };
};
