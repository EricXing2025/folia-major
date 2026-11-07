import * as THREE from 'three';
import { CHANGAN_VIEW, LEVEL, LYRIC_HOUSE, PALACE_LAMPS, PAGODA, PAIFANG, STALLS } from './layout';
import { TERRACE_TOP } from './terrace';
import type { MachiColorBlend, MachiMaterials } from '../../engine/materials';

// src/components/visualizer/machi/scenes/changan/changanLights.ts
// 长安夜市的灯：大雁塔下两盏暖金泛光（青砖塔身从下往上被照亮，高处自然暗下去）、三盏宫灯与两列
// 食摊的琥珀点光把广场照亮、市楼楼面一盏提亮歌词屏；地上的圆形光斑与拉长的彩色倒影 streak 都用
// 加色贴片画，不用投影光（天光与月光在 engine/skyLights.ts）。streak 的长轴朝默认镜头方向——
// 湿地反光总是朝观察者脚下拉长，这是整张效果图的标志。

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

/** 拉长光带贴图：纵向从亮到灭（光源在贴图上端），横向软边。 */
const createStreakTexture = () => {
    const width = 64;
    const height = 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const u = (x + 0.5) / width * 2 - 1;
            const v = 1 - (y + 0.5) / height;
            const across = Math.max(0, 1 - u * u) ** 1.4;
            const along = v ** 1.9;
            const value = Math.round(255 * Math.min(1, across * along * 1.35));
            const index = (y * width + x) * 4;
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

type PoolKey = 'lanternAmber' | 'pagodaGold' | 'spillLight' | 'eqColor' | 'paifangRed';

export interface ChanganLightLevels {
    /** 宫灯、食摊与灯串的琥珀光（副歌加亮、夜里才亮）。 */
    lanterns: number;
    /** 大雁塔的暖金泛光。 */
    pagoda: number;
    /** 地上的光斑与倒影 streak（白天被日光盖掉）。 */
    pools: number;
}

export class ChanganLights {
    readonly group = new THREE.Group();
    private readonly pagodaLights: THREE.PointLight[];
    private readonly lanternLights: THREE.PointLight[];
    private readonly pools: THREE.Mesh[] = [];
    private readonly poolMaterials: { material: THREE.MeshBasicMaterial; key: PoolKey; level: number; group: 'lanterns' | 'pagoda' }[] = [];
    private levels: ChanganLightLevels = { lanterns: 1, pagoda: 1, pools: 1 };
    private readonly poolTexture = createPoolTexture();
    private readonly streakTexture = createStreakTexture();

    constructor(private readonly blend: MachiColorBlend, materials: MachiMaterials, lampHeads: THREE.Vector3[]) {
        this.group.name = 'ChanganLights';

        const point = (intensity: number, distance: number, position: [number, number, number], name: string) => {
            const light = new THREE.PointLight(0xffffff, intensity, distance, 2);
            light.position.set(...position);
            light.name = name;
            return light;
        };
        // 塔前左右两盏泛光，贴着矮台往塔身打；塔身后一盏弱的，把塔从屋脊带剪影里托出来。
        this.pagodaLights = [
            point(6, 6, [PAGODA.cx - 0.9, TERRACE_TOP + 0.15, PAGODA.cz + 1.1], 'Lights/pagoda0'),
            point(6, 6, [PAGODA.cx + 0.9, TERRACE_TOP + 0.15, PAGODA.cz + 1.1], 'Lights/pagoda1'),
            point(3, 5, [PAGODA.cx, TERRACE_TOP + 1.2, PAGODA.cz - 1.1], 'Lights/pagodaBack'),
        ];
        // 三盏宫灯各一点光 + 中景伞棚上一点暖光 + 右列食摊上方一点 + 市楼楼面一盏（提亮歌词屏）。
        this.lanternLights = [
            ...lampHeads.map((head, index) => point(4, 5.5, [head.x, head.y - 0.1, head.z], `Lights/lamp${index}`)),
            point(4.5, 6, [STALLS[5]!.x, 2.0, STALLS[5]!.z + 0.3], 'Lights/stall'),
            point(3.2, 5.5, [STALLS[1]!.x, 2.2, STALLS[1]!.z + 0.5], 'Lights/stallRow'),
            point(3.4, 5, [LYRIC_HOUSE.cx + 0.4, 2.0, LYRIC_HOUSE.cz + 1.0], 'Lights/house'),
        ];

        // 圆形光斑：宫灯下、食摊前、矮台前缘各一圈。
        const pool = (key: PoolKey, level: number, size: number, at: [number, number], group2: 'lanterns' | 'pagoda') => {
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
        // 拉长的倒影 streak：湿石板把灯的颜色朝镜头脚下拖一条。长轴与默认镜头方位角一致。
        const streakYaw = CHANGAN_VIEW.azimuth;
        const streak = (key: PoolKey, level: number, width: number, length: number, at: [number, number], group2: 'lanterns' | 'pagoda') => {
            const material = materials.track(new THREE.MeshBasicMaterial({
                color: 0xffffff,
                map: this.streakTexture,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            const geometry = new THREE.PlaneGeometry(width, length);
            geometry.rotateX(-Math.PI / 2);
            geometry.rotateY(streakYaw);
            // 贴图上端（最亮）对着光源，中心往镜头方向挪半个身位。
            const offset = length * 0.42;
            const result = new THREE.Mesh(geometry, material);
            result.position.set(at[0] + Math.sin(streakYaw) * offset, LEVEL.lot + 0.005, at[1] + Math.cos(streakYaw) * offset);
            result.renderOrder = 1;
            result.name = `Streak/${key}`;
            this.pools.push(result);
            this.poolMaterials.push({ material, key, level, group: group2 });
            return result;
        };
        const pools = [
            pool('lanternAmber', 0.5, 3.0, [PALACE_LAMPS[0]!.x, PALACE_LAMPS[0]!.z], 'lanterns'),
            pool('lanternAmber', 0.5, 3.0, [PALACE_LAMPS[1]!.x, PALACE_LAMPS[1]!.z], 'lanterns'),
            pool('lanternAmber', 0.45, 2.6, [PALACE_LAMPS[2]!.x, PALACE_LAMPS[2]!.z], 'lanterns'),
            pool('spillLight', 0.4, 2.4, [STALLS[5]!.x, STALLS[5]!.z + 0.2], 'lanterns'),
            pool('pagodaGold', 0.4, 2.2, [PAGODA.cx, PAGODA.cz + 1.6], 'pagoda'),
        ];
        const streaks = [
            // 牌坊两柱与匾下：朱红与琥珀各拖一条。
            streak('paifangRed', 0.34, 1.1, 2.6, [PAIFANG.cx - 0.7, PAIFANG.cz + 0.5], 'lanterns'),
            streak('lanternAmber', 0.4, 1.3, 3.0, [PAIFANG.cx + 0.6, PAIFANG.cz + 0.6], 'lanterns'),
            // 三盏宫灯下各一条长琥珀。
            streak('lanternAmber', 0.5, 1.0, 3.4, [PALACE_LAMPS[0]!.x, PALACE_LAMPS[0]!.z], 'lanterns'),
            streak('lanternAmber', 0.5, 1.0, 3.4, [PALACE_LAMPS[1]!.x, PALACE_LAMPS[1]!.z], 'lanterns'),
            streak('lanternAmber', 0.45, 0.9, 2.8, [PALACE_LAMPS[2]!.x, PALACE_LAMPS[2]!.z], 'lanterns'),
            // 右列与左列食摊前、伞棚前的暖光。
            streak('spillLight', 0.42, 1.2, 2.6, [STALLS[0]!.x - 0.4, STALLS[0]!.z + 0.4], 'lanterns'),
            streak('spillLight', 0.38, 1.0, 2.2, [STALLS[1]!.x - 0.3, STALLS[1]!.z + 0.5], 'lanterns'),
            streak('spillLight', 0.36, 0.9, 2.0, [STALLS[3]!.x + 0.5, STALLS[3]!.z + 0.4], 'lanterns'),
            streak('spillLight', 0.4, 1.1, 2.4, [STALLS[5]!.x, STALLS[5]!.z + 0.5], 'lanterns'),
            // 歌词屏的粉金泛光与塔下的金。
            streak('eqColor', 0.34, 1.6, 2.4, [LYRIC_HOUSE.cx - 0.3, LYRIC_HOUSE.cz + 0.9], 'lanterns'),
            streak('pagodaGold', 0.42, 1.2, 2.2, [PAGODA.cx, PAGODA.cz + 1.3], 'pagoda'),
        ];
        this.group.add(...this.pagodaLights, ...this.lanternLights, ...pools, ...streaks);
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
            light.intensity = (index === 2 ? 3 : 6) * pagoda;
        });
        this.lanternLights.forEach((light, index) => {
            light.color.copy(this.blend.get(index < 3 ? 'lanternAmber' : 'interiorLight'));
            light.intensity = (index < 3 ? 4 : index === 3 ? 4.5 : index === 4 ? 3.2 : 3.4) * lanterns;
        });
        this.poolMaterials.forEach(({ material, key, level, group }) => {
            const scale = (group === 'pagoda' ? pagoda : lanterns) * pools;
            material.color.copy(this.blend.get(key)).multiplyScalar(level * scale);
        });
    }

    dispose() {
        this.pools.forEach(pool => pool.geometry.dispose());
        this.poolTexture.dispose();
        this.streakTexture.dispose();
    }
}
