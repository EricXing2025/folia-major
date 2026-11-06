import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MACHI_BASE } from '@/components/visualizer/machi/engine/geometry/plinth';
import type { MachiMaterials } from '@/components/visualizer/machi/engine/materials';
import { MACHI_SCENES } from '@/components/visualizer/machi/scenes';
import { CHANGAN_SCENE } from '@/components/visualizer/machi/scenes/changan/changanScene';
import { resolveChanganVariation } from '@/components/visualizer/machi/scenes/changan/changanSeed';
import {
    BOARD,
    CHAMFER_CENTER,
    CHANGAN_VIEW,
    EQ,
    LEVEL,
    PAGODA,
    PAIFANG,
    PALACE_LAMPS,
    PROPS,
    ROAD,
    STAIR,
    STALL,
    STALLS,
    STRING_SPANS,
    TERRACE,
} from '@/components/visualizer/machi/scenes/changan/layout';
import { buildChanganMarket } from '@/components/visualizer/machi/scenes/changan/market';
import { buildChanganTerrace, TERRACE_TOP } from '@/components/visualizer/machi/scenes/changan/terrace';
import { MACHI_SCENE_IDS } from '@/components/visualizer/machi/types';

// test/unit/visualizer/machi/changan.test.ts
// 长安夜市：按歌变的东西是确定的（同一首歌同一个样）；高台与大雁塔在底座后中、七层收分的比例守住；
// 牌坊与食摊在场地里、不压路也不互相插；歌词屏贴在台基前墙、朝着默认镜头；灯笼 / 花球是成批的实例、
// 颜色键与明暗表对得上数；天灯、城楼的剪影都在底座里。

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
            variation.skyPhase.forEach(phase => {
                expect(phase).toBeGreaterThanOrEqual(0);
                expect(phase).toBeLessThan(1);
            });
            expect(variation.stringSag).toBeGreaterThanOrEqual(0.8);
            expect(variation.stringSag).toBeLessThanOrEqual(1.3);
            expect(variation.windSlant).toBeGreaterThanOrEqual(0.06);
            expect(variation.windSlant).toBeLessThanOrEqual(0.2);
            expect(variation.puddleAmount).toBeGreaterThanOrEqual(0.45);
            expect(variation.puddleAmount).toBeLessThanOrEqual(0.8);
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
        // 塔的底面在台面上，台宽约为塔基宽的 1.7 倍。
        expect(PAGODA.cx - PAGODA.baseWidth / 2).toBeGreaterThan(TERRACE.x0);
        expect(PAGODA.cx + PAGODA.baseWidth / 2).toBeLessThan(TERRACE.x1);
        expect(PAGODA.cz - PAGODA.baseWidth / 2).toBeGreaterThan(TERRACE.z0);
        expect(PAGODA.cz + PAGODA.baseWidth / 2).toBeLessThan(TERRACE.z1);
        const terraceWidth = TERRACE.x1 - TERRACE.x0;
        expect(terraceWidth / PAGODA.baseWidth).toBeGreaterThanOrEqual(1.6);
        expect(terraceWidth / PAGODA.baseWidth).toBeLessThanOrEqual(1.9);
    });

    it('keeps the pagoda proportions: seven levels, taper and silhouette ratio', () => {
        expect(PAGODA.levelHeights).toHaveLength(7);
        expect(PAGODA.taper).toBeGreaterThanOrEqual(0.88);
        expect(PAGODA.taper).toBeLessThanOrEqual(0.92);
        const towerHeight = PAGODA.levelHeights.reduce((sum, item) => sum + item + PAGODA.eaveThickness, 0);
        expect(towerHeight / PAGODA.baseWidth).toBeGreaterThanOrEqual(2.4);
        expect(towerHeight / PAGODA.baseWidth).toBeLessThanOrEqual(2.6);
    });

    it('lands the stair on the lot inside the base, off the terrace footprint and the road', () => {
        const landing = {
            x: CHAMFER_CENTER.x + Math.sin(STAIR.yaw) * STAIR.run,
            z: CHAMFER_CENTER.z + Math.cos(STAIR.yaw) * STAIR.run,
        };
        expect(Math.abs(landing.x)).toBeLessThan(half);
        expect(Math.abs(landing.z)).toBeLessThan(half);
        expect(landing.x).toBeLessThan(ROAD.inner);
        expect(landing.z).toBeLessThan(ROAD.inner);
        // 台阶落在斜面外面：不在台身矩形里。
        const insideTerrace = landing.x > TERRACE.x0 && landing.x < TERRACE.x1 - TERRACE.chamfer && landing.z > TERRACE.z0 && landing.z < TERRACE.z1;
        expect(insideTerrace).toBe(false);
    });

    it('keeps the paifang, stalls, lamps and props on the lot off the road and inside the base', () => {
        const boxes = [
            ...rotatedCorners(PAIFANG.cx, PAIFANG.cz, PAIFANG.yaw, PAIFANG.pillarOffset + 0.5, 0.4).map(point => ['paifang', point.x, point.z] as const),
            ...STALLS.flatMap((stall, index) =>
                rotatedCorners(stall.x, stall.z, stall.yaw, STALL.canopySize.w / 2, STALL.canopySize.d / 2).map(point => [`stall${index}`, point.x, point.z] as const)),
            ...PALACE_LAMPS.map((lamp, index) => [`lamp${index}`, lamp.x, lamp.z] as const),
            ['warrior', PROPS.warrior.x, PROPS.warrior.z] as const,
            ['blossom', PROPS.blossomTree.x, PROPS.blossomTree.z] as const,
            ...PROPS.tables.map((table, index) => [`table${index}`, table.x, table.z] as const),
        ];
        boxes.forEach(([name, x, z]) => {
            expect(Math.abs(x), name).toBeLessThan(half);
            expect(Math.abs(z), name).toBeLessThan(half);
            expect(x, name).toBeLessThan(ROAD.inner);
            expect(z, name).toBeLessThan(ROAD.inner);
        });
    });

    it('keeps the right-side stalls clear of each other, and the mid stall clear of the paifang', () => {
        // 右列两个食摊的外接框不叠。
        const boxes = STALLS.slice(0, 2).map(stall => {
            const corners = rotatedCorners(stall.x, stall.z, stall.yaw, STALL.width / 2, STALL.depth / 2);
            return {
                x0: Math.min(...corners.map(p => p.x)),
                x1: Math.max(...corners.map(p => p.x)),
                z0: Math.min(...corners.map(p => p.z)),
                z1: Math.max(...corners.map(p => p.z)),
            };
        });
        const overlap = boxes[0]!.x0 < boxes[1]!.x1 && boxes[1]!.x0 < boxes[0]!.x1 && boxes[0]!.z0 < boxes[1]!.z1 && boxes[1]!.z0 < boxes[0]!.z1;
        expect(overlap).toBe(false);
        // 中景摊与牌坊之间留出广场走道（中心距 > 两摊各自半径和的一半）。
        const mid = STALLS[2]!;
        const gap = Math.hypot(mid.x - PAIFANG.cx, mid.z - PAIFANG.cz);
        expect(gap).toBeGreaterThan(2.4);
    });

    it('hangs the lyric screen on the terrace front wall facing the default camera', () => {
        // 屏面朝 +z，镜头方位角 30°：面法线与镜头方向夹角不超过 30°。
        expect(CHANGAN_VIEW.azimuth).toBeLessThanOrEqual(30 * Math.PI / 180 + 1e-6);
        // 屏在台基前墙面上、宽度与高度都收进墙面。
        expect(BOARD.cx - BOARD.width / 2).toBeGreaterThan(TERRACE.x0);
        expect(BOARD.cx + BOARD.width / 2).toBeLessThan(TERRACE.x1 - TERRACE.chamfer);
        expect(BOARD.y0).toBeGreaterThan(LEVEL.lot);
        expect(BOARD.y0 + BOARD.height).toBeLessThan(TERRACE.top);
        // EQ 条带在屏正下方的墙面上。
        expect(EQ.cx).toBeCloseTo(BOARD.cx, 5);
        expect(EQ.y0).toBeLessThan(BOARD.y0);
        expect(EQ.y0 + EQ.maxHeight).toBeLessThanOrEqual(BOARD.y0 + 0.02);
    });

    it('keeps the city wall, gate tower, skyline and string anchors inside the base', () => {
        const wall = PROPS.cityWall;
        expect(wall.x0).toBeGreaterThanOrEqual(-half);
        expect(wall.x1).toBeLessThan(half);
        expect(wall.z0).toBeGreaterThanOrEqual(-half);
        expect(wall.z1).toBeLessThan(ROAD.inner);
        expect(wall.gate.z).toBeGreaterThan(wall.z0);
        expect(wall.gate.z).toBeLessThan(wall.z1);
        PROPS.skyline.forEach(item => {
            expect(Math.abs(item.x)).toBeLessThan(half);
            expect(Math.abs(item.z)).toBeLessThan(half);
            expect(item.x).toBeLessThan(ROAD.inner);
        });
        expect(Math.abs(PROPS.teaHouse.x)).toBeLessThan(half);
        expect(Math.abs(PROPS.teaHouse.z)).toBeLessThan(half);
        STRING_SPANS.forEach(span => {
            [span.from, span.to].forEach(point => {
                expect(Math.abs(point[0])).toBeLessThan(half);
                expect(Math.abs(point[2])).toBeLessThan(half);
                expect(point[1]).toBeGreaterThan(2);
            });
        });
        PROPS.skyLanterns.forEach(spot => {
            expect(Math.abs(spot.x)).toBeLessThan(half);
            expect(Math.abs(spot.z)).toBeLessThan(half);
        });
    });
});

describe('changan content surfaces', () => {
    it('mounts the lyric screen on the terrace front wall facing +z', () => {
        const terrace = buildChanganTerrace(materials);
        expect(terrace.boardFace.rotationY).toBeCloseTo(0, 5);
        expect(terrace.boardFace.position.x).toBeCloseTo(BOARD.cx, 5);
        expect(terrace.boardFace.position.z).toBeGreaterThan(TERRACE.z1);
        expect(terrace.boardFace.width).toBeLessThanOrEqual(BOARD.width);
        expect(terrace.pagodaTop.y).toBeGreaterThan(TERRACE_TOP);
    });

    it('builds the pagoda arches and the EQ strip into instanced pieces', () => {
        const terrace = buildChanganTerrace(materials);
        let arches = 0;
        terrace.group.traverse(object => {
            if (object.name.startsWith('Pagoda/arch')) arches += 1;
        });
        // 七层、每面一孔：28 个拱洞（拱顶圆盘另算）。
        expect(arches).toBe(7 * 4 * 2);
        expect(terrace.eq.mesh.count).toBe(EQ.count);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        for (let index = 0; index < terrace.eq.mesh.count; index += 1) {
            terrace.eq.mesh.getMatrixAt(index, matrix);
            position.setFromMatrixPosition(matrix);
            expect(position.x).toBeGreaterThan(TERRACE.x0);
            expect(position.x).toBeLessThan(TERRACE.x1 - TERRACE.chamfer);
            expect(position.z).toBeGreaterThan(TERRACE.z1);
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
        // 灯笼串是批出来的，每个摊、牌坊下与串上都有挂灯。
        expect(market.lanternBatch.mesh.count).toBeGreaterThan(15);
        expect(market.steamSources.length).toBe(STALLS.length);
    });
});
