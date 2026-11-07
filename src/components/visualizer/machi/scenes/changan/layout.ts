// src/components/visualizer/machi/scenes/changan/layout.ts
// 长安夜市的尺寸表（米，原点在底座中心，y 向上，+z 是前、+x 是右）。几何、灯、天气、招牌、镜头都按这里摆，
// 改一处尺寸不用到处找。与便利店同款的街角：两条路在前右角相交；夜市广场占后左象限——后中偏右一座矮石台，
// 台上是七层大雁塔（远处地标，暖金泛光），塔前是退到最后的广场纵深；前左一座唐式牌坊，左右两列食摊沿纵深
// 排开，后右一座面朝镜头的市楼，楼面是歌词屏与 EQ 光柱。默认镜头从前右看过来，方位角 30°：牌坊横匾、
// 食摊幌子与市楼的歌词屏都基本正面可读。

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
 * 高台：矮石台，只把大雁塔从广场里垫起来（不再是吃掉画面的主舞台）。压在最后景深层，
 * 台面上的塔在默认镜头下占画面高 ≤40%。
 */
export const TERRACE = {
    x0: -1.1,
    x1: 1.2,
    z0: -5.75,
    z1: -4.5,
    /** 台面高度（台帮顶）。 */
    top: 0.28,
    /** 台面铺地压顶出挑。 */
    capOverhang: 0.05,
} as const;

/** 大雁塔：七层方塔，立在矮台面上，后中偏右（投影在画面右 60% 一带）。 */
export const PAGODA = {
    cx: -0.4,
    cz: -5.12,
    baseWidth: 1.2,
    /** 每层宽是下层的比例（收分）。 */
    taper: 0.9,
    /** 各层塔身高（下大上小），共七层。 */
    levelHeights: [0.26, 0.24, 0.21, 0.18, 0.16, 0.15, 0.14] as const,
    /** 叠涩出檐：每层檐口比塔身宽出的量与檐厚。 */
    eaveOverhang: 0.12,
    eaveThickness: 0.04,
    underEave: 0.055,
    /** 塔刹高。 */
    spire: 0.2,
} as const;

/** 歌词楼：后右的二层市楼，楼面朝向默认镜头（与方位角同角，歌词屏入射角 0°）。 */
export const LYRIC_HOUSE = {
    cx: 1.0,
    cz: -3.15,
    yaw: 30 * DEG,
    /** 楼面沿墙向的宽、进深、墙高与屋顶高。 */
    width: 2.0,
    depth: 0.95,
    wallHeight: 2.55,
    roofHeight: 0.34,
} as const;

/**
 * 歌词屏：歌词楼楼面（朝镜头的面）上的宽幅深色灯箱。沿墙向偏左一点——右端在右列食摊顶棚后会被挡。
 * cy 是屏面中心的离地高度。
 */
export const BOARD = {
    /** 屏面中心在楼面局部 x 方向的偏移（左移避开右列食摊）。 */
    lx: -0.15,
    width: 1.7,
    /** 屏体高（屏面 = 高 − 0.12 = 0.62m，与竹影的歌词带同规格）。 */
    height: 0.74,
    cy: 1.82,
} as const;

/** 歌词屏下的 EQ 条带：一排小竖光柱，高低跟节拍走（楼面上、屏的正下方）。 */
export const EQ = {
    lx: BOARD.lx,
    width: BOARD.width - 0.2,
    count: 16,
    /** 柱脚高度（楼面上段、屏下沿之下）。 */
    y0: 1.1,
    maxHeight: 0.3,
} as const;

/** 牌坊：前左，二柱一间一楼+两夹楼，正对默认镜头（与方位角同角）。 */
export const PAIFANG = {
    cx: -3.55,
    cz: -0.5,
    yaw: 30 * DEG,
    pillarOffset: 1.35,
    pillarSize: 0.3,
    pillarHeight: 3.1,
    midLintel: { y0: 2.48, y1: 2.78 },
    topLintel: { y0: 2.9, y1: 3.14 },
    plaque: { width: 1.55, height: 0.5, cy: 2.68 },
    centerRoof: { y0: 3.14, y1: 3.6, width: 2.4 },
    sideRoof: { y0: 2.88, y1: 3.22, width: 1.25 },
    banner: { width: 0.32, height: 1.35, y0: 0.98 },
    lion: { forward: 0.62, size: 0.42 },
} as const;

/** 食摊：右列三个朝纵深退去，左列两个在牌坊后，中景一个；正面朝镜头方向斜着。顶棚的外沿不越过场边。 */
export const STALLS = [
    { x: 1.3, z: 1.35, yaw: 38 * DEG, menu: 0, style: 'awning', steam: true },
    { x: 1.35, z: 0.0, yaw: 38 * DEG, menu: 1, style: 'awning', steam: true },
    { x: 1.35, z: -1.35, yaw: 32 * DEG, menu: 2, style: 'awning', steam: false },
    { x: -4.2, z: -2.2, yaw: 68 * DEG, menu: 3, style: 'awning', steam: false },
    { x: -4.55, z: -3.6, yaw: 72 * DEG, menu: 4, style: 'umbrella', steam: false },
    { x: -0.8, z: 0.9, yaw: 40 * DEG, menu: 5, style: 'umbrella', steam: true },
] as const;
export const STALL = {
    width: 1.25,
    depth: 0.65,
    counterTop: 0.85,
    postHeight: 1.95,
    canopyY: 1.9,
    canopySize: { w: 1.45, d: 0.85 },
    /** 伞棚的半径与高。 */
    umbrella: { radius: 0.85, height: 0.38 },
    sign: { width: 0.95, height: 0.3, y0: 1.48 },
} as const;

/** 宫灯柱：广场上三盏，兼当灯串的锚点。 */
export const PALACE_LAMPS = [
    { x: -3.2, z: 1.6 },
    { x: -0.35, z: 1.95 },
    { x: 2.0, z: -0.6 },
] as const;
export const PALACE_LAMP = { poleHeight: 2.85, headY: 2.62, headSize: 0.52 } as const;

/** 灯串的锚点（世界坐标）：牌坊顶、三盏宫灯、各食摊上沿、歌词楼一角。灯笼串跨广场，灯珠串补摊间短段。 */
const STRING_LAMP = LEVEL.lot + PALACE_LAMP.headY + 0.28;
const STRING_STALL = LEVEL.lot + STALL.canopyY + 0.04;
const STRING_PAIFANG = LEVEL.lot + PAIFANG.centerRoof.y0 + 0.2;
export const STRING_SPANS = [
    { from: [PAIFANG.cx, STRING_PAIFANG, PAIFANG.cz], to: [-3.2, STRING_LAMP, 1.6], kind: 'lantern' },
    { from: [-3.2, STRING_LAMP, 1.6], to: [-0.35, STRING_LAMP, 1.95], kind: 'lantern' },
    { from: [-0.35, STRING_LAMP, 1.95], to: [2.0, STRING_LAMP, -0.6], kind: 'lantern' },
    { from: [-3.2, STRING_LAMP, 1.6], to: [-4.2, STRING_STALL, -2.2], kind: 'lantern' },
    { from: [2.0, STRING_LAMP, -0.6], to: [2.08, 2.42, -3.2], kind: 'lantern' },
    { from: [-4.2, STRING_STALL, -2.2], to: [-4.55, STRING_STALL, -3.6], kind: 'festoon' },
    { from: [-0.35, STRING_LAMP, 1.95], to: [-0.8, STRING_STALL, 0.9], kind: 'festoon' },
    { from: [2.0, STRING_LAMP, -0.6], to: [1.3, STRING_STALL, 1.35], kind: 'festoon' },
    { from: [1.3, STRING_STALL, 1.35], to: [1.35, STRING_STALL, 0.0], kind: 'festoon' },
    { from: [1.35, STRING_STALL, 0.0], to: [1.35, STRING_STALL, -1.35], kind: 'festoon' },
] as const;

/** 道具与背景的位置。 */
export const PROPS = {
    warrior: { x: 1.95, z: -3.8, yaw: 40 * DEG },
    blossomTrees: [
        { x: -5.2, z: -0.8 },
        { x: -2.95, z: -4.75 },
    ] as const,
    /** 后沿的唐屋屋脊带（剪影+亮窗）：城墙与矮台之间那一排中景屋顶。 */
    rooftops: [
        { x: -5.3, z: -5.9, w: 1.4, d: 0.3, h: 1.05 },
        { x: -3.75, z: -5.9, w: 1.3, d: 0.3, h: 0.85 },
        { x: -2.15, z: -5.9, w: 1.4, d: 0.3, h: 1.2 },
    ] as const,
    cityWall: {
        x0: -5.98,
        x1: -5.45,
        z0: -5.95,
        z1: -0.35,
        top: 1.45,
        gate: { z: -4.7, width: 1.7, height: 1.9, roofTop: 2.45 },
        gate2: { z: -1.5, width: 1.3, height: 1.75, roofTop: 2.1 },
    },
    tables: [
        { x: -1.9, z: 0.9 },
        { x: -1.5, z: -0.4 },
        { x: 0.2, z: 1.4 },
    ] as const,
    skyLanterns: [
        { x: -4.6, z: -5.2 },
        { x: -1.8, z: -5.5 },
        { x: 0.9, z: -5.6 },
    ] as const,
} as const;

/** 默认视角：从前右斜俯视，方位角 30°——歌词楼面与牌坊正面都朝着它；缩放比 v1 收小一些，广场铺满下沿。 */
export const CHANGAN_VIEW = {
    azimuth: 30 * DEG,
    elevation: 30 * DEG,
    zoom: 1.3,
} as const;
