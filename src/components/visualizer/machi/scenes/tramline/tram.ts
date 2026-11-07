import * as THREE from 'three';
import { boxAt, cylinderAt, group, mesh, roundedBox, tubeBetween } from '../../engine/geometry/shapes';
import { createBaseClippingPlanes, createSoftEllipseTexture, clipToBase } from '../../engine/actors/traffic';
import { MACHI_REFLECT_LAYER } from '../../engine/fx/reflection';
import { MACHI_BASE } from '../../engine/geometry/plinth';
import type { MachiColorBlend, MachiMaterials } from '../../engine/materials';
import { MACHI_GLOSS } from '../../engine/sheen';
import { TRACK, TRAM } from './layout';
import type { TramlineVariation } from './tramlineSeed';

// src/components/visualizer/machi/scenes/tramline/tram.ts
// 双层香港电车（叮叮）：长车身沿 x、车头朝 +x（靠左行驶，内侧轨往 +x）。深绿车身、奶油窗带、圆车顶、
// 前后挡风玻璃与目的地箱、转向架与车轮、向后仰的受电杆。车从底座边缘“开出来”：全部材质带底座裁切面
// （clipToBase，与 traffic 共用），脚下软影代替投影，前灯光斑与灯件进倒影图层。位置按氛围时间循环，
// 暂停时定住不动；涂装色走调色板键，syncColors 时同步。

const WHEEL_RADIUS = 0.17;

export class MachiTram {
    readonly group = new THREE.Group();
    /** 车侧广告牌的挂点（朝 +z）：signs 把画好的广告面挂进来。 */
    readonly adAnchor = new THREE.Group();
    /** 车头目的地箱的挂点（朝 +x）。 */
    readonly destAnchor = new THREE.Group();
    private readonly body: THREE.MeshToonMaterial;
    private readonly band: THREE.MeshToonMaterial;
    private readonly roof: THREE.MeshToonMaterial;
    private readonly accent: THREE.MeshToonMaterial;
    private readonly headlight: THREE.MeshBasicMaterial;
    private readonly taillight: THREE.MeshBasicMaterial;
    private readonly pool: THREE.MeshBasicMaterial;
    private readonly wheels: THREE.Mesh[] = [];
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly textures: THREE.Texture[] = [];
    private lastX = 0;

    constructor(materials: MachiMaterials, private readonly blend: MachiColorBlend, variation: TramlineVariation) {
        this.group.name = 'Tram';
        const clipping = createBaseClippingPlanes(MACHI_BASE.half);
        const clip = <T extends THREE.Material>(material: T) => materials.track(clipToBase(material, clipping));
        this.body = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient }), MACHI_GLOSS.paint));
        this.band = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient }), MACHI_GLOSS.paint));
        this.roof = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient })));
        this.accent = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient }), MACHI_GLOSS.chrome));
        const glass = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient }), MACHI_GLOSS.glass));
        const rubber = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient })));
        glass.color.set('#141c22');
        rubber.color.set('#17191d');
        // 车内暖光、前灯、尾灯：用 glow role 但整件都要裁切（这些 role 只给车用）。
        const cabinGlow = clip(materials.glow('tramCabin'));
        this.headlight = clip(materials.glow('tramHead'));
        this.taillight = clip(materials.glow('tramTail'));

        const L = TRAM.length / 2;
        const W = TRAM.width / 2;
        const parts: THREE.Object3D[] = [];
        // 转向架与底盘裙板：两条深灰，轮子露一个边。
        [-1.05, 1.05].forEach(x => {
            parts.push(boxAt(rubber, [1.25, 0.4, 1.1], [x, 0.3, 0], { radius: 0.05, name: 'Bogie' }));
        });
        parts.push(boxAt(rubber, [TRAM.length - 0.24, 0.34, 1.06], [0, 0.32, 0], { radius: 0.05, name: 'Chassis' }));
        const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.13, 14);
        wheelGeometry.rotateX(Math.PI / 2);
        this.geometries.push(wheelGeometry);
        [-1.35, -0.75, 0.75, 1.35].forEach(x => {
            [-0.6, 0.6].forEach(z => {
                const wheel = mesh(wheelGeometry, rubber, { name: 'Wheel' });
                wheel.position.set(x, TRAM.wheelY, z);
                this.wheels.push(wheel);
                parts.push(wheel);
            });
        });
        // 车身：下层壳、两层之间的奶油腰板（车侧广告就贴这）、上层、圆车顶与屋脊小通风脊。
        parts.push(boxAt(this.body, [TRAM.length, TRAM.lowerTop - TRAM.chassisTop, TRAM.width], [0, TRAM.chassisTop, 0], { radius: 0.07, name: 'Body/lower' }));
        parts.push(boxAt(this.band, [TRAM.length, TRAM.bandTop - TRAM.lowerTop, TRAM.width + 0.01], [0, TRAM.lowerTop, 0], { radius: 0.04, name: 'Body/band' }));
        parts.push(boxAt(this.body, [TRAM.length, TRAM.upperTop - TRAM.bandTop, TRAM.width], [0, TRAM.bandTop, 0], { radius: 0.07, name: 'Body/upper' }));
        parts.push(boxAt(this.roof, [TRAM.length - 0.12, TRAM.roofY - TRAM.upperTop, TRAM.width - 0.06], [0, TRAM.upperTop, 0], { radius: 0.11, name: 'Roof' }));
        parts.push(boxAt(this.roof, [TRAM.length - 0.9, 0.05, 0.3], [0, TRAM.roofY, 0], { radius: 0.02, name: 'Roof/ridge' }));

        // 窗：两层各一条深色玻璃带加绿色窗框立柱（一批实例），上层留几扇亮着车厢暖光。
        const winBand = (y0: number, y1: number, name: string) => {
            const h = y1 - y0;
            [1, -1].forEach(side => {
                parts.push(boxAt(glass, [TRAM.length - 0.5, h, 0.04], [0, y0, side * (W - 0.02)], { radius: 0.01, name }));
            });
            [1, -1].forEach(end => {
                parts.push(boxAt(glass, [0.04, h, TRAM.width - 0.42], [end * (L - 0.23), y0, 0], { radius: 0.01, name }));
            });
        };
        winBand(0.98, 1.58, 'Win/lower');
        winBand(2.06, 2.52, 'Win/upper');
        const mullionGeometry = new THREE.BoxGeometry(0.06, 1, 0.05);
        const mullions = new THREE.InstancedMesh(mullionGeometry, this.body, 24);
        mullions.name = 'Mullions';
        this.geometries.push(mullionGeometry);
        const matrix = new THREE.Matrix4();
        let index = 0;
        [0.98, 2.06].forEach(y0 => {
            const h = (y0 === 0.98 ? 1.58 : 2.52) - y0;
            [0.645, -0.645].forEach(z => {
                for (let k = 0; k < 6; k += 1) {
                    matrix.makeScale(1, h + 0.06, 1);
                    matrix.setPosition(-L + 0.45 + k * 0.58, y0 - 0.03, z);
                    mullions.setMatrixAt(index, matrix);
                    index += 1;
                }
            });
        });
        parts.push(mullions);
        // 车厢灯：上层朝 +z 三扇亮窗（夜里看得到的暖光），进倒影图层。
        [-1.0, 0.0, 1.0].forEach(x => {
            const lit = mesh(new THREE.PlaneGeometry(0.44, 0.42), cabinGlow, { name: 'Win/lit', castShadow: false, receiveShadow: false });
            lit.position.set(x, 2.06 + 0.23, W + 0.008);
            lit.layers.enable(MACHI_REFLECT_LAYER);
            parts.push(lit);
        });
        [-0.55].forEach(x => {
            const lit = mesh(new THREE.PlaneGeometry(0.5, 0.5), cabinGlow, { name: 'Win/lit', castShadow: false, receiveShadow: false });
            lit.position.set(x, 1.28, W + 0.008);
            lit.layers.enable(MACHI_REFLECT_LAYER);
            parts.push(lit);
        });

        // 车头车尾（双层车两端同款）：目的地箱位留给 signs、底部中间的圆形头灯 / 一对红色尾灯、登车梯口。
        [1, -1].forEach(end => {
            parts.push(boxAt(this.band, [0.1, 0.3, 0.66], [end * (L + 0.01), 2.3, 0], { radius: 0.02, name: 'End/destBox' }));
            parts.push(boxAt(this.accent, [0.06, 0.1, TRAM.width - 0.1], [end * (L + 0.01), 0.62, 0], { radius: 0.01, name: 'End/bumper' }));
            const lamp = end > 0 ? this.headlight : this.taillight;
            const count = end > 0 ? 1 : 2;
            for (let k = 0; k < count; k += 1) {
                const light = mesh(new THREE.SphereGeometry(end > 0 ? 0.09 : 0.055, 10, 8), lamp, { name: end > 0 ? 'Headlight' : 'Taillight', castShadow: false, receiveShadow: false });
                light.position.set(end * (L + 0.04), end > 0 ? 0.78 : 0.82, count === 1 ? 0 : (k === 0 ? -0.42 : 0.42));
                light.layers.enable(MACHI_REFLECT_LAYER);
                parts.push(light);
            }
        });
        // 车门（靠站台一侧，-z）：前、后两扇，玻璃门带门槛。
        [[0.95, 'Front'], [-1.15, 'Rear']].forEach(([x, name]) => {
            parts.push(boxAt(this.accent, [0.62, 1.3, 0.05], [x as number, 0.62, -W + 0.02], { radius: 0.02, name: `Door/${name}` }));
            parts.push(boxAt(glass, [0.5, 0.8, 0.03], [x as number, 0.85, -W - 0.005], { radius: 0.01, name: `Door/${name}/glass` }));
        });

        // 受电杆：车顶后段起根，向后上方仰，端头一只小滑靴贴在接触线下。
        parts.push(cylinderAt(this.accent, 0.05, 0.1, [-0.75, TRAM.roofY + 0.02, 0], { segments: 8, name: 'Pole/base' }));
        parts.push(tubeBetween(this.accent, new THREE.Vector3(-0.75, TRAM.roofY + 0.06, 0), new THREE.Vector3(-1.72, TRAM.poleY, 0), 0.028, { name: 'Pole' }));
        parts.push(boxAt(this.accent, [0.18, 0.05, 0.1], [-1.78, TRAM.poleY + 0.02, 0], { radius: 0.01, name: 'Pole/shoe' }));

        // 脚下软影与车头前方的灯光斑（加色，不进阴影图）。
        const shadowTexture = createSoftEllipseTexture();
        const poolTexture = createSoftEllipseTexture(true);
        this.textures.push(shadowTexture, poolTexture);
        const shadowGeometry = new THREE.PlaneGeometry(TRAM.length + 0.7, TRAM.width + 0.9).rotateX(-Math.PI / 2);
        const poolGeometry = new THREE.PlaneGeometry(3.0, 2.2).rotateX(-Math.PI / 2);
        this.geometries.push(shadowGeometry, poolGeometry);
        const shadow = mesh(shadowGeometry, clip(new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTexture, transparent: true, opacity: 0.5, depthWrite: false })), { name: 'Shadow', castShadow: false, receiveShadow: false });
        shadow.position.y = 0.006;
        shadow.renderOrder = 1;
        this.pool = clip(new THREE.MeshBasicMaterial({ map: poolTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        const pool = mesh(poolGeometry, this.pool, { name: 'HeadlightPool', castShadow: false, receiveShadow: false });
        pool.position.set(L + 1.5, 0.01, 0);
        pool.renderOrder = 1;
        parts.push(shadow, pool);

        const car = group('Tram/body', ...parts);
        car.children.forEach(child => { child.castShadow = false; });
        this.group.add(car);
        this.adAnchor.position.set(0, (TRAM.ad.y0 + TRAM.ad.y1) / 2, W + 0.012);
        this.destAnchor.position.set(L + 0.065, 2.3, 0);
        this.destAnchor.rotation.y = Math.PI / 2;
        this.group.add(this.adAnchor, this.destAnchor);
        this.group.position.set(0, 0, TRAM.z);
        this.phase = variation.tramPhase;
        this.syncColors();
    }

    private readonly phase: number;

    syncColors() {
        this.body.color.copy(this.blend.get('tramBody'));
        this.band.color.copy(this.blend.get('tramBand'));
        this.roof.color.copy(this.blend.get('tramRoof'));
        this.accent.color.copy(this.blend.get('tramTrim'));
        this.pool.color.copy(this.blend.get('streetLight')).multiplyScalar(0.3);
    }

    /** 按氛围时间把车摆在轨道上；一圈从底座东外开到西外（裁切面负责进出场）。 */
    update(ambientTime: number, wet: number) {
        const speed = TRAM.span / TRAM.period;
        const x = -TRAM.span / 2 + ((ambientTime * speed + this.phase * TRAM.span) % TRAM.span);
        this.group.position.x = x;
        if (this.lastX !== x) {
            const roll = (x - this.lastX) / WHEEL_RADIUS;
            this.wheels.forEach(wheel => { wheel.rotation.z -= roll; });
            this.lastX = x;
        }
        // 车灯在湿地上才明显。
        this.pool.opacity = 0.06 + 0.3 * wet;
    }

    dispose() {
        this.textures.forEach(texture => texture.dispose());
        this.geometries.forEach(geometry => geometry.dispose());
    }
}
