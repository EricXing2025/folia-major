import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MachiMaterials } from '../../engine/materials';
import { LEVEL, PAIFANG, PALACE_LAMP, PALACE_LAMPS, PROPS, STALL, STALLS, STRING_SPANS } from './layout';
import { boxAt, boxSpan, cylinderAt, group, mesh, roundedBox, sagWire, tubeBetween } from '../../engine/geometry/shapes';
import type { ChanganVariation } from './changanSeed';

// src/components/visualizer/machi/scenes/changan/market.ts
// 夜市广场 Group "Market"：前左的唐式牌坊（两根立柱、横梁、斗拱小屋顶、横匾与柱上竖幡、一对石狮），
// 右边一列食摊与广场中景一个（柜台、顶棚、幌子、蒸笼白气、挂灯）、小桌椅，两盏宫灯柱兼作灯串锚点，
// 横跨广场的红灯笼串与灯珠串（悬链线），一角一株粉花树；背景是后左带城楼的城墙、后右几座低檐唐屋
// 与茶馆角上的紫色小霓虹，天上两盏慢慢升起的天灯。
// 灯笼、花球、栏板柱、凳、瓦当这类重复件都是 InstancedMesh；会动的天灯单独留在小 Group 里。

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

export interface ChanganMarketParts {
    group: THREE.Group;
    /** 牌坊横匾（曲名）的安装面。 */
    plaqueFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    /** 牌坊两柱上挂的竖幡灯箱（歌手）的安装面。 */
    bannerFaces: { position: THREE.Vector3; rotationY: number; width: number; height: number }[];
    /** 三个食摊的幌子面。 */
    stallSignFaces: { position: THREE.Vector3; rotationY: number; width: number; height: number }[];
    /** 茶馆角的紫色小霓虹面。 */
    teaNeonFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    /** 灯笼串 + 摊挂灯 + 牌坊挂灯的灯笼批（实例色按 seed 方案）。 */
    lanternBatch: ChanganColorBatch;
    /** 花树花球批（实例色在花键之间）。 */
    blossomBatch: ChanganColorBatch;
    /** 两盏宫灯灯头的世界坐标（光柱、点光、光斑用）。 */
    lampHeads: THREE.Vector3[];
    /** 两盏天灯（direct 里慢慢升起）。 */
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
        parts.push(boxAt(stone, [0.46, 0.3, 0.46], [base.x, base.y, base.z], { rotationY: yaw, name: 'Paifang/base' }));
        const p = at(lx, groundY + 0.24, 0);
        parts.push(boxAt(red, [PAIFANG.pillarSize, PAIFANG.pillarHeight, PAIFANG.pillarSize], [p.x, p.y, p.z], { rotationY: yaw, radius: 0.025, name: 'Paifang/pillar' }));
    });
    // 上下两道横梁（小额枋 + 大额枋）与端头的花板。
    const mid = at(0, groundY + PAIFANG.midLintel.y0, 0);
    parts.push(boxAt(red, [2.62, PAIFANG.midLintel.y1 - PAIFANG.midLintel.y0, 0.26], [mid.x, mid.y, mid.z], { rotationY: yaw, radius: 0.02, name: 'Paifang/lintelMid' }));
    const topL = at(0, groundY + PAIFANG.topLintel.y0, 0);
    parts.push(boxAt(red, [2.36, PAIFANG.topLintel.y1 - PAIFANG.topLintel.y0, 0.22], [topL.x, topL.y, topL.z], { rotationY: yaw, radius: 0.02, name: 'Paifang/lintelTop' }));
    [-1, 1].forEach(side => {
        const end = at(side * 1.32, groundY + PAIFANG.midLintel.y0 + 0.01, 0);
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
        lanternAnchors: [[-0.52, groundY + 1.92, 0.16] as const, [0.52, groundY + 1.92, 0.16] as const].map(([lx, ly, lz]) => at(lx, ly, lz)),
    };
};

/** 食摊一个：柜台 + 前板、四柱、斜顶棚与檐口、幌子面、蒸笼与货色、挂灯两只。 */
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
    const { width, depth, counterTop, postHeight, canopyY, canopySize } = STALL;

    const c = at(0, groundY, 0);
    parts.push(boxAt(counter, [width, counterTop, depth], [c.x, c.y, c.z], { rotationY: yaw, radius: 0.03, name: `Stall${index}/counter` }));
    const front = at(0, groundY + counterTop - 0.16, depth / 2 + 0.02);
    parts.push(boxAt(wood, [width - 0.1, 0.12, 0.05], [front.x, front.y, front.z], { rotationY: yaw, radius: 0.02, name: `Stall${index}/front` }));
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
    // 幌子（招牌面）：顶棚下挂在前面。
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
    // 顶棚下两角各挂一只灯笼（进灯笼批）。
    const lanternAnchors = [[-width / 2 + 0.14, groundY + canopyY - 0.26, depth / 2 + 0.12] as const, [width / 2 - 0.14, groundY + canopyY - 0.26, depth / 2 + 0.12] as const]
        .map(([lx, ly, lz]) => at(lx, ly, lz));
    return {
        parts,
        signFace: { position: signFace, rotationY: yaw, width: STALL.sign.width, height: STALL.sign.height },
        lanternAnchors,
        steamerTop,
    };
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

/** 城墙一段 + 城楼剪影（后左，贴着底座左缘，朝场内的面受一点光）。 */
const buildCityWall = (materials: MachiMaterials) => {
    const wall = materials.toon('wallSil');
    const roof = materials.toon('skylineRoof');
    const dark = materials.toon('stoneDark');
    const parts: THREE.Object3D[] = [];
    const { x0, x1, z0, z1, top, gate } = PROPS.cityWall;
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
    // 城楼：高出墙身的敌楼（收分大屋顶 + 朝场内的门洞暗示）。
    const gx = (x0 + x1) / 2 + 0.06;
    parts.push(boxAt(wall, [x1 - x0 + 0.14, gate.height - top, gate.width], [gx, y + top, gate.z], { radius: 0.02, name: 'Gate/body' }));
    parts.push(boxAt(roof, [x1 - x0 + 0.4, 0.12, gate.width + 0.34], [gx, y + gate.height, gate.z], { radius: 0.02, name: 'Gate/roof' }));
    parts.push(boxAt(roof, [x1 - x0 + 0.2, gate.roofTop - gate.height - 0.2, gate.width * 0.72], [gx, y + gate.height + 0.12, gate.z], { radius: 0.02, name: 'Gate/roofUp' }));
    parts.push(boxAt(roof, [x1 - x0 + 0.1, 0.1, gate.width * 0.6], [gx, y + gate.roofTop - 0.08, gate.z], { radius: 0.02, name: 'Gate/ridge' }));
    parts.push(boxAt(dark, [0.04, 0.9, 0.55], [x1 + 0.12, y, gate.z], { radius: 0.02, name: 'Gate/arch' }));
    return group('Market/cityWall', ...parts);
};

/** 后右的唐屋天际线：两三座低檐剪影 + 一家茶馆（高一点，角上有紫色小霓虹面）。 */
const buildSkyline = (materials: MachiMaterials) => {
    const wall = materials.toon('skylineWall');
    const roof = materials.toon('skylineRoof');
    const tea = materials.toon('teaWall');
    const glow = materials.glow('teaEave');
    const parts: THREE.Object3D[] = [];
    const y = LEVEL.lot;
    PROPS.skyline.forEach((item, index) => {
        parts.push(boxAt(wall, [item.w, item.h, item.d], [item.x, y, item.z], { radius: 0.02, name: `Skyline${index}/body` }));
        parts.push(boxAt(roof, [item.w + 0.3, 0.14, item.d + 0.3], [item.x, y + item.h, item.z], { radius: 0.03, name: `Skyline${index}/roof` }));
        parts.push(boxAt(roof, [item.w * 0.8, 0.26, item.d * 0.8], [item.x, y + item.h + 0.14, item.z], { radius: 0.03, name: `Skyline${index}/roofUp` }));
    });
    const t = PROPS.teaHouse;
    parts.push(boxAt(tea, [t.w, t.h, t.d], [t.x, y, t.z], { radius: 0.02, name: 'Tea/body' }));
    parts.push(boxAt(roof, [t.w + 0.34, 0.15, t.d + 0.34], [t.x, y + t.h, t.z], { radius: 0.03, name: 'Tea/roof' }));
    parts.push(boxAt(roof, [t.w * 0.78, 0.24, t.d * 0.78], [t.x, y + t.h + 0.15, t.z], { radius: 0.03, name: 'Tea/roofUp' }));
    // 茶馆檐口一小条受光的边 + 角上霓虹的安装面（朝镜头斜出）。
    parts.push(boxAt(glow, [t.w + 0.36, 0.03, 0.04], [t.x, y + t.h - 0.02, t.z + t.d / 2 + 0.17], { radius: 0.01, name: 'Tea/eaveGlow' }));
    const neonAt = toWorld(t.x, t.z, t.neonYaw, 0, 0, t.d / 2 + 0.02);
    const neonFace = {
        position: new THREE.Vector3(neonAt.x, y + t.h * 0.62, neonAt.z),
        rotationY: t.neonYaw,
        width: 0.5,
        height: 0.5,
    };
    return { parts, neonFace };
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

/** 一株粉花树：干与两杈 + 一蓬花球（InstancedMesh，密度按歌变）。 */
const buildBlossom = (materials: MachiMaterials, density: number, rng: () => number) => {
    const trunk = materials.toon('treeTrunk');
    const parts: THREE.Object3D[] = [];
    const { x, z } = PROPS.blossomTree;
    const y = LEVEL.lot;
    parts.push(cylinderAt(trunk, 0.085, 1.45, [x, y, z], { name: 'Blossom/trunk', radiusTop: 0.05, segments: 8 }));
    parts.push(tubeBetween(trunk, new THREE.Vector3(x, y + 0.9, z), new THREE.Vector3(x - 0.42, y + 1.6, z - 0.1), 0.045, { name: 'Blossom/branch' }));
    parts.push(tubeBetween(trunk, new THREE.Vector3(x, y + 1.05, z), new THREE.Vector3(x + 0.34, y + 1.75, z + 0.14), 0.04, { name: 'Blossom/branch2' }));
    const count = Math.round(15 * density);
    const blobGeometry = new THREE.IcosahedronGeometry(0.34, 1);
    const blobs = new THREE.InstancedMesh(blobGeometry, materials.product, count);
    blobs.name = 'Blossom/blobs';
    const keys: string[] = [];
    const shade = new Float32Array(count);
    const matrix = new THREE.Matrix4();
    const center = new THREE.Vector3(x - 0.05, y + 2.05, z);
    for (let index = 0; index < count; index += 1) {
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
    }
    parts.push(blobs);
    return { parts, batch: { mesh: blobs, keys, shade } };
};

/** 两盏天灯：纸罩（下口一点暖光），direct 里慢慢升起、绕回。 */
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
        steamSources.push({ position: stall.steamerTop, puffs: Math.max(3, Math.round(6 * variation.smokeDensity)), period: 3.6, size: 0.55 });
    });

    const lampHeads: THREE.Vector3[] = [];
    PALACE_LAMPS.forEach((spot, index) => {
        const lamp = buildPalaceLamp(materials, spot, index);
        parts.push(group(`Market/lamp${index}`, ...lamp.parts));
        lampHeads.push(lamp.head);
    });

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

    // 花树、桌椅、城墙与天际线、天灯。
    const blossomRng = (() => { let s = 97 + Math.round(variation.blossomDensity * 100); return () => { s = (s * 16807) % 2147483647; return (s & 0xffff) / 0x10000; }; })();
    const blossom = buildBlossom(materials, variation.blossomDensity, blossomRng);
    parts.push(group('Market/blossom', ...blossom.parts));
    parts.push(buildTables(materials));
    parts.push(buildCityWall(materials));
    const skyline = buildSkyline(materials);
    parts.push(group('Market/skyline', ...skyline.parts));
    const skyLanterns = buildSkyLanterns(materials);

    return {
        group: group('Market', ...parts, ...skyLanterns),
        plaqueFace: paifang.plaqueFace,
        bannerFaces: paifang.bannerFaces,
        stallSignFaces,
        teaNeonFace: skyline.neonFace,
        lanternBatch: { mesh: lanternMesh, keys: lanternKeys, shade: new Float32Array(lanternKeys.length).fill(1) },
        blossomBatch: blossom.batch,
        lampHeads,
        skyLanterns,
        steamSources,
        stringAnchors: anchors,
    };
};
