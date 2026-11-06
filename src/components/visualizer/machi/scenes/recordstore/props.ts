import * as THREE from 'three';
import type { MachiMaterials } from '../../engine/materials';
import type { RecordstoreVariation } from './recordstoreSeed';
import type { RecordstoreProductBatch } from './interior';
import { BASE, DEG, LEVEL, PROPS, STORE } from './layout';
import { boxAt, boxSpan, cylinderAt, group, mesh, roundedBox, sagWire, tubeBetween } from '../../engine/geometry/shapes';

// src/components/visualizer/machi/scenes/recordstore/props.ts
// 街边道具 Group "Props"：空调外机（屋顶两台、侧墙两台，风扇会转）、路灯、电线杆与电线、反光镜、停车标志、
// 门口 A 字立牌（OPEN / 营业中）、门外一箱特价黑胶；按歌变的自行车（菜篮车）在 "SongProps" 里。
// 每件都是一个命名 Group，在本地坐标里搭好再摆到 layout 里的位置。

export interface RecordstorePlacement {
    position: THREE.Vector3;
    rotationY: number;
    width: number;
    height: number;
}

export interface RecordstorePropsParts {
    group: THREE.Group;
    /** 会转的风扇叶。 */
    fans: THREE.Object3D[];
    /** 特价箱里的唱片（实例色，和商品一起换主题色）。 */
    productBatches: RecordstoreProductBatch[];
    /** 招牌模块要贴字的面。 */
    aFrameFaces: (RecordstorePlacement & { lean?: number })[];
    crateTagFaces: RecordstorePlacement[];
    /** 路灯灯头（世界坐标）。 */
    streetLampHead: THREE.Vector3;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 菜篮自行车（日式 mamachari）：本地坐标沿 +x 是车头。 */
const buildBicycle = (materials: MachiMaterials, name: string) => {
    const frame = materials.toon('bike');
    const metal = materials.toon('metal');
    const rubber = materials.toon('rubber');
    const wheelRadius = 0.33;
    const parts: THREE.Object3D[] = [];
    const wheel = (x: number) => {
        const tire = mesh(new THREE.TorusGeometry(wheelRadius, 0.028, 6, 28), rubber, { name: 'Tire' });
        tire.position.set(x, wheelRadius + 0.03, 0);
        const rim = mesh(new THREE.TorusGeometry(wheelRadius - 0.03, 0.01, 4, 24), metal, { name: 'Rim' });
        rim.position.copy(tire.position);
        const hub = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 8), metal, { name: 'Hub' });
        hub.rotation.x = Math.PI / 2;
        hub.position.copy(tire.position);
        parts.push(tire, rim, hub);
        for (let index = 0; index < 6; index += 1) {
            const angle = (index * Math.PI) / 6;
            const a = tire.position.clone().add(v(Math.cos(angle) * (wheelRadius - 0.03), Math.sin(angle) * (wheelRadius - 0.03), 0));
            const b = tire.position.clone().add(v(-Math.cos(angle) * (wheelRadius - 0.03), -Math.sin(angle) * (wheelRadius - 0.03), 0));
            parts.push(tubeBetween(metal, a, b, 0.004, { segments: 3, castShadow: false, name: 'Spoke' }));
        }
    };
    const rearX = -0.55;
    const frontX = 0.58;
    wheel(rearX);
    wheel(frontX);
    const axleY = wheelRadius + 0.03;
    const bottomBracket = v(-0.05, 0.3, 0);
    const seatTop = v(-0.25, 0.86, 0);
    const headTop = v(0.42, 0.95, 0);
    const headLow = v(0.48, 0.66, 0);
    parts.push(
        tubeBetween(frame, bottomBracket, seatTop, 0.022, { name: 'SeatTube' }),
        tubeBetween(frame, bottomBracket, headLow, 0.026, { name: 'DownTube' }),
        tubeBetween(frame, headLow, headTop, 0.024, { name: 'HeadTube' }),
        tubeBetween(frame, bottomBracket, v(rearX, axleY, 0.05), 0.014, { name: 'ChainStay' }),
        tubeBetween(frame, v(-0.22, 0.78, 0), v(rearX, axleY, 0.05), 0.014, { name: 'SeatStay' }),
        tubeBetween(metal, headLow, v(frontX, axleY, 0), 0.016, { name: 'Fork' }),
    );
    parts.push(boxAt(rubber, [0.24, 0.06, 0.13], [seatTop.x - 0.02, seatTop.y, 0], { radius: 0.025, name: 'Saddle' }));
    parts.push(tubeBetween(metal, v(headTop.x - 0.12, headTop.y + 0.08, -0.26), v(headTop.x - 0.12, headTop.y + 0.08, 0.26), 0.014, { name: 'Handlebar' }));
    parts.push(tubeBetween(metal, headTop, v(headTop.x - 0.1, headTop.y + 0.08, 0), 0.016, { name: 'Stem' }));
    parts.push(boxAt(frame, [0.42, 0.09, 0.025], [-0.28, 0.28, 0.07], { radius: 0.02, name: 'ChainGuard' }));
    parts.push(boxAt(metal, [0.38, 0.02, 0.2], [rearX - 0.02, axleY + 0.36, 0], { radius: 0.006, name: 'Carrier' }));
    parts.push(boxAt(metal, [0.32, 0.22, 0.3], [frontX + 0.04, 0.82, 0], { radius: 0.02, name: 'Basket' }));
    parts.push(tubeBetween(metal, v(rearX + 0.1, axleY - 0.05, 0.04), v(rearX + 0.25, 0.01, 0.14), 0.01, { name: 'Kickstand' }));
    const bike = group(name, ...parts);
    bike.rotation.x = -4 * DEG;
    return bike;
};

/** 空调外机：机身、圆形出风格栅、会转的风扇叶、冷媒管。正面朝 +z。 */
const buildAcUnit = (materials: MachiMaterials, name: string, fans: THREE.Object3D[]) => {
    const body = materials.toon('acUnit');
    const dark = materials.toon('darkMetal');
    const parts: THREE.Object3D[] = [
        boxAt(body, [0.82, 0.62, 0.3], [0, 0.04, 0], { radius: 0.04, name: 'Body' }),
        boxAt(dark, [0.86, 0.04, 0.34], [0, 0, 0], { radius: 0.01, name: 'Feet' }),
    ];
    const grille = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), dark, { name: 'Grille' });
    grille.rotation.x = Math.PI / 2;
    grille.position.set(-0.12, 0.36, 0.15);
    parts.push(grille);
    const blades: THREE.Object3D[] = [];
    for (let index = 0; index < 3; index += 1) {
        const blade = mesh(roundedBox(0.18, 0.07, 0.01, 0.004), materials.toon('metal'), { name: 'Blade', castShadow: false });
        blade.position.set(Math.cos((index * 2 * Math.PI) / 3) * 0.09, Math.sin((index * 2 * Math.PI) / 3) * 0.09, 0);
        blade.rotation.z = (index * 2 * Math.PI) / 3;
        blades.push(blade);
    }
    const fan = group('Fan', ...blades);
    fan.position.set(-0.12, 0.36, 0.165);
    fan.userData.dynamic = true;
    fans.push(fan);
    parts.push(fan);
    parts.push(boxAt(dark, [0.04, 0.3, 0.04], [0.32, 0.1, -0.14], { radius: 0.01, name: 'Pipe' }));
    return group(name, ...parts);
};

/** 路灯：锥形灯杆、伸出的灯臂、灯头（底面发光）。 */
const buildStreetLamp = (materials: MachiMaterials) => {
    const { x, z, height, arm } = PROPS.streetLamp;
    const metal = materials.toon('metal');
    const parts: THREE.Object3D[] = [
        cylinderAt(metal, 0.085, height, [0, LEVEL.lot, 0], { radiusTop: 0.055, segments: 10, name: 'Pole' }),
        cylinderAt(materials.toon('darkMetal'), 0.12, 0.3, [0, LEVEL.lot, 0], { segments: 10, name: 'Foot' }),
        tubeBetween(metal, v(0, LEVEL.lot + height - 0.15, 0), v(-arm * 0.55, LEVEL.lot + height + 0.12, 0), 0.04, { name: 'Arm' }),
        tubeBetween(metal, v(-arm * 0.55, LEVEL.lot + height + 0.12, 0), v(-arm, LEVEL.lot + height + 0.08, 0), 0.04, { name: 'Arm' }),
        boxAt(materials.toon('darkMetal'), [0.56, 0.1, 0.24], [-arm - 0.12, LEVEL.lot + height, 0], { radius: 0.04, name: 'Head' }),
    ];
    const lens = mesh(new THREE.PlaneGeometry(0.46, 0.16), materials.glow('lampHead'), { name: 'Lens', castShadow: false, receiveShadow: false });
    lens.rotation.x = Math.PI / 2;
    lens.position.set(-arm - 0.12, LEVEL.lot + height - 0.003, 0);
    parts.push(lens);
    const lamp = group('StreetLamp', ...parts);
    lamp.position.set(x, 0, z);
    return { group: lamp, head: v(x - arm - 0.12, LEVEL.lot + height - 0.02, z) };
};

/** 电线杆：混凝土杆、两层横担与瓷瓶、变压器、底部黄黑护套；电线顺着左边沿伸出底座，一根接到店前左角。 */
const buildUtilityPole = (materials: MachiMaterials) => {
    const { x, z, height } = PROPS.utilityPole;
    const top = LEVEL.lot + height;
    const parts: THREE.Object3D[] = [
        cylinderAt(materials.toon('pole'), 0.15, height, [x, LEVEL.lot, z], { radiusTop: 0.11, segments: 14, name: 'Pole' }),
        cylinderAt(materials.toon('caution'), 0.165, 1.6, [x, LEVEL.lot, z], { segments: 14, name: 'Guard' }),
        cylinderAt(materials.toon('acUnit'), 0.2, 0.62, [x + 0.32, top - 2.2, z], { segments: 12, name: 'Transformer' }),
        tubeBetween(materials.toon('darkMetal'), v(x, top - 1.9, z), v(x + 0.32, top - 1.9, z), 0.03, { name: 'TransformerBracket' }),
    ];
    const insulators: THREE.Vector3[] = [];
    const wireEnds: THREE.Vector3[] = [];
    [top - 0.7, top - 0.25].forEach((y, level) => {
        const span = level === 0 ? 0.9 : 1.2;
        parts.push(boxSpan(materials.toon('darkMetal'), x - span / 2, x + span / 2, y - 0.05, y + 0.05, z - 0.06, z + 0.06, { radius: 0.015, name: 'Crossarm' }));
        [-span / 2 + 0.08, 0, span / 2 - 0.08].forEach(offset => {
            if (offset === 0 && level === 1) return;
            insulators.push(v(x + offset, y + 0.05, z));
        });
    });
    insulators.forEach(point => {
        parts.push(cylinderAt(materials.toon('white'), 0.04, 0.1, [point.x, point.y, point.z], { radiusTop: 0.025, segments: 8, name: 'Insulator' }));
        wireEnds.push(point.clone().setY(point.y + 0.09));
    });
    const wire = materials.toon('wire');
    wireEnds.forEach((end, index) => {
        const backEnd = v(end.x + (index - 2) * 0.03, end.y - 0.3, -BASE.half);
        const frontEnd = v(end.x + (index - 2) * 0.03, end.y - 0.2, BASE.half);
        parts.push(sagWire(wire, end, backEnd, 0.55 + index * 0.04));
        parts.push(sagWire(wire, end, frontEnd, 0.35 + index * 0.03));
    });
    parts.push(sagWire(wire, v(x + 0.1, top - 2.6, z), v(STORE.x0 + 0.1, STORE.parapetTop - 0.1, STORE.z1 - 0.1), 0.35, 0.01));
    parts.push(boxAt(materials.toon('brand2'), [0.03, 0.42, 0.14], [x + 0.15, LEVEL.lot + 1.9, z], { radius: 0.01, name: 'AddressPlate' }));
    return group('UtilityPole', ...parts);
};

/** 路口的反光镜：橙色立杆、圆镜。 */
const buildCurveMirror = (materials: MachiMaterials) => {
    const { x, z, height } = PROPS.curveMirror;
    const pole = materials.toon('mirrorPole');
    const parts: THREE.Object3D[] = [
        cylinderAt(pole, 0.035, height, [0, LEVEL.lot, 0], { segments: 8, name: 'Pole' }),
        tubeBetween(pole, v(0, LEVEL.lot + height - 0.1, 0), v(0.2, LEVEL.lot + height - 0.1, -0.14), 0.025, { name: 'Bracket' }),
    ];
    const rim = mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 24), pole, { name: 'Rim' });
    const glass = mesh(new THREE.CircleGeometry(0.29, 24), materials.toon('metal'), { name: 'Mirror', castShadow: false });
    [rim, glass].forEach(part => {
        part.position.set(0.26, LEVEL.lot + height - 0.1, -0.18);
        part.rotation.y = 125 * DEG;
        part.rotateX(-12 * DEG);
        parts.push(part);
    });
    const mirror = group('CurveMirror', ...parts);
    mirror.position.set(x, 0, z);
    return mirror;
};

/** 停车标志：倒三角红牌、白边。 */
const buildStopSign = (materials: MachiMaterials) => {
    const { x, z, height } = PROPS.stopSign;
    const shape = new THREE.Shape();
    const r = 0.36;
    for (let index = 0; index < 3; index += 1) {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 3;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (index === 0) shape.moveTo(px, py);
        else shape.lineTo(px, py);
    }
    shape.closePath();
    const plate = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.01, bevelSegments: 1 });
    const parts: THREE.Object3D[] = [
        cylinderAt(materials.toon('metal'), 0.03, height, [0, LEVEL.lot, 0], { segments: 8, name: 'Pole' }),
    ];
    const back = mesh(plate, materials.toon('white'), { name: 'Rim' });
    back.position.set(0, LEVEL.lot + height - 0.15, 0.03);
    const face = mesh(new THREE.ShapeGeometry(shape), materials.toon('stopRed'), { name: 'Face' });
    face.scale.setScalar(0.86);
    face.position.set(0, LEVEL.lot + height - 0.15 - 0.012, 0.08);
    parts.push(back, face);
    const sign = group('StopSign', ...parts);
    sign.position.set(x, 0, z);
    sign.rotation.y = 60 * DEG;
    return sign;
};

/** 门口的 A 字立牌：两块斜靠的板，正面贴 OPEN / 营业中。 */
const buildAFrame = (materials: MachiMaterials) => {
    const { x, z } = PROPS.aFrame;
    const lean = 12 * DEG;
    const board = { w: 0.56, h: 0.82 };
    const rotationY = 35 * DEG;
    const parts: THREE.Object3D[] = [];
    [1, -1].forEach(side => {
        const panel = mesh(roundedBox(board.w, board.h, 0.03, 0.012), materials.toon('wood'), { name: 'Panel' });
        panel.position.set(0, LEVEL.lot + Math.cos(lean) * board.h / 2, side * Math.sin(lean) * board.h / 2);
        panel.rotation.x = side * -lean;
        parts.push(panel);
    });
    const frame = group('AFrame', ...parts);
    frame.position.set(x, 0, z);
    frame.rotation.y = rotationY;
    const normal = v(Math.sin(rotationY), 0, Math.cos(rotationY));
    const faceCenter = v(x, LEVEL.lot + Math.cos(lean) * board.h / 2, z).addScaledVector(normal, Math.sin(lean) * board.h / 2 + 0.02);
    return {
        group: frame,
        faces: [{ position: faceCenter, rotationY, width: board.w - 0.06, height: board.h - 0.08, lean } as RecordstorePlacement & { lean: number }],
    };
};

/** 门外一箱特价黑胶：和店内的翻箱同款矮一点，前板上挂一块小价签（字面另挂）。 */
const buildSaleCrate = (materials: MachiMaterials) => {
    const { x, z } = PROPS.saleCrate;
    const wood = materials.toon('wood');
    const dark = materials.toon('darkMetal');
    const w = 0.78;
    const d = 0.62;
    const h = 0.46;
    const rotationY = 18 * DEG;
    const parts: THREE.Object3D[] = [
        boxSpan(wood, -w / 2, w / 2, 0.05, h, -d / 2, -d / 2 + 0.04, { radius: 0.01, name: 'Side' }),
        boxSpan(wood, -w / 2, w / 2, 0.05, h * 0.78, d / 2 - 0.04, d / 2, { radius: 0.01, name: 'Side' }),
        boxSpan(wood, -w / 2, -w / 2 + 0.04, 0.05, h, -d / 2, d / 2, { radius: 0.01, name: 'Side' }),
        boxSpan(wood, w / 2 - 0.04, w / 2, 0.05, h, -d / 2, d / 2, { radius: 0.01, name: 'Side' }),
        boxSpan(wood, -w / 2 + 0.04, w / 2 - 0.04, 0.02, 0.07, -d / 2 + 0.04, d / 2 - 0.04, { radius: 0.008, name: 'Bottom' }),
        boxSpan(dark, -w / 2 - 0.02, w / 2 + 0.02, 0, 0.05, -d / 2 - 0.02, d / 2 + 0.02, { radius: 0.01, name: 'Feet' }),
    ];
    const crate = group('SaleCrate', ...parts);
    crate.position.set(x, LEVEL.lot, z);
    crate.rotation.y = rotationY;
    const normal = v(Math.sin(rotationY), 0, Math.cos(rotationY));
    const tagCenter = v(x, LEVEL.lot + h * 0.55, z).addScaledVector(normal, d / 2 + 0.006);
    return {
        group: crate,
        faces: [{ position: tagCenter, rotationY, width: 0.4, height: 0.26 } as RecordstorePlacement],
        // 箱子本地坐标里的唱片槽位（世界变换按上面的放置）：封套面朝 +z。
        records: { x, z, rotationY, w: w - 0.14, d, y: LEVEL.lot + 0.09 },
    };
};

/**
 * 按歌变的道具 Group "SongProps"：自行车（一到两辆、停在哪、颜色走调色板）。
 * 换歌时整组换掉重建，其余道具不动。
 */
export const buildRecordstoreSongProps = (materials: MachiMaterials, variation: RecordstoreVariation) => {
    const parts: THREE.Object3D[] = [];
    const firstSlot = PROPS.bikeSlots[variation.bikeSlot];
    const bike = buildBicycle(materials, 'Bicycle0');
    bike.position.set(firstSlot.x, LEVEL.lot, firstSlot.z);
    bike.rotation.y = Math.PI + variation.bikeYaw;
    parts.push(bike);
    if (variation.secondBike) {
        const otherSlot = PROPS.bikeSlots[variation.bikeSlot === 0 ? 1 : 0];
        const second = buildBicycle(materials, 'Bicycle1');
        second.position.set(otherSlot.x, LEVEL.lot, otherSlot.z + 0.05);
        second.rotation.y = Math.PI - variation.bikeYaw * 0.7;
        parts.push(second);
    }
    return group('SongProps', ...parts);
};

export const buildRecordstoreProps = (materials: MachiMaterials): RecordstorePropsParts => {
    const fans: THREE.Object3D[] = [];
    const acUnits = [
        ...PROPS.roofAc.map((at, index) => {
            const unit = buildAcUnit(materials, `RoofAc${index}`, fans);
            unit.position.set(at.x, STORE.roofTop, at.z);
            unit.rotation.y = index === 0 ? 0 : Math.PI / 2;
            return unit;
        }),
        ...PROPS.groundAc.z.map((z, index) => {
            const unit = buildAcUnit(materials, `GroundAc${index}`, fans);
            unit.position.set(PROPS.groundAc.x, LEVEL.lot, z);
            unit.rotation.y = -Math.PI / 2;
            return unit;
        }),
    ];

    const lamp = buildStreetLamp(materials);
    const aFrame = buildAFrame(materials);
    const saleCrate = buildSaleCrate(materials);
    // 特价箱里的唱片：一排实例化的封套（面朝街）。
    const recordCount = 16;
    const recordBatch = new THREE.InstancedMesh(roundedBox(1, 1, 1, 0), materials.product, recordCount);
    recordBatch.name = 'SaleRecords';
    recordBatch.castShadow = false;
    const colorIndex = new Uint8Array(recordCount);
    const shade = new Float32Array(recordCount);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Matrix4();
    const slot = saleCrate.records;
    for (let index = 0; index < recordCount; index += 1) {
        const t = index / (recordCount - 1);
        rotation.makeRotationY(slot.rotationY).multiply(new THREE.Matrix4().makeRotationX(-0.14 + t * 0.1));
        matrix.makeScale(slot.w, 0.3, 0.014).premultiply(rotation);
        const local = v(0, slot.y + 0.15, -slot.d / 2 + 0.09 + t * (slot.d - 0.2));
        const world = v(slot.x, 0, slot.z).add(local.applyAxisAngle(new THREE.Vector3(0, 1, 0), slot.rotationY));
        matrix.setPosition(world.x, world.y, world.z);
        recordBatch.setMatrixAt(index, matrix);
        recordBatch.setColorAt(index, new THREE.Color(1, 1, 1));
        colorIndex[index] = index % 8;
        shade[index] = 0.8 + (index % 5) * 0.08;
    }

    const props = group(
        'Props',
        ...acUnits,
        lamp.group,
        buildUtilityPole(materials),
        buildCurveMirror(materials),
        buildStopSign(materials),
        aFrame.group,
        saleCrate.group,
        recordBatch,
    );
    return {
        group: props,
        fans,
        productBatches: [{ mesh: recordBatch, colorIndex, shade }],
        aFrameFaces: aFrame.faces,
        crateTagFaces: saleCrate.faces,
        streetLampHead: lamp.head,
    };
};
