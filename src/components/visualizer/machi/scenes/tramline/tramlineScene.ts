import * as THREE from 'three';
import { mixHexColors } from '../../../../../utils/themeColorMath';
import type { MachiSongContext } from '../../createMachiRuntime';
import { machiNeonGroup } from '../../engine/beatFx';
import { resolveMachiFlicker } from '../../engine/director';
import { MachiLightCones } from '../../engine/fx/lightCones';
import { MACHI_REFLECT_LAYER } from '../../engine/fx/reflection';
import { MachiSteam } from '../../engine/fx/steam';
import type { MachiDrip, MachiWeatherLayout } from '../../engine/fx/weather';
import { bakeStatic, withGeometryCache } from '../../engine/geometry/shapes';
import { MACHI_BASE } from '../../engine/geometry/plinth';
import type { MachiGlowSpec } from '../../engine/materials';
import type { MachiArtResolver } from '../../engine/palette';
import { createVisualizerRng } from '../../../visualizerSeedHash';
import type { MachiScene, MachiSceneContent, MachiSceneContext, MachiSceneDefinition, MachiSceneFrame } from '../types';
import { buildTramlineGround, tramlineFramingPoints } from './base';
import { buildCafeInterior, buildTangLau } from './building';
import {
    BOARD,
    BUILDING,
    FASCIA,
    KIOSK,
    LEVEL,
    STATION,
    TRAMLINE_VIEW,
} from './layout';
import {
    buildKiosk,
    buildStreetLamp,
    buildStreetProps,
    buildStreetSign,
    buildTramPoles,
    buildTramStop,
} from './props';
import { MachiTram } from './tram';
import { TramlineLights } from './tramlineLights';
import { resolveTramlineVariation, type TramlineVariation } from './tramlineSeed';
import { TramlineSigns } from './tramlineSigns';

// src/components/visualizer/machi/scenes/tramline/tramlineScene.ts
// 港岛末班电车：雨后街角的唐楼（三层，灰米色墙、深绿窗框、小阳台与窗式空调），一层骑楼底是开着暖灯的
// 茶餐厅，二层转角挑一块大歌词灯箱；前面一条双轨电车路，绿色双层叮叮车沿近轨慢慢开过；站台有盖候车亭、
// 报刊亭、街名路牌、中央电线杆与接触线。曲名写在茶餐厅门头店招，歌手写在电车腰板广告与站牌下的小牌，
// 站台电子信息牌滚下一句歌词。霓虹分三组：茶餐厅暖光（0）、旧红商业霓虹（1）、冷色交通灯（2）。
// 按歌变的：电车涂装与广告版式、店招版式、亮灯窗、空调位、阳台盆栽、海报版式、水洼风向、出场相位
// （tramlineSeed.ts，rebuildsForSeed 重建）。

/** 场景自己的颜色：唐楼的灰米与深绿、茶餐厅的暖木与花砖、报刊亭的铁皮绿、电车的墨绿与奶油。 */
const TRAMLINE_ART = {
    tangWall: '#b9a98f',
    tangTrim: '#8f8271',
    tangBand: '#85907f',
    windowFrame: '#3d5048',
    windowInner: '#1e2624',
    windowGlass: '#22303a',
    curtain: '#a89a7c',
    roofTar: '#3a4145',
    cafeWall: '#8a7358',
    cafeFloor: '#4a6a62',
    awning: '#69574a',
    boardFrame: '#2e3d3a',
    boardRim: '#43544e',
    counterBody: '#7a5548',
    chrome: '#b8bcc0',
    glassCase: '#cfc9b8',
    kettle: '#c8ccd2',
    benchSeat: '#8f3f3a',
    tableTop: '#e8e0cc',
    stoolSeat: '#c8552e',
    lampShade: '#2f5c40',
    fanBlade: '#3a4a44',
    shelterPaint: '#607675',
    shelterTrim: '#33403e',
    signBox: '#26332f',
    platformEdge: '#e8e0c8',
    kioskBody: '#3d5947',
    kioskTrim: '#8f2f33',
    posterPaper: '#e8e0c8',
    rail: '#9aa2a8',
    drain: '#3a4046',
    electricBox: '#5a6663',
    binBody: '#4a5a52',
    binLid: '#33403e',
    bollard: '#33403e',
    potColor: '#8f4f3a',
    planterGreen: '#3f6a48',
    pipe: '#5a6663',
    acUnit: '#c6c4bb',
    acGrille: '#8e9089',
    neonRed: '#e46d78',
    neonMint: '#6dcebf',
    windowWarm: '#ffd79a',
    cafeLight: '#ffd17b',
    signPlateText: '#e8e0c8',
    posterBaseA: '#e8e0c8',
    posterPanelA: '#2f5c40',
    posterTextA: '#2f3f3a',
    posterAccentA: '#b8322e',
    posterBaseB: '#26332f',
    posterPanelB: '#d8a24a',
    posterTextB: '#e8e0c8',
    posterAccentB: '#6dcebf',
} as const;

/** 电车涂装：车身、奶油腰板、车顶。0 经典墨绿，1 浅一档的广告涂装绿，2 墨绿配红边（任务基准 tramGreen）。 */
const TRAM_LIVERIES = [
    { body: '#3a6b4e', band: '#e8e0c8', roof: '#d8d0bc' },
    { body: '#558a64', band: '#eee4c8', roof: '#d8d0bc' },
    { body: '#3f5852', band: '#b8452e', roof: '#d8d0bc' },
] as const;

/** 茶餐厅店招版式（底 / 字 / 点缀），按歌换。 */
const CAFE_SIGNS = [
    { base: '#f2ead2', text: '#2f3f3a', accent: '#8f2f33' },
    { base: '#2f5c40', text: '#f2ead2', accent: '#d8a24a' },
    { base: '#3a4a44', text: '#f2ead2', accent: '#6dcebf' },
] as const;

/** 电车广告版式（底 / 字 / 饰带）。 */
const TRAM_ADS = [
    { base: '#20302c', text: '#f2ead2', accent: '#d8a24a' },
    { base: '#e8e0c8', text: '#2f3f3a', accent: '#8f2f33' },
    { base: '#2f5c40', text: '#e8e0c8', accent: '#e46d78' },
] as const;

const resolveTramlineArt: MachiArtResolver = (_theme, seed, base) => {
    const variation = resolveTramlineVariation(seed);
    const livery = TRAM_LIVERIES[variation.tramLivery]!;
    const cafeSign = CAFE_SIGNS[variation.cafeSignStyle]!;
    const ad = TRAM_ADS[variation.tramAdStyle]!;
    return {
        ...TRAMLINE_ART,
        // 霓虹与灯色向主题各拉一点，跟整条街同族。
        neonRed: mixHexColors(TRAMLINE_ART.neonRed, base.neon, 0.3),
        neonMint: mixHexColors(TRAMLINE_ART.neonMint, base.led, 0.25),
        cafeLight: mixHexColors(TRAMLINE_ART.cafeLight, base.interiorLight, 0.45),
        windowWarm: mixHexColors(TRAMLINE_ART.windowWarm, base.interiorLight, 0.4),
        // 店招底色向主题品牌色拉一点（三种版式各自的底）。
        cafeSignBase: mixHexColors(cafeSign.base, base.brand[2] ?? cafeSign.base, variation.cafeSignStyle === 0 ? 0.12 : 0.3),
        cafeSignText: cafeSign.text,
        cafeSignAccent: mixHexColors(cafeSign.accent, base.neon, 0.3),
        tramAdBase: ad.base,
        tramAdText: ad.text,
        tramAdAccent: mixHexColors(ad.accent, base.brand[0] ?? ad.accent, 0.4),
        posterAccentA: mixHexColors(TRAMLINE_ART.posterAccentA, base.neon, 0.35),
        posterAccentB: mixHexColors(TRAMLINE_ART.posterAccentB, base.led, 0.35),
        tramBody: livery.body,
        tramBand: livery.band,
        tramRoof: livery.roof,
        tramTrim: '#33403e',
        tramCabin: mixHexColors('#ffca8a', base.interiorLight, 0.5),
    };
};

/** 自发光件：颜色键与亮度倍数（线性空间，> 1 才会被 bloom 轻轻带出光晕）。 */
const TRAMLINE_GLOWS: Record<string, MachiGlowSpec> = {
    windowLit: { key: 'windowWarm', level: 0.8 },
    cafeLamp: { key: 'cafeLight', level: 2.1 },
    lampHead: { key: 'streetLight', level: 1.9 },
    tramCabin: { key: 'tramCabin', level: 1.5 },
    tramHead: { key: 'streetLight', level: 1.7 },
    tramTail: { key: 'stopRed', level: 2.2 },
    shelterLamp: { key: 'streetLight', level: 1.7 },
};

/** 滴水：站台雨棚两侧、茶餐厅门头雨篷前檐、报刊亭檐口、唐楼排水管口各一串（相位按歌定）。 */
const tramlineDrips = (seed: string | number): MachiDrip[] => {
    const rng = createVisualizerRng(`machi:tramline-drips:${seed}`);
    const drip = (x: number, z: number, from: number, to: number): MachiDrip => ({
        x, z, from, to,
        period: 0.9 + rng() * 1.7,
        phase: rng(),
    });
    const drips: MachiDrip[] = [];
    // 站台雨棚前沿与两端。
    for (let x = STATION.x0 + 0.4; x < STATION.x1 - 0.2; x += 0.55) {
        drips.push(drip(x, STATION.z1 + 0.12, STATION.roofFrontY - 0.03, LEVEL.platform));
    }
    drips.push(drip(STATION.x0 + 0.15, (STATION.z0 + STATION.z1) / 2, STATION.roofY - 0.06, LEVEL.platform));
    // 茶餐厅门头雨篷前檐。
    for (let x = FASCIA.x0 + 0.4; x < FASCIA.x1 - 0.3; x += 0.7) {
        drips.push(drip(x, FASCIA.z1 + 0.04, FASCIA.y0 - 0.02, LEVEL.lot));
    }
    // 报刊亭朝前的檐口与唐楼排水管口。
    drips.push(drip(KIOSK.cx + 0.3, KIOSK.cz + 0.75, KIOSK.roofY - 0.05, LEVEL.lot));
    drips.push(drip(BUILDING.x1 + 0.3, -2.4, LEVEL.lot + 0.3, LEVEL.lot));
    return drips;
};

class TramlineScene implements MachiScene {
    readonly root = new THREE.Group();
    readonly framing;
    readonly weather: MachiWeatherLayout;
    readonly reflectionPlaneY = 0.05;
    readonly surfaces;
    readonly puddles;
    readonly focusPoint;
    /** 亮灯窗、空调位、海报版式这些是建场景时按 seed 定死的几何：换歌重建。 */
    readonly rebuildsForSeed = true;

    private song: MachiSongContext;
    private variation: TramlineVariation;
    private readonly world = new THREE.Group();
    private readonly signs: TramlineSigns;
    private readonly lights: TramlineLights;
    private readonly tram: MachiTram;
    private readonly steam: MachiSteam;
    private readonly lightCones: MachiLightCones;
    private readonly fan: THREE.Object3D;
    private readonly glowA = new THREE.Vector4();
    private readonly glowB = new THREE.Vector4();

    constructor(private readonly context: MachiSceneContext) {
        const { materials, blend, geometryCache, song } = context;
        this.song = song;
        const variation = resolveTramlineVariation(song.seed);
        this.variation = variation;
        materials.defineGlows(TRAMLINE_GLOWS);
        this.root.name = 'Tramline';

        const built = withGeometryCache(geometryCache, () => ({
            ground: buildTramlineGround(materials),
            building: buildTangLau(materials, variation),
            cafe: buildCafeInterior(materials),
            stop: buildTramStop(materials, variation),
            kiosk: buildKiosk(materials, variation),
            streetSign: buildStreetSign(materials),
            lamp: buildStreetLamp(materials),
            poles: buildTramPoles(materials),
            props: buildStreetProps(materials),
        }));
        this.fan = built.cafe.fan;
        this.world.name = 'Tramline/world';
        this.world.add(
            built.ground.group,
            built.building.group,
            built.cafe.group,
            built.stop.group,
            built.kiosk.group,
            built.streetSign.group,
            built.lamp.group,
            built.poles,
            built.props,
        );
        // 亮的东西与遮挡件进倒影图层（合批前打上）：唐楼实体在倒影镜头里当遮挡，灯箱不会穿墙映到地面。
        this.world.traverse(object => {
            if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
            const isGlow = object.material.name.startsWith('machi:glow');
            const isBuildingBody = !object.material.transparent && object.parent !== null && isInside(object, built.building.group);
            if (isGlow || isBuildingBody) object.layers.enable(MACHI_REFLECT_LAYER);
        });
        this.surfaces = { road: [built.ground.roadSurface], lot: built.ground.lotSurfaces };
        this.puddles = { offset: variation.puddleOffset, amount: variation.puddleAmount };
        bakeStatic(this.world);

        this.tram = withGeometryCache(geometryCache, () => new MachiTram(materials, blend, variation));
        this.signs = new TramlineSigns(materials, blend, {
            board: built.building.boardFace,
            fascia: built.building.fasciaFace,
            neon: built.building.neonFaces,
            menus: built.cafe.menuFaces,
            decals: built.cafe.decalFaces,
            ticker: { position: new THREE.Vector3(STATION.ticker.x, STATION.ticker.y, STATION.ticker.z), rotationY: 0, width: STATION.ticker.width, height: STATION.ticker.height },
            stopPlate: built.stop.stopPlateFace,
            artistPlate: built.stop.artistPlateFace,
            posters: built.kiosk.posterFaces,
            streetPlate: built.streetSign.face,
            sticker: built.stop.stickerFace,
        }, variation, this.tram.adAnchor, this.tram.destAnchor);
        const doorAt = new THREE.Vector3(BUILDING.x1 - 0.64, LEVEL.lot, BUILDING.z1 - BUILDING.arcade);
        const kioskAt = new THREE.Vector3(KIOSK.cx + 0.4, KIOSK.roofY, KIOSK.cz + 0.4);
        this.lights = new TramlineLights(blend, materials, built.cafe.lamps, built.lamp.head, doorAt, kioskAt);
        const lamp = built.lamp.head;
        this.lightCones = new MachiLightCones(materials, blend, [
            { apex: lamp, target: new THREE.Vector3(lamp.x, LEVEL.road, lamp.z + 0.35), radius: 1.3, gain: 0.5 },
        ]);
        this.steam = new MachiSteam(materials, blend, [
            { position: built.cafe.steam, puffs: 5, period: 2.1, size: 0.55 },
            { position: new THREE.Vector3(-0.9, LEVEL.road + 0.02, 0.85), puffs: 4, period: 3.4, size: 0.5 },
        ]);
        this.root.add(this.world, this.lights.group, this.signs.group, this.tram.group, this.lightCones.mesh, this.steam.mesh);

        this.focusPoint = new THREE.Vector3(BOARD.cx, BOARD.cy, BOARD.cz);
        const boardFront = new THREE.Vector3(Math.sin(BOARD.azimuth), 0, Math.cos(BOARD.azimuth));
        this.weather = {
            half: MACHI_BASE.half,
            groundY: LEVEL.lot * 0.5,
            roofs: [
                { x0: BUILDING.x0 - 0.06, z0: BUILDING.z0 - 0.06, x1: BUILDING.x1 + 0.06, z1: BUILDING.z1 + 0.06, y: BUILDING.parapetTop },
                { x0: FASCIA.x0, z0: FASCIA.z0, x1: FASCIA.x1, z1: FASCIA.z1, y: FASCIA.y1 + 0.02 },
                { x0: STATION.x0 - 0.05, z0: STATION.z0 - 0.02, x1: STATION.x1 + 0.05, z1: STATION.z1 + 0.16, y: STATION.roofY + 0.06 },
                { x0: KIOSK.cx - KIOSK.w / 2 - 0.09, z0: KIOSK.cz - KIOSK.d / 2 - 0.09, x1: KIOSK.cx + KIOSK.w / 2 + 0.09, z1: KIOSK.cz + KIOSK.d / 2 + 0.09, y: KIOSK.roofY + 0.07 },
            ],
            drips: tramlineDrips(song.seed),
            glints: [
                { position: new THREE.Vector3(lamp.x, 2.2, lamp.z + 0.2), radius: 1.8 },
                { position: new THREE.Vector3(doorAt.x, 1.4, BUILDING.z1 + 0.4), radius: 1.9 },
                { position: new THREE.Vector3(BOARD.cx + boardFront.x, BOARD.cy + 0.2, BOARD.cz + boardFront.z), radius: 2.2 },
            ],
            windYaw: variation.windYaw,
            windSlant: variation.windSlant,
        };
        this.framing = { points: tramlineFramingPoints(), view: { ...TRAMLINE_VIEW } };
        // 雾里的两处灯：店门口、路灯下。
        this.glowA.set(doorAt.x, 0, BUILDING.z1 + 0.4, 3.2);
        this.glowB.set(lamp.x, 0, lamp.z + 0.3, 2.4);
        this.syncColors();
        context.invalidateShadows();
    }

    setContent(content: MachiSceneContent) {
        this.signs.setContent(content);
    }

    swapSong(song: MachiSongContext, content: MachiSceneContent) {
        this.song = song;
        this.variation = resolveTramlineVariation(song.seed);
        this.setContent(content);
    }

    direct(frame: MachiSceneFrame) {
        const { songTime, ambientTime, chorus, staticMode } = frame;
        if (frame.targetChanged) this.signs.showBoard(frame.target, frame.lines, frame.immediate, frame.showText);
        else if (frame.preheat) this.signs.preheat(frame.preheat, frame.lines, frame.showText);
        const { environment, look, beat } = frame;
        const streetFlicker = staticMode ? 1 : resolveMachiFlicker(ambientTime + 1.7, `${frame.seed}:street`, 0.4);
        const street = look.streetLamps * (0.78 + 0.22 * streetFlicker);
        const night = 1 - 0.85 * environment.daylight;
        // 灯：店内暖光跟 beat.warm 呼吸，路灯与人造光看时段；地面光斑夜里亮、鼓点再跳一下。
        const interiorLevel = (1 + 0.08 * chorus) * look.artificial * beat.warm;
        this.lights.update({
            interior: interiorLevel,
            street,
            pools: (1 - 0.85 * environment.daylight) * (1 + 0.5 * beat.thump),
            thump: beat.thump,
        });
        // 三组霓虹：茶餐厅灯与住宅暖窗走 warm、路灯灯头跟时段、车厢暖灯走冷色交通组（组 2）的拍子。
        const { materials } = this.context;
        materials.setGlowLevel('windowLit', (0.2 + 0.8 * look.artificial) * (0.85 + 0.15 * beat.warm));
        materials.setGlowLevel('cafeLamp', (0.3 + 0.7 * look.artificial) * (0.9 + 0.1 * chorus) * beat.warm);
        materials.setGlowLevel('lampHead', (0.15 + 0.85 * look.streetLamps) * (0.9 + 0.1 * streetFlicker));
        materials.setGlowLevel('tramCabin', (0.3 + 0.7 * look.artificial) * machiNeonGroup(beat, 2));
        materials.setGlowLevel('tramHead', 0.35 + 0.65 * look.streetLamps);
        materials.setGlowLevel('tramTail', 0.3 + 0.7 * look.streetLamps);
        materials.setGlowLevel('shelterLamp', 0.15 + 0.85 * look.streetLamps);
        // 会动的东西：电车沿轨循环（氛围时钟，暂停即停）、风扇转、白气与光柱慢慢流。
        this.tram.update(ambientTime, environment.wetness);
        this.fan.rotation.y = ambientTime * this.variation.fanSpeed * Math.PI;
        this.lightCones.update(ambientTime, street * (1 - 0.6 * environment.daylight));
        this.steam.update(ambientTime, frame.atmosphere.wind);
        const atmosphere = frame.atmosphere;
        atmosphere.glowA.copy(this.glowA);
        atmosphere.glowB.copy(this.glowB);
        atmosphere.glowColorA.copy(this.context.blend.get('cafeLight')).multiplyScalar(0.5 * interiorLevel * night);
        atmosphere.glowColorB.copy(this.context.blend.get('streetLight')).multiplyScalar(0.4 * street * night);
        this.signs.update({
            songTime,
            ambientTime,
            delta: frame.delta,
            staticMode,
            chorus,
            audio: frame.audio,
            flicker: frame.flicker,
            artificial: look.artificial,
            beat,
        });
    }

    syncColors() {
        this.context.materials.syncColors();
        this.lights.sync();
        this.tram.syncColors();
        this.lightCones.syncColors();
        this.steam.syncColors();
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
        this.lights.dispose();
        this.signs.dispose();
        this.tram.dispose();
        this.lightCones.dispose();
        this.steam.dispose();
        this.context.materials.dispose();
        this.root.removeFromParent();
    }
}

/** object 在 ancestor 的子树里（含自身）。 */
const isInside = (object: THREE.Object3D, ancestor: THREE.Object3D): boolean => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (node === ancestor) return true;
    }
    return false;
};

export const TRAMLINE_SCENE: MachiSceneDefinition = {
    resolveArt: resolveTramlineArt,
    create: context => new TramlineScene(context),
};
