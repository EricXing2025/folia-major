import * as THREE from 'three';
import { mixHexColors } from '../../../../../utils/themeColorMath';
import type { MachiSongContext } from '../../createMachiRuntime';
import { resolveMachiCar, type MachiLane } from '../../engine/actors/schedules';
import { createBaseClippingPlanes, MachiTraffic } from '../../engine/actors/traffic';
import { machiLightboxGroup, machiNeonGroup } from '../../engine/beatFx';
import { resolveMachiFlicker } from '../../engine/director';
import { MachiLightCones } from '../../engine/fx/lightCones';
import { MACHI_REFLECT_LAYER } from '../../engine/fx/reflection';
import { MachiSteam } from '../../engine/fx/steam';
import type { MachiDrip } from '../../engine/fx/weather';
import { bakeStatic, withGeometryCache } from '../../engine/geometry/shapes';
import type { MachiGlowSpec } from '../../engine/materials';
import type { MachiArtResolver } from '../../engine/palette';
import type { MachiScene, MachiSceneContent, MachiSceneContext, MachiSceneDefinition, MachiSceneFrame } from '../types';
import { buildChanganBase } from './base';
import { buildChanganMarket, type ChanganColorBatch } from './market';
import { buildChanganTerrace, TERRACE_TOP } from './terrace';
import { BASE, BOARD, CHANGAN_VIEW, LEVEL, PAGODA, PAIFANG, PROPS, ROAD, STALL, STALLS, TERRACE } from './layout';
import { ChanganLights } from './changanLights';
import { resolveChanganVariation, type ChanganVariation } from './changanSeed';
import { ChanganSigns } from './changanSigns';
import { localXZ } from './market';

// src/components/visualizer/machi/scenes/changan/changanScene.ts
// 长安夜市街角：与便利店同款的十字路口（两条路在前右角相交），夜市广场占后左象限——后中一座石砌高台，
// 台上是七层大雁塔（青砖收分、叠涩翘檐、四面暖光拱窗、塔刹，暖金泛光从下往上渐暗），台基前墙上是
// 宽幅歌词屏与一排 EQ 光柱，前右角斜面中央台阶下到广场；前左一座唐式牌坊（横匾写曲名、两柱竖幡写歌手、
// 一对石狮），右边一列食摊与广场中景一个（幌子写肉夹馍 / 羊肉泡馍 / 油泼面·酸梅汤，蒸笼冒白气，顶棚挂红灯），
// 小桌椅、两盏宫灯柱、横跨广场的灯笼串与灯珠串、一角粉花树；背景是后左带城楼的城墙、后右唐屋天际线
// 与茶馆角的紫色小霓虹「茶」，天上两盏天灯慢慢升起，街上偶尔过一辆车。按歌变的：灯笼配色、烟气浓淡、
// 花球密度、天灯相位、风向、水洼、灯串下垂（changanSeed.ts）。

/** 长安夜市自己的颜色：青灰湿石板、唐式朱木与灰瓦、青砖塔身、暖金泛光与琥珀灯笼；冷色只有花粉与一点紫霓虹。 */
const CHANGAN_ART = {
    terraceStone: '#4d5767',
    stoneCap: '#5d6878',
    stoneDark: '#39414f',
    slabJoint: '#3a4250',
    paifangRed: '#8e3327',
    paifangRoof: '#2e3a47',
    paifangTrim: '#c9994e',
    plaqueBase: '#141a26',
    wood: '#6b4a2e',
    stallCounter: '#54382a',
    stallRoof: '#3a4654',
    boardPanel: '#10151f',
    brass: '#b8924e',
    pagodaBrick: '#525e6e',
    pagodaEave: '#36404e',
    pagodaGold: '#ffc46a',
    lanternRed: '#e8402e',
    lanternAmber: '#ffb36b',
    festoonWarm: '#ffd9a0',
    blossom: '#e78fb4',
    blossomDeep: '#c86d96',
    terracotta: '#b06a48',
    warriorDark: '#8a5238',
    lampPost: '#4a3226',
    wallSil: '#232b3a',
    skylineWall: '#232c38',
    skylineRoof: '#2e3a47',
    teaWall: '#332f3a',
    lionStone: '#7d8794',
    tableTop: '#5a4030',
    treeTrunk: '#4a3a30',
    skyLantern: '#ffcf8a',
    spillLight: '#ffb36b',
} as const;

const resolveChanganArt: MachiArtResolver = (_theme, _seed, base) => ({
    ...CHANGAN_ART,
    // 湿石板广场：青灰的蓝灰石，仍向主题的混凝土色偏一点。
    concrete: mixHexColors('#4d5a6e', base.concrete, 0.4),
    // 玻璃外溢出的光与泛光的金：店内暖光与固定的琥珀 / 金各一半。
    spillLight: mixHexColors(CHANGAN_ART.spillLight, base.interiorLight, 0.5),
    pagodaGold: mixHexColors(CHANGAN_ART.pagodaGold, base.interiorLight, 0.3),
    // 冷色点缀：EQ 与紫霓虹都向主题霓虹色拉一点，跟兄弟场景的霓虹同族。
    eqColor: mixHexColors('#ef7fb8', base.neon, 0.3),
    neonPurple: mixHexColors('#c86ff0', base.neon, 0.35),
});

/** 自发光件：颜色键与亮度倍数（线性空间，> 1 才会被 bloom 轻轻带出光晕）。 */
const CHANGAN_GLOWS: Record<string, MachiGlowSpec> = {
    pagodaArch: { key: 'pagodaGold', level: 2.6 },
    eaveTrim: { key: 'pagodaGold', level: 0.9 },
    eqBar: { key: 'eqColor', level: 2.3 },
    palaceLamp: { key: 'lanternAmber', level: 2.4 },
    festoonBulb: { key: 'festoonWarm', level: 1.9 },
    skyLantern: { key: 'skyLantern', level: 1.7 },
    teaEave: { key: 'neonPurple', level: 0.8 },
};

/** 四条车道（靠左行驶）：前路东行 / 西行，右路北行 / 南行。两端伸出底座，车由裁切面从底座边缘“开出来”。 */
const LANE_REACH = 8;
const CHANGAN_LANES: readonly MachiLane[] = [
    { from: [-LANE_REACH, ROAD.inner + 0.92], to: [LANE_REACH, ROAD.inner + 0.92] },
    { from: [LANE_REACH, ROAD.outer - 1.12], to: [-LANE_REACH, ROAD.outer - 1.12] },
    { from: [ROAD.inner + 0.92, LANE_REACH], to: [ROAD.inner + 0.92, -LANE_REACH] },
    { from: [ROAD.outer - 1.12, -LANE_REACH], to: [ROAD.outer - 1.12, LANE_REACH] },
];

/** 默认构图要框进去的点：底座顶面四角与两侧厚度、塔尖、牌坊顶、城楼顶、天际线顶、灯串高点。 */
const framingPoints = () => {
    const h = BASE.half;
    const points: THREE.Vector3[] = [];
    [-h, h].forEach(x => [-h, h].forEach(z => {
        points.push(new THREE.Vector3(x, 0, z));
        if (x !== z || x < 0) points.push(new THREE.Vector3(x, -BASE.depth, z));
    }));
    const towerTop = TERRACE_TOP + PAGODA.levelHeights.reduce((sum, item) => sum + item + PAGODA.eaveThickness, 0) + PAGODA.spire + 0.2;
    points.push(new THREE.Vector3(PAGODA.cx, towerTop, PAGODA.cz));
    points.push(new THREE.Vector3(PAIFANG.cx, LEVEL.lot + PAIFANG.centerRoof.y1 + 0.3, PAIFANG.cz));
    const gate = PROPS.cityWall.gate;
    points.push(new THREE.Vector3((PROPS.cityWall.x0 + PROPS.cityWall.x1) / 2, LEVEL.lot + gate.roofTop + 0.2, gate.z));
    points.push(new THREE.Vector3(PROPS.teaHouse.x, LEVEL.lot + PROPS.teaHouse.h + 0.6, PROPS.teaHouse.z));
    return points;
};

/** 滴水：牌坊檐口下沿、各食摊顶棚前沿、台基压顶前缘、城楼檐口。 */
const changanDrips = (): MachiDrip[] => {
    const drips: MachiDrip[] = [];
    // 牌坊前檐下：沿横匾一圈每隔一段一滴（局部坐标绕 yaw 变到世界）。
    for (let lx = -1.3; lx <= 1.3; lx += 0.5) {
        const p = localXZ(PAIFANG.cx, PAIFANG.cz, PAIFANG.yaw, lx, 0.34);
        drips.push({ x: p.x + (Math.random() - 0.5) * 0.1, z: p.z + (Math.random() - 0.5) * 0.1, from: LEVEL.lot + PAIFANG.sideRoof.y0 - 0.02, to: LEVEL.lot, period: 1.1 + Math.random() * 1.8, phase: Math.random() });
    }
    // 食摊顶棚前沿。
    STALLS.forEach(stall => {
        for (let lx = -0.4; lx <= 0.4; lx += 0.4) {
            const p = localXZ(stall.x, stall.z, stall.yaw, lx, STALL.depth / 2 + 0.18);
            drips.push({ x: p.x, z: p.z, from: LEVEL.lot + STALL.canopyY - 0.04, to: LEVEL.lot, period: 1.1 + Math.random() * 1.8, phase: Math.random() });
        }
    });
    // 台基压顶前缘与城楼檐口。
    for (let x = TERRACE.x0 + 0.4; x < TERRACE.x1 - TERRACE.chamfer; x += 1.3) {
        drips.push({ x, z: TERRACE.z1 + 0.08, from: TERRACE_TOP - 0.02, to: LEVEL.lot, period: 1.4 + Math.random() * 1.6, phase: Math.random() });
    }
    const gate = PROPS.cityWall.gate;
    [-0.5, 0.5].forEach(side => {
        drips.push({ x: PROPS.cityWall.x1 + 0.3, z: gate.z + side * gate.width * 0.5, from: LEVEL.lot + gate.height + 0.1, to: LEVEL.lot, period: 1.3 + Math.random() * 1.5, phase: Math.random() });
    });
    return drips;
};

/** object 是不是 ancestor 的后代。 */
const isInside = (object: THREE.Object3D, ancestor: THREE.Object3D) => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
    return false;
};

class ChanganScene implements MachiScene {
    readonly root = new THREE.Group();
    readonly framing;
    readonly weather;
    readonly reflectionPlaneY = LEVEL.lot;
    readonly surfaces;
    readonly puddles;
    // 对焦对着歌词屏正面的中心（大光圈下清晰的那一层只有一米来厚）。
    readonly focusPoint = new THREE.Vector3(BOARD.cx, BOARD.y0 + BOARD.height / 2, TERRACE.z1 + 0.03);
    readonly rebuildsForSeed = true;
    private readonly world = new THREE.Group();
    private readonly colorBatches: ChanganColorBatch[];
    private readonly lanternMaterial: THREE.MeshBasicMaterial;
    private readonly skyLanterns: THREE.Object3D[];
    private readonly skySpots: readonly { x: number; z: number }[];
    private readonly lights: ChanganLights;
    private readonly signs: ChanganSigns;
    private readonly traffic: MachiTraffic;
    private readonly lightCones: MachiLightCones;
    private readonly steam: MachiSteam;
    private readonly glowA: THREE.Vector4;
    private readonly glowB: THREE.Vector4;
    private variation: ChanganVariation;
    private song: MachiSongContext;

    constructor(private readonly context: MachiSceneContext) {
        const { materials, blend, geometryCache } = context;
        this.song = context.song;
        const variation = resolveChanganVariation(context.song.seed);
        this.variation = variation;
        materials.defineGlows(CHANGAN_GLOWS);
        this.root.name = 'Changan';

        const { base, terrace, market } = withGeometryCache(geometryCache, () => ({
            base: buildChanganBase(materials),
            terrace: buildChanganTerrace(materials),
            market: buildChanganMarket(materials, variation),
        }));
        this.colorBatches = [market.lanternBatch, market.blossomBatch];
        this.lanternMaterial = market.lanternBatch.mesh.material as THREE.MeshBasicMaterial;
        this.skyLanterns = market.skyLanterns;
        this.skySpots = PROPS.skyLanterns;
        this.world.name = 'Changan/world';
        this.world.add(base.group, terrace.group, market.group);
        // 亮的东西进倒影图层（合批前打上，合批按图层分开）。台基与塔身也进：倒影镜头不认灯光，卡通材质
        // 在那里是全黑的，正好当遮挡（塔身剪影把身后的灯笼光挡住），拱窗与檐口的暖光才映得出来。
        this.world.traverse(object => {
            if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
            const isGlow = object.material.name.startsWith('machi:glow');
            const isTerraceBody = !object.material.transparent && object.parent !== null && isInside(object, terrace.group);
            if (isGlow || isTerraceBody) object.layers.enable(MACHI_REFLECT_LAYER);
        });
        this.surfaces = { road: [base.roadSurface], lot: base.lotSurfaces };
        this.puddles = { offset: variation.puddleOffset, amount: variation.puddleAmount };
        bakeStatic(this.world);

        this.lights = new ChanganLights(blend, materials, market.lampHeads);
        this.signs = new ChanganSigns(materials, blend, {
            boardFace: terrace.boardFace,
            plaqueFace: market.plaqueFace,
            bannerFaces: market.bannerFaces,
            stallSignFaces: market.stallSignFaces,
            teaNeonFace: market.teaNeonFace,
            eq: terrace.eq,
        });
        // 招牌都进倒影图层（横匾、竖幡、幌子、霓虹、歌词屏都是亮的）。
        this.signs.group.traverse(object => {
            if (object instanceof THREE.Mesh) object.layers.enable(MACHI_REFLECT_LAYER);
        });

        const clipping = createBaseClippingPlanes(BASE.half);
        this.traffic = withGeometryCache(geometryCache, () => new MachiTraffic(materials, blend, clipping, CHANGAN_LANES, LEVEL.road));
        // 光柱：两盏宫灯往下、右摊顶棚下各一束。
        this.lightCones = new MachiLightCones(materials, blend, [
            ...market.lampHeads.map(head => ({ apex: head, target: new THREE.Vector3(head.x, LEVEL.lot, head.z), radius: 1.3, gain: 0.9 })),
            { apex: new THREE.Vector3(STALLS[0]!.x - 0.2, LEVEL.lot + STALL.canopyY - 0.1, STALLS[0]!.z + 0.15), target: new THREE.Vector3(STALLS[0]!.x - 0.2, LEVEL.lot, STALLS[0]!.z + 0.25), radius: 0.9, gain: 0.6 },
        ]);
        // 白气：三个食摊的蒸笼（密度按歌变）+ 路中间的井盖一缕。
        this.steam = new MachiSteam(materials, blend, [
            ...market.steamSources,
            { position: new THREE.Vector3(-2.4, LEVEL.road + 0.02, (ROAD.inner + ROAD.outer) / 2 + 0.3), puffs: Math.max(4, Math.round(6 * variation.smokeDensity)), period: 4.4, size: 0.9 },
        ]);
        this.root.add(this.world, this.lights.group, this.signs.group, this.traffic.group, this.lightCones.mesh, this.steam.mesh);

        this.weather = {
            half: BASE.half,
            groundY: (LEVEL.lot + LEVEL.road) / 2,
            roofs: [
                { x0: TERRACE.x0, z0: TERRACE.z0, x1: TERRACE.x1, z1: TERRACE.z1, y: TERRACE_TOP },
                { x0: PAIFANG.cx - 1.6, z0: PAIFANG.cz - 0.7, x1: PAIFANG.cx + 1.6, z1: PAIFANG.cz + 0.9, y: LEVEL.lot + PAIFANG.centerRoof.y1 },
                { x0: 0.7, z0: -0.6, x1: ROAD.inner, z1: ROAD.inner, y: LEVEL.lot + STALL.canopyY + 0.1 },
                { x0: STALLS[2]!.x - 0.8, z0: STALLS[2]!.z - 0.5, x1: STALLS[2]!.x + 0.8, z1: STALLS[2]!.z + 0.5, y: LEVEL.lot + STALL.canopyY + 0.1 },
            ],
            drips: changanDrips(),
            // 落进灯光里的雨丝被照亮：歌词屏前、宫灯下、食摊灯笼下。
            glints: [
                { position: new THREE.Vector3(BOARD.cx, BOARD.y0 + 0.5, TERRACE.z1 + 0.6), radius: 2.1 },
                { position: new THREE.Vector3(market.lampHeads[1]!.x, market.lampHeads[1]!.y - 0.3, market.lampHeads[1]!.z), radius: 1.4 },
                { position: new THREE.Vector3(STALLS[0]!.x, 1.7, STALLS[0]!.z + 0.3), radius: 1.5 },
            ],
            windYaw: variation.windYaw,
            windSlant: variation.windSlant,
        };
        this.framing = { points: framingPoints(), view: { ...CHANGAN_VIEW } };
        // 雾里的两处灯：广场灯笼区、塔基泛光。
        this.glowA = new THREE.Vector4(-1.0, 0, 1.4, 3.0);
        this.glowB = new THREE.Vector4(PAGODA.cx, 0, TERRACE.z1 - 0.4, 3.0);
        this.syncColors();
        context.invalidateShadows();
    }

    setContent(content: MachiSceneContent) {
        this.signs.setContent(content);
    }

    swapSong(song: MachiSongContext, content: MachiSceneContent) {
        this.song = song;
        this.variation = resolveChanganVariation(song.seed);
        this.setContent(content);
    }

    direct(frame: MachiSceneFrame) {
        const { songTime, ambientTime, chorus, staticMode } = frame;
        if (frame.targetChanged) this.signs.showBoard(frame.target, frame.lines, frame.immediate, frame.showText);
        else if (frame.preheat) this.signs.preheat(frame.preheat, frame.lines, frame.showText);
        const { environment, look } = frame;
        const lanternFlicker = staticMode ? 1 : resolveMachiFlicker(ambientTime + 3.1, `${frame.seed}:lanterns`, 0.45);
        // 夜里灯笼亮、白天弱下去；泛光只在大雁塔是主角时亮着。
        const lanterns = look.artificial * (0.8 + 0.2 * lanternFlicker);
        const { beat } = frame;
        const pagoda = look.artificial * (1 + 0.08 * chorus + 0.05 * frame.audio) * beat.warm;
        this.lights.setLevels({ lanterns, pagoda, pools: (1 - 0.85 * environment.daylight) * (1 + beat.thump) });
        // 灯笼批的亮度：暖色灯那一组随节拍，闪烁落在整批上。
        const lanternLevel = 1.9 * lanterns * (0.9 + 0.1 * lanternFlicker) * machiLightboxGroup(beat, 0);
        this.lanternMaterial.color.setScalar(Math.max(0.15, lanternLevel));
        this.context.materials.setGlowLevel('eqBar', (0.7 + 0.3 * look.artificial) * (1 + 0.3 * chorus));
        this.context.materials.setGlowLevel('palaceLamp', (0.15 + 0.85 * look.streetLamps) * (0.85 + 0.15 * lanternFlicker));
        this.context.materials.setGlowLevel('festoonBulb', lanterns * machiNeonGroup(beat, 1));
        this.context.materials.setGlowLevel('pagodaArch', pagoda * machiNeonGroup(beat, 0));
        this.context.materials.setGlowLevel('eaveTrim', pagoda);
        this.context.materials.setGlowLevel('skyLantern', 0.4 + 0.6 * lanterns);
        this.context.materials.setGlowLevel('teaEave', lanterns * machiNeonGroup(beat, 2));
        // 会动的东西：车按氛围时钟，白气、光柱慢慢流；两盏天灯慢慢升起、绕回。静态模式下街上没有车。
        this.traffic.group.visible = !staticMode;
        this.traffic.update(ambientTime, frame.seed, frame.trafficChance);
        this.lightCones.update(ambientTime, lanterns * (1 - 0.6 * environment.daylight));
        this.steam.update(ambientTime, frame.atmosphere.wind);
        const skyRise = 5.8;
        this.skyLanterns.forEach((lantern, index) => {
            const spot = this.skySpots[index]!;
            const t = ((ambientTime * 0.023 + this.variation.skyPhase[index]!) % 1 + 1) % 1;
            lantern.position.set(
                spot.x + Math.sin(ambientTime * 0.11 + index * 2.4) * 0.5,
                1.5 + t * skyRise,
                spot.z + Math.cos(ambientTime * 0.09 + index * 1.9) * 0.35,
            );
            lantern.scale.setScalar(0.55 + 0.45 * Math.sin(Math.PI * t));
        });
        const atmosphere = frame.atmosphere;
        atmosphere.glowA.copy(this.glowA);
        atmosphere.glowB.copy(this.glowB);
        const night = 1 - 0.85 * environment.daylight;
        atmosphere.glowColorA.copy(this.context.blend.get('lanternAmber')).multiplyScalar(0.5 * lanterns * night);
        atmosphere.glowColorB.copy(this.context.blend.get('pagodaGold')).multiplyScalar(0.42 * pagoda * night);
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
    }

    syncColors() {
        this.context.materials.syncColors();
        this.lights.sync();
        this.traffic.syncColors();
        this.lightCones.syncColors();
        this.steam.syncColors();
        const color = new THREE.Color();
        this.colorBatches.forEach(batch => {
            for (let index = 0; index < batch.keys.length; index += 1) {
                color.copy(this.context.blend.get(batch.keys[index]!)).multiplyScalar(batch.shade[index]!);
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
            const car = resolveMachiCar(t, seed, CHANGAN_LANES, chance);
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
        this.lightCones.dispose();
        this.steam.dispose();
        this.context.materials.dispose();
        this.root.removeFromParent();
    }
}

export const CHANGAN_SCENE: MachiSceneDefinition = {
    resolveArt: resolveChanganArt,
    create: context => new ChanganScene(context),
};
