import * as THREE from 'three';
import { mixHexColors } from '../../../../../utils/themeColorMath';
import type { MachiSongContext } from '../../createMachiRuntime';
import { resolveMachiCar, type MachiLane } from '../../engine/actors/schedules';
import { MachiNobori } from '../../engine/actors/nobori';
import { createBaseClippingPlanes, MachiTraffic } from '../../engine/actors/traffic';
import { machiNeonGroup } from '../../engine/beatFx';
import { resolveMachiFlicker } from '../../engine/director';
import { MachiLightCones } from '../../engine/fx/lightCones';
import { MACHI_REFLECT_LAYER } from '../../engine/fx/reflection';
import { MachiSteam } from '../../engine/fx/steam';
import type { MachiDrip } from '../../engine/fx/weather';
import { bakeStatic, withGeometryCache } from '../../engine/geometry/shapes';
import type { MachiGlowSpec } from '../../engine/materials';
import { seedIndex, type MachiArtResolver } from '../../engine/palette';
import type { MachiScene, MachiSceneContent, MachiSceneContext, MachiSceneDefinition, MachiSceneFrame } from '../types';
import { buildRecordstoreBase } from './base';
import { buildRecordstoreInterior, type RecordstoreProductBatch } from './interior';
import { BASE, BOARD, DOOR, FASCIA, LEVEL, NEON, PROPS, RECORDSTORE_VIEW, ROAD, STORE } from './layout';
import { RecordstoreLights } from './recordstoreLights';
import { buildRecordstoreDoorEvents, resolveRecordstoreDoorOpenness } from './recordstoreDoor';
import { resolveRecordstoreVariation, type RecordstoreVariation } from './recordstoreSeed';
import { RecordstoreSigns } from './recordstoreSigns';
import { buildRecordstoreProps, buildRecordstoreSongProps } from './props';
import { buildRecordstoreStore } from './store';

// src/components/visualizer/machi/scenes/recordstore/recordstoreScene.ts
// 深夜唱片店街角：与便利店同款的十字路口（两条路在前右角相交、店占后左象限），墨绿的店身、整面落地玻璃透出
// 暖琥珀光；店内是成排黑胶货架、翻唱片的木箱、唱片封面墙、试听角与柜台。屋顶一块横屏逐字点亮当前行，
// 店角竖挂霓虹「深夜唱片 / MIDNIGHT RECORDS」（粉青双色）、店招写曲名、橱窗海报写歌手、门口のぼり旗写
// 「レコード」、A 字牌与一箱特价黑胶。会动的：段落开头自动门开合、试听角唱盘旋转、空调风扇、偶尔开过的车、
// 旗、井盖和外机的白气、路灯光柱。按歌变的：唱片配色与摆放、海报版式、自行车、风向、水洼、开门节奏
// （recordstoreSeed.ts）。

/** 唱片店自己的颜色：墨绿店身、木色箱柜、黑色货架与黑胶、黄铜点缀；自行车和霓虹双色按 seed / 主题走。 */
const RECORDSTORE_ART = {
    wall: '#2c4638',
    trim: '#6f7a72',
    roof: '#333a45',
    frame: '#272c35',
    interiorFloor: '#6b5137',
    interiorWall: '#33503f',
    shelf: '#22262d',
    counter: '#7a5c3a',
    wood: '#8a6a44',
    brass: '#c99a4e',
    vinyl: '#14161b',
    acUnit: '#d4d6d0',
    mirrorPole: '#e5702a',
    signBoard: '#182019',
    spillLight: '#ffb36b',
} as const;
const BIKE_COLORS = ['#c8423a', '#2f6db0', '#e7c64a', '#3f8f5a', '#e9e6dc', '#2a2d34'];

const resolveRecordstoreArt: MachiArtResolver = (_theme, seed, base) => ({
    ...RECORDSTORE_ART,
    // 玻璃外溢出的光：店内暖光与固定的琥珀各一半。
    spillLight: mixHexColors(RECORDSTORE_ART.spillLight, base.interiorLight, 0.5),
    // 店角竖霓虹的粉青双色：向主题霓虹色各拉一点，跟城寨的霓虹同族但配色偏暖。
    neonPink: mixHexColors('#ff5fa2', base.neon, 0.4),
    neonCyan: mixHexColors('#5fd8e8', base.neon, 0.18),
    bike: BIKE_COLORS[seedIndex(seed, 'bike', BIKE_COLORS.length)]!,
});

/** 门开合时阴影图隔多大一段重画一次（开合度 0..1）。 */
const DOOR_SHADOW_STEP = 0.06;

/** 自发光件：颜色键与亮度倍数（线性空间，> 1 才会被 bloom 轻轻带出光晕）。 */
const RECORDSTORE_GLOWS: Record<string, MachiGlowSpec> = {
    ceilingLight: { key: 'interiorLight', level: 2.2 },
    lampHead: { key: 'streetLight', level: 3.2 },
    warmWindow: { key: 'interiorLight', level: 0.42 },
    screen: { key: 'led', level: 1.3 },
    neonRim: { key: 'neon', level: 1.4 },
};

/** 四条车道（靠左行驶）：前路东行 / 西行，右路北行 / 南行。两端伸出底座，车由裁切面从底座边缘“开出来”。 */
const LANE_REACH = 8;
const RECORDSTORE_LANES: readonly MachiLane[] = [
    { from: [-LANE_REACH, ROAD.inner + 0.92], to: [LANE_REACH, ROAD.inner + 0.92] },
    { from: [LANE_REACH, ROAD.outer - 1.12], to: [-LANE_REACH, ROAD.outer - 1.12] },
    { from: [ROAD.inner + 0.92, LANE_REACH], to: [ROAD.inner + 0.92, -LANE_REACH] },
    { from: [ROAD.outer - 1.12, -LANE_REACH], to: [ROAD.outer - 1.12, LANE_REACH] },
];

/** 默认构图要框进去的点：底座顶面四角与两侧厚度、歌词屏顶、竖霓虹顶、店的后角。 */
const framingPoints = () => {
    const h = BASE.half;
    const points: THREE.Vector3[] = [];
    [-h, h].forEach(x => [-h, h].forEach(z => {
        points.push(new THREE.Vector3(x, 0, z));
        if (x !== z || x < 0) points.push(new THREE.Vector3(x, -BASE.depth, z));
    }));
    const across = new THREE.Vector3(Math.cos(BOARD.azimuth), 0, -Math.sin(BOARD.azimuth));
    const boardTop = BOARD.y0 + BOARD.height + 0.5;
    [-1, 1].forEach(side => {
        points.push(new THREE.Vector3(
            BOARD.cx + across.x * side * (BOARD.width / 2),
            boardTop,
            BOARD.cz + across.z * side * (BOARD.width / 2),
        ));
    });
    points.push(new THREE.Vector3(NEON.cx, NEON.y0 + NEON.height + 0.2, NEON.cz));
    points.push(new THREE.Vector3(STORE.x0, STORE.parapetTop, STORE.z0));
    points.push(new THREE.Vector3(PROPS.utilityPole.x, PROPS.utilityPole.height + 0.2, PROPS.utilityPole.z));
    return points;
};

/** 滴水：店招下沿（前面、右面）每隔一段一滴，落水管口一串。 */
const recordstoreDrips = (): MachiDrip[] => {
    const drips: MachiDrip[] = [];
    const frontZ = STORE.z1 + FASCIA.depth + 0.07;
    const rightX = STORE.x1 + FASCIA.depth + 0.07;
    for (let x = STORE.x0 + 0.3; x < STORE.x1; x += 0.42) {
        drips.push({ x: x + (Math.random() - 0.5) * 0.12, z: frontZ, from: FASCIA.y0 - 0.02, to: LEVEL.lot, period: 1.1 + Math.random() * 1.8, phase: Math.random() });
    }
    for (let z = STORE.z1; z > STORE.z0 + 0.5; z -= 0.45) {
        drips.push({ x: rightX, z: z + (Math.random() - 0.5) * 0.12, from: FASCIA.y0 - 0.02, to: LEVEL.lot, period: 1.1 + Math.random() * 1.8, phase: Math.random() });
    }
    for (let index = 0; index < 4; index += 1) {
        drips.push({ x: STORE.x0 - 0.12 + (Math.random() - 0.5) * 0.04, z: STORE.z1 + 0.06, from: LEVEL.lot + 0.08, to: LEVEL.lot, period: 0.32 + Math.random() * 0.12, phase: index / 4 });
    }
    return drips;
};

/** object 是不是 ancestor 的后代。 */
const isInside = (object: THREE.Object3D, ancestor: THREE.Object3D) => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
    return false;
};

class RecordstoreScene implements MachiScene {
    readonly root = new THREE.Group();
    readonly framing;
    readonly weather;
    readonly reflectionPlaneY = 0.06;
    readonly surfaces;
    readonly puddles;
    // 对焦对着歌词屏正面的中心（大光圈下清晰的那一层只有一米来厚）。
    readonly focusPoint = new THREE.Vector3(
        BOARD.cx + Math.sin(BOARD.azimuth) * (BOARD.depth / 2 + 0.012),
        BOARD.y0 + BOARD.height / 2,
        BOARD.cz + Math.cos(BOARD.azimuth) * (BOARD.depth / 2 + 0.012),
    );
    private readonly world = new THREE.Group();
    private songProps: THREE.Group;
    private readonly productBatches: RecordstoreProductBatch[];
    private readonly doorPanels: ReturnType<typeof buildRecordstoreStore>['doorPanels'];
    private readonly platter: THREE.Object3D;
    private readonly fans: THREE.Object3D[];
    private readonly lights: RecordstoreLights;
    private readonly signs: RecordstoreSigns;
    private readonly traffic: MachiTraffic;
    private readonly nobori: MachiNobori;
    private readonly lightCones: MachiLightCones;
    private readonly steam: MachiSteam;
    private readonly glowA: THREE.Vector4;
    private readonly glowB: THREE.Vector4;
    private variation: RecordstoreVariation;
    private song: MachiSongContext;
    private doorEvents: number[];
    private doorOpenness = 0;
    /** 阴影图上一次按门开到多大画的。 */
    private shadowDoorOpenness = 0;

    constructor(private readonly context: MachiSceneContext) {
        const { materials, blend, geometryCache } = context;
        this.song = context.song;
        const variation = resolveRecordstoreVariation(context.song.seed);
        this.variation = variation;
        this.doorEvents = buildRecordstoreDoorEvents(context.song.lines, variation);
        materials.defineGlows(RECORDSTORE_GLOWS);
        this.root.name = 'Recordstore';

        const { base, interior, store, props, songProps } = withGeometryCache(geometryCache, () => {
            const builtInterior = buildRecordstoreInterior(materials, variation.shelfSeed);
            return {
                base: buildRecordstoreBase(materials),
                interior: builtInterior,
                store: buildRecordstoreStore(materials, builtInterior.group),
                props: buildRecordstoreProps(materials),
                songProps: buildRecordstoreSongProps(materials, variation),
            };
        });
        this.productBatches = [...interior.productBatches, ...props.productBatches];
        this.doorPanels = store.doorPanels;
        this.platter = interior.platter;
        this.fans = props.fans;
        this.world.name = 'Recordstore/world';
        this.world.add(base.group, store.group, props.group, songProps);
        // 亮的东西进倒影图层（合批前打上，合批按图层分开）。店本身也进：倒影镜头不认灯光，卡通材质在那里是全黑的，
        // 正好当遮挡，屋顶上的歌词屏不会穿过店身映到店前的水洼里。
        this.world.traverse(object => {
            if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
            const isGlow = object.material.name.startsWith('machi:glow');
            const isStoreBody = !object.material.transparent && object.parent !== null && isInside(object, store.group);
            if (isGlow || isStoreBody) object.layers.enable(MACHI_REFLECT_LAYER);
        });
        this.surfaces = { road: [base.roadSurface], lot: base.lotSurfaces };
        this.puddles = { offset: variation.puddleOffset, amount: variation.puddleAmount };
        bakeStatic(this.world);
        this.songProps = songProps;

        this.lights = new RecordstoreLights(blend, materials, props.streetLampHead);
        this.signs = new RecordstoreSigns(materials, blend, {
            boardFace: store.boardFace,
            fasciaFaces: store.fasciaFaces,
            neonFaces: store.neonFaces,
            aFrameFaces: props.aFrameFaces,
            crateTagFaces: props.crateTagFaces,
        });
        this.signs.group.traverse(object => {
            if (object instanceof THREE.Mesh && !object.name.startsWith('Poster') && !object.name.startsWith('AFrame')) object.layers.enable(MACHI_REFLECT_LAYER);
        });

        const clipping = createBaseClippingPlanes(BASE.half);
        this.traffic = withGeometryCache(geometryCache, () => new MachiTraffic(materials, blend, clipping, RECORDSTORE_LANES, LEVEL.road));
        // 门口一面のぼり旗：门左边的场地边上，布面朝前右（大致对着默认镜头），旗杆在左。
        this.nobori = new MachiNobori(materials, [{ x: PROPS.nobori.x, y: LEVEL.lot, z: PROPS.nobori.z, rotationY: 0.35 }]);
        const lamp = props.streetLampHead;
        this.lightCones = new MachiLightCones(materials, blend, [
            { apex: lamp, target: new THREE.Vector3(lamp.x - 0.2, LEVEL.road, lamp.z), radius: 1.65, gain: 1 },
        ]);
        this.steam = new MachiSteam(materials, blend, [
            { position: new THREE.Vector3(-2.4, LEVEL.road + 0.02, (ROAD.inner + ROAD.outer) / 2 + 0.3), puffs: 7, period: 4.4, size: 1 },
            { position: new THREE.Vector3(PROPS.roofAc[0]!.x - 0.12, STORE.roofTop + 0.68, PROPS.roofAc[0]!.z + 0.2), puffs: 5, period: 3.3, size: 0.6 },
        ]);
        this.root.add(this.world, this.lights.group, this.signs.group, this.traffic.group, this.nobori.group, this.lightCones.mesh, this.steam.mesh);

        const boardFront = new THREE.Vector3(Math.sin(BOARD.azimuth), 0, Math.cos(BOARD.azimuth)).multiplyScalar(BOARD.depth / 2 + 0.8);
        this.weather = {
            half: BASE.half,
            groundY: LEVEL.lot * 0.5,
            roofs: [{ x0: STORE.x0 - STORE.overhang, z0: STORE.z0 - STORE.overhang, x1: STORE.x1 + STORE.overhang, z1: STORE.z1 + STORE.overhang, y: STORE.roofTop }],
            drips: recordstoreDrips(),
            // 落进灯光里的雨丝被照亮：路灯光柱、店门口、歌词屏前。
            glints: [
                { position: new THREE.Vector3(lamp.x - 0.2, 2.4, lamp.z), radius: 1.7 },
                { position: new THREE.Vector3((STORE.frontPillarEnd + STORE.x1) / 2, 1.5, STORE.z1 + 0.9), radius: 2.0 },
                { position: new THREE.Vector3(BOARD.cx + boardFront.x, BOARD.y0 + BOARD.height * 0.55, BOARD.cz + boardFront.z), radius: 2.1 },
            ],
            windYaw: variation.windYaw,
            windSlant: variation.windSlant,
        };
        this.framing = { points: framingPoints(), view: { ...RECORDSTORE_VIEW } };
        // 雾里的两处灯：店门口、路灯下。
        this.glowA = new THREE.Vector4((STORE.frontPillarEnd + STORE.x1) / 2 + 0.6, 0, STORE.z1 + 0.9, 3.4);
        this.glowB = new THREE.Vector4(lamp.x, 0, lamp.z, 2.3);
        this.syncColors();
        context.invalidateShadows();
    }

    setContent(content: MachiSceneContent) {
        this.signs.setContent(content, this.variation);
        const { palette } = content;
        this.nobori.paint({
            font: content.font,
            fallbacks: content.fallbacks,
            faces: [{ background: palette.brand[0], ink: '#ffffff', text: 'レコード' }],
        });
    }

    swapSong(song: MachiSongContext, content: MachiSceneContent) {
        const seedChanged = song.seed !== this.song.seed;
        this.song = song;
        this.variation = resolveRecordstoreVariation(song.seed);
        if (seedChanged) this.rebuildSongProps();
        this.doorEvents = buildRecordstoreDoorEvents(song.lines, this.variation);
        this.setContent(content);
    }

    /** 换歌：按新 seed 重建自行车（只有这一组跟着歌变几何）。 */
    private rebuildSongProps() {
        const shared = new Set(this.context.geometryCache.values());
        this.songProps.removeFromParent();
        this.songProps.traverse(object => {
            if (object instanceof THREE.Mesh && !shared.has(object.geometry)) object.geometry.dispose();
        });
        const holder = new THREE.Group();
        const next = withGeometryCache(this.context.geometryCache, () => buildRecordstoreSongProps(this.context.materials, this.variation));
        holder.add(next);
        bakeStatic(holder);
        next.removeFromParent();
        this.world.add(next);
        this.songProps = next;
        this.context.invalidateShadows();
    }

    direct(frame: MachiSceneFrame) {
        const { songTime, ambientTime, chorus, staticMode } = frame;
        if (frame.targetChanged) this.signs.showBoard(frame.target, frame.lines, frame.immediate, frame.showText);
        else if (frame.preheat) this.signs.preheat(frame.preheat, frame.lines, frame.showText);
        const { environment, look } = frame;
        const streetFlicker = staticMode ? 1 : resolveMachiFlicker(ambientTime + 3.1, `${frame.seed}:street`, 0.45);
        // 白天店里的灯弱下去，路灯熄掉；光柱、地上的光斑、雾里的灯跟着。
        const street = look.streetLamps * (0.75 + 0.25 * streetFlicker);
        const openness = resolveRecordstoreDoorOpenness(this.doorEvents, songTime, this.variation, this.song.isInstrumental || frame.lines.length === 0);
        if (Math.abs(openness - this.doorOpenness) > 1e-4) {
            this.doorOpenness = openness;
            // 门动一下就重画整张阴影图太贵：门走过一小段、或者停在全开 / 全关时才重画，门板本身每帧照常走。
            const settled = openness === 0 || openness === 1;
            if (Math.abs(openness - this.shadowDoorOpenness) >= DOOR_SHADOW_STEP || (settled && openness !== this.shadowDoorOpenness)) {
                this.shadowDoorOpenness = openness;
                this.context.invalidateShadows();
            }
        }
        // 霓虹随拍（智能动感模式）：店里的灯（连同它投在地上的光斑）跟着小节慢慢涨落，店招上沿的霓虹边是第二组霓虹；
        // 地面干时光斑跟鼓点跳。
        const { beat } = frame;
        const interiorLevel = (1 + 0.1 * chorus + 0.06 * this.doorOpenness) * look.artificial * beat.warm;
        this.lights.setLevels({ interior: interiorLevel, street, pools: (1 - 0.85 * environment.daylight) * (1 + beat.thump) });
        this.context.materials.setGlowLevel('neonRim', (0.75 + 0.25 * frame.flicker) * (1 + 0.4 * chorus) * look.artificial * machiNeonGroup(beat, 1));
        this.context.materials.setGlowLevel('lampHead', 0.15 + 0.85 * look.streetLamps);
        // 会动的东西：车按氛围时钟，旗随风飘，白气、光柱慢慢流，唱盘在播放时转。静态模式下街上没有车。
        this.traffic.group.visible = !staticMode;
        this.traffic.update(ambientTime, frame.seed, frame.trafficChance);
        this.nobori.update(ambientTime, 0.35 + 0.65 * Math.min(1, frame.rain));
        this.lightCones.update(ambientTime, street * (1 - 0.6 * environment.daylight));
        this.steam.update(ambientTime, frame.atmosphere.wind);
        const atmosphere = frame.atmosphere;
        atmosphere.glowA.copy(this.glowA);
        atmosphere.glowB.copy(this.glowB);
        const night = 1 - 0.85 * environment.daylight;
        atmosphere.glowColorA.copy(this.context.blend.get('interiorLight')).multiplyScalar(0.55 * interiorLevel * night);
        atmosphere.glowColorB.copy(this.context.blend.get('streetLight')).multiplyScalar(0.42 * street * night);
        this.signs.update({
            songTime,
            ambientTime,
            delta: frame.delta,
            staticMode,
            chorus,
            audio: frame.audio,
            flicker: frame.flicker,
            beat,
        });
        // 风扇转、自动门滑开、唱盘转（ambientTime 只在播放时走，暂停自然停）。
        this.fans.forEach((fan, index) => {
            fan.rotation.z = -ambientTime * (this.variation.fanSpeed + index * 0.37) * Math.PI * 2;
        });
        this.platter.rotation.y = ambientTime * 2.1;
        this.doorPanels.forEach(panel => {
            panel.object.position.x = panel.closedX + panel.direction * DOOR.slide * this.doorOpenness;
        });
    }

    syncColors() {
        this.context.materials.syncColors();
        this.lights.sync();
        this.traffic.syncColors();
        this.lightCones.syncColors();
        this.steam.syncColors();
        const color = new THREE.Color();
        this.productBatches.forEach(batch => {
            for (let index = 0; index < batch.colorIndex.length; index += 1) {
                color.copy(this.context.blend.get(`product${batch.colorIndex[index]!}`)).multiplyScalar(batch.shade[index]!);
                batch.mesh.setColorAt(index, color);
            }
            if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
        });
    }

    get busy() {
        return this.signs.busy;
    }

    nextCar(from: number, seed: string | number, chance: number) {
        for (let t = from; t < from + 120; t += 0.04) {
            const car = resolveMachiCar(t, seed, RECORDSTORE_LANES, chance);
            if (car && Math.abs(car.distance - LANE_REACH) < 0.3) return t;
        }
        return null;
    }

    dispose() {
        const geometries = new Set<THREE.BufferGeometry>(this.context.geometryCache.values());
        this.root.traverse(object => {
            if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) geometries.add(object.geometry);
        });
        geometries.forEach(geometry => geometry.dispose());
        this.lights.dispose();
        this.signs.dispose();
        this.traffic.dispose();
        this.nobori.dispose();
        this.lightCones.dispose();
        this.steam.dispose();
        this.context.materials.dispose();
        this.root.removeFromParent();
    }
}

export const RECORDSTORE_SCENE: MachiSceneDefinition = {
    resolveArt: resolveRecordstoreArt,
    create: context => new RecordstoreScene(context),
};
