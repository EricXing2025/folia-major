import * as THREE from 'three';
import type { MachiMaterials } from '../../engine/materials';
import { PAGODA, TERRACE } from './layout';
import { boxAt, boxSpan, cylinderAt, group, mesh, roundedBox } from '../../engine/geometry/shapes';

// src/components/visualizer/machi/scenes/changan/terrace.ts
// 后中偏右的塔组 Group "Terrace"：一座矮石台（台帮 + 压顶铺地，只把大雁塔从广场里垫起来），
// 台面上的七层大雁塔（青砖塔身、逐层收分、叠涩出檐带翘角、四面暖光拱窗、塔刹）。塔是远处地标：
// 整组在默认镜头下只占画面高四成以内，退到市集与歌词楼的后面。

/** 台帮顶面高度（压顶石上表面）。 */
export const TERRACE_TOP = TERRACE.top + 0.05;

export interface ChanganTerraceParts {
    group: THREE.Group;
    /** 塔尖顶的世界坐标（构图取景用）。 */
    pagodaTop: THREE.Vector3;
}

/** 矮石台：一整块台帮 + 上沿一道线脚 + 压顶铺地（出挑一点）。 */
const buildTerraceBody = (materials: MachiMaterials) => {
    const stone = materials.toon('terraceStone');
    const cap = materials.toon('stoneCap');
    const dark = materials.toon('stoneDark');
    const { x0, x1, z0, z1, top, capOverhang } = TERRACE;
    const parts: THREE.Object3D[] = [];

    parts.push(boxSpan(stone, x0, x1, 0, top, z0, z1, { radius: 0.03, name: 'Terrace/body' }));
    // 台帮上沿一圈勾边（压顶下的一道线脚）。
    parts.push(boxSpan(dark, x0 - 0.02, x1 + 0.02, top - 0.09, top, z0 - 0.02, z1 + 0.02, { radius: 0.015, name: 'Terrace/trim' }));
    // 压顶铺地：比台帮出挑一点。
    parts.push(boxSpan(cap, x0 - capOverhang, x1 + capOverhang, top, TERRACE_TOP, z0 - capOverhang, z1 + capOverhang, { radius: 0.02, name: 'Terrace/cap' }));
    return group('Terrace/body', ...parts);
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
        parts.push(boxAt(brick, [width, height, width], [cx, y, cz], { radius: 0.02, name: `Pagoda/body${level}` }));
        parts.push(boxAt(eave, [width + 0.07, 0.05, width + 0.07], [cx, y + height - 0.05, cz], { radius: 0.015, name: `Pagoda/band${level}` }));
        // 叠涩出檐：檐下先出半层，再出整檐，檐角微翘。
        const eaveY = y + height;
        parts.push(boxAt(eave, [width + underEave * 2, eaveThickness * 0.6, width + underEave * 2], [cx, eaveY, cz], { radius: 0.01, name: `Pagoda/underEave${level}` }));
        const eaveW = width + eaveOverhang * 2;
        parts.push(boxAt(eave, [eaveW, eaveThickness * 0.5, eaveW], [cx, eaveY + eaveThickness * 0.6, cz], { radius: 0.01, name: `Pagoda/eave${level}` }));
        // 四角微翘的小檐角。
        const corner = eaveW / 2 - 0.06;
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {
            const tip = mesh(roundedBox(0.14, 0.03, 0.14, 0.012), eave, { name: 'Pagoda/eaveTip' });
            tip.position.set(cx + sx! * corner, eaveY + eaveThickness + 0.03, cz + sz! * corner);
            tip.rotation.y = -Math.atan2(sz!, sx!);
            tip.rotation.z = 0.34;
            parts.push(tip);
        });
        // 檐口下沿一圈受光的金线（泛光照到檐口的暗示）。
        parts.push(boxAt(trim, [eaveW + 0.008, 0.018, eaveW + 0.008], [cx, eaveY - 0.012, cz], { radius: 0.006, name: `Pagoda/eaveTrim${level}` }));
        // 四面拱窗：暖光的小洞口，底层的高大些；每层比塔身往外探一点点避免 z-fight。
        const archW = taller ? 0.3 : 0.19;
        const archH = taller ? 0.44 : 0.26;
        const archY = y + (taller ? 0.16 : height * 0.3);
        const archR = archW / 2;
        [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dz], face) => {
            const faceDist = width / 2 + 0.01;
            const ax = cx + dx! * faceDist;
            const az = cz + dz! * faceDist;
            const yaw = dx !== 0 ? Math.PI / 2 : 0;
            parts.push(boxAt(arch, [archW, archH - archR, 0.025], [ax, archY, az], { rotationY: yaw, radius: 0.012, name: `Pagoda/arch${level}:${face}` }));
            // 拱顶：轴沿面法线的一张圆盘，下半与矩形重合，露出的上半正好是圆拱。
            const capCylinder = mesh(new THREE.CylinderGeometry(archR, archR, 0.025, 12), arch, { name: `Pagoda/archTop${level}:${face}` });
            capCylinder.position.set(ax, archY + archH - archR, az);
            if (dx !== 0) capCylinder.rotation.z = Math.PI / 2;
            else capCylinder.rotation.x = Math.PI / 2;
            parts.push(capCylinder);
        });
        y += height + eaveThickness;
        width *= taper;
    });
    // 塔刹：基座圆盘、刹杆、相轮宝珠、尖顶。
    parts.push(cylinderAt(eave, 0.17, 0.06, [cx, y, cz], { name: 'Pagoda/spireBase' }));
    parts.push(cylinderAt(brick, 0.035, spire, [cx, y + 0.04, cz], { radiusTop: 0.015, name: 'Pagoda/spireRod' }));
    [[0.06, 0.16], [0.048, 0.26], [0.034, 0.34]].forEach(([r, at], index) => {
        const orb = mesh(new THREE.SphereGeometry(r!, 12, 8), trim, { name: `Pagoda/orb${index}` });
        orb.position.set(cx, y + 0.04 + at!, cz);
        parts.push(orb);
    });
    const tip = mesh(new THREE.ConeGeometry(0.032, 0.1, 10), trim, { name: 'Pagoda/spireTip' });
    tip.position.set(cx, y + 0.04 + spire, cz);
    parts.push(tip);
    return { parts, top: new THREE.Vector3(cx, y + 0.04 + spire + 0.07, cz) };
};

export const buildChanganTerrace = (materials: MachiMaterials): ChanganTerraceParts => {
    const pagoda = buildPagoda(materials);
    return {
        group: group(
            'Terrace',
            buildTerraceBody(materials),
            group('Terrace/pagoda', ...pagoda.parts),
        ),
        pagodaTop: pagoda.top,
    };
};
