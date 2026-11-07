import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MACHI_BASE } from '@/components/visualizer/machi/engine/geometry/plinth';
import type { MachiMaterials } from '@/components/visualizer/machi/engine/materials';
import { MACHI_SCENES } from '@/components/visualizer/machi/scenes';
import { buildTramlineGround } from '@/components/visualizer/machi/scenes/tramline/base';
import { buildCafeInterior, buildTangLau } from '@/components/visualizer/machi/scenes/tramline/building';
import { BOARD, BUILDING, FASCIA, KIOSK, LEVEL, PROPS, ROAD, STATION, STREET_LAMP, STREET_SIGN, TRACK, TRAM, TRAMLINE_VIEW, TRAM_POLES } from '@/components/visualizer/machi/scenes/tramline/layout';
import { buildKiosk, buildStreetLamp, buildStreetSign, buildTramStop } from '@/components/visualizer/machi/scenes/tramline/props';
import { buildTramBody, tramTravel, tramWheelAngleAt, tramXAt } from '@/components/visualizer/machi/scenes/tramline/tram';
import { resolveTramlineVariation } from '@/components/visualizer/machi/scenes/tramline/tramlineSeed';
import { DEFAULT_MACHI_VIEWS, MACHI_SCENE_IDS } from '@/components/visualizer/machi/types';
import en from '@/i18n/locales/en';
import zhCN from '@/i18n/locales/zh-CN';

// test/unit/visualizer/machi/tramline.test.ts
// 港岛末班电车：场景已注册、按歌变的东西是确定的；唐楼在后排左、轨道路在前、站台不压轨、报刊亭在后排右。
// 几何断言走世界坐标而不是设计常量：灯箱背板与歌词屏同中心、竖霓虹字面贴盒体、电车窗框覆盖窗带、
// 车轮落轨；动画断言覆盖正常循环、圈边界不倒轮、暂停不走、seed 相位。

const material = new THREE.MeshToonMaterial();
const materials = {
    toon: () => material,
    glass: new THREE.MeshBasicMaterial({ transparent: true }),
    glow: () => new THREE.MeshBasicMaterial({ name: 'machi:glow:test' }),
    snowy: <T extends THREE.Material>(value: T) => value,
    track: <T>(value: T) => value,
    gradient: null,
} as unknown as MachiMaterials;

const bounds = (object: THREE.Object3D) => {
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object);
};

const findAll = (root: THREE.Object3D, name: string) => {
    const found: THREE.Object3D[] = [];
    root.traverse(object => { if (object.name === name) found.push(object); });
    return found;
};

/** 两个盒体之间的最近距离（相交为 0）。 */
const boxDistance = (a: THREE.Box3, b: THREE.Box3) => {
    const dx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
    const dy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
    const dz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));
    return Math.hypot(dx, dy, dz);
};

const BOARD_N = new THREE.Vector3(Math.sin(BOARD.azimuth), 0, Math.cos(BOARD.azimuth));
const BOARD_ACROSS = new THREE.Vector3(Math.cos(BOARD.azimuth), 0, -Math.sin(BOARD.azimuth));

describe('tramline registration', () => {
    it('registers the scene id, definition, default view and locale titles', () => {
        expect(MACHI_SCENE_IDS).toContain('tramline');
        const definition = MACHI_SCENES.tramline;
        expect(typeof definition.resolveArt).toBe('function');
        expect(typeof definition.create).toBe('function');
        expect(DEFAULT_MACHI_VIEWS.tramline).toBeDefined();
        const options = zhCN.options as Record<string, string>;
        expect(options.machiSceneTramline).toBe('港岛末班电车');
        expect((en.options as Record<string, string>).machiSceneTramline).toBe('Last Tram to Hong Kong');
    });
});

describe('tramline variation', () => {
    it('is deterministic and keeps every draw inside its range', () => {
        for (let index = 0; index < 300; index += 1) {
            const seed = `song-${index}`;
            const variation = resolveTramlineVariation(seed);
            expect(resolveTramlineVariation(seed)).toEqual(variation);
            expect(variation.tramLivery).toBeGreaterThanOrEqual(0);
            expect(variation.tramLivery).toBeLessThanOrEqual(2);
            expect(variation.cafeSignStyle).toBeGreaterThanOrEqual(0);
            expect(variation.cafeSignStyle).toBeLessThanOrEqual(2);
            expect(variation.tramAdStyle).toBeGreaterThanOrEqual(0);
            expect(variation.tramAdStyle).toBeLessThanOrEqual(2);
            expect(variation.posterLayout).toBeGreaterThanOrEqual(0);
            expect(variation.posterLayout).toBeLessThanOrEqual(1);
            expect(variation.litWindows).toHaveLength(8);
            expect(variation.curtains).toHaveLength(8);
            variation.curtains.forEach(flag => expect(typeof flag).toBe('boolean'));
            expect(variation.acSpots.length).toBeGreaterThanOrEqual(3);
            expect(variation.acSpots.length).toBeLessThanOrEqual(5);
            expect(new Set(variation.acSpots).size).toBe(variation.acSpots.length);
            variation.acSpots.forEach(spot => {
                expect(spot).toBeGreaterThanOrEqual(0);
                expect(spot).toBeLessThan(6);
            });
            expect(variation.tramPhase).toBeGreaterThanOrEqual(0);
            expect(variation.tramPhase).toBeLessThan(1);
            expect(variation.puddleAmount).toBeGreaterThanOrEqual(0.5);
            expect(variation.puddleAmount).toBeLessThanOrEqual(0.8);
            expect(variation.fanSpeed).toBeGreaterThanOrEqual(1.8);
            expect(variation.fanSpeed).toBeLessThanOrEqual(3.2);
            expect(Math.abs(variation.windYaw)).toBeLessThanOrEqual(0.25);
        }
    });

    it('actually varies between songs', () => {
        const draws = Array.from({ length: 60 }, (_, index) => resolveTramlineVariation(`song-${index}`));
        expect(new Set(draws.map(item => item.tramLivery)).size).toBe(3);
        expect(new Set(draws.map(item => item.cafeSignStyle)).size).toBe(3);
        expect(new Set(draws.map(item => item.posterLayout)).size).toBe(2);
        expect(new Set(draws.map(item => item.litWindows.join(''))).size).toBeGreaterThan(5);
        expect(new Set(draws.map(item => item.curtains.join(''))).size).toBeGreaterThan(3);
    });
});

describe('tramline layout', () => {
    const half = MACHI_BASE.half;

    it('splits the base into the four quarters the scene promises', () => {
        // 唐楼压后排左（在路后），报刊亭在后排右，站台贴着轨道北侧的人行道。
        expect(BUILDING.z1).toBeLessThan(ROAD.z0);
        expect(BUILDING.x1).toBeLessThan(0);
        expect(KIOSK.cx).toBeGreaterThan(0);
        expect(KIOSK.cz).toBeLessThan(0);
        expect(STATION.z1).toBeLessThan(ROAD.z0);
        expect(STATION.x1).toBeLessThan(0);
    });

    it('lays both tram tracks across the road and keeps the tram on the near one', () => {
        expect(ROAD.z0).toBeLessThan(TRACK.near);
        expect(TRACK.near).toBeLessThan(TRACK.far);
        expect(TRACK.far).toBeLessThan(ROAD.z1);
        expect(TRAM.z).toBe(TRACK.near);
        // 车体比轨距宽一点但明显窄于两条线的间距；一圈跑得比底座对角还长才能完全开出去。
        expect(TRAM.width).toBeGreaterThan(TRACK.gauge);
        expect(TRAM.width).toBeLessThan(TRACK.far - TRACK.near);
        expect(TRAM.span).toBeGreaterThan(half * 2 + TRAM.length);
        // 受电杆端头贴着接触线。
        expect(Math.abs(TRAM.poleY - TRACK.wireY)).toBeLessThan(0.1);
        // 电线杆立在两条轨之间。
        expect(TRACK.poleZ).toBeGreaterThan(TRACK.near);
        expect(TRACK.poleZ).toBeLessThan(TRACK.far);
        TRAM_POLES.x.forEach(x => expect(Math.abs(x)).toBeLessThan(half));
    });

    it('keeps the shelter, the railing and the small props off the tracks', () => {
        // 候车亭、护栏、护柱都在路北侧（轨道外）。
        expect(STATION.z1).toBeLessThan(TRACK.near - TRACK.gauge / 2 - 0.1);
        expect(STATION.rail.z).toBeLessThan(TRACK.near - TRACK.gauge / 2);
        expect(STATION.rail.gap[0]).toBeLessThan(STATION.rail.gap[1]);
        expect(STATION.bench.x0).toBeGreaterThanOrEqual(STATION.x0);
        expect(STATION.bench.x1).toBeLessThanOrEqual(STATION.x1);
        PROPS.bollards.forEach(bollard => {
            expect(bollard.z).toBeLessThan(TRACK.near - TRACK.gauge / 2);
        });
        const loose = [PROPS.electricBox, PROPS.bin, PROPS.planter, PROPS.manhole, PROPS.drain, STREET_SIGN, STREET_LAMP];
        loose.forEach(prop => {
            expect(Math.abs(prop.x)).toBeLessThan(half);
            expect(Math.abs(prop.z)).toBeLessThan(half);
        });
        // 井盖在路上，排水口在路边。
        expect(PROPS.manhole.z).toBeGreaterThan(ROAD.z0);
        expect(PROPS.manhole.z).toBeLessThan(ROAD.z1);
        expect(PROPS.drain.z).toBeLessThan(ROAD.z0);
    });

    it('faces the lyric board at the default camera and fits between awning and cornice', () => {
        expect(Math.abs(TRAMLINE_VIEW.azimuth - BOARD.azimuth) * 180 / Math.PI).toBeLessThanOrEqual(30);
        // 灯箱贴着雨篷顶挂：底沿不碰雨篷上沿、顶沿不过三层窗台带，前缘不压轨。
        expect(BOARD.cy - BOARD.height / 2).toBeGreaterThanOrEqual(FASCIA.y1 - 0.05);
        expect(BOARD.cy + BOARD.height / 2).toBeLessThan(BUILDING.win3.y0 - 0.05);
        // 灯箱中心在街角外（不穿进楼体）：x 在右墙外、z 在前墙外。
        expect(BOARD.cx).toBeGreaterThan(BUILDING.x1);
        expect(BOARD.cz).toBeGreaterThan(BUILDING.z1);
        // 屏面比楼窄：宽度明显小于前墙可见跨度，挂在转角而不是糊住整面墙。
        expect(BOARD.width).toBeLessThan((BUILDING.x1 - BUILDING.x0) * 0.8);
        expect(BOARD.width).toBeGreaterThan(1.8);
        expect(BOARD.height).toBeLessThan(BUILDING.win2.y1 - BUILDING.win2.y0 + 0.6);
    });

    it('keeps the kiosk and its rotated footprint inside the base', () => {
        const reach = (KIOSK.w + KIOSK.d) / 2 * Math.SQRT1_2;
        expect(KIOSK.cx + reach).toBeLessThan(half);
        expect(KIOSK.cx - reach).toBeGreaterThan(-half);
        expect(KIOSK.cz + reach).toBeLessThan(0);
        expect(KIOSK.cz - reach).toBeGreaterThan(-half);
        expect(KIOSK.roofY).toBeLessThan(BUILDING.wallTop);
    });
});

describe('tang lau building', () => {
    it('stays inside the base and inside its own quadrant', () => {
        const variation = resolveTramlineVariation('layout-check');
        const built = buildTangLau(materials, variation);
        const box = bounds(built.group);
        expect(box.min.x).toBeGreaterThanOrEqual(-MACHI_BASE.half - 0.01);
        expect(box.max.x).toBeLessThanOrEqual(MACHI_BASE.half);
        expect(box.min.z).toBeGreaterThanOrEqual(-MACHI_BASE.half - 0.01);
        expect(box.max.z).toBeLessThanOrEqual(ROAD.z0);
        expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
        expect(box.max.y).toBeLessThanOrEqual(BUILDING.parapetTop + 0.61);
    });

    it('keeps both upper facades on their own wall planes', () => {
        const built = buildTangLau(materials, resolveTramlineVariation('facades'));
        // cafeTop 以上的墙段：前墙贴 z1 沿 x 走，右墙贴 x1 沿 z 走——轴向写反时右墙会整面缺失。
        const walls = findAll(built.group, 'Wall')
            .map(object => new THREE.Box3().setFromObject(object))
            .filter(box => box.min.y > BUILDING.cafeTop);
        expect(walls.length).toBeGreaterThan(0);
        const span = (box: THREE.Box3, axis: 'x' | 'z') => (axis === 'x' ? box.max.x - box.min.x : box.max.z - box.min.z);
        expect(walls.some(box => box.max.z > BUILDING.z1 - 0.02 && span(box, 'x') > 0.3)).toBe(true);
        expect(walls.some(box => box.max.x > BUILDING.x1 - 0.02 && span(box, 'z') > 0.3)).toBe(true);
    });

    it('mounts one AC unit per seeded spot', () => {
        for (let index = 0; index < 20; index += 1) {
            const variation = resolveTramlineVariation(`ac-${index}`);
            const built = buildTangLau(materials, variation);
            let count = 0;
            built.group.traverse(object => {
                if (object.name === 'AC') count += 1;
            });
            expect(count).toBe(variation.acSpots.length);
        }
    });

    it('batches lit windows into one instanced mesh matching the slots', () => {
        const built = buildTangLau(materials, resolveTramlineVariation('windows'));
        expect(built.windowGlow).toBeInstanceOf(THREE.InstancedMesh);
        expect(built.windowGlow.count).toBe(built.windowSlots.length);
    });

    it('aligns the board backing, face and mounts in world space', () => {
        const built = buildTangLau(materials, resolveTramlineVariation('board'));
        built.group.updateMatrixWorld(true);
        const face = built.boardFace;
        expect(face.rotationY).toBeCloseTo(BOARD.azimuth, 5);
        // 背板盒体的世界包围盒：中心就是灯箱中心（boxAt 底面锚点已换算），屏面中心贴合法线。
        const frames = findAll(built.group, 'Board/frame');
        expect(frames).toHaveLength(1);
        const frameBox = new THREE.Box3().setFromObject(frames[0]!);
        const frameCenter = frameBox.getCenter(new THREE.Vector3());
        expect(frameCenter.y).toBeCloseTo(face.position.y, 5);
        // 屏面中心沿板面法线探出背板前表面（盒体前表面过灯箱中心，屏再探出 2cm）。
        const out = face.position.clone().sub(frameCenter).dot(BOARD_N);
        expect(out).toBeCloseTo(BOARD.depth / 2 + 0.02, 4);
        // 屏面完整落在背板可见边界内（法线方向的投影不超出宽高的半值）。
        const side = face.position.clone().sub(frameCenter).dot(BOARD_ACROSS);
        expect(Math.abs(side) + face.width / 2).toBeLessThanOrEqual(BOARD.width / 2 + 0.07);
        expect(face.height).toBeLessThanOrEqual(BOARD.height + 0.13);
        // 四边框条存在并分别贴着背板上下左右边。
        expect(findAll(built.group, 'Board/bezel').length).toBeGreaterThanOrEqual(4);
        // 安装臂：一头在灯箱背面附近，另一头落在前墙或右墙面。
        const mounts = findAll(built.group, 'Board/mount');
        expect(mounts.length).toBeGreaterThanOrEqual(2);
        let toFront = 0;
        let toRight = 0;
        mounts.forEach(mount => {
            const box = new THREE.Box3().setFromObject(mount);
            // 臂的起点贴在背板背面（与背板盒体相交或几乎相触），终点落在墙面
            //（墙在灯箱负侧，所以看 bbox 的 min 端：前墙 min.z、右墙 min.x）。
            expect(boxDistance(frameBox, box)).toBeLessThan(0.12);
            if (Math.abs(box.min.z - BUILDING.z1) < 0.08) toFront += 1;
            if (Math.abs(box.min.x - BUILDING.x1) < 0.08) toRight += 1;
        });
        // 前后墙至少各一根臂（两根斜臂把灯箱钉在转角两面上）。
        expect(toFront).toBeGreaterThanOrEqual(1);
        expect(toRight).toBeGreaterThanOrEqual(1);
    });

    it('aligns the corner neon box, both text faces and its supports in world space', () => {
        const built = buildTangLau(materials, resolveTramlineVariation('neon'));
        built.group.updateMatrixWorld(true);
        const boxes = findAll(built.group, 'Neon/box');
        expect(boxes).toHaveLength(1);
        const box = new THREE.Box3().setFromObject(boxes[0]!);
        const center = box.getCenter(new THREE.Vector3());
        // 盒体中心与两面字的中心等高下：字面不悬空、不落地。
        built.neonFaces.forEach(face => {
            expect(face.position.y).toBeCloseTo(center.y, 4);
            // 字面贴在盒体旋转后的薄面外侧（沿对角方向 0.105，盒深半宽 0.1 + 5mm）。
            const dx = face.position.x - center.x;
            const dz = face.position.z - center.z;
            expect(Math.hypot(dx, dz)).toBeCloseTo(0.105, 3);
            expect(Math.abs(dx)).toBeCloseTo(Math.abs(dz), 4);
            expect(face.rotationY === Math.PI / 4 || face.rotationY === Math.PI / 4 + Math.PI).toBe(true);
            // 字面不超出盒面：宽高都在盒体投影内。
            expect(face.width).toBeLessThan(0.43);
            expect(face.height).toBeLessThan(1.51);
        });
        // 支架存在：一根吊杆接雨篷、一根臂接骑楼柱。
        expect(findAll(built.group, 'Neon/hanger').length).toBeGreaterThanOrEqual(1);
        expect(findAll(built.group, 'Neon/arm').length).toBeGreaterThanOrEqual(1);
    });

    it('recesses windows: pane sits behind the wall face with curtain and lit layer inside', () => {
        const variation = resolveTramlineVariation('recess');
        const built = buildTangLau(materials, variation);
        built.group.updateMatrixWorld(true);
        // 玻璃面比外墙皮凹进去，亮灯实例面在玻璃后面。
        const panes = findAll(built.group, 'Win/pane');
        const backs = findAll(built.group, 'Win/back');
        const curtains = findAll(built.group, 'Win/curtain');
        expect(panes.length).toBe(built.windowSlots.length);
        expect(backs.length).toBe(built.windowSlots.length);
        expect(curtains.length).toBe(variation.curtains.filter(Boolean).length);
        built.group.traverse(object => {
            if (object.name !== 'Win/pane') return;
            const box = new THREE.Box3().setFromObject(object);
            // 前墙窗凹在 z1 以内，右墙窗凹在 x1 以内（不外凸）。
            const front = Math.abs(box.max.z - (BUILDING.z1 - 0.045)) < 0.03;
            const right = Math.abs(box.max.x - (BUILDING.x1 - 0.045)) < 0.03;
            expect(front || right).toBe(true);
        });
    });

    it('keeps the cafe interior inside the shell', () => {
        const cafe = buildCafeInterior(materials);
        const box = bounds(cafe.group);
        expect(box.min.x).toBeGreaterThanOrEqual(BUILDING.x0);
        expect(box.max.x).toBeLessThanOrEqual(BUILDING.x1);
        expect(box.min.z).toBeGreaterThanOrEqual(BUILDING.z0);
        expect(box.max.z).toBeLessThanOrEqual(BUILDING.z1);
        expect(box.max.y).toBeLessThanOrEqual(BUILDING.cafeTop + 0.01);
        expect(cafe.lamps.length).toBeGreaterThanOrEqual(2);
        cafe.lamps.forEach(lamp => expect(lamp.y).toBeLessThan(BUILDING.cafeTop));
    });
});

describe('double decker tram', () => {
    const build = () => {
        const built = buildTramBody(materials);
        built.group.updateMatrixWorld(true);
        return built;
    };

    it('sits every wheel on a rail at gauge width', () => {
        const built = build();
        expect(built.wheels.length).toBe(8);
        built.wheels.forEach(wheel => {
            const position = new THREE.Vector3();
            wheel.getWorldPosition(position);
            // 轮底贴轨面（railTop），轮心在轨距半宽处。
            expect(position.y - 0.17).toBeCloseTo(TRACK.railTop, 3);
            expect(Math.abs(Math.abs(position.z - TRAM.z) - TRACK.gauge / 2)).toBeLessThan(0.02);
            expect(Math.abs(position.x)).toBeLessThan(TRAM.length / 2);
        });
    });

    it('covers each window band with its mullion frames', () => {
        const built = build();
        const mullions = built.group.getObjectByName('Mullions') as THREE.InstancedMesh;
        expect(mullions).toBeInstanceOf(THREE.InstancedMesh);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const bands = [
            { y0: 0.98, y1: 1.58 },
            { y0: 2.06, y1: 2.52 },
        ];
        for (let index = 0; index < mullions.count; index += 1) {
            mullions.getMatrixAt(index, matrix);
            matrix.decompose(position, new THREE.Quaternion(), scale);
            const band = bands[Math.floor(index / 12)]!;
            const top = position.y + scale.y / 2;
            const bottom = position.y - scale.y / 2;
            // 窗框中心就是窗带中心；上下略压过窗带边（框线咬合），不穿到下层车身里。
            expect(position.y).toBeCloseTo((band.y0 + band.y1) / 2, 4);
            expect(bottom).toBeLessThanOrEqual(band.y0);
            expect(top).toBeGreaterThanOrEqual(band.y1);
            expect(bottom).toBeGreaterThan(band.y0 - 0.06);
            expect(Math.abs(position.z)).toBeCloseTo(TRAM.width / 2 + 0.005, 3);
        }
    });

    it('puts the headlight ahead of the nose and mounts ad / destination faces proud of the shell', () => {
        const built = build();
        const head = built.group.getObjectByName('Headlight');
        expect(head).toBeInstanceOf(THREE.Mesh);
        const position = new THREE.Vector3();
        head!.getWorldPosition(position);
        expect(position.x).toBeGreaterThan(TRAM.length / 2);
        const tails = findAll(built.group, 'Taillight');
        expect(tails.length).toBeGreaterThanOrEqual(2);
        tails.forEach(tail => {
            tail.getWorldPosition(position);
            expect(position.x).toBeLessThan(-TRAM.length / 2);
        });
        // 广告挂在 +z 车身侧面（朝站台对面的镜头），目的地箱朝 +x 车头。
        const adPos = new THREE.Vector3();
        built.adAnchor.getWorldPosition(adPos);
        expect(adPos.z - TRAM.z).toBeGreaterThan(TRAM.width / 2);
        const destPos = new THREE.Vector3();
        built.destAnchor.getWorldPosition(destPos);
        expect(destPos.x).toBeGreaterThan(TRAM.length / 2);
        // 受电杆端头到接触线高（滑靴贴线）。
        const shoe = built.group.getObjectByName('Pole/shoe')!;
        shoe.getWorldPosition(position);
        expect(position.y).toBeGreaterThan(TRACK.wireY - 0.05);
        expect(position.y).toBeLessThan(TRACK.wireY + 0.15);
    });
});

describe('tram loop animation', () => {
    const speed = TRAM.span / TRAM.period;

    it('drives wheels from continuous travel, so the wrap boundary never reverses them', () => {
        // 一圈 18s：找相位让车在 t≈9s 回绕，检查回绕前后轮转角连续。
        const phase = 0.02;
        const wrapTime = (1 - phase) * TRAM.period;
        const before = tramWheelAngleAt(wrapTime - 1e-4, phase);
        const after = tramWheelAngleAt(wrapTime + 1e-4, phase);
        // 回绕点两侧轮角变化只由真实位移产生（< 0.001 rad），不是 -x 跳变的差值。
        const delta = Math.abs(after - before);
        expect(delta).toBeLessThan(0.01);
        // 位置回绕正常：绕前在轨东端外，绕后回到西端外。
        expect(tramXAt(wrapTime - 1e-3, phase)).toBeGreaterThan(0);
        expect(tramXAt(wrapTime + 1e-3, phase)).toBeLessThan(0);
    });

    it('advances wheels exactly with travelled distance', () => {
        const phase = 0.3;
        const t0 = 2.5;
        const dt = 0.4;
        const angle0 = tramWheelAngleAt(t0, phase);
        const angle1 = tramWheelAngleAt(t0 + dt, phase);
        // 轮转角差 = 行驶距离 / 半径（模 2π 后的短差）。
        let delta = angle1 - angle0;
        while (delta < -Math.PI) delta += Math.PI * 2;
        while (delta > Math.PI) delta -= Math.PI * 2;
        expect(Math.abs(delta)).toBeCloseTo((speed * dt) / 0.17, 3);
        expect(Math.sign(delta)).toBe(-1);
    });

    it('freezes both the car and its wheels when the ambient clock pauses', () => {
        const t = 7.7;
        const phase = 0.6;
        // 暂停：同一个 ambientTime 重复 update → 位置与轮角都不变。
        expect(tramXAt(t, phase)).toBe(tramXAt(t, phase));
        expect(tramWheelAngleAt(t, phase)).toBe(tramWheelAngleAt(t, phase));
        // 恢复：时钟继续走，车沿 +x 前进、轮继续滚。
        expect(tramXAt(t + 0.5, phase) - tramXAt(t, phase)).toBeCloseTo(speed * 0.5, 5);
    });

    it('keeps the seeded phase within the loop span', () => {
        for (let index = 0; index < 40; index += 1) {
            const variation = resolveTramlineVariation(`phase-${index}`);
            const x = tramXAt(0, variation.tramPhase);
            expect(x).toBeGreaterThanOrEqual(-TRAM.span / 2);
            expect(x).toBeLessThan(TRAM.span / 2);
            expect(Number.isFinite(tramTravel(0, variation.tramPhase))).toBe(true);
        }
    });
});

describe('street furniture', () => {
    it('builds the shelter, the kiosk and the signs inside the base', () => {
        const variation = resolveTramlineVariation('props');
        const stop = buildTramStop(materials, variation);
        const stopBox = bounds(stop.group);
        expect(stopBox.min.x).toBeGreaterThanOrEqual(STATION.x0 - 0.3);
        expect(stopBox.max.x).toBeLessThanOrEqual(STATION.x1 + 0.3);
        // 雨棚可以挑出路缘一点（檐口滴水），但不能伸到轨道边缘。
        expect(stopBox.max.z).toBeLessThanOrEqual(TRACK.near - TRACK.gauge / 2 - 0.05);
        expect(stopBox.min.y).toBeGreaterThanOrEqual(-0.01);
        expect(stopBox.max.y).toBeLessThanOrEqual(STATION.roofY + 0.6);
        // 站牌面朝路（+z），给歌手留的小牌也在。
        expect(stop.stopPlateFace.rotationY).toBeCloseTo(0, 1);
        expect(stop.stopPlateFace.position.x).toBeCloseTo(STATION.pole.x, 1);
        expect(stop.artistPlateFace).toBeDefined();
        expect(stop.stickerFace).toBeDefined();

        const kiosk = buildKiosk(materials, variation);
        const kioskBox = bounds(kiosk.group);
        expect(kioskBox.min.x).toBeGreaterThanOrEqual(-MACHI_BASE.half);
        expect(kioskBox.max.x).toBeLessThanOrEqual(MACHI_BASE.half);
        expect(kioskBox.min.z).toBeGreaterThanOrEqual(-MACHI_BASE.half);
        expect(kioskBox.max.z).toBeLessThanOrEqual(ROAD.z0);
        expect(kioskBox.max.y).toBeLessThanOrEqual(KIOSK.roofY + 0.6);
        expect(kiosk.posterFaces.length).toBeGreaterThanOrEqual(2);

        const sign = buildStreetSign(materials);
        expect(sign.face.position.x).toBeCloseTo(STREET_SIGN.x, 1);
        expect(sign.face.position.z).toBeCloseTo(STREET_SIGN.z, 1);
        expect(sign.face.rotationY).toBeCloseTo(STREET_SIGN.rotationY, 5);

        const lamp = buildStreetLamp(materials);
        expect(lamp.head.x).toBeCloseTo(STREET_LAMP.head.x, 5);
        // 返回的灯头点是灯罩下沿（光锥与真实灯的挂点），比灯壳中心低一点。
        expect(lamp.head.y).toBeCloseTo(STREET_LAMP.head.y - 0.07, 5);
        const lampBox = bounds(lamp.group);
        expect(lampBox.max.z).toBeLessThanOrEqual(TRACK.near + 0.2);
    });
});

describe('ground', () => {
    it('covers the base, keeps a wettable road surface and stays level', () => {
        const ground = buildTramlineGround(materials);
        const box = bounds(ground.group);
        // 底座本身是共享的圆角台，四角会比 half 略多出一点（与各场景一致）。
        expect(box.min.x).toBeGreaterThanOrEqual(-MACHI_BASE.half - 0.06);
        expect(box.max.x).toBeLessThanOrEqual(MACHI_BASE.half + 0.06);
        expect(box.min.z).toBeGreaterThanOrEqual(-MACHI_BASE.half - 0.06);
        expect(box.max.z).toBeLessThanOrEqual(MACHI_BASE.half + 0.06);
        expect(ground.roadSurface).toBeInstanceOf(THREE.Mesh);
        expect(ground.lotSurfaces.length).toBeGreaterThanOrEqual(1);
        // 路面在人行道之下、轨道顶在路面之上一点点。
        const road = new THREE.Box3().setFromObject(ground.roadSurface);
        expect(road.max.y).toBeLessThanOrEqual(LEVEL.lot + 0.001);
        expect(TRACK.railTop).toBeGreaterThan(LEVEL.road);
        expect(TRACK.railTop).toBeLessThan(LEVEL.platform);
    });
});
