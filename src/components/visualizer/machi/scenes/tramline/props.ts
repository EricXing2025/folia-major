import * as THREE from 'three';
import { boxAt, cylinderAt, group, mesh, sagWire, tubeBetween } from '../../engine/geometry/shapes';
import type { MachiMaterials } from '../../engine/materials';
import { KIOSK, LEVEL, PROPS, STATION, STREET_LAMP, STREET_SIGN, TRACK, TRAM_POLES } from './layout';
import type { TramlineFace } from './building';
import type { TramlineVariation } from './tramlineSeed';

// src/components/visualizer/machi/scenes/tramline/props.ts
// 街道家具：有盖候车亭（斜雨棚、凳子、站牌杆、电子信息牌的位）、报刊亭、街角路牌、人行道路灯、
// 两轨之间的中央电线杆与接触线、电箱垃圾桶护柱这些小物。招牌字面另挂（tramlineSigns.ts），这里只给位置。

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface TramlinePropParts {
    group: THREE.Object3D;
    /** 路灯灯头（世界坐标，给真实灯与光锥）。 */
    lampHead: THREE.Vector3;
    /** 站牌杆上的两块牌位：站名牌（静态）与歌手信息牌。 */
    stopPlateFace: TramlineFace;
    artistPlateFace: TramlineFace;
    /** 报刊亭上的海报位（前面、左面）。 */
    posterFaces: TramlineFace[];
    /** 街角路牌字面。 */
    streetPlateFace: TramlineFace;
    /** 候车亭后墙内壁的导视贴纸位。 */
    stickerFace: TramlineFace;
}

/** 候车亭：四根细柱撑起一块前低后高的斜雨棚，后墙半高栏板，一张候车凳，右端站牌杆。 */
export const buildTramStop = (materials: MachiMaterials, variation: TramlineVariation): { group: THREE.Object3D; stopPlateFace: TramlineFace; artistPlateFace: TramlineFace; stickerFace: TramlineFace } => {
    const S = STATION;
    const parts: THREE.Object3D[] = [];
    const paint = materials.toon('shelterPaint');
    const dark = materials.toon('shelterTrim');
    // 斜雨棚：前沿薄一点、后沿厚一点，顶面走 shelterTop（雪会落在上面）。
    const roof = boxAt(paint, [S.x1 - S.x0 - 0.1, 0.07, S.z1 - S.z0 + 0.28], [(S.x0 + S.x1) / 2, S.roofY - 0.04, (S.z0 + S.z1) / 2 + 0.05], { radius: 0.02, name: 'Shelter/roof' });
    roof.rotation.x = -0.09;
    parts.push(roof);
    parts.push(boxAt(dark, [S.x1 - S.x0 - 0.06, 0.05, 0.05], [(S.x0 + S.x1) / 2, S.roofFrontY, S.z1 + 0.12], { radius: 0.01, name: 'Shelter/lip' }));
    // 柱子：后两前两，前柱短一点跟着斜顶走。
    const postAt = (x: number, z: number, top: number) => {
        parts.push(cylinderAt(dark, 0.045, top - LEVEL.platform, [x, LEVEL.platform, z], { segments: 8, name: 'Shelter/post' }));
    };
    postAt(S.x0 + 0.22, S.z0 + 0.14, S.roofY + 0.1);
    postAt(S.x1 - 0.22, S.z0 + 0.14, S.roofY + 0.1);
    postAt(S.x0 + 0.22, S.z1 - 0.06, S.roofFrontY + 0.03);
    postAt(S.x1 - 0.22, S.z1 - 0.06, S.roofFrontY + 0.03);
    // 后墙半高栏板（半墙加玻璃顶条）。
    parts.push(boxAt(paint, [S.x1 - S.x0 - 0.5, 1.05, 0.07], [(S.x0 + S.x1) / 2, LEVEL.platform, S.z0 + 0.12], { radius: 0.02, name: 'Shelter/back' }));
    const glass = mesh(new THREE.PlaneGeometry(S.x1 - S.x0 - 0.7, S.roofFrontY + 0.1 - 1.15 - LEVEL.platform), materials.glass, { name: 'Shelter/glass', castShadow: false, receiveShadow: false });
    glass.position.set((S.x0 + S.x1) / 2, (LEVEL.platform + 1.05 + S.roofFrontY + 0.1) / 2, S.z0 + 0.12);
    parts.push(glass);
    // 候车凳：一条凳面两条腿（左右摆法按歌换边）。
    const benchX0 = variation.propFlip ? S.bench.x0 + 0.35 : S.bench.x0;
    const benchX1 = variation.propFlip ? S.bench.x1 : S.bench.x1 - 0.35;
    parts.push(boxAt(materials.toon('benchSeat'), [benchX1 - benchX0, 0.07, 0.32], [(benchX0 + benchX1) / 2, LEVEL.platform + 0.42, S.bench.z], { radius: 0.02, name: 'Bench' }));
    [benchX0 + 0.15, benchX1 - 0.15].forEach(x => {
        parts.push(boxAt(materials.toon('darkMetal'), [0.06, 0.42, 0.28], [x, LEVEL.platform, S.bench.z], { radius: 0.01, name: 'Bench/leg' }));
    });
    // 雨棚下一盏候车灯：夜里给站台一点暖光，不至于让整段候车位沉进黑里。
    const lampX = (S.x0 + S.x1) / 2 + 0.3;
    parts.push(cylinderAt(dark, 0.012, 0.16, [lampX, S.roofFrontY - 0.12, S.z0 + 0.3], { segments: 6, name: 'Shelter/lampCord', castShadow: false }));
    const bulb = mesh(new THREE.SphereGeometry(0.055, 10, 8), materials.glow('shelterLamp'), { name: 'Shelter/lamp', castShadow: false, receiveShadow: false });
    bulb.position.set(lampX, S.roofFrontY - 0.19, S.z0 + 0.3);
    parts.push(bulb);
    // 站牌杆：绿杆、顶部一块「電車站 TRAM STOP」牌（双面，两面同一幅字）、下面一块歌手信息牌。
    const pole = materials.toon('windowFrame');
    parts.push(cylinderAt(pole, 0.035, 2.5, [S.pole.x, LEVEL.platform, S.pole.z], { segments: 8, name: 'Stop/pole' }));
    parts.push(boxAt(materials.toon('signBox'), [0.72, 0.3, 0.08], [S.pole.x, 2.12, S.pole.z], { radius: 0.02, name: 'Stop/plate' }));
    parts.push(boxAt(materials.toon('signBox'), [0.62, 0.22, 0.06], [S.pole.x, 1.78, S.pole.z], { radius: 0.02, name: 'Stop/artist' }));
    const stopPlateFace: TramlineFace = { position: v(S.pole.x, 2.12, S.pole.z + 0.045), rotationY: 0, width: 0.66, height: 0.24 };
    const artistPlateFace: TramlineFace = { position: v(S.pole.x, 1.78, S.pole.z + 0.035), rotationY: 0, width: 0.56, height: 0.17 };
    // 后墙内壁的导视贴纸（主题图标）。
    const stickerFace: TramlineFace = { position: v(S.x0 + 0.85, 1.5, S.z0 + 0.165), rotationY: 0, width: 0.28, height: 0.28 };
    return { group: group('TramStop', ...parts), stopPlateFace, artistPlateFace, stickerFace };
};

/** 报刊亭：深绿铁皮小亭，45° 对着街角。红色招牌带、窗口翻板、两面海报位。 */
export const buildKiosk = (materials: MachiMaterials, variation: TramlineVariation): { group: THREE.Object3D; posterFaces: TramlineFace[] } => {
    const K = KIOSK;
    const kiosk = new THREE.Group();
    kiosk.name = 'Kiosk';
    const body = materials.toon('kioskBody');
    const w = K.w / 2;
    const d = K.d / 2;
    kiosk.add(boxAt(body, [K.w, K.h, K.d], [0, LEVEL.lot, 0], { radius: 0.04, name: 'Kiosk/body' }));
    kiosk.add(boxAt(materials.toon('kioskTrim'), [K.w + 0.18, 0.14, K.d + 0.18], [0, K.roofY, 0], { radius: 0.03, name: 'Kiosk/roof' }));
    kiosk.add(boxAt(materials.toon('kioskTrim'), [K.w + 0.1, 0.3, K.d + 0.1], [0, K.roofY - 0.16, 0], { radius: 0.02, name: 'Kiosk/band' }));
    // 卖货窗：前面半高翻板斜开着，里面一格格杂志。
    kiosk.add(boxAt(materials.toon('kioskTrim'), [K.w - 0.3, 0.05, 0.5], [0, LEVEL.lot + 0.92, d + 0.18], { radius: 0.01, name: 'Kiosk/flap', }));
    const magazine = materials.toon('posterPaper');
    for (let index = 0; index < 5; index += 1) {
        const x = -w + 0.24 + (index % 3) * 0.36;
        const y = LEVEL.lot + 0.98 + Math.floor(index / 3) * 0.3;
        kiosk.add(boxAt(magazine, [0.26, 0.3, 0.03], [x, y, d + 0.02], { radius: 0, name: 'Kiosk/mag' }));
    }
    // 翻板台面上一摞报纸/杂志：营业中的报刊亭味。
    kiosk.add(boxAt(magazine, [0.34, 0.09, 0.3], [-w + 0.42, LEVEL.lot + 0.97, d + 0.3], { radius: 0.005, name: 'Kiosk/papers' }));
    kiosk.add(boxAt(magazine, [0.3, 0.07, 0.26], [-w + 0.4, LEVEL.lot + 1.06, d + 0.29], { radius: 0.005, name: 'Kiosk/papers2', rotationY: 0.14 }));
    // 顶上小水箱/天线一点细节。
    kiosk.add(cylinderAt(materials.toon('darkMetal'), 0.02, 0.5, [w - 0.2, K.roofY + 0.07, -d + 0.2], { segments: 6, name: 'Kiosk/aerial' }));
    kiosk.position.set(K.cx, 0, K.cz);
    kiosk.rotation.y = K.rotationY;
    kiosk.updateMatrixWorld(true);
    // 海报位：前面（翻板上方）与左面（各一幅，版式按歌变）。
    const local = (x: number, y: number, z: number) => v(x, y, z).applyMatrix4(kiosk.matrixWorld);
    const posterFaces: TramlineFace[] = [
        { position: local(0, 1.52, d + 0.012), rotationY: K.rotationY, width: K.w - 0.4, height: 0.42 },
        { position: local(-w - 0.012, 1.35, variation.propFlip ? 0.15 : -0.1), rotationY: K.rotationY - Math.PI / 2, width: K.d - 0.4, height: 0.55 },
    ];
    return { group: kiosk, posterFaces };
};

/** 街角路牌：绿杆一块白底蓝字街名板（「春秧街 CHUN YEUNG STREET」）。 */
export const buildStreetSign = (materials: MachiMaterials): { group: THREE.Object3D; face: TramlineFace } => {
    const S = STREET_SIGN;
    const parts: THREE.Object3D[] = [
        cylinderAt(materials.toon('windowFrame'), 0.035, S.poleTop, [S.x, LEVEL.lot, S.z], { segments: 8, name: 'Sign/pole' }),
        boxAt(materials.toon('signBox'), [S.plate.width + 0.06, S.plate.height + 0.06, 0.05], [S.x, S.plate.y, S.z], { radius: 0.02, name: 'Sign/plate', rotationY: S.rotationY }),
    ];
    const offset = 0.03;
    const face: TramlineFace = {
        position: v(S.x + Math.sin(S.rotationY) * offset, S.plate.y, S.z + Math.cos(S.rotationY) * offset),
        rotationY: S.rotationY,
        width: S.plate.width,
        height: S.plate.height,
    };
    return { group: group('StreetSign', ...parts), face };
};

/** 人行道路灯：绿杆一臂伸到近轨上方，灯头朝下。返回灯头（光锥与真实灯用）。 */
export const buildStreetLamp = (materials: MachiMaterials): { group: THREE.Object3D; head: THREE.Vector3 } => {
    const L = STREET_LAMP;
    const pole = materials.toon('windowFrame');
    const parts: THREE.Object3D[] = [
        cylinderAt(pole, 0.07, L.top, [L.x, LEVEL.lot, L.z], { radiusTop: 0.05, segments: 10, name: 'Lamp/pole' }),
        cylinderAt(materials.toon('darkMetal'), 0.11, 0.26, [L.x, LEVEL.lot, L.z], { segments: 10, name: 'Lamp/foot' }),
        tubeBetween(pole, v(L.x, L.top - 0.1, L.z), v(L.head.x, L.head.y + 0.08, L.head.z - 0.12), 0.032, { name: 'Lamp/arm' }),
        boxAt(materials.toon('darkMetal'), [0.5, 0.11, 0.26], [L.head.x, L.head.y, L.head.z], { radius: 0.04, name: 'Lamp/head' }),
    ];
    const lens = mesh(new THREE.PlaneGeometry(0.42, 0.18).rotateX(Math.PI / 2), materials.glow('lampHead'), { name: 'Lamp/lens', castShadow: false, receiveShadow: false });
    lens.position.set(L.head.x, L.head.y - 0.002, L.head.z);
    parts.push(lens);
    return { group: group('StreetLamp', ...parts), head: v(L.head.x, L.head.y - 0.07, L.head.z) };
};

/** 中央电线杆与接触线：两轨之间四根杆，杆顶双臂往两边挂线；接触线顺轨走、杆间带点垂。 */
export const buildTramPoles = (materials: MachiMaterials): THREE.Object3D => {
    const parts: THREE.Object3D[] = [];
    const pole = materials.toon('pole');
    const wire = materials.toon('wire');
    const armY = TRAM_POLES.armY;
    const wireY = TRACK.wireY;
    TRAM_POLES.x.forEach(x => {
        parts.push(cylinderAt(pole, 0.055, TRAM_POLES.top, [x, LEVEL.road, TRAM_POLES.z], { radiusTop: 0.04, segments: 10, name: 'Pole' }));
        parts.push(cylinderAt(materials.toon('darkMetal'), 0.09, 0.2, [x, LEVEL.road, TRAM_POLES.z], { segments: 8, name: 'Pole/foot' }));
        // 横臂：往两边轨各伸一支（顶端小绝缘子）。
        parts.push(tubeBetween(pole, v(x, armY, TRAM_POLES.z), v(x, wireY, TRACK.near), 0.022, { name: 'Pole/arm' }));
        parts.push(tubeBetween(pole, v(x, armY, TRAM_POLES.z), v(x, wireY, TRACK.far), 0.022, { name: 'Pole/arm' }));
        parts.push(boxAt(materials.toon('darkMetal'), [0.06, 0.1, 0.06], [x, wireY, TRACK.near], { radius: 0.01, name: 'Pole/ins' }));
        parts.push(boxAt(materials.toon('darkMetal'), [0.06, 0.1, 0.06], [x, wireY, TRACK.far], { radius: 0.01, name: 'Pole/ins' }));
    });
    // 接触线：杆与杆之间微垂，两头直接通到底座外。
    const xs = [...TRAM_POLES.x];
    [TRACK.near, TRACK.far].forEach(z => {
        let prev = v(-6.1, wireY - 0.04, z);
        xs.forEach(x => {
            const tip = v(x, wireY, z);
            parts.push(sagWire(wire, prev, tip, 0.03, 0.008));
            prev = tip;
        });
        parts.push(sagWire(wire, prev, v(6.1, wireY - 0.04, z), 0.03, 0.008));
    });
    return group('TramPoles', ...parts);
};

/** 小道具：电箱、垃圾桶、两个候车位护柱、一盆路边绿植。 */
export const buildStreetProps = (materials: MachiMaterials): THREE.Object3D => {
    const parts: THREE.Object3D[] = [];
    parts.push(boxAt(materials.toon('electricBox'), [0.6, 0.85, 0.42], [PROPS.electricBox.x, LEVEL.lot, PROPS.electricBox.z], { radius: 0.04, name: 'ElectricBox' }));
    parts.push(boxAt(materials.toon('darkMetal'), [0.5, 0.04, 0.32], [PROPS.electricBox.x, LEVEL.lot + 0.55, PROPS.electricBox.z + 0.22], { radius: 0.005, name: 'ElectricBox/slot' }));
    parts.push(cylinderAt(materials.toon('binBody'), 0.19, 0.55, [PROPS.bin.x, LEVEL.lot, PROPS.bin.z], { segments: 12, name: 'Bin' }));
    parts.push(cylinderAt(materials.toon('binLid'), 0.2, 0.06, [PROPS.bin.x, LEVEL.lot + 0.55, PROPS.bin.z], { segments: 12, name: 'Bin/lid' }));
    PROPS.bollards.forEach(({ x, z }) => {
        parts.push(cylinderAt(materials.toon('bollard'), 0.07, 0.62, [x, LEVEL.lot, z], { segments: 10, name: 'Bollard' }));
        parts.push(boxAt(materials.toon('caution'), [0.15, 0.1, 0.15], [x, LEVEL.lot + 0.42, z], { radius: 0.01, name: 'Bollard/band' }));
    });
    // 路缘排水口：贴路面的几块深色格栅，香港马路牙子的常见件。
    [-4.7, 1.9, 4.9].forEach(x => {
        parts.push(boxAt(materials.toon('drain'), [0.52, 0.03, 0.26], [x, LEVEL.road + 0.005, 1.02], { radius: 0.005, name: 'Drain' }));
        parts.push(boxAt(materials.toon('darkMetal'), [0.56, 0.015, 0.3], [x, LEVEL.road + 0.001, 1.02], { radius: 0.003, name: 'Drain/rim' }));
    });
    parts.push(
        cylinderAt(materials.toon('potColor'), 0.22, 0.3, [PROPS.planter.x, LEVEL.lot, PROPS.planter.z], { segments: 10, name: 'Planter' }),
        mesh(new THREE.SphereGeometry(0.3, 12, 9), materials.toon('planterGreen'), { name: 'Plant' }),
    );
    parts[parts.length - 1]!.position.set(PROPS.planter.x, LEVEL.lot + 0.5, PROPS.planter.z);
    return group('StreetProps', ...parts);
};
