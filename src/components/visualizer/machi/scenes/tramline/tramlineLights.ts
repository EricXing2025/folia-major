import * as THREE from 'three';
import type { MachiColorBlend, MachiMaterials } from '../../engine/materials';
import { LEVEL } from './layout';

// src/components/visualizer/machi/scenes/tramline/tramlineLights.ts
// 真实灯与光斑：茶餐厅里两盏暖光（吧台与卡座上方）、骑楼口一盏溢出的暖光把门口人行道照亮、
// 街角路灯一盏聚光打进轨道边的路面，天光月光在 engine/skyLights.ts。地上的光斑用加色贴片画：
// 灯下一片圆、店门口一片、站牌下一片，鼓点时轨道边再有一片会跳的光斑。灯少而主次分明——
// 歌词灯箱最亮，茶餐厅次之，路灯与站台是交通层。

/** 光斑贴图：柔边的圆。 */
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
            const falloff = Math.max(0, 1 - Math.hypot(u, v));
            const value = Math.round(255 * falloff * falloff);
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

export interface TramlineLightLevels {
    /** 店内暖光（beat.warm 的呼吸）。 */
    interior: number;
    /** 路灯与人造光的总体亮（look.artificial / streetLamps）。 */
    street: number;
    /** 地上的光斑（夜里亮、白天弱）。 */
    pools: number;
    /** 鼓点那一跳（beat.thump，轨道边光斑涨一下）。 */
    thump: number;
}

interface Pool {
    material: THREE.MeshBasicMaterial;
    key: 'cafeLight' | 'streetLight' | 'tramCabin';
    level: number;
    role: 'interior' | 'street' | 'cool';
}

export class TramlineLights {
    readonly group = new THREE.Group();
    private readonly interior: THREE.PointLight[];
    private readonly spill: THREE.PointLight;
    private readonly street: THREE.SpotLight;
    private readonly pools: Pool[] = [];
    private readonly thumpMaterial: THREE.MeshBasicMaterial;
    private levels: TramlineLightLevels = { interior: 1, street: 1, pools: 1, thump: 0 };
    private readonly poolTexture = createPoolTexture();
    private readonly geometries: THREE.BufferGeometry[] = [];

    constructor(private readonly blend: MachiColorBlend, materials: MachiMaterials, cafeLamps: THREE.Vector3[], lampHead: THREE.Vector3, doorAt: THREE.Vector3) {
        this.group.name = 'TramlineLights';
        const point = (intensity: number, distance: number, position: THREE.Vector3, name: string) => {
            const light = new THREE.PointLight(0xffffff, intensity, distance, 2);
            light.position.copy(position);
            light.name = name;
            return light;
        };
        this.interior = cafeLamps.map((position, index) => point(7, 6.5, position, `Lights/cafe${index}`));
        this.spill = point(4.5, 5.5, doorAt.clone().add(new THREE.Vector3(0, 1.6, 0.9)), 'Lights/spill');
        this.street = new THREE.SpotLight(0xffffff, 14, 9, 0.72, 0.6, 2);
        this.street.name = 'Lights/street';
        this.street.position.copy(lampHead);
        this.street.target.position.set(lampHead.x, 0, lampHead.z + 0.4);
        this.group.add(this.street.target);

        const poolAt = (key: Pool['key'], role: Pool['role'], x: number, z: number, radius: number, level: number, y?: number) => {
            const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2);
            this.geometries.push(geometry);
            const material = materials.track(new THREE.MeshBasicMaterial({ map: this.poolTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
            material.name = `machi:pool:${role}`;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, (y ?? LEVEL.lot) + 0.012, z);
            mesh.renderOrder = 1;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            this.pools.push({ material, key, level, role });
            this.group.add(mesh);
        };
        // 店门口一片暖光（骑楼口）、路灯下一片（打在轨道上）、站牌下一小片冷光。
        poolAt('cafeLight', 'interior', doorAt.x, -0.9, 1.7, 0.45);
        poolAt('cafeLight', 'interior', -4.2, -1.15, 1.4, 0.3);
        poolAt('streetLight', 'street', lampHead.x, lampHead.z + 0.4, 1.6, 0.34, LEVEL.road);
        poolAt('tramCabin', 'cool', -3.4, 0.95, 1.0, 0.26);
        // 鼓点光斑：轨道边、路灯下，thump 一跳它涨一圈。
        const thumpGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        this.geometries.push(thumpGeometry);
        this.thumpMaterial = materials.track(new THREE.MeshBasicMaterial({ map: this.poolTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.thumpMaterial.name = 'machi:pool:thump';
        const thump = new THREE.Mesh(thumpGeometry, this.thumpMaterial);
        thump.name = 'Lights/thumpPool';
        thump.position.set(lampHead.x - 0.4, LEVEL.road + 0.013, lampHead.z + 0.9);
        thump.renderOrder = 1;
        thump.castShadow = false;
        thump.receiveShadow = false;
        this.thump = thump;
        this.group.add(thump);
        this.group.add(...this.interior, this.spill, this.street);
        this.sync();
    }

    private readonly thump: THREE.Mesh;

    sync() {
        this.interior.forEach(light => light.color.copy(this.blend.get('interiorLight')));
        this.spill.color.copy(this.blend.get('cafeLight'));
        this.street.color.copy(this.blend.get('streetLight'));
        this.pools.forEach(pool => pool.material.color.copy(this.blend.get(pool.key)).multiplyScalar(pool.level));
        this.thumpMaterial.color.copy(this.blend.get('streetLight')).multiplyScalar(0.5);
    }

    /** 每帧把节拍与环境亮度写进灯与光斑。 */
    update(levels: TramlineLightLevels) {
        this.levels = levels;
        this.interior.forEach(light => { light.intensity = 7 * levels.interior * levels.street; });
        this.spill.intensity = 4.5 * levels.interior * levels.street;
        this.street.intensity = 10 * levels.street;
        this.pools.forEach((pool, index) => {
            const base = pool.role === 'interior' ? levels.interior : pool.role === 'cool' ? 1 : levels.street;
            pool.material.opacity = pool.level * levels.pools * (0.65 + 0.35 * base);
            pool.material.color.copy(this.blend.get(pool.key)).multiplyScalar(pool.level * (0.75 + 0.25 * base));
            void index;
        });
        const thump = levels.thump;
        const scale = 1.6 + 1.4 * thump;
        this.thump.scale.set(scale, 1, scale);
        this.thumpMaterial.opacity = 0.05 + 0.4 * thump * levels.pools;
    }

    dispose() {
        this.poolTexture.dispose();
        this.geometries.forEach(geometry => geometry.dispose());
    }
}
