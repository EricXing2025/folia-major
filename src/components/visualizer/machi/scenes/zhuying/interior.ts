import * as THREE from 'three';
import { createVisualizerRng } from '../../../visualizerSeedHash';
import { boxAt, boxSpan, cylinderAt, group, mesh, tubeBetween } from '../../engine/geometry/shapes';
import type { MachiMaterials } from '../../engine/materials';
import { LEVEL, PLANT_SLOTS, ROOM, SHELF, TEA } from './layout';
import type { ZhuyingVariation } from './zhuyingSeed';

// src/components/visualizer/machi/scenes/zhuying/interior.ts
// 屋里的摆设：左墙的矮书架（两格书脊是实例，下沿一条暖光灯带）、前左的茶案一角（矮案、茶壶茶杯、冒的热气由
// 场景的 MachiSteam 补）、纸灯笼立灯、蒲团与地毯、吊顶带下的一盆吊植（垂藤与叶是实例）。书脊按歌变配色。

export interface ZhuyingProductBatch {
    mesh: THREE.InstancedMesh;
    colorIndex: number[];
    shade: number[];
}

export interface ZhuyingInteriorParts {
    group: THREE.Group;
    productBatches: ZhuyingProductBatch[];
    /** 茶壶嘴上冒热气的位置（场景的蒸汽用）。 */
    steamAt: THREE.Vector3;
    /** 纸灯笼的灯心（暖光点）。 */
    lanternAt: THREE.Vector3;
}

const BOOK_COLORS = 8;

export const buildZhuyingInterior = (materials: MachiMaterials, variation: ZhuyingVariation): ZhuyingInteriorParts => {
    const random = createVisualizerRng(`zhuying:shelf:${variation.shelfSeed}`);
    const parts: THREE.Object3D[] = [];
    const wood = materials.toon('woodDark');
    const woodMid = materials.toon('woodMid');

    // 矮书架：两侧板、两格层板、一个顶面，书脊一格一格排（缺几本、偶尔歪一本）。
    parts.push(
        boxSpan(wood, SHELF.x0, SHELF.x1, LEVEL.floor, SHELF.top, SHELF.z0, SHELF.z0 + 0.03, { radius: 0.006, name: 'Shelf/side' }),
        boxSpan(wood, SHELF.x0, SHELF.x1, LEVEL.floor, SHELF.top, SHELF.z1 - 0.03, SHELF.z1, { radius: 0.006, name: 'Shelf/side' }),
        boxSpan(wood, SHELF.x0, SHELF.x1, SHELF.top - 0.035, SHELF.top, SHELF.z0, SHELF.z1, { radius: 0.006, name: 'Shelf/top' }),
        boxSpan(woodMid, SHELF.x0 + 0.03, SHELF.x1 - 0.03, SHELF.mid - 0.03, SHELF.mid, SHELF.z0, SHELF.z1, { radius: 0.004, name: 'Shelf/board' }),
        boxSpan(woodMid, SHELF.x0 + 0.03, SHELF.x1 - 0.03, LEVEL.floor + 0.04, LEVEL.floor + 0.065, SHELF.z0, SHELF.z1, { radius: 0.004, name: 'Shelf/kick' }),
        // 背板薄薄一片贴上墙。
        boxSpan(woodMid, SHELF.x0 + 0.005, SHELF.x0 + 0.03, LEVEL.floor, SHELF.top, SHELF.z0 + 0.03, SHELF.z1 - 0.03, { radius: 0.002, name: 'Shelf/back' }),
        // 下沿的暖光灯带（一格一格的光吐在地板上）。
        boxSpan(materials.glow('shelfStrip'), SHELF.x0 + 0.06, SHELF.x1 - 0.02, LEVEL.floor + 0.075, LEVEL.floor + 0.095, SHELF.z0 + 0.04, SHELF.z1 - 0.04, { radius: 0.004, name: 'Shelf/strip' }),
    );

    // 书脊：两格各一排实例，seed 定高低、配色与缺位。
    const spines: { x: number; y: number; z: number; w: number; h: number; lean: number }[] = [];
    const spineRows = [LEVEL.floor + 0.065, SHELF.mid];
    spineRows.forEach((rowY, row) => {
        const rowTop = row === 0 ? SHELF.mid - 0.03 : SHELF.top - 0.035;
        let z = SHELF.z0 + 0.09;
        while (z < SHELF.z1 - 0.1) {
            if (random() < 0.1) {
                z += 0.05 + random() * 0.1;
                continue;
            }
            const w = 0.022 + random() * 0.028;
            const h = Math.min(rowTop - rowY - 0.02, 0.2 + random() * 0.16);
            spines.push({ x: SHELF.x0 + 0.11 + random() * 0.05, y: rowY, z: z + w / 2, w, h, lean: random() < 0.06 ? (random() - 0.5) * 0.25 : 0 });
            z += w + 0.004 + random() * 0.012;
        }
    });
    const spineGeometry = new THREE.BoxGeometry(0.2, 1, 1);
    const spineMesh = new THREE.InstancedMesh(spineGeometry, materials.product, spines.length);
    spineMesh.name = 'Spines';
    spineMesh.castShadow = false;
    spineMesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const euler = new THREE.Euler();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const colorIndex: number[] = [];
    const shade: number[] = [];
    spines.forEach((spine, index) => {
        euler.set(0, 0, spine.lean);
        quaternion.setFromEuler(euler);
        scale.set(1, spine.h, spine.w);
        matrix.compose(new THREE.Vector3(spine.x, spine.y + spine.h / 2, spine.z), quaternion, scale);
        spineMesh.setMatrixAt(index, matrix);
        colorIndex.push(Math.floor(random() * BOOK_COLORS));
        shade.push(0.55 + random() * 0.45);
    });
    parts.push(spineMesh);
    // 顶面再摞两本平放的书与一个小盆栽。
    parts.push(
        boxAt(materials.product, [0.2, 0.03, 0.14], [SHELF.x0 + 0.16, SHELF.top, SHELF.z0 + 0.4], { name: 'Book/flat', radius: 0.004 }),
        boxAt(materials.product, [0.16, 0.025, 0.12], [SHELF.x0 + 0.18, SHELF.top + 0.03, SHELF.z0 + 0.42], { name: 'Book/flat', radius: 0.004 }),
        cylinderAt(woodMid, 0.05, 0.07, [SHELF.x0 + 0.16, SHELF.top, SHELF.z1 - 0.3], { name: 'Pot', segments: 10 }),
        cylinderAt(materials.toon('plant'), 0.06, 0.05, [SHELF.x0 + 0.16, SHELF.top + 0.07, SHELF.z1 - 0.3], { name: 'Pot/plant', segments: 8, radiusTop: 0.02 }),
    );

    // 茶案一角：圆矮案四条小足，案上一把茶壶两只杯；旁边一盏纸灯笼立灯、一个蒲团，底下一张地毯。
    const rug = boxAt(materials.toon('rug'), [TEA.rug.width, 0.012, TEA.rug.depth], [TEA.rug.x, LEVEL.floor + 0.002, TEA.rug.z], { name: 'Rug', radius: 0.05 });
    parts.push(rug);
    const table = TEA.table;
    parts.push(
        cylinderAt(wood, table.radius, 0.035, [table.x, table.top - 0.035, table.z], { name: 'Tea/table', segments: 20 }),
    );
    for (let index = 0; index < 4; index += 1) {
        const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
        parts.push(cylinderAt(wood, 0.022, table.top - 0.035 - LEVEL.floor - 0.012, [table.x + Math.cos(angle) * table.radius * 0.72, LEVEL.floor + 0.012, table.z + Math.sin(angle) * table.radius * 0.72], { name: 'Tea/leg', segments: 8 }));
    }
    // 茶壶与两只杯。
    parts.push(
        cylinderAt(materials.toon('teapot'), 0.075, 0.09, [table.x - 0.08, table.top, table.z - 0.05], { name: 'Teapot', segments: 14, radiusTop: 0.05 }),
        cylinderAt(materials.toon('teapot'), 0.024, 0.03, [table.x - 0.08, table.top + 0.09, table.z - 0.05], { name: 'Teapot/lid', segments: 10 }),
        tubeBetween(materials.toon('teapot'), new THREE.Vector3(table.x - 0.14, table.top + 0.05, table.z - 0.08), new THREE.Vector3(table.x - 0.2, table.top + 0.09, table.z - 0.11), 0.012, { name: 'Teapot/spout', segments: 8 }),
        cylinderAt(materials.toon('teacup'), 0.028, 0.045, [table.x + 0.1, table.top, table.z + 0.06], { name: 'Cup', segments: 10 }),
        cylinderAt(materials.toon('teacup'), 0.028, 0.045, [table.x + 0.16, table.top, table.z - 0.04], { name: 'Cup', segments: 10 }),
    );

    // 纸灯笼立灯：细杆上一个纸罩（圆的或长的按歌变），罩里一团暖光。
    const lantern = TEA.lantern;
    const lanternAt = new THREE.Vector3(lantern.x, LEVEL.floor + lantern.height * 0.62, lantern.z);
    const shadeHeight = variation.lanternStyle === 0 ? 0.26 : 0.4;
    const shadeRadius = variation.lanternStyle === 0 ? 0.15 : 0.11;
    parts.push(
        cylinderAt(wood, 0.05, 0.02, [lantern.x, LEVEL.floor, lantern.z], { name: 'Lantern/base', segments: 10 }),
        cylinderAt(wood, 0.012, lantern.height - shadeHeight - 0.02, [lantern.x, LEVEL.floor + 0.02, lantern.z], { name: 'Lantern/pole', segments: 6 }),
        cylinderAt(materials.glow('lantern'), shadeRadius, shadeHeight, [lantern.x, lanternAt.y - shadeHeight / 2, lantern.z], { name: 'Lantern/shade', segments: 14, radiusTop: shadeRadius * 0.72 }),
        cylinderAt(wood, shadeRadius * 0.2, 0.015, [lantern.x, lanternAt.y + shadeHeight / 2, lantern.z], { name: 'Lantern/cap', segments: 8 }),
    );

    // 蒲团：一只扁圆的草垫。
    parts.push(
        cylinderAt(materials.toon('cushion'), TEA.cushion.radius, 0.09, [TEA.cushion.x, LEVEL.floor + 0.012, TEA.cushion.z], { name: 'Cushion', segments: 18, radiusTop: TEA.cushion.radius * 0.82 }),
        cylinderAt(woodMid, TEA.cushion.radius * 0.3, 0.015, [TEA.cushion.x, LEVEL.floor + 0.1, TEA.cushion.z], { name: 'Cushion/knot', segments: 10 }),
    );

    // 吊盆：吊顶带下一根绳、一只小盆、几股垂藤与叶片（实例）。
    const plant = PLANT_SLOTS[variation.plantSlot];
    const potY = 2.42;
    parts.push(
        tubeBetween(wood, new THREE.Vector3(plant.x, ROOM.wallHeight - 0.14, plant.z), new THREE.Vector3(plant.x, potY + 0.09, plant.z), 0.008, { name: 'Plant/rope', segments: 6 }),
        cylinderAt(woodMid, 0.09, 0.1, [plant.x, potY - 0.02, plant.z], { name: 'Plant/pot', segments: 12, radiusTop: 0.075 }),
    );
    const leafGeometry = new THREE.PlaneGeometry(0.05, 0.09);
    const leafCount = 22;
    const leaves = new THREE.InstancedMesh(leafGeometry, materials.toon('plant'), leafCount);
    leaves.name = 'Plant/leaves';
    leaves.castShadow = false;
    const leafRandom = createVisualizerRng(`zhuying:plant:${variation.shelfSeed}`);
    for (let index = 0; index < leafCount; index += 1) {
        const strand = index % 5;
        const strandX = plant.x + Math.cos((strand / 5) * Math.PI * 2) * 0.07;
        const strandZ = plant.z + Math.sin((strand / 5) * Math.PI * 2) * 0.07;
        const drop = 0.06 + (index % 4) * 0.1 + leafRandom() * 0.06;
        euler.set(0, leafRandom() * Math.PI * 2, (leafRandom() - 0.5) * 0.5);
        quaternion.setFromEuler(euler);
        matrix.compose(new THREE.Vector3(strandX, potY - drop, strandZ), quaternion, scale.set(0.8 + leafRandom() * 0.5, 0.8 + leafRandom() * 0.5, 1));
        leaves.setMatrixAt(index, matrix);
    }
    parts.push(leaves);

    return {
        group: group('Interior', ...parts),
        productBatches: [{ mesh: spineMesh, colorIndex, shade }],
        steamAt: new THREE.Vector3(table.x - 0.18, table.top + 0.1, table.z - 0.1),
        lanternAt,
    };
};
