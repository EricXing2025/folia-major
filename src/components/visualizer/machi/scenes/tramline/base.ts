import * as THREE from 'three';
import { buildMachiPlinth, MACHI_BASE, machiSurface } from '../../engine/geometry/plinth';
import { boxAt, boxSpan, cylinderAt, group, mesh, tubeBetween } from '../../engine/geometry/shapes';
import type { MachiMaterials } from '../../engine/materials';
import { BOARD, BUILDING, KIOSK, LEVEL, PROPS, ROAD, STREET_LAMP, STATION, TRACK, TRAM_POLES } from './layout';

// src/components/visualizer/machi/scenes/tramline/base.ts
// 港岛街景的地面：底座、人行道、前面一条街（双轨电车轨嵌在沥青里）、站台抬高的一级、路缘、斑马线和
// 井盖。湿路面走共用的地面着色器（machiSurface），路缘断口对应站台上车口与斑马线两端的过路处。

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 底座、人行道与街面：路是整幅湿沥青，人行道是高出一点的混凝土，站台再抬一级。 */
export const buildTramlineGround = (materials: MachiMaterials) => {
    const h = MACHI_BASE.half;
    const roadSurface = machiSurface(materials.toon('asphalt'), -h, h, ROAD.z0, ROAD.z1, LEVEL.road, 'Surface/road');
    const lotSurface = machiSurface(materials.toon('concrete'), -h, h, -h, ROAD.z0 + 0.004, LEVEL.lot, 'Surface/sidewalk');
    const farSurface = machiSurface(materials.toon('concrete'), -h, h, ROAD.z1, h, LEVEL.lot, 'Surface/farSidewalk');
    const surfaces = group('Base/Surfaces', roadSurface, lotSurface, farSurface);
    surfaces.userData.dynamic = true;

    const parts: THREE.Object3D[] = [];
    const curb = materials.toon('curb');
    // 路缘：人行道与路之间，在站台上车口和斑马线两端断开。
    const gaps: [number, number][] = [[STATION.x0 - 0.1, STATION.x1 + 0.1], [0.85, 2.45]];
    let from = -h;
    [...gaps, [h, h] as const].forEach(([gap0, gap1]) => {
        if (gap0 - from > 0.05) parts.push(boxSpan(curb, from, gap0, LEVEL.road, 0.12, ROAD.z0 - ROAD.curb, ROAD.z0, { radius: 0.02, name: 'Curb' }));
        from = gap1;
    });
    parts.push(boxSpan(curb, -h, h, LEVEL.road, 0.12, ROAD.z1, ROAD.z1 + ROAD.curb, { radius: 0.02, name: 'Curb/far' }));

    // 双轨电车轨：一条暗色镶边槽，槽里嵌一道钢轨亮边（沿 x，两条线）。
    const groove = materials.toon('drain');
    const rail = materials.toon('rail');
    [TRACK.near, TRACK.far].forEach(center => {
        [-TRACK.gauge / 2, TRACK.gauge / 2].forEach(offset => {
            const z = center + offset;
            parts.push(boxSpan(groove, -h, h, LEVEL.road + 0.004, 0.028, z - 0.09, z + 0.09, { name: 'Track/groove' }));
            parts.push(boxSpan(rail, -h, h, 0.028, TRACK.railTop, z - 0.032, z + 0.032, { name: 'Track/rail' }));
        });
        // 两根轨之间与两轨外侧的槽线（铺进沥青的轨槽感）。
        parts.push(boxSpan(groove, -h, h, LEVEL.road + 0.004, 0.024, center - 0.05, center + 0.05, { name: 'Track/inner' }));
    });

    // 站台：人行道边上抬高一级，前沿一条安全白线。
    parts.push(boxSpan(materials.toon('concrete'), STATION.x0, STATION.x1, LEVEL.lot, LEVEL.platform, STATION.z0, STATION.z1, { radius: 0.03, name: 'Platform/deck' }));
    parts.push(boxSpan(materials.toon('platformEdge'), STATION.x0 + 0.06, STATION.x1 - 0.06, LEVEL.platform, LEVEL.platform + 0.012, STATION.z1 - 0.18, STATION.z1 - 0.04, { name: 'Platform/edge' }));

    // 站台前沿的候车护栏：两根横杆一排放手，中间留上车的口。
    const railMat = materials.toon('metal');
    const railZ = STATION.rail.z;
    const spans: [number, number][] = [[STATION.rail.x0, STATION.rail.gap[0]], [STATION.rail.gap[1], STATION.rail.x1]];
    spans.forEach(([x0, x1]) => {
        parts.push(tubeBetween(railMat, v(x0, LEVEL.platform + 0.95, railZ), v(x1, LEVEL.platform + 0.95, railZ), 0.025, { name: 'Rail/top' }));
        parts.push(tubeBetween(railMat, v(x0, LEVEL.platform + 0.5, railZ), v(x1, LEVEL.platform + 0.5, railZ), 0.02, { name: 'Rail/mid' }));
    });
    const postXs = [STATION.rail.x0, ...spans.flatMap(s => s), STATION.rail.x1].sort((a, b) => a - b);
    postXs.forEach((x, index) => {
        if (index > 0 && Math.abs(x - postXs[index - 1]!) < 0.01) return;
        parts.push(cylinderAt(railMat, 0.03, 0.95, [x, LEVEL.platform, railZ], { segments: 8, name: 'Rail/post' }));
    });

    // 斑马线：路面上横跨的短白杠（InstancedMesh 一种白漆），加上路缘两端的一对小缺口。
    const bars: { x: number; z: number; w: number; d: number }[] = [];
    for (let z = ROAD.z0 + 0.35; z < ROAD.z1 - 0.3; z += 0.62) {
        bars.push({ x: 1.65, z, w: 1.5, d: 0.34 });
    }
    const paintGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const paint = new THREE.InstancedMesh(paintGeometry, materials.toon('roadPaint'), bars.length);
    paint.name = 'Base/Paint';
    paint.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    bars.forEach((bar, index) => {
        matrix.makeScale(bar.w, 1, bar.d);
        matrix.setPosition(bar.x, LEVEL.road + 0.008, bar.z);
        paint.setMatrixAt(index, matrix);
    });
    parts.push(paint);

    // 井盖与排水格。
    const manhole = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.018, 24), materials.toon('darkMetal'), { name: 'Manhole', castShadow: false });
    manhole.position.set(PROPS.manhole.x, LEVEL.road + 0.01, PROPS.manhole.z);
    parts.push(manhole);
    parts.push(boxSpan(materials.toon('drain'), PROPS.drain.x - 0.21, PROPS.drain.x + 0.21, LEVEL.road + 0.004, 0.02, PROPS.drain.z - 0.04, PROPS.drain.z + 0.04, { name: 'Drain' }));

    const base = group('Base', buildMachiPlinth(materials), group('Base/Lot', ...parts), surfaces);
    return { group: base, roadSurface, lotSurfaces: [lotSurface, farSurface] };
};

/** 默认构图要框进去的点：底座顶面四角与两侧厚度、唐楼顶、灯箱顶、电杆顶与路灯头。 */
export const tramlineFramingPoints = () => {
    const h = MACHI_BASE.half;
    const points: THREE.Vector3[] = [];
    [-h, h].forEach(x => [-h, h].forEach(z => {
        points.push(v(x, 0, z));
        if (z < 0 || x < 0) points.push(v(x, -MACHI_BASE.depth, z));
    }));
    points.push(v(BUILDING.x0, BUILDING.parapetTop, BUILDING.z0), v(BUILDING.x1, BUILDING.parapetTop, BUILDING.z0));
    points.push(v(BOARD.cx, BOARD.cy + BOARD.height / 2 + 0.15, BOARD.cz));
    TRAM_POLES.x.forEach(x => points.push(v(x, TRAM_POLES.top + 0.15, TRACK.poleZ)));
    points.push(v(STREET_LAMP.head.x, STREET_LAMP.head.y + 0.2, STREET_LAMP.head.z));
    points.push(v(KIOSK.cx, KIOSK.roofY + 0.3, KIOSK.cz));
    return points;
};
