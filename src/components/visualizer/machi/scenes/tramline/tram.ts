import * as THREE from 'three';
import { boxAt, cylinderAt, group, mesh, tubeBetween } from '../../engine/geometry/shapes';
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
// （clipToBase，与 traffic 共用），脚下软影代替投影，前灯光斑与灯件进倒影图层。
// 车身几何在 buildTramBody 里搭（不碰 DOM，单测可以直接建）；软影 / 前灯光斑的贴图要 canvas，留在类里。
// 位置按氛围时间循环：tramXAt 是纯函数（绕行圈取模），车轮转角由累计行程推出——圈边界不会出现差值跳变。
// 暂停时氛围时钟不动，车与轮都定住。涂装色走调色板键，syncColors 时同步。


/** 累计行程（米，不取模）：氛围时钟 × 车速 + 相位偏移。 */
export const tramTravel = (ambientTime: number, phase: number) => ambientTime * (TRAM.span / TRAM.period) + phase * TRAM.span;

/** 车在轨上的 x（一圈从底座东外到西外，取模回绕）。 */
export const tramXAt = (ambientTime: number, phase: number) => {
    const span = TRAM.span;
    return -span / 2 + (((tramTravel(ambientTime, phase) % span) + span) % span);
};

/** 车轮转角：按累计行程连续滚动，圈边界只是 x 回绕、轮子不倒转。 */
export const tramWheelAngleAt = (ambientTime: number, phase: number) => {
    const angle = -(tramTravel(ambientTime, phase) / TRAM.wheelRadius) % (Math.PI * 2);
    return angle;
};

export interface TramBodyMats {
    body: THREE.MeshToonMaterial;
    band: THREE.MeshToonMaterial;
    roof: THREE.MeshToonMaterial;
    accent: THREE.MeshToonMaterial;
}

export interface TramBodyBuild {
    group: THREE.Object3D;
    wheels: THREE.Mesh[];
    adAnchor: THREE.Group;
    destAnchor: THREE.Group;
    mats: TramBodyMats;
}

/**
 * 车体几何与材质（不含 canvas 贴图的软影 / 光斑）：上下两层、奶油腰板、圆车顶、双层窗带与窗框立柱、
 * 转向架车轮、车门、目的地箱挂点、受电杆。返回的车组已放在轨道上（z = TRAM.z），x 由 update 每帧写。
 */
export const buildTramBody = (materials: MachiMaterials): TramBodyBuild => {
    const clipping = createBaseClippingPlanes(MACHI_BASE.half);
    const clip = <T extends THREE.Material>(material: T) => materials.track(clipToBase(material, clipping));
    const body = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient }), MACHI_GLOSS.paint));
    const band = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient }), MACHI_GLOSS.paint));
    const roof = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient })));
    const accent = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient }), MACHI_GLOSS.chrome));
    const glass = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient }), MACHI_GLOSS.glass));
    const rubber = clip(materials.snowy(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: materials.gradient })));
    glass.color.set('#141c22');
    rubber.color.set('#17191d');
    // 车内暖光、前灯、尾灯：用 glow role 但整件都要裁切（这些 role 只给车用）。
    const cabinGlow = clip(materials.glow('tramCabin'));
    const headlight = clip(materials.glow('tramHead'));
    const taillight = clip(materials.glow('tramTail'));

    const L = TRAM.length / 2;
    const W = TRAM.width / 2;
    const parts: THREE.Object3D[] = [];
    const wheels: THREE.Mesh[] = [];
    // 转向架与底盘裙板：两条深灰，轮子落在两根钢轨上（轨距半宽）、露一个边。
    [-1.25, 1.25].forEach(x => {
        parts.push(boxAt(rubber, [1.35, 0.4, 1.0], [x, 0.3, 0], { radius: 0.05, name: 'Bogie' }));
    });
    parts.push(boxAt(rubber, [TRAM.length - 0.24, 0.34, 1.02], [0, 0.32, 0], { radius: 0.05, name: 'Chassis' }));
    const wheelGeometry = new THREE.CylinderGeometry(TRAM.wheelRadius, TRAM.wheelRadius, 0.13, 14);
    wheelGeometry.rotateX(Math.PI / 2);
    [-1.6, -0.9, 0.9, 1.6].forEach(x => {
        [-TRACK.gauge / 2, TRACK.gauge / 2].forEach(z => {
            const wheel = mesh(wheelGeometry, rubber, { name: 'Wheel' });
            wheel.position.set(x, TRAM.wheelY, z);
            wheels.push(wheel);
            parts.push(wheel);
        });
    });
    // 车身：下层壳、两层之间的奶油腰板（车侧广告就贴这）、上层、圆车顶与屋脊小通风脊，
    // 下沿一条深色防撞条把车压回地面。
    parts.push(boxAt(body, [TRAM.length, TRAM.lowerTop - TRAM.chassisTop, TRAM.width], [0, TRAM.chassisTop, 0], { radius: 0.07, name: 'Body/lower' }));
    parts.push(boxAt(accent, [TRAM.length - 0.15, 0.055, TRAM.width + 0.02], [0, TRAM.chassisTop + 0.02, 0], { radius: 0.02, name: 'Body/rub' }));
    parts.push(boxAt(band, [TRAM.length, TRAM.bandTop - TRAM.lowerTop, TRAM.width + 0.01], [0, TRAM.lowerTop, 0], { radius: 0.04, name: 'Body/band' }));
    parts.push(boxAt(body, [TRAM.length, TRAM.upperTop - TRAM.bandTop, TRAM.width], [0, TRAM.bandTop, 0], { radius: 0.07, name: 'Body/upper' }));
    parts.push(boxAt(roof, [TRAM.length - 0.12, TRAM.roofY - TRAM.upperTop, TRAM.width - 0.06], [0, TRAM.upperTop, 0], { radius: 0.11, name: 'Roof' }));
    parts.push(boxAt(roof, [TRAM.length - 0.9, 0.05, 0.3], [0, TRAM.roofY, 0], { radius: 0.02, name: 'Roof/ridge' }));
    // 上沿一条奶油细带勾出上下层的分界线（夜里也能看出是双层）。
    parts.push(boxAt(band, [TRAM.length - 0.1, 0.05, TRAM.width + 0.012], [0, TRAM.upperTop - 0.05, 0], { radius: 0.015, name: 'Body/waistline' }));

    // 窗：两层各一条深色玻璃带加绿色窗框立柱（一批实例），上层留几扇亮着车厢暖光。
    const winBand = (y0: number, y1: number, name: string) => {
        const h = y1 - y0;
        [1, -1].forEach(side => {
            parts.push(boxAt(glass, [TRAM.length - 0.5, h, 0.04], [0, y0, side * (W - 0.018)], { radius: 0.01, name }));
        });
        [1, -1].forEach(end => {
            parts.push(boxAt(glass, [0.04, h, TRAM.width - 0.42], [end * (L - 0.018), y0, 0], { radius: 0.01, name }));
        });
    };
    winBand(0.98, 1.58, 'Win/lower');
    winBand(2.06, 2.52, 'Win/upper');
    // 窗框立柱：BoxGeometry 中心原点，实例 y 放各自窗带中心、凸出玻璃面一线。
    const mullionGeometry = new THREE.BoxGeometry(0.06, 1, 0.05);
    const mullions = new THREE.InstancedMesh(mullionGeometry, body, 24);
    mullions.name = 'Mullions';
    const matrix = new THREE.Matrix4();
    let index = 0;
    [[0.98, 1.58], [2.06, 2.52]].forEach(([y0, y1]) => {
        const h = y1 - y0;
        [W + 0.005, -(W + 0.005)].forEach(z => {
            for (let k = 0; k < 6; k += 1) {
                matrix.makeScale(1, h + 0.04, 1);
                matrix.setPosition(-L + 0.45 + k * 0.66, y0 + h / 2, z);
                mullions.setMatrixAt(index, matrix);
                index += 1;
            }
        });
    });
    parts.push(mullions);
    // 车厢灯：上层朝 +z 三扇亮窗（夜里看得到的暖光），下层一扇，都进倒影图层。
    [-1.0, 0.0, 1.0].forEach(x => {
        const lit = mesh(new THREE.PlaneGeometry(0.44, 0.42), cabinGlow, { name: 'Win/lit', castShadow: false, receiveShadow: false });
        lit.position.set(x, 2.29, W + 0.008);
        lit.layers.enable(MACHI_REFLECT_LAYER);
        parts.push(lit);
    });
    const litLower = mesh(new THREE.PlaneGeometry(0.5, 0.5), cabinGlow, { name: 'Win/lit', castShadow: false, receiveShadow: false });
    litLower.position.set(-0.55, 1.28, W + 0.008);
    litLower.layers.enable(MACHI_REFLECT_LAYER);
    parts.push(litLower);

    // 车头车尾（双层车两端同款）：奶油端柱、目的地箱位留给 signs、底部中间的圆形头灯
    // （外套一圈灯碗）/ 一对红色尾灯、登车梯口。
    [1, -1].forEach(end => {
        parts.push(boxAt(band, [0.07, TRAM.upperTop - TRAM.bandTop, 0.07], [end * (L - 0.1), TRAM.bandTop, W - 0.03], { radius: 0.015, name: 'End/pillar' }));
        parts.push(boxAt(band, [0.07, TRAM.upperTop - TRAM.bandTop, 0.07], [end * (L - 0.1), TRAM.bandTop, -W + 0.03], { radius: 0.015, name: 'End/pillar' }));
        parts.push(boxAt(band, [0.07, TRAM.lowerTop - 0.6, 0.07], [end * (L - 0.1), 0.6, W - 0.03], { radius: 0.015, name: 'End/pillarL' }));
        parts.push(boxAt(band, [0.07, TRAM.lowerTop - 0.6, 0.07], [end * (L - 0.1), 0.6, -W + 0.03], { radius: 0.015, name: 'End/pillarL' }));
        parts.push(boxAt(band, [0.1, 0.3, 0.66], [end * (L + 0.01), 2.3, 0], { radius: 0.02, name: 'End/destBox' }));
        parts.push(boxAt(accent, [0.06, 0.1, TRAM.width - 0.1], [end * (L + 0.01), 0.62, 0], { radius: 0.01, name: 'End/bumper' }));
        if (end > 0) {
            // 头灯：深色灯碗套在车头，灯珠在碗心。
            const housing = mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.08, 12).rotateZ(Math.PI / 2), accent, { name: 'Head/housing' });
            housing.position.set(L + 0.03, 0.78, 0);
            parts.push(housing);
            const light = mesh(new THREE.SphereGeometry(0.08, 10, 8), headlight, { name: 'Headlight', castShadow: false, receiveShadow: false });
            light.position.set(L + 0.08, 0.78, 0);
            light.layers.enable(MACHI_REFLECT_LAYER);
            parts.push(light);
        } else {
            [-0.4, 0.4].forEach(z => {
                const light = mesh(new THREE.SphereGeometry(0.055, 10, 8), taillight, { name: 'Taillight', castShadow: false, receiveShadow: false });
                light.position.set(end * (L + 0.04), 0.82, z);
                light.layers.enable(MACHI_REFLECT_LAYER);
                parts.push(light);
            });
        }
    });
    // 车门（靠站台一侧，-z）：前、后两扇，玻璃门带门槛。
    [[1.15, 'Front'], [-1.3, 'Rear']].forEach(([x, name]) => {
        parts.push(boxAt(accent, [0.62, 1.3, 0.05], [x as number, 0.62, -W + 0.02], { radius: 0.02, name: `Door/${name}` }));
        parts.push(boxAt(glass, [0.5, 0.8, 0.03], [x as number, 0.85, -W - 0.005], { radius: 0.01, name: `Door/${name}/glass` }));
    });

    // 受电杆：车顶后段起根，向后上方仰，端头一只小滑靴贴在接触线下。
    parts.push(cylinderAt(accent, 0.05, 0.1, [-0.85, TRAM.roofY + 0.02, 0], { segments: 8, name: 'Pole/base' }));
    parts.push(tubeBetween(accent, new THREE.Vector3(-0.85, TRAM.roofY + 0.06, 0), new THREE.Vector3(-1.82, TRAM.poleY, 0), 0.028, { name: 'Pole' }));
    parts.push(boxAt(accent, [0.18, 0.05, 0.1], [-1.88, TRAM.poleY + 0.02, 0], { radius: 0.01, name: 'Pole/shoe' }));

    const car = group('Tram/body', ...parts);
    car.children.forEach(child => { child.castShadow = false; });
    const adAnchor = new THREE.Group();
    const destAnchor = new THREE.Group();
    adAnchor.position.set(0, (TRAM.ad.y0 + TRAM.ad.y1) / 2, W + 0.012);
    destAnchor.position.set(L + 0.065, 2.3, 0);
    destAnchor.rotation.y = Math.PI / 2;
    car.add(adAnchor, destAnchor);
    car.position.set(0, 0, TRAM.z);
    return { group: car, wheels, adAnchor, destAnchor, mats: { body, band, roof, accent } };
};

export class MachiTram {
    readonly group = new THREE.Group();
    /** 车侧广告牌的挂点（朝 +z）：signs 把画好的广告面挂进来。 */
    readonly adAnchor: THREE.Group;
    /** 车头目的地箱的挂点（朝 +x）。 */
    readonly destAnchor: THREE.Group;
    private readonly mats: TramBodyMats;
    private readonly pool: THREE.MeshBasicMaterial;
    private readonly wheels: THREE.Mesh[];
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly textures: THREE.Texture[] = [];
    private readonly phase: number;

    constructor(materials: MachiMaterials, private readonly blend: MachiColorBlend, variation: TramlineVariation) {
        this.group.name = 'Tram';
        const built = buildTramBody(materials);
        this.mats = built.mats;
        this.wheels = built.wheels;
        this.adAnchor = built.adAnchor;
        this.destAnchor = built.destAnchor;
        this.group.add(built.group);
        const clipping = createBaseClippingPlanes(MACHI_BASE.half);
        const clip = <T extends THREE.Material>(material: T) => materials.track(clipToBase(material, clipping));
        const L = TRAM.length / 2;

        // 脚下软影与车头前方的灯光斑（加色，不进阴影图；光斑跟着车平移但不跟车转向）。
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
        built.group.add(shadow, pool);

        this.phase = variation.tramPhase;
        this.syncColors();
    }

    syncColors() {
        this.mats.body.color.copy(this.blend.get('tramBody'));
        this.mats.band.color.copy(this.blend.get('tramBand'));
        this.mats.roof.color.copy(this.blend.get('tramRoof'));
        this.mats.accent.color.copy(this.blend.get('tramTrim'));
        this.pool.color.copy(this.blend.get('streetLight')).multiplyScalar(0.3);
    }

    /** 按氛围时间把车摆在轨道上；一圈从底座东外开到西外（裁切面负责进出场）。 */
    update(ambientTime: number, wet: number) {
        this.group.position.x = tramXAt(ambientTime, this.phase);
        const angle = tramWheelAngleAt(ambientTime, this.phase);
        this.wheels.forEach(wheel => { wheel.rotation.z = angle; });
        // 车灯在湿地上才明显。
        this.pool.opacity = 0.06 + 0.3 * wet;
    }

    dispose() {
        this.textures.forEach(texture => texture.dispose());
        this.geometries.forEach(geometry => geometry.dispose());
    }
}
