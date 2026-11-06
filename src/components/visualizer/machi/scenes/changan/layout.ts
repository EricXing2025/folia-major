// src/components/visualizer/machi/scenes/changan/layout.ts
// 长安夜市的尺寸表（米，原点在底座中心，y 向上，+z 是前、+x 是右）。几何、灯、天气、招牌、镜头都按这里摆，
// 改一处尺寸不用到处找。与便利店同款的街角：两条路在前右角相交；夜市广场占后左象限，后中是高台与大雁塔，
// 前左是牌坊，右边一排食摊。默认镜头从前右看过来，方位角比兄弟场景收小一些（30°），让高台正面的歌词屏
// 和牌坊横匾都基本正面可读。

export const DEG = Math.PI / 180;

/** 底座：12m 见方、0.6m 厚，顶面就是路面。 */
export const BASE = { half: 6, depth: 0.6, radius: 0.12 } as const;

/** 各层地面的高度。 */
export const LEVEL = {
    road: 0,
    lot: 0.12,
} as const;

/** 两条路：前面（+z）一条沿 x，右面（+x）一条沿 z，在前右角相交；路外侧各有一条窄人行道到底座边。 */
export const ROAD = {
    inner: 2.2,
    outer: 5.5,
    curbWidth: 0.16,
    edgeLineInset: 0.24,
} as const;

/**
 * 高台：唐式石台，托起大雁塔。前右角切成 45° 斜面，中央台阶从斜面正中朝镜头方向下来
 * （这样台阶正面对着默认镜头，台基前墙又留得出整块面给歌词屏）。
 */
export const TERRACE = {
    x0: -4.3,
    x1: 1.1,
    z0: -5.6,
    z1: -2.0,
    /** 台面高度（台帮顶）。 */
    top: 1.35,
    /** 前右角斜面的投影尺寸。 */
    chamfer: 1.0,
    /** 台面铺地压顶出挑。 */
    capOverhang: 0.07,
    /** 栏板高。 */
    railTop: 0.46,
} as const;

/** 台基斜面（前右角）的中点与朝向：台阶从这里下。 */
export const CHAMFER = {
    /** 斜面两端点：前墙上的 (x1-chamfer, z1) 与右墙上的 (x1, z1-chamfer)。 */
    from: { x: TERRACE.x1 - TERRACE.chamfer, z: TERRACE.z1 },
    to: { x: TERRACE.x1, z: TERRACE.z1 - TERRACE.chamfer },
} as const;
export const CHAMFER_CENTER = {
    x: (CHAMFER.from.x + CHAMFER.to.x) / 2,
    z: (CHAMFER.from.z + CHAMFER.to.z) / 2,
} as const;
/** 台阶朝向（弧度）：斜面的外法线，正对默认镜头（45°）。 */
export const STAIR_YAW = 45 * DEG;

/** 中央台阶：从斜面中点沿 STAIR_YAW 方向下到广场。 */
export const STAIR = {
    yaw: STAIR_YAW,
    width: 1.15,
    run: 1.55,
    top: TERRACE.top,
    base: LEVEL.lot,
    steps: 9,
} as const;

/** 歌词屏：高台正面（+z 面）的宽幅深色灯箱，屏面朝 +z。 */
export const BOARD = {
    cx: -2.0,
    width: 3.8,
    height: 0.86,
    /** 屏面中心高度（台帮墙面上段）。 */
    y0: 0.44,
    /** 屏箱厚度。 */
    depth: 0.12,
    azimuth: 0,
} as const;

/** 歌词屏下的 EQ 条带：一排小竖光柱，高低跟节拍走。 */
export const EQ = {
    cx: BOARD.cx,
    width: BOARD.width - 0.2,
    count: 18,
    y0: LEVEL.lot + 0.04,
    /** 最高不碰屏框下沿（屏框底边从 0.34 起）。 */
    maxHeight: 0.17,
} as const;

/** 大雁塔：七层方塔，立在台面后中。 */
export const PAGODA = {
    cx: -1.6,
    cz: -3.85,
    baseWidth: 3.0,
    /** 每层宽是下层的比例（收分）。 */
    taper: 0.9,
    /** 各层塔身高（下大上小），共七层。 */
    levelHeights: [1.45, 1.15, 1.0, 0.9, 0.83, 0.75, 0.68] as const,
    /** 叠涩出檐：每层檐口比塔身宽出的量与檐厚。 */
    eaveOverhang: 0.25,
    eaveThickness: 0.09,
    underEave: 0.14,
    /** 塔刹高。 */
    spire: 0.8,
} as const;

/** 牌坊：前左，二柱一间一楼+两夹楼，朝镜头转一点。 */
export const PAIFANG = {
    cx: -4.35,
    cz: 0.85,
    yaw: 38 * DEG,
    pillarOffset: 1.05,
    pillarSize: 0.28,
    pillarHeight: 2.55,
    midLintel: { y0: 2.05, y1: 2.35 },
    topLintel: { y0: 2.45, y1: 2.65 },
    plaque: { width: 1.2, height: 0.42, cy: 2.25 },
    centerRoof: { y0: 2.65, y1: 3.05, width: 1.9 },
    sideRoof: { y0: 2.42, y1: 2.72, width: 1.0 },
    banner: { width: 0.3, height: 1.15, y0: 0.85 },
    lion: { forward: 0.55, size: 0.42 },
} as const;

/** 食摊：右侧一列（两个）加中景一个；正面朝镜头方向斜着（30–40°）。顶棚的外沿不越过场边。 */
export const STALLS = [
    { x: 1.35, z: 1.35, yaw: 40 * DEG, menu: 0 },
    { x: 1.35, z: -0.3, yaw: 40 * DEG, menu: 1 },
    { x: -0.8, z: 1.35, yaw: 40 * DEG, menu: 2 },
] as const;
export const STALL = {
    width: 1.25,
    depth: 0.65,
    counterTop: 0.85,
    postHeight: 1.95,
    canopyY: 1.9,
    canopySize: { w: 1.45, d: 0.85 },
    sign: { width: 0.95, height: 0.3, y0: 1.48 },
} as const;

/** 宫灯柱：广场上两盏，兼当灯串的锚点。 */
export const PALACE_LAMPS = [
    { x: -2.6, z: 1.7 },
    { x: 0.2, z: 1.85 },
] as const;
export const PALACE_LAMP = { poleHeight: 2.85, headY: 2.62, headSize: 0.52 } as const;

/** 灯串的锚点（世界坐标）：牌坊顶、两盏宫灯、食摊上沿、中景摊上沿。灯笼串跨广场，灯珠串补摊前一短段。 */
const STRING_LAMP = LEVEL.lot + PALACE_LAMP.headY + 0.28;
const STRING_STALL = LEVEL.lot + STALL.canopyY + 0.04;
export const STRING_SPANS = [
    { from: [-4.35, LEVEL.lot + PAIFANG.centerRoof.y0 + 0.25, 0.85], to: [PALACE_LAMPS[0].x, STRING_LAMP, PALACE_LAMPS[0].z], kind: 'lantern' },
    { from: [PALACE_LAMPS[0].x, STRING_LAMP, PALACE_LAMPS[0].z], to: [PALACE_LAMPS[1].x, STRING_LAMP, PALACE_LAMPS[1].z], kind: 'lantern' },
    { from: [PALACE_LAMPS[0].x, STRING_LAMP, PALACE_LAMPS[0].z], to: [-0.85, STRING_STALL, 1.3], kind: 'lantern' },
    { from: [PALACE_LAMPS[1].x, STRING_LAMP, PALACE_LAMPS[1].z], to: [1.25, STRING_STALL, 1.28], kind: 'festoon' },
    { from: [1.25, STRING_STALL, 1.28], to: [1.28, STRING_STALL, -0.25], kind: 'festoon' },
] as const;

/** 道具与背景的位置。 */
export const PROPS = {
    warrior: { x: 0.35, z: -0.9, yaw: 30 * DEG },
    blossomTree: { x: -5.2, z: -0.8 },
    teaHouse: { x: 1.6, z: -3.3, w: 0.95, d: 1.1, h: 1.35, neonYaw: 48 * DEG },
    skyline: [
        { x: 1.55, z: -5.2, w: 0.95, d: 1.3, h: 1.15 },
        { x: 1.6, z: -4.35, w: 0.85, d: 1.0, h: 0.9 },
    ] as const,
    cityWall: { x0: -5.98, x1: -5.45, z0: -5.95, z1: -0.35, top: 1.45, gate: { z: -4.7, width: 1.7, height: 1.9, roofTop: 2.45 } },
    tables: [
        { x: -1.9, z: 1.6 },
        { x: -1.4, z: 0.35 },
        { x: 0.15, z: 0.85 },
    ] as const,
    skyLanterns: [
        { x: -3.4, z: -4.9 },
        { x: 0.3, z: -4.4 },
    ] as const,
} as const;

/** 默认视角：从前右斜俯视，方位角 30°（与城寨一致）：台基正面的歌词屏读得出，右侧食摊的正面也读得出。 */
export const CHANGAN_VIEW = {
    azimuth: 30 * DEG,
    elevation: 30 * DEG,
    zoom: 1.48,
} as const;
