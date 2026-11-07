import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MACHI_BASE } from '@/components/visualizer/machi/engine/geometry/plinth';
import type { MachiMaterials } from '@/components/visualizer/machi/engine/materials';
import { MACHI_SCENES } from '@/components/visualizer/machi/scenes';
import { buildTramlineGround } from '@/components/visualizer/machi/scenes/tramline/base';
import { buildCafeInterior, buildTangLau } from '@/components/visualizer/machi/scenes/tramline/building';
import { BOARD, BUILDING, FASCIA, KIOSK, LEVEL, PROPS, ROAD, STATION, STREET_LAMP, STREET_SIGN, TRACK, TRAM, TRAMLINE_VIEW, TRAM_POLES } from '@/components/visualizer/machi/scenes/tramline/layout';
import { buildKiosk, buildStreetLamp, buildStreetSign, buildTramStop } from '@/components/visualizer/machi/scenes/tramline/props';
import { resolveTramlineVariation } from '@/components/visualizer/machi/scenes/tramline/tramlineSeed';
import { DEFAULT_MACHI_VIEWS, MACHI_SCENE_IDS } from '@/components/visualizer/machi/types';
import en from '@/i18n/locales/en';
import zhCN from '@/i18n/locales/zh-CN';

// test/unit/visualizer/machi/tramline.test.ts
// 港岛末班电车：场景已注册、按歌变的东西是确定的；唐楼在后排左、轨道路在前、站台不压轨、报刊亭在后排右、
// 歌词灯箱朝着默认镜头；唐楼与茶餐厅、站台、报刊亭、地面都在底座里；亮灯窗与凳子是实例、空调数跟 seed 走。

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
            expect(variation.posterLayout).toBeLessThanOrEqual(2);
            expect(variation.litWindows).toHaveLength(8);
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

    it('faces the lyric board at the default camera and keeps it clear of the track', () => {
        expect(Math.abs(TRAMLINE_VIEW.azimuth - BOARD.azimuth) * 180 / Math.PI).toBeLessThanOrEqual(30);
        // 灯箱挂在二层转角：底沿在门头雨篷上下、顶沿不过女儿墙，前缘不压轨。
        expect(BOARD.cy - BOARD.height / 2).toBeGreaterThanOrEqual(FASCIA.y0 - 0.3);
        expect(BOARD.cy + BOARD.height / 2).toBeLessThan(BUILDING.parapetTop);
        expect(BOARD.cz + BOARD.width / 2).toBeLessThan(ROAD.z0);
        expect(BOARD.width).toBeCloseTo(3.6, 1);
        expect(BOARD.height).toBeCloseTo(1.7, 1);
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
        // 转角两扇永远留给灯箱：实例色里这两位总是暗的。
        const color = new THREE.Color();
        built.windowGlow.getColorAt(3, color);
        expect(color.r).toBeLessThan(0.2);
        built.windowGlow.getColorAt(4, color);
        expect(color.r).toBeLessThan(0.2);
    });

    it('aims the board and the fascia sign the way the signs mount them', () => {
        const built = buildTangLau(materials, resolveTramlineVariation('faces'));
        expect(built.boardFace.rotationY).toBeCloseTo(BOARD.azimuth, 5);
        // 字面沿板面法线外探一点，避免与框架盒共面。
        expect(built.boardFace.position.x).toBeCloseTo(BOARD.cx + Math.sin(BOARD.azimuth) * 0.02, 5);
        expect(built.boardFace.position.z).toBeCloseTo(BOARD.cz + Math.cos(BOARD.azimuth) * 0.02, 5);
        expect(built.boardFace.width).toBeCloseTo(BOARD.width, 5);
        expect(built.fasciaFace.rotationY).toBeCloseTo(0, 5);
        expect(built.fasciaFace.position.z).toBeGreaterThan(FASCIA.z0);
        expect(built.fasciaFace.width).toBeLessThan(FASCIA.x1 - FASCIA.x0);
        // 转角霓虹有两个面（一支双面竖灯箱），贴在盒体前后薄面上而不是埋进盒子里。
        expect(built.neonFaces).toHaveLength(2);
        built.neonFaces.forEach(face => {
            expect(Math.abs(face.position.x)).toBeLessThan(MACHI_BASE.half);
            expect(Math.abs(face.position.z)).toBeLessThan(MACHI_BASE.half);
            // 面相对灯箱中心的偏移沿局部 ±z（盒深半宽 0.1 外侧），沿 (sin45, cos45) 对角线方向。
            const dx = face.position.x - (BUILDING.x1 - 0.1 + 0.2);
            const dz = face.position.z - (BUILDING.z1 + 0.28);
            expect(Math.abs(dx)).toBeCloseTo(Math.abs(dz), 4);
            expect(Math.abs(dx)).toBeCloseTo(Math.SQRT1_2 * 0.105, 3);
            expect(face.rotationY === Math.PI / 4 || face.rotationY === Math.PI / 4 + Math.PI).toBe(true);
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
