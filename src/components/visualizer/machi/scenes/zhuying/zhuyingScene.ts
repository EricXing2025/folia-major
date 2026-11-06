import * as THREE from 'three';
import { mixHexColors } from '../../../../../utils/themeColorMath';
import { createVisualizerRng } from '../../../visualizerSeedHash';
import type { MachiSongContext } from '../../createMachiRuntime';
import { machiNeonGroup } from '../../engine/beatFx';
import { MachiLightCones } from '../../engine/fx/lightCones';
import { MACHI_REFLECT_LAYER } from '../../engine/fx/reflection';
import { MachiSteam } from '../../engine/fx/steam';
import type { MachiDrip } from '../../engine/fx/weather';
import { MACHI_BASE } from '../../engine/geometry/plinth';
import { bakeStatic, withGeometryCache } from '../../engine/geometry/shapes';
import type { MachiGlowSpec } from '../../engine/materials';
import { vivid, type MachiArtResolver } from '../../engine/palette';
import type { MachiScene, MachiSceneContent, MachiSceneContext, MachiSceneDefinition, MachiSceneFrame } from '../types';
import { buildZhuyingDesk } from './desk';
import { buildZhuyingInterior, type ZhuyingProductBatch } from './interior';
import { DESK, LEVEL, LYRIC, ROOM, SKYLINE, TEA, WINDOW, ZHUYING_VIEW } from './layout';
import { buildZhuyingRoom } from './room';
import { buildZhuyingSkyline } from './skyline';
import { ZhuyingLights } from './zhuyingLights';
import { resolveZhuyingVariation } from './zhuyingSeed';
import { ZhuyingSigns } from './zhuyingSigns';

// src/components/visualizer/machi/scenes/zhuying/zhuyingScene.ts
// 烛影长安：夜里一间临街书房（一间屋子的大小，不是大平层）。后墙整面落地棂格窗，窗外是雨里的长安——
// 湿街、两重唐风屋顶、被灯光洗亮的大雁塔（窗外唯一的暖色大块）、左端的城楼，窗角探进来一枝樱花。
// 屋里暖琥珀：窗前右中一张书桌，超宽显示器上是 K 线图（标题栏写曲名、底部量柱与末根蜡烛随拍子长）、
// 前沿一条 LED 跑马灯、键盘、杯子、耳机架、斜杆台灯、小键盘台；左墙矮书架上一排书脊，上方 K 线霓虹；
// 后墙右段实墙一圈环形灯（歌手名霓虹 + EQ 柱随节拍起伏）；前左矮茶案冒热气，旁边纸灯笼与蒲团。
// 会动的：EQ 柱、量柱、末根蜡烛、茶壶白气、台灯灯锥、街上的雨与湿反光。按歌变的：樱花角、吊盆位、
// 天际线灯窗、书脊配色、蜡烛图、末根蜡烛阴阳、跑马灯字条、风向、水洼（zhuyingSeed.ts）。

/** 书房自己的颜色：暖木与宣纸的屋里，深蓝的屋外；塔是暖金，霓虹一粉一青，蜡烛图红绿两色。 */
const ZHUYING_ART = {
    wallInner: '#8a7a68',
    floorWood: '#4a3728',
    woodDark: '#33261c',
    woodMid: '#5a4530',
    ceiling: '#3a2e24',
    blind: '#8f7a52',
    deskTop: '#3a2c22',
    plasticDark: '#1c1f26',
    keycap: '#2c3038',
    mug: '#7a4a3a',
    metal: '#8a8f96',
    lampShade: '#c9965a',
    teapot: '#6a4a38',
    teacup: '#d8cdb8',
    cushion: '#9a7c4a',
    rug: '#5c4a3a',
    plant: '#4f8a46',
    roofBody: '#2a2f38',
    roofDark: '#1f242c',
    roofMid: '#333a44',
    roofFar: '#1a1e26',
    pagodaBody: '#7a5a30',
    pagodaRoof: '#4a3a22',
    pagodaGlow: '#e8b45c',
    branch: '#3a2a24',
    blossom: '#f2a8c0',
    chartUp: '#35d07f',
    chartDown: '#f0485c',
    ringLight: '#ffd9e8',
    neonPink: '#ff5fa2',
    neonCyan: '#5fd8e8',
    screenGlow: '#6aa9ff',
    chartMark: '#ffffff',
} as const;

const resolveZhuyingArt: MachiArtResolver = (_theme, _seed, base) => ({
    ...ZHUYING_ART,
    // 灯环与霓虹向主题靠一点；屏幕冷光向主题的 LED 色偏一点。
    ringLight: mixHexColors(ZHUYING_ART.ringLight, base.interiorLight, 0.35),
    neonPink: mixHexColors(ZHUYING_ART.neonPink, base.neon, 0.4),
    neonCyan: mixHexColors(ZHUYING_ART.neonCyan, base.neon, 0.18),
    screenGlow: mixHexColors(ZHUYING_ART.screenGlow, base.led, 0.4),
    blossom: mixHexColors(ZHUYING_ART.blossom, base.brand[0], 0.25),
    chartUp: vivid('#35d07f', 0.5, 0.4, 0.65),
    chartDown: vivid('#f0485c', 0.5, 0.4, 0.65),
});

/** 自发光件：颜色键与亮度倍数（线性空间，> 1 才被 bloom 轻轻带出光晕）。 */
const ZHUYING_GLOWS: Record<string, MachiGlowSpec> = {
    shelfStrip: { key: 'interiorLight', level: 1.8 },
    lantern: { key: 'interiorLight', level: 1.6 },
    lampGlow: { key: 'interiorLight', level: 2.4 },
    pagoda: { key: 'pagodaGlow', level: 1.6 },
    gateLamp: { key: 'interiorLight', level: 1.4 },
    cityWindow: { key: 'interiorLight', level: 0.55 },
    chartMark: { key: 'chartMark', level: 0.9 },
    chartUp: { key: 'chartUp', level: 1.3 },
    chartDown: { key: 'chartDown', level: 1.3 },
    eqBar: { key: 'neonPink', level: 1.5 },
    keyLit: { key: 'interiorLight', level: 1.1 },
};

/** 默认构图要框进去的点：房间四角与地面、两面墙头、显示器顶、塔尖。 */
const framingPoints = () => {
    const points: THREE.Vector3[] = [
        new THREE.Vector3(ROOM.x0, LEVEL.floor, ROOM.z0),
        new THREE.Vector3(ROOM.x1, LEVEL.floor, ROOM.z0),
        new THREE.Vector3(ROOM.x0, LEVEL.floor, ROOM.z1),
        new THREE.Vector3(ROOM.x1, LEVEL.floor, ROOM.z1),
        new THREE.Vector3(ROOM.x0, ROOM.wallHeight, ROOM.z0),
        new THREE.Vector3(ROOM.x1, ROOM.wallHeight, ROOM.z0),
        new THREE.Vector3(ROOM.x0, ROOM.wallHeight, ROOM.z1),
        new THREE.Vector3(ROOM.x1, ROOM.wallHeight, ROOM.z1),
        new THREE.Vector3(SKYLINE.pagoda.x, LEVEL.street + SKYLINE.pagoda.height + 0.2, SKYLINE.pagoda.z),
        new THREE.Vector3(DESK.x1, DESK.top, DESK.z1),
    ];
    return points;
};

/** 滴水：窗外上沿一排（窗框外滴水落到街上）、左墙外檐口几滴。节奏按歌变。 */
const zhuyingDrips = (seed: string | number): MachiDrip[] => {
    const random = createVisualizerRng(`zhuying:drips:${seed}`);
    const drips: MachiDrip[] = [];
    for (let x = WINDOW.x0 + 0.3; x < WINDOW.x1; x += 0.55) {
        drips.push({ x: x + (random() - 0.5) * 0.1, z: ROOM.z0 - 0.08, from: WINDOW.head + 0.3, to: LEVEL.street, period: 1.1 + random() * 1.6, phase: random() });
    }
    // 城楼的檐口（透过窗看得见的那排楼沿）。
    for (let x = SKYLINE.gate.x0 + 0.15; x < SKYLINE.gate.x1; x += 0.32) {
        drips.push({ x: x + (random() - 0.5) * 0.06, z: SKYLINE.gate.z1 + 0.04, from: 1.06, to: LEVEL.street, period: 1.3 + random() * 1.8, phase: random() });
    }
    return drips;
};

/** object 是不是 ancestor 的后代。 */
const isInside = (object: THREE.Object3D, ancestor: THREE.Object3D) => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
    return false;
};

class ZhuyingScene implements MachiScene {
    readonly root = new THREE.Group();
    readonly framing;
    readonly weather;
    readonly reflectionPlaneY = LEVEL.street + 0.01;
    readonly surfaces;
    readonly puddles;
    // 对焦对着窗上的歌词点阵条。
    readonly focusPoint = new THREE.Vector3((LYRIC.x0 + LYRIC.x1) / 2, (LYRIC.y0 + LYRIC.y1) / 2, LYRIC.z);
    readonly rebuildsForSeed = true;
    private readonly world = new THREE.Group();
    private readonly lights: ZhuyingLights;
    private readonly signs: ZhuyingSigns;
    private readonly steam: MachiSteam;
    private readonly lightCones: MachiLightCones;
    private readonly productBatches: ZhuyingProductBatch[];
    private readonly roomTextures: THREE.Texture[];
    private readonly glowA: THREE.Vector4;
    private readonly glowB: THREE.Vector4;
    private readonly variation;

    constructor(private readonly context: MachiSceneContext) {
        const { materials, blend, geometryCache } = context;
        const variation = resolveZhuyingVariation(context.song.seed);
        this.variation = variation;
        materials.defineGlows(ZHUYING_GLOWS);
        this.root.name = 'Zhuying';

        const built = withGeometryCache(geometryCache, () => ({
            room: buildZhuyingRoom(materials),
            skyline: buildZhuyingSkyline(materials, variation),
            desk: buildZhuyingDesk(materials, variation),
            interior: buildZhuyingInterior(materials, variation),
        }));
        const { room, skyline, desk, interior } = built;
        this.productBatches = interior.productBatches;
        this.roomTextures = [room.streakTexture];
        this.world.name = 'Zhuying/world';
        this.world.add(room.group, skyline.group, desk.group, interior.group);
        // 亮的东西进倒影图层（湿街上映得出灯窗、塔灯、灯笼）；天际线的楼身当遮挡。
        this.world.traverse(object => {
            if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
            const isGlow = object.material.name.startsWith('machi:glow');
            const isSkyBody = !object.material.transparent && object.parent !== null && isInside(object, skyline.group);
            if (isGlow || isSkyBody) object.layers.enable(MACHI_REFLECT_LAYER);
        });
        this.surfaces = { road: [skyline.street], lot: skyline.lotSurfaces };
        this.puddles = { offset: variation.puddleOffset, amount: variation.puddleAmount };
        bakeStatic(this.world);

        this.lights = new ZhuyingLights(blend, materials, desk.lampApex, interior.lanternAt);
        this.signs = new ZhuyingSigns(materials, blend, {
            monitorFace: desk.monitorFace,
            tickerFace: desk.tickerFace,
        });
        this.signs.group.traverse(object => {
            if (object instanceof THREE.Mesh) object.layers.enable(MACHI_REFLECT_LAYER);
        });
        this.steam = new MachiSteam(materials, blend, [
            { position: interior.steamAt, puffs: 5, period: 3.4, size: 0.4 },
        ]);
        this.lightCones = new MachiLightCones(materials, blend, [
            { apex: desk.lampApex, target: desk.lampTarget, radius: 0.55, gain: 0.8 },
        ], 'interiorLight');
        this.root.add(this.world, this.lights.group, this.signs.group, this.steam.mesh, this.lightCones.mesh);

        this.weather = {
            half: MACHI_BASE.half,
            groundY: LEVEL.street,
            // 遮挡最多四块（MAX_ROOFS）：房间、塔、镜头前的两排檐口；中排屋顶是远景剪影，让位给近处的。
            roofs: [
                { x0: ROOM.x0 - 0.06, z0: ROOM.z0 - 0.06, x1: ROOM.x1 + 0.06, z1: ROOM.z1 + 0.06, y: ROOM.wallHeight },
                skyline.roofs.pagoda,
                skyline.roofs.surround[0]!,
                skyline.roofs.surround[1]!,
            ],
            drips: zhuyingDrips(context.song.seed),
            // 落进灯光里的雨丝被照亮：塔上的暖光、城楼檐下的灯、窗里泻出的灯光。
            glints: [
                { position: new THREE.Vector3(SKYLINE.pagoda.x, 1.5, SKYLINE.pagoda.z + 0.3), radius: 1.4 },
                { position: new THREE.Vector3((SKYLINE.gate.x0 + SKYLINE.gate.x1) / 2, 0.9, SKYLINE.gate.z1 + 0.3), radius: 1.0 },
                { position: new THREE.Vector3((WINDOW.x0 + WINDOW.x1) / 2, 1.6, WINDOW.z - 0.3), radius: 1.8 },
            ],
            windYaw: variation.windYaw,
            windSlant: variation.windSlant,
        };
        this.framing = { points: framingPoints(), view: { ...ZHUYING_VIEW } };
        // 雾里的两处灯：屋里的暖光、塔上的暖光。
        this.glowA = new THREE.Vector4(desk.lampApex.x, desk.lampApex.y, desk.lampApex.z, 1.6);
        this.glowB = new THREE.Vector4(SKYLINE.pagoda.x, 1.6, SKYLINE.pagoda.z + 0.3, 2.2);
        this.syncColors();
        context.invalidateShadows();
    }

    setContent(content: MachiSceneContent) {
        this.signs.setContent(content, this.variation);
    }

    /** 换歌（seed 不变）：只重画字面；seed 变了运行时会重建整个场景（rebuildsForSeed）。 */
    swapSong(_song: MachiSongContext, content: MachiSceneContent) {
        this.setContent(content);
    }

    direct(frame: MachiSceneFrame) {
        const { songTime, ambientTime, chorus, staticMode, environment, look } = frame;
        if (frame.targetChanged) this.signs.showBoard(frame.target, frame.lines, frame.immediate, frame.showText);
        else if (frame.preheat) this.signs.preheat(frame.preheat, frame.lines, frame.showText);
        const { beat } = frame;
        const night = 1 - 0.85 * environment.daylight;
        // 屋里的暖光随小节慢慢涨落；显示器冷光跟着屏面亮度与音频；地上光斑干时跟鼓点跳。
        const interior = look.artificial * beat.warm * (1 + 0.1 * chorus);
        const screen = (0.55 + 0.45 * night) * (0.8 + 0.2 * frame.audio + 0.1 * chorus);
        this.lights.setLevels({
            interior,
            screen,
            pools: night * (1 + beat.thump),
        });
        const materials = this.context.materials;
        materials.setGlowLevel('shelfStrip', interior);
        materials.setGlowLevel('lantern', interior);
        materials.setGlowLevel('lampGlow', interior * (0.9 + 0.1 * frame.flicker));
        materials.setGlowLevel('pagoda', night * (0.9 + 0.15 * beat.warm));
        materials.setGlowLevel('gateLamp', (0.5 + 0.5 * look.streetLamps) * (0.85 + 0.15 * frame.flicker));
        materials.setGlowLevel('cityWindow', night * (0.75 + 0.25 * beat.warm));
        materials.setGlowLevel('chartMark', 0.65 + 0.35 * frame.audio * beat.neon);
        materials.setGlowLevel('chartUp', 0.85 + 0.35 * beat.thump);
        materials.setGlowLevel('chartDown', 0.85 + 0.35 * beat.thump);
        materials.setGlowLevel('eqBar', 0.7 + 0.4 * beat.neon * (0.5 + frame.audio));
        materials.setGlowLevel('keyLit', interior * (0.7 + 0.3 * machiNeonGroup(beat, 2)));
        this.steam.update(ambientTime, frame.atmosphere.wind);
        this.lightCones.update(ambientTime, interior * (1 - 0.6 * environment.daylight));
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
        const atmosphere = frame.atmosphere;
        atmosphere.glowA.copy(this.glowA);
        atmosphere.glowB.copy(this.glowB);
        atmosphere.glowColorA.copy(this.context.blend.get('interiorLight')).multiplyScalar(0.5 * interior * night);
        atmosphere.glowColorB.copy(this.context.blend.get('pagodaGlow')).multiplyScalar(0.45 * night);
    }

    syncColors() {
        this.context.materials.syncColors();
        this.lights.sync();
        this.steam.syncColors();
        this.lightCones.syncColors();
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

    dispose() {
        const geometries = new Set<THREE.BufferGeometry>(this.context.geometryCache.values());
        this.root.traverse(object => {
            if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) geometries.add(object.geometry);
        });
        geometries.forEach(geometry => geometry.dispose());
        this.roomTextures.forEach(texture => texture.dispose());
        this.lights.dispose();
        this.signs.dispose();
        this.steam.dispose();
        this.lightCones.dispose();
        this.context.materials.dispose();
        this.root.removeFromParent();
    }
}

export const ZHUYING_SCENE: MachiSceneDefinition = {
    resolveArt: resolveZhuyingArt,
    create: context => new ZhuyingScene(context),
};
