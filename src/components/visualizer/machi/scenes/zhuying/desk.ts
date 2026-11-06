import * as THREE from 'three';
import { createVisualizerRng } from '../../../visualizerSeedHash';
import { boxAt, boxSpan, cylinderAt, group, mesh, tubeBetween } from '../../engine/geometry/shapes';
import type { MachiMaterials } from '../../engine/materials';
import { DESK, LEVEL, MONITOR } from './layout';
import type { ZhuyingVariation } from './zhuyingSeed';

// src/components/visualizer/machi/scenes/zhuying/desk.ts
// 书桌一角（屋里的工作台）：桌面、两侧板脚与前沿跑马灯的底板；桌上的超宽显示器（支架与边框，屏面是
// zhuyingSigns.ts 的画布）、键盘、杯子、耳机架、斜杆小台灯（灯罩里一点暖光，灯锥由场景补）、一块小键盘台
// （十几颗键，亮着的那几颗按歌变）。

export interface ZhuyingDeskParts {
    group: THREE.Group;
    /** 台灯灯头与光锥落点（场景的光锥用）。 */
    lampApex: THREE.Vector3;
    lampTarget: THREE.Vector3;
    /** 显示器屏面（画布贴在它正前方）。 */
    monitorFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    /** 前沿跑马灯面。 */
    tickerFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    /** 小键盘上亮着的键（实例色：红绿琥珀随机）。 */
    keypad: THREE.InstancedMesh;
}

export const buildZhuyingDesk = (materials: MachiMaterials, variation: ZhuyingVariation): ZhuyingDeskParts => {
    const random = createVisualizerRng(`zhuying:desk:${variation.keySeed}`);
    const parts: THREE.Object3D[] = [];
    const wood = materials.toon('woodDark');
    const topY = DESK.top;

    // 桌面与两块板脚；前沿中间留出跑马灯的位置（灯条面由 signs 贴）。
    parts.push(
        boxSpan(materials.toon('deskTop'), DESK.x0 - 0.04, DESK.x1 + 0.04, topY - 0.05, topY, DESK.z0, DESK.z1, { radius: 0.012, name: 'Desk/top' }),
        boxSpan(wood, DESK.x0 + 0.02, DESK.x0 + 0.12, LEVEL.floor, topY - 0.05, DESK.z0 + 0.06, DESK.z1 - 0.06, { radius: 0.008, name: 'Desk/leg' }),
        boxSpan(wood, DESK.x1 - 0.12, DESK.x1 - 0.02, LEVEL.floor, topY - 0.05, DESK.z0 + 0.06, DESK.z1 - 0.06, { radius: 0.008, name: 'Desk/leg' }),
        // 前沿的跑马灯底板（一条细黑槽）。
        boxSpan(wood, DESK.x0 + 0.1, DESK.x1 - 0.1, DESK.tickerY - DESK.tickerHeight / 2 - 0.03, DESK.tickerY + DESK.tickerHeight / 2 + 0.03, DESK.z1 - 0.02, DESK.z1, { radius: 0.006, name: 'Desk/tickerBox' }),
    );

    // 显示器：底座、立柱、边框（屏面另贴）。
    const normal = new THREE.Vector3(Math.sin(MONITOR.azimuth), 0, Math.cos(MONITOR.azimuth));
    const across = new THREE.Vector3(normal.z, 0, -normal.x);
    const monitorAt = new THREE.Vector3(MONITOR.x, MONITOR.y, MONITOR.z);
    const bezel = boxAt(wood, [MONITOR.width + 0.06, MONITOR.height + 0.06, 0.035], [MONITOR.x, MONITOR.y - MONITOR.height / 2 - 0.03, MONITOR.z], { name: 'Monitor/bezel', radius: 0.01, rotationY: MONITOR.azimuth });
    // boxAt 按底面中心放：底面就是屏下沿，绕 azimuth 转。
    const neck = boxAt(wood, [0.05, 0.3, 0.04], [MONITOR.x - normal.x * 0.12, topY + 0.04, MONITOR.z - normal.z * 0.12], { name: 'Monitor/neck', radius: 0.008, rotationY: MONITOR.azimuth });
    const foot = boxAt(wood, [0.5, 0.025, 0.3], [MONITOR.x - normal.x * 0.15, topY, MONITOR.z - normal.z * 0.15], { name: 'Monitor/foot', radius: 0.01, rotationY: MONITOR.azimuth });
    parts.push(bezel, neck, foot);
    const monitorFace = {
        position: monitorAt.clone().add(normal.clone().multiplyScalar(0.02)),
        rotationY: MONITOR.azimuth,
        width: MONITOR.width,
        height: MONITOR.height,
    };

    // 键盘：屏前一长条薄板，键帽是一片小凸点（只画两片暖色键带暗示）。
    const keyboardAt = new THREE.Vector3(MONITOR.x + across.x * 0.02, topY, MONITOR.z + normal.z * 0.5);
    const keyboard = boxAt(materials.toon('plasticDark'), [0.78, 0.025, 0.26], [keyboardAt.x, topY, keyboardAt.z], { name: 'Keyboard', radius: 0.008, rotationY: MONITOR.azimuth });
    parts.push(keyboard);
    const keyRow = boxAt(materials.toon('keycap'), [0.72, 0.014, 0.2], [keyboardAt.x, topY + 0.025, keyboardAt.z], { name: 'Keyboard/keys', radius: 0.004, rotationY: MONITOR.azimuth });
    parts.push(keyRow);

    // 杯子、耳机架。
    parts.push(
        cylinderAt(materials.toon('mug'), 0.055, 0.12, [-0.05, topY, -3.35], { name: 'Mug', segments: 14 }),
        cylinderAt(wood, 0.045, 0.01, [-0.05, topY + 0.115, -3.35], { name: 'Mug/lid', segments: 14 }),
    );
    const hp = { x: 0.22, z: -3.72 };
    parts.push(
        cylinderAt(wood, 0.09, 0.015, [hp.x, topY, hp.z], { name: 'Headphones/base', segments: 12 }),
        cylinderAt(materials.toon('metal'), 0.014, 0.24, [hp.x, topY + 0.015, hp.z], { name: 'Headphones/pole', segments: 8 }),
        boxAt(materials.toon('metal'), [0.16, 0.02, 0.05], [hp.x, topY + 0.255, hp.z], { name: 'Headphones/arm', radius: 0.006, rotationY: MONITOR.azimuth }),
        boxAt(materials.toon('plasticDark'), [0.05, 0.14, 0.09], [hp.x - 0.08 * Math.cos(MONITOR.azimuth), topY + 0.15, hp.z + 0.08 * Math.sin(MONITOR.azimuth)], { name: 'Headphones/cup', radius: 0.02, rotationY: MONITOR.azimuth }),
        boxAt(materials.toon('plasticDark'), [0.05, 0.14, 0.09], [hp.x + 0.08 * Math.cos(MONITOR.azimuth), topY + 0.15, hp.z - 0.08 * Math.sin(MONITOR.azimuth)], { name: 'Headphones/cup', radius: 0.02, rotationY: MONITOR.azimuth }),
    );

    // 斜杆小台灯：桌后左角一个圆座，斜杆把灯罩送到桌面中上方，罩里一点暖光。
    const lampBase = new THREE.Vector3(-1.78, topY, -3.7);
    const lampApex = new THREE.Vector3(-1.35, topY + 0.55, -3.4);
    const lampTarget = new THREE.Vector3(-1.15, topY, -3.15);
    parts.push(
        cylinderAt(wood, 0.075, 0.02, [lampBase.x, topY, lampBase.z], { name: 'Lamp/base', segments: 12 }),
        tubeBetween(materials.toon('metal'), lampBase.clone().setY(topY + 0.02), lampApex, 0.016, { name: 'Lamp/arm', segments: 8 }),
        cylinderAt(materials.toon('lampShade'), 0.07, 0.09, [lampApex.x, lampApex.y - 0.02, lampApex.z], { name: 'Lamp/shade', segments: 12, radiusTop: 0.035 }),
        cylinderAt(materials.glow('lampGlow'), 0.032, 0.015, [lampApex.x, lampApex.y - 0.045, lampApex.z], { name: 'Lamp/bulb', segments: 10 }),
    );

    // 小键盘台：一块斜放的板，上面 3×5 颗键，亮着的那几颗是发光实例（红 / 绿 / 琥珀）。
    const padAt = new THREE.Vector3(-1.42, topY, -3.3);
    const padYaw = MONITOR.azimuth * 0.6;
    parts.push(boxAt(materials.toon('plasticDark'), [0.34, 0.035, 0.24], [padAt.x, topY, padAt.z], { name: 'Keypad', radius: 0.008, rotationY: padYaw }));
    const KEY_COLUMNS = 5;
    const KEY_ROWS = 3;
    const keyGeometry = new THREE.BoxGeometry(0.042, 0.012, 0.042);
    const keypad = new THREE.InstancedMesh(keyGeometry, materials.glow('keyLit'), KEY_COLUMNS * KEY_ROWS);
    keypad.name = 'Keypad/keys';
    keypad.castShadow = false;
    keypad.userData.dynamic = true;
    const keyMatrix = new THREE.Matrix4();
    const keyColor = new THREE.Color();
    const keyPalette = [new THREE.Color('#ff5f6b'), new THREE.Color('#45e08a'), new THREE.Color('#ffb547')];
    let keyIndex = 0;
    for (let row = 0; row < KEY_ROWS; row += 1) {
        for (let column = 0; column < KEY_COLUMNS; column += 1) {
            const lx = (column - (KEY_COLUMNS - 1) / 2) * 0.058;
            const lz = (row - (KEY_ROWS - 1) / 2) * 0.066;
            const cos = Math.cos(padYaw);
            const sin = Math.sin(padYaw);
            const litKey = random() < 0.4;
            keyMatrix.makeRotationY(padYaw).setPosition(padAt.x + lx * cos - lz * sin, topY + 0.041, padAt.z + lx * sin + lz * cos);
            keypad.setMatrixAt(keyIndex, keyMatrix);
            keypad.setColorAt(keyIndex, litKey ? keyPalette[Math.floor(random() * keyPalette.length)]! : keyColor.set('#14161a'));
            keyIndex += 1;
        }
    }
    parts.push(keypad);

    // 跑马灯面在桌的前沿（朝 +z）。
    const tickerFace = {
        position: new THREE.Vector3((DESK.x0 + DESK.x1) / 2, DESK.tickerY, DESK.z1 + 0.002),
        rotationY: 0,
        width: DESK.x1 - DESK.x0 - 0.3,
        height: DESK.tickerHeight,
    };

    return { group: group('Desk', ...parts), lampApex, lampTarget, monitorFace, tickerFace, keypad };
};
