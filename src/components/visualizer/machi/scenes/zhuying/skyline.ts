import * as THREE from 'three';
import { createVisualizerRng } from '../../../visualizerSeedHash';
import { boxSpan, cylinderAt, group, mesh, tubeBetween } from '../../engine/geometry/shapes';
import type { MachiMaterials } from '../../engine/materials';
import { LEVEL, SKYLINE, STREET, SURROUND_ROOFS, WINDOW } from './layout';
import type { ZhuyingVariation } from './zhuyingSeed';

// src/components/visualizer/machi/scenes/zhuying/skyline.ts
// 窗外的长安夜：后墙之外是一条湿街（引擎的湿地面），再往外由近到远几层剪影——一重近檐、一重带灯窗的唐风屋顶、
// 近檐排里被灯光洗亮的大雁塔（七层，窗外唯一的暖色大块，塔尖收在歌词条下的亮窗格里）、左端的城楼、
// 最远的屋脊带；窗的上沿一角探进来一枝樱花。
// 房前、右两侧的底座上再摆两簇矮檐，让书房像架在屋顶群之上。全是低模剪影，几何都进静态合批。

export interface ZhuyingSkylineParts {
    group: THREE.Group;
    /** 湿街面（引擎给它装沥青材质）。 */
    street: THREE.Mesh;
    /** 几座屋顶的顶面（引擎给它们装混凝土湿面）。 */
    lotSurfaces: THREE.Mesh[];
    /** 天气用的屋顶遮挡（雨落在哪一层）：场景最多挑四个，各段分开标好。 */
    roofs: {
        near: { x0: number; z0: number; x1: number; z1: number; y: number };
        mid: { x0: number; z0: number; x1: number; z1: number; y: number };
        pagoda: { x0: number; z0: number; x1: number; z1: number; y: number };
        surround: { x0: number; z0: number; x1: number; z1: number; y: number }[];
    };
    /** 亮窗的实例网格（syncColors 时回写强度）。 */
    litWindows: THREE.InstancedMesh;
}

/** 一座唐风屋顶：墙身一盒，上面一块挑出的大屋檐板（四角起翘用两块斜板近似），顶上一道正脊。 */
const tangRoof = (
    materials: MachiMaterials,
    body: string,
    roof: string,
    x0: number, x1: number,
    z0: number, z1: number,
    y0: number, y1: number,
) => {
    const overhang = 0.16;
    const roofH = Math.min(0.22, (y1 - y0) * 0.25 + 0.08);
    return [
        boxSpan(materials.toon(body), x0, x1, y0, y1, z0, z1, { radius: 0.01, name: 'RoofBody' }),
        // 挑檐：中间一块平板，四角往外挑一点、微微上翘（两块斜板拼出弧度）。
        boxSpan(materials.toon(roof), x0 - overhang, x1 + overhang, y1, y1 + roofH * 0.45, z0 - overhang, z1 + overhang, { radius: 0.015, name: 'Eave' }),
        boxSpan(materials.toon(roof), x0 - overhang * 0.4, x1 + overhang * 0.4, y1 + roofH * 0.45, y1 + roofH, z0 - overhang * 0.4, z1 + overhang * 0.4, { radius: 0.015, name: 'Eave' }),
        boxSpan(materials.toon(roof), (x0 + x1) / 2 - (x1 - x0) * 0.32, (x0 + x1) / 2 + (x1 - x0) * 0.32, y1 + roofH, y1 + roofH + 0.05, (z0 + z1) / 2 - 0.05, (z0 + z1) / 2 + 0.05, { radius: 0.01, name: 'Ridge' }),
    ];
};

export const buildZhuyingSkyline = (materials: MachiMaterials, variation: ZhuyingVariation): ZhuyingSkylineParts => {
    const random = createVisualizerRng(`zhuying:skyline:${variation.skylineSeed}`);
    const parts: THREE.Object3D[] = [];
    const roofs: ZhuyingSkylineParts['roofs'] = {
        near: { x0: -6, z0: SKYLINE.nearZ - 0.35, x1: 0.5, z1: SKYLINE.nearZ + 0.35, y: 0.85 },
        mid: { x0: -6, z0: SKYLINE.midZ0, x1: 1.1, z1: SKYLINE.midZ1, y: 1.45 },
        pagoda: { x0: SKYLINE.pagoda.x - 0.45, z0: SKYLINE.pagoda.z - 0.35, x1: SKYLINE.pagoda.x + 0.45, z1: SKYLINE.pagoda.z + 0.35, y: LEVEL.street + SKYLINE.pagoda.height },
        surround: [
            { x0: 1.2, z0: -4.4, x1: 6, z1: 6, y: 0.9 },
            { x0: -6, z0: 1.2, x1: 1.2, z1: 6, y: 0.9 },
        ],
    };

    // 湿街面：一整片在窗外（街上没有别的东西，夜色里只剩反光）。dynamic：引擎要给它换湿路面材质，不能进合批。
    const street = mesh(new THREE.PlaneGeometry(12, STREET.z1 - STREET.z0), materials.toon('asphalt'), { name: 'Street', castShadow: false, receiveShadow: true, dynamic: true });
    street.geometry.rotateX(-Math.PI / 2);
    street.position.set(0, LEVEL.street, (STREET.z0 + STREET.z1) / 2);
    parts.push(street);

    // 近檐：窗台下一排矮檐口（把视线里的街面切成前后两层）。
    let x = -6;
    while (x < 0.4) {
        const w = 1.1 + random() * 1.5;
        const h = 0.5 + random() * 0.35;
        parts.push(...tangRoof(materials, 'roofBody', 'roofDark', x, Math.min(x + w, 0.5), SKYLINE.nearZ - 0.3, SKYLINE.nearZ + 0.28, LEVEL.street, h));
        x += w + 0.12 + random() * 0.3;
    }

    // 中排：四五座带灯窗的唐风屋顶，高低错落；灯窗是 +z 面上的小发光格（实例）。
    const litWindows: { x: number; y: number; z: number; w: number; h: number }[] = [];
    const midRoofs: { x0: number; x1: number; h: number }[] = [];
    x = -5.9;
    while (x < 1.0) {
        const w = 1.2 + random() * 1.6;
        const h = 0.95 + random() * 0.5;
        midRoofs.push({ x0: x, x1: Math.min(x + w, 1.1), h });
        x += w + 0.35 + random() * 0.5;
    }
    midRoofs.forEach(block => {
        parts.push(...tangRoof(materials, 'roofBody', 'roofMid', block.x0, block.x1, SKYLINE.midZ0, SKYLINE.midZ1, LEVEL.street, block.h));
        // 每座一到两排灯窗，seed 定哪几格亮着。
        const columns = Math.max(2, Math.floor((block.x1 - block.x0) / 0.3));
        for (let column = 0; column < columns; column += 1) {
            if (random() < 0.42) continue;
            const wx = block.x0 + ((block.x1 - block.x0) * (column + 0.5)) / columns;
            const wy = block.h * (0.35 + random() * 0.4);
            litWindows.push({ x: wx, y: wy, z: SKYLINE.midZ1 + 0.006, w: 0.09 + random() * 0.05, h: 0.08 + random() * 0.06 });
        }
    });

    // 大雁塔：矮殿基座上七层收分的塔身——泛光暖金的塔身、每层一道深色挑檐、每层前右两面各一孔拱洞亮窗
    // （下宽上窄两级叠出拱顶），窗外唯一的暖色大块；架在近檐排里，剪影从檐口后升起来。
    const pagoda = SKYLINE.pagoda;
    parts.push(
        boxSpan(materials.toon('roofBody'), pagoda.x - 0.55, pagoda.x + 0.55, LEVEL.street, LEVEL.street + pagoda.base, pagoda.z - 0.3, pagoda.z + 0.3, { radius: 0.02, name: 'Pagoda/base' }),
    );
    const tierH = (pagoda.height - pagoda.base) / 7;
    for (let tier = 0; tier < 7; tier += 1) {
        const t = tier / 6;
        const half = 0.34 * (1 - t * 0.55);
        const y = LEVEL.street + pagoda.base + tierH * tier;
        const eaveY = y + tierH * 0.72;
        parts.push(
            boxSpan(materials.glow('pagodaBody'), pagoda.x - half, pagoda.x + half, y, y + tierH, pagoda.z - half * 0.7, pagoda.z + half * 0.7, { radius: 0.008, name: 'Pagoda/tier' }),
            boxSpan(materials.toon('pagodaRoof'), pagoda.x - half - 0.09, pagoda.x + half + 0.09, eaveY, eaveY + tierH * 0.18, pagoda.z - half * 0.7 - 0.09, pagoda.z + half * 0.7 + 0.09, { radius: 0.008, name: 'Pagoda/eave' }),
            // 拱洞亮窗：前面（+z）与右面（+x）各一孔，镜头两个面都看得到。
            boxSpan(materials.glow('pagoda'), pagoda.x - half * 0.22, pagoda.x + half * 0.22, y + tierH * 0.26, y + tierH * 0.6, pagoda.z + half * 0.7, pagoda.z + half * 0.7 + 0.012, { radius: 0.003, name: 'Pagoda/niche' }),
            boxSpan(materials.glow('pagoda'), pagoda.x - half * 0.13, pagoda.x + half * 0.13, y + tierH * 0.6, y + tierH * 0.82, pagoda.z + half * 0.7, pagoda.z + half * 0.7 + 0.012, { radius: 0.003, name: 'Pagoda/niche' }),
            boxSpan(materials.glow('pagoda'), pagoda.x + half, pagoda.x + half + 0.012, y + tierH * 0.26, y + tierH * 0.6, pagoda.z - half * 0.16, pagoda.z + half * 0.16, { radius: 0.003, name: 'Pagoda/niche' }),
            boxSpan(materials.glow('pagoda'), pagoda.x + half, pagoda.x + half + 0.012, y + tierH * 0.6, y + tierH * 0.82, pagoda.z - half * 0.09, pagoda.z + half * 0.09, { radius: 0.003, name: 'Pagoda/niche' }),
        );
    }
    // 塔刹。
    parts.push(cylinderAt(materials.toon('pagodaRoof'), 0.05, 0.16, [pagoda.x, LEVEL.street + pagoda.height, pagoda.z], { name: 'Pagoda/finial', segments: 6 }));

    // 城楼：窗左端外一座城台，上面一间重檐城楼，檐下一点暖灯。
    const gate = SKYLINE.gate;
    parts.push(
        boxSpan(materials.toon('roofBody'), gate.x0, gate.x1, LEVEL.street, LEVEL.street + 0.55, gate.z0, gate.z1, { radius: 0.02, name: 'Gate/platform' }),
        boxSpan(materials.glow('gateLamp'), (gate.x0 + gate.x1) / 2 - 0.06, (gate.x0 + gate.x1) / 2 + 0.06, LEVEL.street + 0.2, LEVEL.street + 0.32, gate.z1 - 0.02, gate.z1, { radius: 0.005, name: 'Gate/lamp' }),
        ...tangRoof(materials, 'roofBody', 'roofMid', gate.x0 + 0.12, gate.x1 - 0.12, gate.z0 + 0.1, gate.z1 - 0.1, LEVEL.street + 0.55, LEVEL.street + 1.15),
    );

    // 最远的屋脊带：贴着底座后沿的一条矮剪影，几点散灯。
    parts.push(boxSpan(materials.toon('roofFar'), -6, 2.5, LEVEL.street, LEVEL.street + 0.55, SKYLINE.farZ - 0.06, SKYLINE.farZ + 0.06, { radius: 0.02, name: 'Skyline/far' }));
    for (let index = 0; index < 8; index += 1) {
        const wx = -5.6 + index * 0.95 + random() * 0.4;
        if (random() < 0.4) continue;
        litWindows.push({ x: wx, y: 0.22 + random() * 0.25, z: SKYLINE.farZ + 0.07, w: 0.1, h: 0.07 });
    }

    // 房前、右两侧的矮檐群：让书房像架在屋顶群之上（只摆剪影，不收光的细节）。
    SURROUND_ROOFS.forEach(area => {
        let cx = area.x0;
        while (cx < area.x1 - 0.8) {
            const w = Math.min(1.0 + random() * 1.4, area.x1 - cx);
            const h = 0.4 + random() * 0.4;
            const cz = area.z0 + random() * Math.max(0.1, area.z1 - area.z0 - 1.0);
            parts.push(...tangRoof(materials, 'roofBody', 'roofDark', cx, cx + w, cz, cz + Math.min(1.0 + random() * 0.6, area.z1 - cz), LEVEL.street, h));
            cx += w + 0.5 + random() * 0.7;
        }
    });

    // 亮窗实例：一片小发光面（共享 glow 材质，场景按拍子调亮度）。
    const litGeometry = new THREE.PlaneGeometry(1, 1);
    const lit = new THREE.InstancedMesh(litGeometry, materials.glow('cityWindow'), litWindows.length);
    lit.name = 'Skyline/litWindows';
    lit.castShadow = false;
    const matrix = new THREE.Matrix4();
    litWindows.forEach((window, index) => {
        matrix.makeScale(window.w, window.h, 1).setPosition(window.x, window.y, window.z);
        lit.setMatrixAt(index, matrix);
    });
    parts.push(lit);

    // 樱花枝：从窗上沿的一角探进来，两三段枝上挂着一小簇花（实例的小疙瘩）。
    const cornerX = variation.blossomCorner === 0 ? WINDOW.x0 + 0.35 : WINDOW.x1 - 0.35;
    const dir = variation.blossomCorner === 0 ? 1 : -1;
    const branchTop = WINDOW.head + 0.4;
    const branchZ = WINDOW.z - 0.2;
    const joints = [
        new THREE.Vector3(cornerX - dir * 0.15, branchTop + 0.25, branchZ - 0.3),
        new THREE.Vector3(cornerX, branchTop, branchZ - 0.1),
        new THREE.Vector3(cornerX + dir * 0.28, branchTop - 0.32, branchZ),
        new THREE.Vector3(cornerX + dir * 0.42, branchTop - 0.62, branchZ + 0.05),
    ];
    for (let index = 0; index < joints.length - 1; index += 1) {
        parts.push(tubeBetween(materials.toon('branch'), joints[index]!, joints[index + 1]!, 0.028 - index * 0.007, { name: 'Blossom/branch', segments: 6 }));
    }
    // 侧枝一小根。
    parts.push(tubeBetween(
        materials.toon('branch'),
        joints[1]!,
        new THREE.Vector3(cornerX + dir * 0.18, branchTop - 0.45, branchZ - 0.18),
        0.014,
        { name: 'Blossom/twig', segments: 6 },
    ));
    const blossomCount = Math.round(14 * variation.blossomDensity);
    const blossomGeometry = new THREE.IcosahedronGeometry(0.045, 0);
    const blossoms = new THREE.InstancedMesh(blossomGeometry, materials.toon('blossom'), blossomCount);
    blossoms.name = 'Blossom/puffs';
    blossoms.castShadow = false;
    const random2 = createVisualizerRng(`zhuying:blossom:${variation.skylineSeed}`);
    const twigEnd = joints[joints.length - 1]!;
    for (let index = 0; index < blossomCount; index += 1) {
        const along = random2();
        const anchor = joints[1]!.clone().lerp(twigEnd, along);
        anchor.x += (random2() - 0.5) * 0.14;
        anchor.y += (random2() - 0.5) * 0.12;
        anchor.z += (random2() - 0.5) * 0.1;
        matrix.makeScale(0.7 + random2() * 0.7, 0.7 + random2() * 0.7, 0.7 + random2() * 0.7).setPosition(anchor.x, anchor.y, anchor.z);
        blossoms.setMatrixAt(index, matrix);
    }
    parts.push(blossoms);

    // 中排屋顶的顶面交给湿地面（灯窗与塔映在湿檐上）。dynamic：引擎要换湿面材质，不能进合批。
    const lotSurfaces = midRoofs.slice(0, 3).map(block => {
        const surface = mesh(new THREE.PlaneGeometry(block.x1 - block.x0, SKYLINE.midZ1 - SKYLINE.midZ0), materials.toon('concrete'), { name: 'Lot/rooftop', castShadow: false, receiveShadow: true, dynamic: true });
        surface.geometry.rotateX(-Math.PI / 2);
        surface.position.set((block.x0 + block.x1) / 2, block.h + 0.001, (SKYLINE.midZ0 + SKYLINE.midZ1) / 2);
        return surface;
    });
    parts.push(...lotSurfaces);

    return { group: group('Skyline', ...parts), street, lotSurfaces, roofs, litWindows: lit };
};
