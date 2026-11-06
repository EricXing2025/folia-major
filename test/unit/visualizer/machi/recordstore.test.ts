import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MACHI_BASE } from '@/components/visualizer/machi/engine/geometry/plinth';
import type { MachiMaterials } from '@/components/visualizer/machi/engine/materials';
import { buildRecordstoreInterior } from '@/components/visualizer/machi/scenes/recordstore/interior';
import { BASE, BOARD, DOOR, FASCIA, LEVEL, NEON, PROPS, RECORDSTORE_VIEW, ROAD, STORE, WALL_NEON } from '@/components/visualizer/machi/scenes/recordstore/layout';
import { buildRecordstoreSongProps } from '@/components/visualizer/machi/scenes/recordstore/props';
import { buildRecordstoreDoorEvents, RECORDSTORE_DOOR_TIMING, resolveRecordstoreDoorOpenness } from '@/components/visualizer/machi/scenes/recordstore/recordstoreDoor';
import { buildRecordstoreStore } from '@/components/visualizer/machi/scenes/recordstore/store';
import { resolveRecordstoreVariation } from '@/components/visualizer/machi/scenes/recordstore/recordstoreSeed';
import type { Line } from '@/types';

// test/unit/visualizer/machi/recordstore.test.ts
// 深夜唱片店：按歌变的东西是确定的（同一首歌同一个样）；店在底座后左象限、店前的道具不占路；歌词屏朝着默认镜头、
// 立在屋顶上；店内的货架、翻箱、柜台、试听角都在店身里；唱片封脊 / 箱里唱片 / 封面都是成批的实例、颜色索引对得上数；
// 自动门在段落开头开、长间奏里按节奏再开。

const line = (text: string, start: number, extra: Partial<Line> = {}): Line => ({
    words: [{ text, startTime: start, endTime: start + 2 }],
    startTime: start,
    endTime: start + 2,
    fullText: text,
    ...extra,
});

const material = new THREE.MeshBasicMaterial();
const materials = { toon: () => material, glow: () => material, track: <T>(value: T) => value, product: material } as unknown as MachiMaterials;

describe('recordstore variation', () => {
    it('is deterministic and keeps every draw inside its range', () => {
        for (let index = 0; index < 300; index += 1) {
            const seed = `song-${index}`;
            const variation = resolveRecordstoreVariation(seed);
            expect(resolveRecordstoreVariation(seed)).toEqual(variation);
            expect([0, 1]).toContain(variation.bikeSlot);
            expect(variation.posterLayout).toBeGreaterThanOrEqual(0);
            expect(variation.posterLayout).toBeLessThanOrEqual(2);
            expect(variation.puddleAmount).toBeGreaterThanOrEqual(0.45);
            expect(variation.puddleAmount).toBeLessThanOrEqual(0.75);
            expect(variation.doorInterval).toBeGreaterThanOrEqual(22);
            expect(variation.doorInterval).toBeLessThanOrEqual(40);
            expect(variation.fanSpeed).toBeGreaterThanOrEqual(1.6);
            expect(variation.fanSpeed).toBeLessThanOrEqual(3.2);
        }
        // 不同的歌确实会不一样：车位、第二辆车、海报版式、货架种子都见过不止一种。
        const draws = Array.from({ length: 60 }, (_, index) => resolveRecordstoreVariation(`song-${index}`));
        expect(new Set(draws.map(item => item.bikeSlot)).size).toBe(2);
        expect(new Set(draws.map(item => item.secondBike)).size).toBe(2);
        expect(new Set(draws.map(item => item.posterLayout)).size).toBe(3);
        expect(new Set(draws.map(item => item.shelfSeed)).size).toBeGreaterThan(10);
    });
});

describe('recordstore door', () => {
    const lines = [
        line('......', 0),
        line('第一段', 20),
        line('还是第一段', 24),
        line('......', 40),
        line('副歌', 90),
        line('副歌下一句', 95),
    ];
    const variation = { doorInterval: 24, doorPhase: 0.5 };

    it('opens at paragraph starts and sometimes in long gaps, in song order', () => {
        const events = buildRecordstoreDoorEvents(lines, variation);
        const cycle = RECORDSTORE_DOOR_TIMING.open + RECORDSTORE_DOOR_TIMING.hold + RECORDSTORE_DOOR_TIMING.close;
        expect(events.length).toBeGreaterThan(0);
        events.forEach((time, index) => {
            if (index > 0) expect(time - events[index - 1]!).toBeGreaterThanOrEqual(cycle - 1e-6);
        });
        // 段落开头（副歌在 90 秒）前 lead 秒有开门。
        expect(events.some(time => Math.abs(time - (90 - RECORDSTORE_DOOR_TIMING.lead)) < 1e-6)).toBe(true);
    });

    it('follows the schedule: closed far from an event, held open through the middle of one', () => {
        const events = buildRecordstoreDoorEvents(lines, variation);
        const first = events[0]!;
        expect(resolveRecordstoreDoorOpenness(events, first + RECORDSTORE_DOOR_TIMING.open + 0.5, variation, false)).toBe(1);
        const cycle = RECORDSTORE_DOOR_TIMING.open + RECORDSTORE_DOOR_TIMING.hold + RECORDSTORE_DOOR_TIMING.close;
        expect(resolveRecordstoreDoorOpenness(events, first + cycle + 2, variation, false)).toBe(0);
        // 纯音乐按 seed 的节奏周期性开。
        let opens = 0;
        for (let t = 0; t < 120; t += 0.5) {
            if (resolveRecordstoreDoorOpenness([], t, variation, true) > 0.5) opens += 1;
        }
        expect(opens).toBeGreaterThan(2);
    });
});

describe('recordstore layout', () => {
    const half = MACHI_BASE.half;

    it('keeps the store, the door and every prop on the base, and the lot props off the road', () => {
        expect(STORE.x0).toBeGreaterThanOrEqual(-half);
        expect(STORE.x1).toBeLessThanOrEqual(half);
        expect(STORE.z0).toBeGreaterThanOrEqual(-half);
        expect(STORE.z1).toBeLessThanOrEqual(half);
        expect(DOOR.x0).toBeGreaterThan(STORE.x0);
        expect(DOOR.x1).toBeLessThan(STORE.x1);
        // 场地上的道具不压路（路从 ROAD.inner 起）。
        const lotProps = [
            ...PROPS.bikeSlots.map((slot, index) => [`bike${index}`, slot.x, slot.z] as const),
            ['aFrame', PROPS.aFrame.x, PROPS.aFrame.z] as const,
            ['saleCrate', PROPS.saleCrate.x, PROPS.saleCrate.z] as const,
            ['nobori', PROPS.nobori.x, PROPS.nobori.z] as const,
        ];
        lotProps.forEach(([name, x, z]) => {
            expect(Math.abs(x), name).toBeLessThan(half);
            expect(Math.abs(z), name).toBeLessThan(half);
            expect(x, name).toBeLessThan(ROAD.inner);
            expect(z, name).toBeLessThan(ROAD.inner);
        });
        [PROPS.streetLamp, PROPS.curveMirror, PROPS.stopSign, PROPS.utilityPole].forEach(prop => {
            expect(Math.abs(prop.x)).toBeLessThan(half);
            expect(Math.abs(prop.z)).toBeLessThan(half);
        });
        // 店占后左象限：两条路在前右角相交。
        expect(STORE.x1).toBeLessThan(ROAD.inner);
        expect(STORE.z1).toBeLessThan(ROAD.inner);
    });

    it('keeps the lot props clear of each other and of either bike placement', () => {
        // 各件的外接框（按各自几何的外沿，自行车两个车位都可能被占，都要留得出）。
        const boxes = [
            { name: 'nobori', x0: PROPS.nobori.x - 0.18, x1: PROPS.nobori.x + 0.18, z0: PROPS.nobori.z - 0.18, z1: PROPS.nobori.z + 0.18 },
            { name: 'aFrame', x0: PROPS.aFrame.x - 0.32, x1: PROPS.aFrame.x + 0.32, z0: PROPS.aFrame.z - 0.32, z1: PROPS.aFrame.z + 0.32 },
            { name: 'saleCrate', x0: PROPS.saleCrate.x - 0.45, x1: PROPS.saleCrate.x + 0.45, z0: PROPS.saleCrate.z - 0.4, z1: PROPS.saleCrate.z + 0.4 },
            ...PROPS.bikeSlots.map((slot, index) => ({
                name: `bike${index}`,
                x0: slot.x - 0.94, x1: slot.x + 0.88,
                z0: slot.z - 0.3, z1: slot.z + 0.3,
            })),
        ];
        boxes.forEach((a, index) => boxes.slice(index + 1).forEach(b => {
            const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
            expect(overlap, `${a.name} overlaps ${b.name}`).toBe(false);
        }));
    });

    it('stands the lyric screen on the roof facing the default camera, and the neon sign inside the base', () => {
        expect(Math.abs(RECORDSTORE_VIEW.azimuth - BOARD.azimuth) * 180 / Math.PI).toBeLessThanOrEqual(30);
        expect(BOARD.y0).toBeGreaterThan(STORE.roofTop);
        // 屏的两端还在屋顶上（屏沿屏面方向的两端角点）。
        const across = { x: Math.cos(BOARD.azimuth), z: -Math.sin(BOARD.azimuth) };
        [-1, 1].forEach(side => {
            const cornerX = BOARD.cx + across.x * side * (BOARD.width / 2);
            const cornerZ = BOARD.cz + across.z * side * (BOARD.width / 2);
            expect(cornerX).toBeGreaterThan(STORE.x0);
            expect(cornerX).toBeLessThan(STORE.x1);
            expect(cornerZ).toBeGreaterThan(STORE.z0);
            expect(cornerZ).toBeLessThan(STORE.z1);
        });
        expect(NEON.y0 + NEON.height).toBeLessThan(STORE.parapetTop + 0.4);
        expect(Math.abs(NEON.cx)).toBeLessThan(half);
        expect(Math.abs(NEON.cz)).toBeLessThan(half);
    });

    it('hangs the English neon on the right solid wall under the fascia band', () => {
        // 横式英文霓虹贴在右面后段实墙里（不压到玻璃段），在店招带下沿之下。
        expect(WALL_NEON.z0).toBeGreaterThanOrEqual(STORE.z0);
        expect(WALL_NEON.z1).toBeLessThanOrEqual(STORE.rightGlassEnd);
        expect(WALL_NEON.y1).toBeLessThanOrEqual(FASCIA.y0);
        expect(WALL_NEON.y0).toBeGreaterThan(LEVEL.lot);
        expect(WALL_NEON.z1).toBeGreaterThan(WALL_NEON.z0);
    });

    it('faces the English neon face out of the right wall', () => {
        const face = buildRecordstoreStore(materials, new THREE.Group()).wallNeonFace;
        // 面贴右墙外皮朝 +x（与右面玻璃、LED 字面同向），宽高就是实墙上留的那块。
        expect(face.rotationY).toBeCloseTo(Math.PI / 2, 5);
        expect(face.position.x).toBeCloseTo(STORE.x1 + 0.006, 5);
        expect(face.position.y).toBeCloseTo((WALL_NEON.y0 + WALL_NEON.y1) / 2, 5);
        expect(face.position.z).toBeCloseTo((WALL_NEON.z0 + WALL_NEON.z1) / 2, 5);
        expect(face.width).toBeCloseTo(WALL_NEON.z1 - WALL_NEON.z0, 5);
        expect(face.height).toBeCloseTo(WALL_NEON.y1 - WALL_NEON.y0, 5);
    });
});

describe('recordstore interior', () => {
    const insideStore = (x: number, z: number) =>
        x > STORE.x0 + STORE.wall - 0.05 && x < STORE.x1 - STORE.wall + 0.05 && z > STORE.z0 + STORE.wall - 0.05 && z < STORE.z1 - STORE.wall + 0.12;

    it('keeps the shelves, crates, cover wall, counter and listening corner inside the store', () => {
        const interior = buildRecordstoreInterior(materials, 42);
        interior.group.updateMatrixWorld(true);
        const offenders: string[] = [];
        interior.group.traverse(object => {
            if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
            const box = new THREE.Box3().setFromObject(object);
            const center = box.getCenter(new THREE.Vector3());
            if (!insideStore(center.x, center.z)) offenders.push(`${object.name || object.type}@(${center.x.toFixed(2)},${center.z.toFixed(2)})`);
        });
        expect(offenders).toEqual([]);
    });

    it('batches every record spine, crate record and cover into instanced meshes with matching color tables', () => {
        const interior = buildRecordstoreInterior(materials, 42);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        interior.productBatches.forEach(batch => {
            expect(batch.colorIndex).toHaveLength(batch.mesh.count);
            expect(batch.shade).toHaveLength(batch.mesh.count);
            for (let index = 0; index < batch.mesh.count; index += 1) {
                batch.mesh.getMatrixAt(index, matrix);
                position.setFromMatrixPosition(matrix);
                expect(insideStore(position.x, position.z), `${batch.mesh.name}#${index}`).toBe(true);
                expect(position.y).toBeGreaterThan(LEVEL.floor);
                expect(position.y).toBeLessThan(STORE.wallHeight);
            }
        });
        // 货架上是一整面唱片墙的规模，但只花三批实例。
        const spines = interior.productBatches.find(batch => batch.mesh.name === 'Spines')!;
        expect(spines.mesh.count).toBeGreaterThan(300);
        expect(interior.productBatches.length).toBe(3);
    });
});

describe('recordstore song props', () => {
    it('parks the seeded bicycles on the lot inside the base', () => {
        for (let index = 0; index < 40; index += 1) {
            const variation = resolveRecordstoreVariation(`song-${index}`);
            const props = buildRecordstoreSongProps(materials, variation);
            const bikes: THREE.Object3D[] = [];
            props.traverse(object => {
                if (object.name.startsWith('Bicycle')) bikes.push(object);
            });
            expect(bikes.length).toBe(variation.secondBike ? 2 : 1);
            const first = bikes[0]!;
            expect(first.position.x).toBeCloseTo(PROPS.bikeSlots[variation.bikeSlot].x, 5);
            expect(first.position.z).toBeCloseTo(PROPS.bikeSlots[variation.bikeSlot].z, 5);
            bikes.forEach(bike => {
                expect(Math.abs(bike.position.x)).toBeLessThan(BASE.half);
                expect(Math.abs(bike.position.z)).toBeLessThan(BASE.half);
                expect(bike.position.x).toBeLessThan(ROAD.inner);
                expect(bike.position.z).toBeLessThan(ROAD.inner);
            });
        }
    });
});
