import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MachiCamera } from '@/components/visualizer/machi/engine/camera';
import { MACHI_BASE } from '@/components/visualizer/machi/engine/geometry/plinth';
import type { MachiMaterials } from '@/components/visualizer/machi/engine/materials';
import { MACHI_SCENES } from '@/components/visualizer/machi/scenes';
import { CHANGAN_SCENE, changanFramingPoints } from '@/components/visualizer/machi/scenes/changan/changanScene';
import { resolveChanganVariation } from '@/components/visualizer/machi/scenes/changan/changanSeed';
import {
    BOARD,
    CHANGAN_VIEW,
    EQ,
    LEVEL,
    LYRIC_HOUSE,
    PAGODA,
    PAIFANG,
    PALACE_LAMPS,
    PROPS,
    ROAD,
    STALL,
    STALLS,
    STRING_SPANS,
    TERRACE,
} from '@/components/visualizer/machi/scenes/changan/layout';
import { buildChanganMarket } from '@/components/visualizer/machi/scenes/changan/market';
import { buildChanganTerrace, TERRACE_TOP } from '@/components/visualizer/machi/scenes/changan/terrace';
import { MACHI_SCENE_IDS } from '@/components/visualizer/machi/types';

// test/unit/visualizer/machi/changan.test.ts
// 长安夜市：按歌变的东西是确定的（同一首歌同一个样）；后中偏右的矮石台与七层大雁塔退成远处地标，
// 构图上用真实镜头量投影（塔组占画面高、塔心的水平位置、画内灯笼数）；市集才是主角——牌坊在前左、
// 六个食摊两列纵深；歌词屏挂在市楼楼面、与默认镜头同方位角（入射角 0°）；灯笼 / 花球是成批的实例、
// 颜色键与明暗表对得上数；天灯、城楼、屋脊带都在底座里。

const material = new THREE.MeshBasicMaterial();
const materials = { toon: () => material, glow: () => material, track: <T>(value: T) => value, product: material } as unknown as MachiMaterials;

/** 一个绕 yaw 的矩形（半宽 w、半深 d）的四角世界坐标。 */
const rotatedCorners = (cx: number, cz: number, yaw: number, w: number, d: number) => {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return [[w, d], [w, -d], [-w, d], [-w, -d]].map(([lx, lz]) => ({
        x: cx + lx! * cos + lz! * sin,
        z: cz - lx! * sin + lz! * cos,
    }));
};

/** 默认构图下的真实镜头（16:9 视口）。 */
const setupCamera = () => {
    const camera = new MachiCamera();
    camera.setAspect(1600, 900);
    camera.setFraming({ points: changanFramingPoints(), view: { ...CHANGAN_VIEW } }, null);
    camera.camera.updateMatrixWorld(true);
    return camera;
};

const ndc = (camera: MachiCamera, x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z).project(camera.camera);
    return { x: v.x, y: v.y };
};

/** object 的包围盒投到 NDC 的范围（正交下取包围盒八角即可）。 */
const boxNdc = (camera: MachiCamera, object: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(object);
    const corners = [
        [box.min.x, box.min.y, box.min.z], [box.min.x, box.min.y, box.max.z],
        [box.min.x, box.max.y, box.min.z], [box.min.x, box.max.y, box.max.z],
        [box.max.x, box.min.y, box.min.z], [box.max.x, box.min.y, box.max.z],
        [box.max.x, box.max.y, box.min.z], [box.max.x, box.max.y, box.max.z],
    ].map(([x, y, z]) => ndc(camera, x!, y!, z!));
    return {
        x0: Math.min(...corners.map(c => c.x)),
        x1: Math.max(...corners.map(c => c.x)),
        y0: Math.min(...corners.map(c => c.y)),
        y1: Math.max(...corners.map(c => c.y)),
    };
};

describe('changan registration', () => {
    it('registers the scene id and its definition', () => {
        expect(MACHI_SCENE_IDS).toContain('changan');
        expect(MACHI_SCENES.changan).toBe(CHANGAN_SCENE);
    });
});

describe('changan variation', () => {
    it('is deterministic and keeps every draw inside its range', () => {
        for (let index = 0; index < 300; index += 1) {
            const seed = `song-${index}`;
            const variation = resolveChanganVariation(seed);
            expect(resolveChanganVariation(seed)).toEqual(variation);
            expect(variation.lanternScheme).toBeGreaterThanOrEqual(0);
            expect(variation.lanternScheme).toBeLessThanOrEqual(2);
            expect(variation.smokeDensity).toBeGreaterThanOrEqual(0.6);
            expect(variation.smokeDensity).toBeLessThanOrEqual(1.4);
            expect(variation.blossomDensity).toBeGreaterThanOrEqual(0.6);
            expect(variation.blossomDensity).toBeLessThanOrEqual(1.3);
            expect(variation.skyPhase).toHaveLength(3);
            variation.skyPhase.forEach(phase => {
                expect(phase).toBeGreaterThanOrEqual(0);
                expect(phase).toBeLessThan(1);
            });
            expect(variation.stringSag).toBeGreaterThanOrEqual(0.8);
            expect(variation.stringSag).toBeLessThanOrEqual(1.3);
            expect(variation.windSlant).toBeGreaterThanOrEqual(0.06);
            expect(variation.windSlant).toBeLessThanOrEqual(0.2);
            expect(variation.puddleAmount).toBeGreaterThanOrEqual(0.55);
            expect(variation.puddleAmount).toBeLessThanOrEqual(0.88);
        }
        // 不同的歌确实会不一样：灯笼配色、烟气、水洼量都见过不止一种。
        const draws = Array.from({ length: 60 }, (_, index) => resolveChanganVariation(`song-${index}`));
        expect(new Set(draws.map(item => item.lanternScheme)).size).toBeGreaterThanOrEqual(2);
        expect(new Set(draws.map(item => item.smokeDensity)).size).toBeGreaterThan(10);
        expect(new Set(draws.map(item => item.puddleAmount)).size).toBeGreaterThan(10);
        expect(new Set(draws.map(item => item.skyPhase[0])).size).toBeGreaterThan(10);
    });
});

describe('changan layout', () => {
    const half = MACHI_BASE.half;

    it('keeps the terrace and the pagoda on the base, in the back quadrant', () => {
        expect(TERRACE.x0).toBeGreaterThanOrEqual(-half);
        expect(TERRACE.z0).toBeGreaterThanOrEqual(-half);
        expect(TERRACE.x1).toBeLessThan(ROAD.inner);
        expect(TERRACE.z1).toBeLessThan(ROAD.inner);
        // 塔的底面在台面上：塔基在台身投影里（出檐挑出是塔形，不算越界）。
        expect(PAGODA.cx - PAGODA.baseWidth / 2).toBeGreaterThan(TERRACE.x0);
        expect(PAGODA.cx + PAGODA.baseWidth / 2).toBeLessThan(TERRACE.x1);
        expect(PAGODA.cz - PAGODA.baseWidth / 2).toBeGreaterThan(TERRACE.z0);
        expect(PAGODA.cz + PAGODA.baseWidth / 2).toBeLessThan(TERRACE.z1);
        // 台是矮台：台面高度远矮于牌楼与市楼。
        expect(TERRACE.top).toBeLessThan(0.5);
    });

    it('keeps the pagoda proportions: seven levels, taper and a stocky silhouette', () => {
        expect(PAGODA.levelHeights).toHaveLength(7);
        expect(PAGODA.taper).toBeGreaterThanOrEqual(0.88);
        expect(PAGODA.taper).toBeLessThanOrEqual(0.92);
        // 大雁塔本身是敦实的：塔身连同叠涩的高度约为基宽的 1.3 倍（v1 的 2.5 倍太瘦了）。
        const towerHeight = PAGODA.levelHeights.reduce((sum, item) => sum + item + PAGODA.eaveThickness, 0);
        expect(towerHeight / PAGODA.baseWidth).toBeGreaterThanOrEqual(1.1);
        expect(towerHeight / PAGODA.baseWidth).toBeLessThanOrEqual(1.7);
    });

    it('keeps the lyric house behind the right stall row with its face toward the camera', () => {
        // 楼面朝默认镜头：面法线与镜头方位角同角，歌词屏入射角 0°。
        expect(LYRIC_HOUSE.yaw).toBeCloseTo(CHANGAN_VIEW.azimuth, 6);
        // 市楼在广场里、底座内，矮台之前。
        rotatedCorners(LYRIC_HOUSE.cx, LYRIC_HOUSE.cz, LYRIC_HOUSE.yaw, LYRIC_HOUSE.width / 2, LYRIC_HOUSE.depth / 2).forEach(point => {
            expect(Math.abs(point.x)).toBeLessThan(half);
            expect(Math.abs(point.z)).toBeLessThan(half);
            expect(point.x).toBeLessThan(ROAD.inner);
            expect(point.z).toBeLessThan(ROAD.inner);
        });
        // 屏带与 EQ 都收进墙面：屏带上沿在上层亮窗之下，EQ 在屏正下方。
        expect(BOARD.cy + BOARD.height / 2 + 0.06).toBeLessThan(LEVEL.lot + LYRIC_HOUSE.wallHeight - 0.05);
        expect(BOARD.cy - BOARD.height / 2).toBeGreaterThan(LEVEL.lot + 1.2);
        expect(EQ.y0 + EQ.maxHeight).toBeLessThan(BOARD.cy - BOARD.height / 2 + 0.12);
    });

    it('keeps the paifang, stalls, lamps and props on the lot off the road and inside the base', () => {
        const boxes = [
            ...rotatedCorners(PAIFANG.cx, PAIFANG.cz, PAIFANG.yaw, PAIFANG.pillarOffset + 0.5, 0.4).map(point => ['paifang', point.x, point.z] as const),
            ...STALLS.flatMap((stall, index) =>
                rotatedCorners(stall.x, stall.z, stall.yaw, STALL.canopySize.w / 2, STALL.canopySize.d / 2).map(point => [`stall${index}`, point.x, point.z] as const)),
            ...PALACE_LAMPS.map((lamp, index) => [`lamp${index}`, lamp.x, lamp.z] as const),
            ['warrior', PROPS.warrior.x, PROPS.warrior.z] as const,
            ...PROPS.blossomTrees.map((tree, index) => [`blossom${index}`, tree.x, tree.z] as const),
            ...PROPS.tables.map((table, index) => [`table${index}`, table.x, table.z] as const),
        ];
        boxes.forEach(([name, x, z]) => {
            expect(Math.abs(x), name).toBeLessThan(half);
            expect(Math.abs(z), name).toBeLessThan(half);
            expect(x, name).toBeLessThan(ROAD.inner);
            expect(z, name).toBeLessThan(ROAD.inner);
        });
        // 六个食摊：右列三个、左列两个、中景一个，两列朝纵深退去。
        expect(STALLS).toHaveLength(6);
        expect(STALLS.slice(0, 3).every(stall => stall.x > 0)).toBe(true);
        expect(STALLS[3]!.x).toBeLessThan(-3);
        expect(STALLS[4]!.x).toBeLessThan(-3);
        expect(STALLS[5]!.x).toBeGreaterThan(-2);
        expect(STALLS[5]!.x).toBeLessThan(0);
    });

    it('keeps the right stall row clear of each other, and the mid stall clear of the paifang', () => {
        // 右列三个食摊的外接框两两不叠。
        const boxes = STALLS.slice(0, 3).map(stall => {
            const corners = rotatedCorners(stall.x, stall.z, stall.yaw, STALL.width / 2, STALL.depth / 2);
            return {
                x0: Math.min(...corners.map(p => p.x)),
                x1: Math.max(...corners.map(p => p.x)),
                z0: Math.min(...corners.map(p => p.z)),
                z1: Math.max(...corners.map(p => p.z)),
            };
        });
        for (let a = 0; a < boxes.length; a += 1) {
            for (let b = a + 1; b < boxes.length; b += 1) {
                const overlap = boxes[a]!.x0 < boxes[b]!.x1 && boxes[b]!.x0 < boxes[a]!.x1
                    && boxes[a]!.z0 < boxes[b]!.z1 && boxes[b]!.z0 < boxes[a]!.z1;
                expect(overlap, `stall${a} vs stall${b}`).toBe(false);
            }
        }
        // 中景摊与牌坊之间留出广场走道。
        const mid = STALLS[5]!;
        const gap = Math.hypot(mid.x - PAIFANG.cx, mid.z - PAIFANG.cz);
        expect(gap).toBeGreaterThan(2.4);
    });

    it('keeps the city wall, gate towers, rooftops and string anchors inside the base', () => {
        const wall = PROPS.cityWall;
        expect(wall.x0).toBeGreaterThanOrEqual(-half);
        expect(wall.x1).toBeLessThan(half);
        expect(wall.z0).toBeGreaterThanOrEqual(-half);
        expect(wall.z1).toBeLessThan(ROAD.inner);
        [wall.gate, wall.gate2].forEach(gate => {
            expect(gate.z).toBeGreaterThan(wall.z0);
            expect(gate.z).toBeLessThan(wall.z1);
        });
        // 屋脊带至少三段、塔后有剪影。
        expect(PROPS.rooftops.length).toBeGreaterThanOrEqual(3);
        PROPS.rooftops.forEach(item => {
            expect(Math.abs(item.x)).toBeLessThan(half);
            expect(Math.abs(item.z)).toBeLessThan(half);
            expect(item.x).toBeLessThan(ROAD.inner);
        });
        // 三株天花灯锚点都在场里；灯串的锚点高度都在人头顶上。
        expect(PROPS.skyLanterns).toHaveLength(3);
        PROPS.skyLanterns.forEach(spot => {
            expect(Math.abs(spot.x)).toBeLessThan(half);
            expect(Math.abs(spot.z)).toBeLessThan(half);
        });
        STRING_SPANS.forEach(span => {
            [span.from, span.to].forEach(point => {
                expect(Math.abs(point[0])).toBeLessThan(half);
                expect(Math.abs(point[2])).toBeLessThan(half);
                expect(point[1]).toBeGreaterThan(2);
            });
        });
    });
});

describe('changan composition', () => {
    it('keeps the tower group under 45% of frame height, back-right of center', () => {
        const camera = setupCamera();
        const terrace = buildChanganTerrace(materials);
        terrace.group.updateMatrixWorld(true);
        const tower = boxNdc(camera, terrace.group);
        // 塔组（矮台 + 七层大雁塔）占画面高：目标 ≤40%，硬上限 45%（v1 是 ~113% 溢出）。
        const share = (tower.y1 - tower.y0) / 2;
        expect(share).toBeLessThanOrEqual(0.45);
        // 塔心在画面右 55%–75% 一带（参考图约 62%）。
        const center = ndc(camera, PAGODA.cx, TERRACE_TOP + 1, PAGODA.cz);
        const widthRatio = (center.x + 1) / 2;
        expect(widthRatio).toBeGreaterThan(0.55);
        expect(widthRatio).toBeLessThan(0.75);
        // 塔组整体在画面里、上方留出一点天。
        expect(tower.x0).toBeGreaterThan(-1);
        expect(tower.x1).toBeLessThan(1);
        expect(tower.y1).toBeLessThan(1);
    });

    it('fills the frame bottom with the market and keeps the paifang at left-center mid-ground', () => {
        const camera = setupCamera();
        const market = buildChanganMarket(materials, resolveChanganVariation('song-0'));
        market.group.updateMatrixWorld(true);
        const paifang = market.group.getObjectByName('Market/paifang')!;
        const paifangNdc = boxNdc(camera, paifang);
        // 牌坊占画面宽约三成，横跨左中区间（参考图约 18–48% 宽）。
        const left = ((paifangNdc.x0 + 1) / 2) * 100;
        const right = ((paifangNdc.x1 + 1) / 2) * 100;
        expect(left).toBeGreaterThan(8);
        expect(right).toBeLessThan(52);
        expect(right - left).toBeGreaterThan(20);
        // 市集内容压到画面下 1/4 以内（广场湿地 + 摊位铺满下沿）。
        const marketNdc = boxNdc(camera, market.group);
        expect(marketNdc.y0).toBeLessThan(-0.6);
    });

    it('keeps at least 18 lanterns visibly inside the default frame', () => {
        const camera = setupCamera();
        const market = buildChanganMarket(materials, resolveChanganVariation('song-0'));
        market.group.updateMatrixWorld(true);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        let lit = 0;
        for (let index = 0; index < market.lanternBatch.mesh.count; index += 1) {
            market.lanternBatch.mesh.getMatrixAt(index, matrix);
            position.setFromMatrixPosition(matrix);
            const point = ndc(camera, position.x, position.y, position.z);
            if (Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1) lit += 1;
        }
        expect(market.lanternBatch.mesh.count).toBeGreaterThanOrEqual(18);
        expect(lit).toBeGreaterThanOrEqual(18);
    });
});

describe('changan content surfaces', () => {
    it('mounts the lyric screen on the lyric-house wall facing the default camera', () => {
        const market = buildChanganMarket(materials, resolveChanganVariation('song-0'));
        // 屏面与楼面、默认镜头方位角同角：入射角 0°（竹影 v1 的 45° 侧屏不可读，这里正对）。
        expect(market.boardFace.rotationY).toBeCloseTo(LYRIC_HOUSE.yaw, 6);
        expect(market.boardFace.rotationY).toBeCloseTo(CHANGAN_VIEW.azimuth, 6);
        // 屏面规格：高与竹影歌词带同档（0.62m）、宽度够一整行长歌词。
        expect(market.boardFace.height).toBeGreaterThanOrEqual(0.6);
        expect(market.boardFace.width).toBeGreaterThanOrEqual(1.5);
        // 屏带在楼面中段、离地一人高以上。
        expect(market.boardFace.position.y).toBeGreaterThan(LEVEL.lot + 1.3);
        expect(market.boardFace.position.y).toBeLessThan(LEVEL.lot + LYRIC_HOUSE.wallHeight);
    });

    it('builds the pagoda arches and the EQ strip into instanced pieces', () => {
        const terrace = buildChanganTerrace(materials);
        let arches = 0;
        terrace.group.traverse(object => {
            if (object.name.startsWith('Pagoda/arch')) arches += 1;
        });
        // 七层、每面一孔：56 个拱洞（拱顶圆盘另算）。
        expect(arches).toBe(7 * 4 * 2);
        expect(terrace.pagodaTop.y).toBeGreaterThan(TERRACE_TOP);

        const market = buildChanganMarket(materials, resolveChanganVariation('song-0'));
        const { eq } = market;
        expect(eq.mesh.count).toBe(EQ.count);
        // EQ 沿楼面局部 x 排开：步进方向与屏面同 yaw，贴着楼面前。
        expect(Math.abs(Math.atan2(-eq.sz, eq.sx) - LYRIC_HOUSE.yaw)).toBeLessThan(0.02);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        for (let index = 0; index < eq.mesh.count; index += 1) {
            eq.mesh.getMatrixAt(index, matrix);
            position.setFromMatrixPosition(matrix);
            expect(position.y).toBeGreaterThan(LEVEL.lot + EQ.y0);
            expect(position.y).toBeLessThan(LEVEL.lot + EQ.y0 + EQ.maxHeight + 0.05);
        }
    });

    it('mounts the plaque, banners, stall signs and neon facing the default camera side', () => {
        const market = buildChanganMarket(materials, resolveChanganVariation('song-0'));
        expect(market.plaqueFace.rotationY).toBeCloseTo(PAIFANG.yaw, 5);
        expect(market.bannerFaces).toHaveLength(2);
        market.bannerFaces.forEach(face => expect(face.rotationY).toBeCloseTo(PAIFANG.yaw, 5));
        expect(market.stallSignFaces).toHaveLength(STALLS.length);
        market.stallSignFaces.forEach((face, index) => expect(face.rotationY).toBeCloseTo(STALLS[index]!.yaw, 5));
        [market.plaqueFace, ...market.bannerFaces, ...market.stallSignFaces, market.teaNeonFace].forEach(face => {
            expect(Math.abs(face.position.x)).toBeLessThan(MACHI_BASE.half);
            expect(Math.abs(face.position.z)).toBeLessThan(MACHI_BASE.half);
            expect(face.position.y).toBeGreaterThan(LEVEL.lot);
        });
    });

    it('batches every lantern and blossom blob into instanced meshes with matching color tables', () => {
        const market = buildChanganMarket(materials, resolveChanganVariation('song-0'));
        const half = MACHI_BASE.half;
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        [market.lanternBatch, market.blossomBatch].forEach(batch => {
            expect(batch.keys).toHaveLength(batch.mesh.count);
            expect(batch.shade).toHaveLength(batch.mesh.count);
            for (let index = 0; index < batch.mesh.count; index += 1) {
                batch.mesh.getMatrixAt(index, matrix);
                position.setFromMatrixPosition(matrix);
                expect(Math.abs(position.x), `${batch.mesh.name}#${index}`).toBeLessThan(half);
                expect(Math.abs(position.z), `${batch.mesh.name}#${index}`).toBeLessThan(half);
                expect(position.y, `${batch.mesh.name}#${index}`).toBeGreaterThan(LEVEL.lot);
            }
        });
        // 灯笼串是批出来的：牌坊挂灯、各摊挂灯与四条长串，总数过 18。
        expect(market.lanternBatch.mesh.count).toBeGreaterThanOrEqual(18);
        // 冒白气的食摊与 STALLS 里 steam 标记对得上；天灯三盏。
        expect(market.steamSources.length).toBe(STALLS.filter(stall => stall.steam).length);
        expect(market.skyLanterns).toHaveLength(3);
    });
});
