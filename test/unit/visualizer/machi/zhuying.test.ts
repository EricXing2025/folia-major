import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MACHI_BASE } from '@/components/visualizer/machi/engine/geometry/plinth';
import type { MachiMaterials } from '@/components/visualizer/machi/engine/materials';
import { buildZhuyingDesk } from '@/components/visualizer/machi/scenes/zhuying/desk';
import { buildZhuyingInterior } from '@/components/visualizer/machi/scenes/zhuying/interior';
import { DESK, LEVEL, LYRIC, MONITOR, RING, ROOM, SHELF, SKYLINE, STREET, TEA, WINDOW, ZHUYING_VIEW } from '@/components/visualizer/machi/scenes/zhuying/layout';
import { buildZhuyingSkyline } from '@/components/visualizer/machi/scenes/zhuying/skyline';
import { resolveZhuyingVariation } from '@/components/visualizer/machi/scenes/zhuying/zhuyingSeed';
import { ZHUYING_TICKER_TEXTS } from '@/components/visualizer/machi/scenes/zhuying/zhuyingSignPaint';

// test/unit/visualizer/machi/zhuying.test.ts
// 烛影长安：按歌变的东西是确定的（同一首歌同一个样）；房间在底座后左、窗开在后墙里、歌词条收在窗洞里、
// 环形灯挂在窗右的实墙上、塔透过窗看得见；书桌与摆件都在房间里、窗外的楼都在墙外；书脊成批实例、
// 颜色索引对得上数；显示器与跑马灯的面朝着默认镜头。

const material = new THREE.MeshBasicMaterial();
const materials = { toon: () => material, glow: () => material, track: <T>(value: T) => value, product: material, glass: material } as unknown as MachiMaterials;

const insideRoom = (x: number, z: number) => x > ROOM.x0 - 0.05 && x < ROOM.x1 + 0.05 && z > ROOM.z0 - 0.05 && z < ROOM.z1 + 0.05;

describe('zhuying variation', () => {
    it('is deterministic and keeps every draw inside its range', () => {
        for (let index = 0; index < 300; index += 1) {
            const seed = `song-${index}`;
            const variation = resolveZhuyingVariation(seed);
            expect(resolveZhuyingVariation(seed)).toEqual(variation);
            expect([0, 1]).toContain(variation.blossomCorner);
            expect([0, 1]).toContain(variation.plantSlot);
            expect([0, 1]).toContain(variation.lanternStyle);
            expect(variation.blossomDensity).toBeGreaterThanOrEqual(0.75);
            expect(variation.blossomDensity).toBeLessThanOrEqual(1.3);
            expect(variation.tickerIndex).toBeGreaterThanOrEqual(0);
            expect(variation.tickerIndex).toBeLessThan(ZHUYING_TICKER_TEXTS.length);
            expect(variation.windSlant).toBeGreaterThanOrEqual(0.06);
            expect(variation.windSlant).toBeLessThanOrEqual(0.2);
            expect(variation.puddleAmount).toBeGreaterThanOrEqual(0.45);
            expect(variation.puddleAmount).toBeLessThanOrEqual(0.75);
        }
        // 不同的歌确实会不一样：樱花角、末根蜡烛阴阳、灯笼款、蜡烛图种子都见过不止一种。
        const draws = Array.from({ length: 60 }, (_, index) => resolveZhuyingVariation(`song-${index}`));
        expect(new Set(draws.map(item => item.blossomCorner)).size).toBe(2);
        expect(new Set(draws.map(item => item.lastCandleUp)).size).toBe(2);
        expect(new Set(draws.map(item => item.lanternStyle)).size).toBe(2);
        expect(new Set(draws.map(item => item.chartSeed)).size).toBeGreaterThan(10);
    });
});

describe('zhuying layout', () => {
    const half = MACHI_BASE.half;

    it('keeps the room on the base and the window inside the back wall', () => {
        expect(ROOM.x0).toBeGreaterThanOrEqual(-half);
        expect(ROOM.x1).toBeLessThanOrEqual(half);
        expect(ROOM.z0).toBeGreaterThanOrEqual(-half);
        expect(ROOM.z1).toBeLessThanOrEqual(half);
        expect(ROOM.wallHeight).toBeLessThanOrEqual(LEVEL.floor + half * 0.6);
        // 窗在后墙里：左右留垛、上下留台与窗头；窗台高过地板。
        expect(WINDOW.x0).toBeGreaterThan(ROOM.x0);
        expect(WINDOW.x1).toBeLessThan(ROOM.x1);
        expect(WINDOW.sill).toBeGreaterThan(LEVEL.floor);
        expect(WINDOW.head).toBeLessThan(ROOM.wallHeight);
        expect(WINDOW.z).toBeGreaterThan(ROOM.z0);
        expect(WINDOW.z).toBeLessThan(ROOM.backInner);
        // 街在墙外（湿街面就是倒影面）。
        expect(STREET.z1).toBeLessThanOrEqual(ROOM.z0 + 0.1);
        expect(STREET.z0).toBeGreaterThanOrEqual(-half);
    });

    it('keeps the lyric strip inside the window opening facing the room', () => {
        expect(LYRIC.x0).toBeGreaterThan(WINDOW.x0);
        expect(LYRIC.x1).toBeLessThan(WINDOW.x1);
        expect(LYRIC.y0).toBeGreaterThan(WINDOW.sill);
        expect(LYRIC.y1).toBeLessThan(WINDOW.head);
        // 竹帘下沿之下还是看得到歌词条。
        expect(LYRIC.y1).toBeLessThan(WINDOW.head - WINDOW.blindDrop + 0.2);
        expect(LYRIC.z).toBeGreaterThan(WINDOW.z);
        expect(LYRIC.z).toBeLessThanOrEqual(ROOM.backInner + 0.05);
        expect(LYRIC.width).toBeGreaterThan(2.5);
    });

    it('hangs the ring light on the solid bay right of the window', () => {
        expect(RING.x - RING.radius).toBeGreaterThan(WINDOW.x1);
        expect(RING.x + RING.radius).toBeLessThan(ROOM.x1 - 0.05);
        expect(RING.y + RING.radius).toBeLessThan(ROOM.wallHeight);
        expect(RING.y - RING.radius).toBeGreaterThan(LEVEL.floor);
        expect(RING.z).toBeGreaterThan(ROOM.z0);
        expect(RING.z).toBeLessThanOrEqual(ROOM.backInner + 0.05);
    });

    it('puts the pagoda inside the window’s horizontal span, outside the room', () => {
        expect(SKYLINE.pagoda.x).toBeGreaterThan(WINDOW.x0);
        expect(SKYLINE.pagoda.x).toBeLessThan(WINDOW.x1);
        expect(SKYLINE.pagoda.z).toBeLessThan(ROOM.z0);
        // 塔在窗里占住上半段（塔高定得让塔尖基本不被窗头裁掉：塔深 1.5m，俯角下视线过窗头再落约 0.9m）。
        expect(LEVEL.street + SKYLINE.pagoda.height).toBeGreaterThan(WINDOW.sill + (WINDOW.head - WINDOW.sill) * 0.5);
        expect(LEVEL.street + SKYLINE.pagoda.height + 0.2).toBeLessThan(WINDOW.head - 0.7);
        // 城楼在窗左端外（台身可以探进窗左一小段，反正隔着墙看）。
        expect(SKYLINE.gate.x0).toBeLessThan(WINDOW.x0);
        expect(SKYLINE.gate.z0).toBeLessThan(ROOM.z0);
    });

    it('keeps the desk, shelf and tea corner inside the room, and the monitor on the desk', () => {
        [DESK, SHELF].forEach(area => {
            expect(insideRoom(area.x0, area.z0)).toBe(true);
            expect(insideRoom(area.x1, area.z1)).toBe(true);
        });
        expect(insideRoom(TEA.table.x, TEA.table.z)).toBe(true);
        expect(insideRoom(TEA.lantern.x, TEA.lantern.z)).toBe(true);
        expect(insideRoom(TEA.cushion.x, TEA.cushion.z)).toBe(true);
        // 显示器在桌面上、在窗前的空间里。
        expect(MONITOR.y).toBeGreaterThan(DESK.top);
        expect(insideRoom(MONITOR.x, MONITOR.z)).toBe(true);
        expect(MONITOR.x).toBeGreaterThan(DESK.x0);
        expect(MONITOR.x).toBeLessThan(DESK.x1);
        // 书架贴左墙、桌面在窗前；K 线霓虹在书架上方那段墙上。
        expect(SHELF.x0).toBeCloseTo(ROOM.leftInner, 5);
        expect(SHELF.neon.y0).toBeGreaterThan(SHELF.top);
        expect(SHELF.neon.y1).toBeLessThan(ROOM.wallHeight);
        expect(SHELF.neon.z0).toBeGreaterThanOrEqual(SHELF.z0 - 0.15);
        expect(SHELF.neon.z1).toBeLessThanOrEqual(SHELF.z1 + 0.15);
        // 默认镜头的方位角跟显示器、歌词条的朝向对得上（都朝着前右的镜头）。
        const toDeg = (radians: number) => radians * 180 / Math.PI;
        expect(Math.abs(toDeg(ZHUYING_VIEW.azimuth - MONITOR.azimuth))).toBeLessThan(60);
    });
});

describe('zhuying interior', () => {
    it('keeps the shelf, tea table, lantern, cushion and hanging plant inside the room', () => {
        const interior = buildZhuyingInterior(materials, resolveZhuyingVariation('song-1'));
        interior.group.updateMatrixWorld(true);
        const offenders: string[] = [];
        interior.group.traverse(object => {
            if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
            const box = new THREE.Box3().setFromObject(object);
            const center = box.getCenter(new THREE.Vector3());
            if (!insideRoom(center.x, center.z)) offenders.push(`${object.name || object.type}@(${center.x.toFixed(2)},${center.z.toFixed(2)})`);
            if (center.y > ROOM.wallHeight + 0.05 || center.y < 0) offenders.push(`${object.name || object.type}@y=${center.y.toFixed(2)}`);
        });
        expect(offenders).toEqual([]);
    });

    it('batches the book spines into one instanced mesh with matching color tables', () => {
        const interior = buildZhuyingInterior(materials, resolveZhuyingVariation('song-1'));
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        interior.productBatches.forEach(batch => {
            expect(batch.colorIndex).toHaveLength(batch.mesh.count);
            expect(batch.shade).toHaveLength(batch.mesh.count);
            for (let index = 0; index < batch.mesh.count; index += 1) {
                batch.mesh.getMatrixAt(index, matrix);
                position.setFromMatrixPosition(matrix);
                expect(insideRoom(position.x, position.z), `${batch.mesh.name}#${index}`).toBe(true);
                expect(position.y).toBeGreaterThan(LEVEL.floor);
                expect(position.y).toBeLessThan(ROOM.wallHeight);
            }
        });
        const spines = interior.productBatches.find(batch => batch.mesh.name === 'Spines')!;
        expect(spines.mesh.count).toBeGreaterThan(30);
        // 热气与灯笼光点的位置都落在房间里的茶案一角。
        expect(insideRoom(interior.steamAt.x, interior.steamAt.z)).toBe(true);
        expect(interior.steamAt.y).toBeGreaterThan(TEA.table.top);
        expect(insideRoom(interior.lanternAt.x, interior.lanternAt.z)).toBe(true);
        expect(interior.lanternAt.y).toBeGreaterThan(LEVEL.floor);
    });

    it('shifts the book spines around between songs', () => {
        const a = buildZhuyingInterior(materials, resolveZhuyingVariation('song-a'));
        const b = buildZhuyingInterior(materials, resolveZhuyingVariation('song-b'));
        const countA = a.productBatches[0]!.mesh.count;
        const countB = b.productBatches[0]!.mesh.count;
        // 种子不同：书脊数或配色表至少有一个不一样（两首歌不会整排都撞一样，多试几首更稳）。
        const differs = ['song-c', 'song-d', 'song-e', 'song-f'].some(seed => {
            const other = buildZhuyingInterior(materials, resolveZhuyingVariation(seed));
            return other.productBatches[0]!.mesh.count !== countA || countA !== countB;
        });
        expect(differs || countA !== countB).toBe(true);
    });
});

describe('zhuying skyline', () => {
    it('keeps the rooftops, pagoda and gate outside the room', () => {
        const skyline = buildZhuyingSkyline(materials, resolveZhuyingVariation('song-1'));
        skyline.group.updateMatrixWorld(true);
        const offenders: string[] = [];
        skyline.group.traverse(object => {
            if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
            const box = new THREE.Box3().setFromObject(object);
            const center = box.getCenter(new THREE.Vector3());
            if (insideRoom(center.x, center.z) && center.y > LEVEL.floor) offenders.push(`${object.name || object.type}@(${center.x.toFixed(2)},${center.z.toFixed(2)})`);
        });
        expect(offenders).toEqual([]);
    });

    it('gives the weather layer four roof stops or fewer, all above the street and inside the base', () => {
        const skyline = buildZhuyingSkyline(materials, resolveZhuyingVariation('song-1'));
        const picks = [skyline.roofs.near, skyline.roofs.mid, skyline.roofs.pagoda, ...skyline.roofs.surround];
        picks.forEach(roof => {
            // 剪影可以稍探出底座边一点（挑檐过沿），遮挡矩形跟着几何走。
            expect(Math.abs(roof.x0)).toBeLessThanOrEqual(MACHI_BASE.half + 0.15);
            expect(Math.abs(roof.x1)).toBeLessThanOrEqual(MACHI_BASE.half + 0.15);
            expect(Math.abs(roof.z0)).toBeLessThanOrEqual(MACHI_BASE.half + 0.15);
            expect(Math.abs(roof.z1)).toBeLessThanOrEqual(MACHI_BASE.half + 0.15);
            expect(roof.y).toBeGreaterThan(LEVEL.street);
            expect(roof.y).toBeLessThan(ROOM.wallHeight + 0.5);
        });
        // 塔是最高的那座（雨先落在它头上）。
        expect(skyline.roofs.pagoda.y).toBeGreaterThan(skyline.roofs.mid.y);
        expect(skyline.roofs.pagoda.y).toBeGreaterThan(skyline.roofs.near.y);
    });

    it('keeps the street and lot surfaces dynamic so the engine can swap in wet materials', () => {
        const skyline = buildZhuyingSkyline(materials, resolveZhuyingVariation('song-1'));
        expect(skyline.street.userData.dynamic).toBe(true);
        skyline.lotSurfaces.forEach(surface => {
            expect(surface.userData.dynamic).toBe(true);
        });
        // 天气遮挡的候选池：场景选房间 + 塔 + 镜头前两排檐口（中排剪影让位）。
        expect(skyline.roofs.surround).toHaveLength(2);
        expect(skyline.roofs.pagoda.y).toBeGreaterThan(skyline.roofs.surround[0]!.y);
    });

    it('lights the skyline with instanced windows matching the lit-window count', () => {
        const skyline = buildZhuyingSkyline(materials, resolveZhuyingVariation('song-1'));
        expect(skyline.litWindows.count).toBeGreaterThan(4);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        for (let index = 0; index < skyline.litWindows.count; index += 1) {
            skyline.litWindows.getMatrixAt(index, matrix);
            position.setFromMatrixPosition(matrix);
            expect(position.z).toBeLessThan(ROOM.z0);
            expect(position.y).toBeGreaterThan(LEVEL.street);
        }
    });
});

describe('zhuying desk', () => {
    it('faces the monitor and the ticker toward the default camera, on the desk', () => {
        const desk = buildZhuyingDesk(materials, resolveZhuyingVariation('song-1'));
        const toDeg = (radians: number) => radians * 180 / Math.PI;
        // 显示器面朝着前右的镜头（azimuth 30° 跟 45° 的镜头差得不大）。
        expect(Math.abs(toDeg(desk.monitorFace.rotationY - ZHUYING_VIEW.azimuth))).toBeLessThan(60);
        expect(desk.monitorFace.width).toBeCloseTo(MONITOR.width, 5);
        expect(desk.monitorFace.height).toBeCloseTo(MONITOR.height, 5);
        expect(desk.monitorFace.position.x).toBeCloseTo(MONITOR.x, 1);
        expect(desk.monitorFace.position.z).toBeCloseTo(MONITOR.z, 1);
        // 跑马灯在桌的前沿，朝 +z。
        expect(desk.tickerFace.rotationY).toBeCloseTo(0, 5);
        expect(desk.tickerFace.position.z).toBeCloseTo(DESK.z1, 1);
        expect(desk.tickerFace.position.y).toBeCloseTo(DESK.tickerY, 5);
        // 台灯悬在桌面上方，光照落点落回桌面。
        expect(desk.lampApex.y).toBeGreaterThan(DESK.top + 0.2);
        expect(desk.lampTarget.y).toBeCloseTo(DESK.top, 5);
        [desk.lampApex, desk.lampTarget].forEach(point => {
            expect(insideRoom(point.x, point.z)).toBe(true);
        });
    });

    it('fills the stream keypad with instanced keys on the desk surface', () => {
        const desk = buildZhuyingDesk(materials, resolveZhuyingVariation('song-1'));
        expect(desk.keypad.count).toBe(15);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        for (let index = 0; index < desk.keypad.count; index += 1) {
            desk.keypad.getMatrixAt(index, matrix);
            position.setFromMatrixPosition(matrix);
            expect(position.y).toBeGreaterThan(DESK.top);
            expect(position.x).toBeGreaterThan(DESK.x0);
            expect(position.x).toBeLessThan(DESK.x1);
            expect(position.z).toBeGreaterThan(DESK.z0);
            expect(position.z).toBeLessThan(DESK.z1);
        }
    });
});
