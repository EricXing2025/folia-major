import * as THREE from 'three';
import { LEVEL, PALACE_LAMPS, STALLS, STAIR, CHAMFER_CENTER, PAGODA } from './layout';
import { TERRACE_TOP } from './terrace';
import type { MachiColorBlend, MachiMaterials } from '../../engine/materials';

// src/components/visualizer/machi/scenes/changan/changanLights.ts
// 长安夜市的灯：大雁塔下两盏暖金泛光（青石塔身从下往上被照亮，高处自然暗下去——夜里的大雁塔就是这样）、
// 两盏宫灯与食摊的琥珀点光把广场照亮；地上的光斑用加色贴片画，不用投影光（天光与月光在 engine/skyLights.ts）。

/** 柔边圆光斑贴图（地面上的灯笼光池）。 */
const createPoolTexture = () => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const u = (x + 0.5) / size * 2 - 1;
            const v = (y + 0.5) / size * 2 - 1;
            const d = Math.hypot(u, v);
            const value = Math.round(255 * Math.max(0, 1 - d) ** 1.7);
            const index = (y * size + x) * 4;
            image.data[index] = value;
            image.data[index + 1] = value;
            image.data[index + 2] = value;
            image.data[index + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
};

export interface ChanganLightLevels {
    /** 宫灯、食摊与灯串的琥珀光（副歌加亮、夜里才亮）。 */
    lanterns: number;
    /** 大雁塔的暖金泛光。 */
    pagoda: number;
    /** 地上的光斑（白天被日光盖掉）。 */
    pools: number;
}

export class ChanganLights {
    readonly group = new THREE.Group();
    private readonly pagodaLights: THREE.PointLight[];
    private readonly lanternLights: THREE.PointLight[];
    private readonly pools: THREE.Mesh[] = [];
    private readonly poolMaterials: { material: THREE.MeshBasicMaterial; key: 'lanternAmber' | 'pagodaGold' | 'spillLight'; level: number; group: 'lanterns' | 'pagoda' }[] = [];
    private levels: ChanganLightLevels = { lanterns: 1, pagoda: 1, pools: 1 };
    private readonly poolTexture = createPoolTexture();

    constructor(private readonly blend: MachiColorBlend, materials: MachiMaterials, lampHeads: THREE.Vector3[]) {
        this.group.name = 'ChanganLights';

        const point = (intensity: number, distance: number, position: [number, number, number], name: string) => {
            const light = new THREE.PointLight(0xffffff, intensity, distance, 2);
            light.position.set(...position);
            light.name = name;
            return light;
        };
        // 塔前左右两盏泛光，贴着台基往塔身打。
        this.pagodaLights = [
            point(8, 8.5, [PAGODA.cx - 1.9, TERRACE_TOP + 0.3, PAGODA.cz + 2.2], 'Lights/pagoda0'),
            point(8, 8.5, [PAGODA.cx + 1.9, TERRACE_TOP + 0.3, PAGODA.cz + 2.2], 'Lights/pagoda1'),
            // 塔身后一盏弱的，把塔从城墙剪影里托出来。
            point(4, 7, [PAGODA.cx, TERRACE_TOP + 1.6, PAGODA.cz - 2.0], 'Lights/pagodaBack'),
        ];
        // 两盏宫灯各一点光 + 食摊上方一点暖光 + 台阶口一点。
        this.lanternLights = [
            ...lampHeads.map((head, index) => point(4, 5.5, [head.x, head.y - 0.1, head.z], `Lights/lamp${index}`)),
            point(4.5, 6, [STALLS[0]!.x - 0.3, 2.1, STALLS[0]!.z], 'Lights/stall'),
            point(2.6, 4.5, [CHAMFER_CENTER.x + Math.sin(STAIR.yaw) * 0.9, 1.4, CHAMFER_CENTER.z + Math.cos(STAIR.yaw) * 0.9], 'Lights/stair'),
        ];

        // 地上的光斑：两盏宫灯下、食摊前、台阶口、中景摊前各一圈。
        const pool = (key: 'lanternAmber' | 'pagodaGold' | 'spillLight', level: number, size: number, at: [number, number], group2: 'lanterns' | 'pagoda') => {
            const material = materials.track(new THREE.MeshBasicMaterial({
                color: 0xffffff,
                map: this.poolTexture,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            const geometry = new THREE.PlaneGeometry(size, size);
            geometry.rotateX(-Math.PI / 2);
            const result = new THREE.Mesh(geometry, material);
            result.position.set(at[0], LEVEL.lot + 0.007, at[1]);
            result.renderOrder = 1;
            result.name = `Pool/${key}`;
            this.pools.push(result);
            this.poolMaterials.push({ material, key, level, group: group2 });
            return result;
        };
        const stairFoot = {
            x: CHAMFER_CENTER.x + Math.sin(STAIR.yaw) * (STAIR.run + 0.4),
            z: CHAMFER_CENTER.z + Math.cos(STAIR.yaw) * (STAIR.run + 0.4),
        };
        const pools = [
            pool('lanternAmber', 0.5, 3.0, [PALACE_LAMPS[0]!.x, PALACE_LAMPS[0]!.z], 'lanterns'),
            pool('lanternAmber', 0.5, 3.0, [PALACE_LAMPS[1]!.x, PALACE_LAMPS[1]!.z], 'lanterns'),
            pool('spillLight', 0.4, 2.6, [STALLS[0]!.x - 0.4, STALLS[0]!.z + 0.2], 'lanterns'),
            pool('spillLight', 0.36, 2.4, [STALLS[2]!.x + 0.2, STALLS[2]!.z + 0.1], 'lanterns'),
            pool('pagodaGold', 0.5, 2.8, [stairFoot.x, stairFoot.z], 'pagoda'),
        ];
        this.group.add(...this.pagodaLights, ...this.lanternLights, ...pools);
        this.sync();
    }

    setLevels(levels: ChanganLightLevels) {
        if (levels.lanterns === this.levels.lanterns && levels.pagoda === this.levels.pagoda && levels.pools === this.levels.pools) return;
        this.levels = levels;
        this.sync();
    }

    /** 颜色（插值后的）与亮度写回灯和光斑。 */
    sync() {
        const { lanterns, pagoda, pools } = this.levels;
        this.pagodaLights.forEach((light, index) => {
            light.color.copy(this.blend.get('pagodaGold'));
            light.intensity = (index === 2 ? 4 : 8) * pagoda;
        });
        this.lanternLights.forEach((light, index) => {
            light.color.copy(this.blend.get(index < 2 ? 'lanternAmber' : 'interiorLight'));
            light.intensity = (index === 2 ? 4.5 : index === 3 ? 2.6 : 4) * lanterns;
        });
        this.poolMaterials.forEach(({ material, key, level, group }) => {
            const scale = (group === 'pagoda' ? pagoda : lanterns) * pools;
            material.color.copy(this.blend.get(key)).multiplyScalar(level * scale);
        });
    }

    dispose() {
        this.pools.forEach(pool => pool.geometry.dispose());
        this.poolTexture.dispose();
    }
}
