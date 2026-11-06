import * as THREE from 'three';
import { DESK, LEVEL, SHELF, TEA } from './layout';
import type { MachiColorBlend, MachiMaterials } from '../../engine/materials';

// src/components/visualizer/machi/scenes/zhuying/zhuyingLights.ts
// 书房的灯：桌上一盏暖台灯、茶案旁一盏纸灯笼（两点暖光把屋里烘成琥珀色），显示器一点冷光吐在桌面上；
// 地上的光斑用加色贴片画（台灯下、灯笼旁、书架灯带下、显示器前一汪冷光）。天光与月光在 engine/skyLights.ts。

/** 光斑贴图：柔边的长条与圆。 */
const createPoolTexture = (round: boolean) => {
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
            const d = round ? Math.hypot(u, v) : Math.max(Math.abs(u) * 0.9, Math.abs(v));
            const falloff = Math.max(0, 1 - d);
            const bias = round ? 1 : 0.6 + 0.4 * (1 - (v + 1) / 2);
            const value = Math.round(255 * falloff * falloff * bias);
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

export interface ZhuyingLightLevels {
    /** 屋里的暖光（台灯、灯笼）：夜里随小节慢慢涨落。 */
    interior: number;
    /** 显示器的冷光：跟着屏面亮度。 */
    screen: number;
    /** 地上的光斑（白天被日光盖掉，干时跟鼓点跳）。 */
    pools: number;
}

export class ZhuyingLights {
    readonly group = new THREE.Group();
    private readonly interior: THREE.PointLight[];
    private readonly screenLight: THREE.PointLight;
    private readonly pools: THREE.Mesh[] = [];
    private readonly poolMaterials: { material: THREE.MeshBasicMaterial; key: 'interiorLight' | 'screenGlow'; level: number }[] = [];
    private levels: ZhuyingLightLevels = { interior: 1, screen: 1, pools: 1 };
    private readonly stripTexture = createPoolTexture(false);
    private readonly roundTexture = createPoolTexture(true);

    constructor(private readonly blend: MachiColorBlend, materials: MachiMaterials, lampApex: THREE.Vector3, lanternAt: THREE.Vector3) {
        this.group.name = 'ZhuyingLights';

        const point = (intensity: number, distance: number, position: THREE.Vector3, name: string) => {
            const light = new THREE.PointLight(0xffffff, intensity, distance, 2);
            light.position.copy(position);
            light.name = name;
            return light;
        };
        // 台灯的暖光与灯笼的暖光（各一档强度，夜里才全开）。
        this.interior = [
            point(6.5, 5.5, lampApex.clone().add(new THREE.Vector3(0, -0.06, 0)), 'Lights/lamp'),
            point(4.5, 5, lanternAt, 'Lights/lantern'),
        ];
        // 显示器的冷光：屏前一点，往桌面与人位吐。
        this.screenLight = point(2.4, 3.2, new THREE.Vector3(-0.55, 1.05, -3.45), 'Lights/screen');

        // 地上的光斑：台灯下一圈、灯笼旁一圈、书架下沿一条、显示器前的桌下一片冷光。
        const pool = (key: 'interiorLight' | 'screenGlow', level: number, size: [number, number], at: [number, number], round: boolean) => {
            const material = materials.track(new THREE.MeshBasicMaterial({
                color: 0xffffff,
                map: round ? this.roundTexture : this.stripTexture,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            const geometry = new THREE.PlaneGeometry(size[0], size[1]);
            geometry.rotateX(-Math.PI / 2);
            const result = new THREE.Mesh(geometry, material);
            result.position.set(at[0], LEVEL.floor + 0.006, at[1]);
            result.renderOrder = 1;
            result.name = `Pool/${key}`;
            this.pools.push(result);
            this.poolMaterials.push({ material, key, level });
            return result;
        };
        pool('interiorLight', 0.5, [1.5, 1.2], [-1.3, -3.25], true);
        pool('interiorLight', 0.45, [1.4, 1.3], [TEA.lantern.x, TEA.lantern.z], true);
        pool('interiorLight', 0.4, [0.5, SHELF.z1 - SHELF.z0 - 0.2], [(SHELF.x0 + SHELF.x1) / 2 + 0.25, (SHELF.z0 + SHELF.z1) / 2], false);
        pool('screenGlow', 0.4, [1.8, 1.0], [(DESK.x0 + DESK.x1) / 2, DESK.z1 + 0.35], false);

        this.group.add(...this.interior, this.screenLight, ...this.pools);
        this.sync();
    }

    setLevels(levels: ZhuyingLightLevels) {
        if (levels.interior === this.levels.interior && levels.screen === this.levels.screen && levels.pools === this.levels.pools) return;
        this.levels = levels;
        this.sync();
    }

    /** 颜色（插值后的）与亮度写回灯和光斑。 */
    sync() {
        const { interior, screen, pools } = this.levels;
        this.interior.forEach((light, index) => {
            light.color.copy(this.blend.get('interiorLight'));
            light.intensity = (index === 0 ? 6.5 : 4.5) * interior;
        });
        this.screenLight.color.copy(this.blend.get('screenGlow'));
        this.screenLight.intensity = 2.4 * screen;
        this.poolMaterials.forEach(({ material, key, level }) => {
            const scale = (key === 'screenGlow' ? screen : interior) * pools;
            material.color.copy(this.blend.get(key)).multiplyScalar(level * scale);
        });
    }

    dispose() {
        this.pools.forEach(pool => pool.geometry.dispose());
        this.stripTexture.dispose();
        this.roundTexture.dispose();
    }
}
