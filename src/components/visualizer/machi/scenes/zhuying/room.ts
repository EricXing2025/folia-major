import * as THREE from 'three';
import { boxSpan, cylinderAt, group, mesh, tubeBetween } from '../../engine/geometry/shapes';
import type { MachiMaterials } from '../../engine/materials';
import { LEVEL, ROOM, WINDOW } from './layout';

// src/components/visualizer/machi/scenes/zhuying/room.ts
// 书房本体：木地板（前右两沿一条深色收边）、后墙与左墙（后墙开出整面落地窗：深木棂格分扇、玻璃、窗台，
// 右段实墙留给环形灯）、两面墙顶的吊顶带与檐口、窗头半卷的竹帘。

export interface ZhuyingRoomParts {
    group: THREE.Group;
    /** 雨痕贴图：材质归材质管，贴图要场景亲手销毁。 */
    streakTexture: THREE.CanvasTexture;
}

/** 玻璃上的雨痕贴图：竖向的水线，越靠下越稀。 */
const createStreakTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(256, 256);
    let seed = 7;
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let column = 0; column < 256; column += 1) {
        const streak = next() < 0.22;
        const fade = 0.25 + next() * 0.5;
        for (let row = 0; row < 256; row += 1) {
            if (!streak) continue;
            const v = row / 256;
            if (next() > fade * (1 - v * 0.6)) continue;
            const index = (row * 256 + column) * 4;
            image.data[index] = 210;
            image.data[index + 1] = 225;
            image.data[index + 2] = 245;
            image.data[index + 3] = Math.round(70 * (1 - v * 0.5));
        }
    }
    context.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
};

export const buildZhuyingRoom = (materials: MachiMaterials): ZhuyingRoomParts => {
    const { x0, x1, z0, z1, wall, wallHeight, ceilingDepth, backInner, leftInner } = ROOM;
    const parts: THREE.Object3D[] = [];
    const wood = materials.toon('woodDark');
    const inner = materials.toon('wallInner');

    // 木地板：一整块架在底座上，前、右两个敞口沿各一条深色收边与踢脚线。
    parts.push(
        boxSpan(materials.toon('floorWood'), x0, x1, 0, LEVEL.floor, z0, z1, { radius: 0.01, name: 'Floor' }),
        boxSpan(wood, x0, x1, LEVEL.floor - 0.02, LEVEL.floor + 0.015, z1 - 0.06, z1, { radius: 0.005, name: 'Edge' }),
        boxSpan(wood, x1 - 0.06, x1, LEVEL.floor - 0.02, LEVEL.floor + 0.015, z0, z1, { radius: 0.005, name: 'Edge' }),
    );

    // 后墙（−z）：按窗洞分段砌——左垛、右段实墙（环形灯挂这）、窗下、窗上。
    parts.push(
        boxSpan(inner, x0, WINDOW.x0, 0, wallHeight, z0, backInner, { radius: 0.005, name: 'Jamb' }),
        boxSpan(inner, WINDOW.x1, x1, 0, wallHeight, z0, backInner, { radius: 0.005, name: 'Bay' }),
        boxSpan(inner, WINDOW.x0, WINDOW.x1, 0, WINDOW.sill, z0, backInner, { radius: 0.005, name: 'Apron' }),
        boxSpan(inner, WINDOW.x0, WINDOW.x1, WINDOW.head, wallHeight, z0, backInner, { radius: 0.005, name: 'Header' }),
        // 窗台里沿一条挑出的小台板。
        boxSpan(wood, WINDOW.x0 - 0.02, WINDOW.x1 + 0.02, WINDOW.sill - 0.03, WINDOW.sill + 0.015, backInner - 0.01, backInner + 0.09, { radius: 0.008, name: 'Sill' }),
        // 右段实墙的护板缝（两条细凹槽，避开环形灯两侧）与墙头一条暖色收边光。
        boxSpan(wood, WINDOW.x1 + 0.2, WINDOW.x1 + 0.22, 0.1, wallHeight - 0.5, backInner, backInner + 0.012, { radius: 0.002, name: 'Bay/seam' }),
        boxSpan(wood, x1 - 0.14, x1 - 0.12, 0.1, wallHeight - 0.5, backInner, backInner + 0.012, { radius: 0.002, name: 'Bay/seam' }),
        boxSpan(materials.glow('shelfStrip'), WINDOW.x1 + 0.03, x1 - 0.03, wallHeight - 0.42, wallHeight - 0.4, backInner, backInner + 0.014, { radius: 0.002, name: 'Bay/trim' }),
    );

    // 窗棂格：墙厚里一圈框料 + 五根竖棂、两根横棂（暗处是深木，玻璃在棂格正中）。
    const mullion = { y0: WINDOW.sill, y1: WINDOW.head, z0: WINDOW.z - 0.035, z1: WINDOW.z + 0.035 };
    parts.push(
        boxSpan(wood, WINDOW.x0 - 0.045, WINDOW.x1 + 0.045, WINDOW.head - 0.02, WINDOW.head + 0.045, mullion.z0, mullion.z1, { radius: 0.008, name: 'Frame' }),
        boxSpan(wood, WINDOW.x0 - 0.045, WINDOW.x1 + 0.045, WINDOW.sill - 0.045, WINDOW.sill + 0.02, mullion.z0, mullion.z1, { radius: 0.008, name: 'Frame' }),
        boxSpan(wood, WINDOW.x0 - 0.045, WINDOW.x0 + 0.02, WINDOW.sill, WINDOW.head, mullion.z0, mullion.z1, { radius: 0.008, name: 'Frame' }),
        boxSpan(wood, WINDOW.x1 - 0.02, WINDOW.x1 + 0.045, WINDOW.sill, WINDOW.head, mullion.z0, mullion.z1, { radius: 0.008, name: 'Frame' }),
    );
    for (let index = 1; index <= 5; index += 1) {
        const x = WINDOW.x0 + ((WINDOW.x1 - WINDOW.x0) * index) / 6;
        parts.push(boxSpan(wood, x - 0.018, x + 0.018, WINDOW.sill, WINDOW.head, mullion.z0, mullion.z1, { radius: 0.006, name: 'Mullion' }));
    }
    [1.16, 1.86].forEach(y => {
        parts.push(boxSpan(wood, WINDOW.x0, WINDOW.x1, y - 0.018, y + 0.018, mullion.z0, mullion.z1, { radius: 0.006, name: 'Mullion' }));
    });

    // 玻璃：一整面在棂格正中，面上贴一层雨痕（稀的竖水线）。
    const glass = mesh(new THREE.PlaneGeometry(WINDOW.x1 - WINDOW.x0, WINDOW.head - WINDOW.sill), materials.glass, { name: 'Glass', castShadow: false, receiveShadow: false });
    glass.position.set((WINDOW.x0 + WINDOW.x1) / 2, (WINDOW.sill + WINDOW.head) / 2, WINDOW.z);
    glass.renderOrder = 2;
    const streakTexture = createStreakTexture();
    const streakMaterial = materials.track(new THREE.MeshBasicMaterial({
        map: streakTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.35,
    }));
    const streak = mesh(new THREE.PlaneGeometry(WINDOW.x1 - WINDOW.x0 - 0.04, WINDOW.head - WINDOW.sill - 0.04), streakMaterial, { name: 'Streaks', castShadow: false, receiveShadow: false });
    streak.position.set((WINDOW.x0 + WINDOW.x1) / 2, (WINDOW.sill + WINDOW.head) / 2, WINDOW.z + 0.012);
    streak.renderOrder = 3;
    parts.push(glass, streak);

    // 左墙（−x）：一整面，踢脚线沿里皮走一圈（后墙右段底下同一条）。
    parts.push(
        boxSpan(inner, x0, leftInner, 0, wallHeight, z0, z1, { radius: 0, name: 'LeftWall' }),
        boxSpan(wood, leftInner - 0.01, leftInner + 0.03, 0, 0.1, z0 + 0.02, z1 - 0.02, { radius: 0.004, name: 'Baseboard' }),
        boxSpan(wood, WINDOW.x1, x1 - 0.02, 0, 0.1, backInner - 0.01, backInner + 0.03, { radius: 0.004, name: 'Baseboard' }),
    );

    // 吊顶带与檐口：沿两面墙各一条，窗帘盒、吊盆都挂在这里；墙头一条深色檐口把墙顶收住。
    const ceiling = materials.toon('ceiling');
    parts.push(
        boxSpan(ceiling, x0, x1, wallHeight - 0.14, wallHeight, z0, z0 + ceilingDepth, { radius: 0, name: 'Ceiling' }),
        boxSpan(ceiling, x0, x0 + ceilingDepth, wallHeight - 0.14, wallHeight, z0, z1, { radius: 0, name: 'Ceiling' }),
        boxSpan(wood, x0 - 0.03, x1 + 0.03, wallHeight, wallHeight + 0.07, z0 - 0.03, backInner + 0.03, { radius: 0.01, name: 'Cornice' }),
        boxSpan(wood, x0 - 0.03, leftInner + 0.03, wallHeight, wallHeight + 0.07, z0 - 0.03, z1 + 0.03, { radius: 0.01, name: 'Cornice' }),
    );

    // 竹帘：窗头一根卷轴，帘面放下一段，两根拉绳垂在旁边。
    const blind = materials.toon('blind');
    const blindBottom = WINDOW.head - WINDOW.blindDrop;
    const blindZ = backInner + 0.045;
    parts.push(
        tubeBetween(wood, new THREE.Vector3(WINDOW.x0 - 0.03, WINDOW.head + 0.01, blindZ), new THREE.Vector3(WINDOW.x1 + 0.03, WINDOW.head + 0.01, blindZ), 0.035, { name: 'Blind/roller', segments: 12 }),
        boxSpan(blind, WINDOW.x0 - 0.02, WINDOW.x1 + 0.02, blindBottom, WINDOW.head, blindZ - 0.008, blindZ + 0.008, { radius: 0.004, name: 'Blind' }),
    );
    for (let index = 0; index < 4; index += 1) {
        const y = blindBottom + ((WINDOW.head - blindBottom) * (index + 0.5)) / 4;
        parts.push(boxSpan(wood, WINDOW.x0 - 0.02, WINDOW.x1 + 0.02, y - 0.004, y + 0.004, blindZ - 0.011, blindZ - 0.005, { radius: 0.002, name: 'Blind/slat' }));
    }
    parts.push(
        boxSpan(wood, WINDOW.x1 - 0.12, WINDOW.x1 - 0.1, blindBottom - 0.32, WINDOW.head + 0.01, blindZ - 0.006, blindZ + 0.006, { radius: 0.002, name: 'Blind/cord' }),
        cylinderAt(wood, 0.02, 0.05, [WINDOW.x1 - 0.11, blindBottom - 0.35, blindZ], { name: 'Blind/pull', segments: 8 }),
    );

    return { group: group('Room', ...parts), streakTexture };
};
