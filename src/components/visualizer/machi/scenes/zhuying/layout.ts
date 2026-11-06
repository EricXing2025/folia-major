// src/components/visualizer/machi/scenes/zhuying/layout.ts
// 烛影长安的尺寸表（米，原点在底座中心，y 向上，+z 是前、+x 是右）。夜里一间临街书房：后墙（−z）与左墙（−x）
// 是内墙，前（+z）、右（+x）两面敞着给镜头；后墙几乎整面是落地窗，窗外是雨里的长安天际线（大雁塔、唐风屋顶、
// 城楼），书桌在窗前右中，矮书架靠左墙，茶案在前左。几何、灯、天气、招牌、镜头都按这里摆。

export const DEG = Math.PI / 180;

/** 各层地面高度。 */
export const LEVEL = {
    /** 窗外的街面 / 水面（湿反光层的高度）。 */
    street: 0.02,
    /** 屋内木地板面。 */
    floor: 0.16,
} as const;

/** 房间：占后左的一块，一间书房的大小；墙厚、墙高、沿墙吊顶带（窗帘盒与吊盆挂在这里）。 */
export const ROOM = {
    x0: -5.3,
    x1: 1.0,
    z0: -4.4,
    z1: 1.0,
    wall: 0.16,
    wallHeight: 3.0,
    ceilingDepth: 0.85,
    /** 墙的里皮（后墙、左墙朝屋内那一面）。 */
    backInner: -4.4 + 0.16,
    leftInner: -5.3 + 0.16,
} as const;

/** 后墙的落地窗：深木棂格分扇，右段实墙留给环形灯；窗头挂着半卷的竹帘。 */
export const WINDOW = {
    x0: ROOM.x0 + 0.25,
    x1: -0.1,
    sill: 0.45,
    head: 2.78,
    /** 玻璃在墙厚的中间。 */
    z: ROOM.z0 + ROOM.wall / 2,
    /** 竹帘从窗头放下的长度。 */
    blindDrop: 0.34,
} as const;

/** 歌词点阵条：贴在窗内侧上部（玻璃前），窗框里、竹帘下沿之下，面朝着屋里（默认镜头方向）。 */
export const LYRIC = {
    x0: WINDOW.x0 + 0.15,
    x1: WINDOW.x1 - 0.25,
    y0: 1.8,
    y1: 2.42,
    z: ROOM.backInner + 0.02,
    width: WINDOW.x1 - 0.25 - (WINDOW.x0 + 0.15),
    height: 2.42 - 1.8,
} as const;

/** 后墙右段实墙上的环形灯：灯环居中，环里写歌手名霓虹与一排 EQ 条。 */
export const RING = {
    x: 0.45,
    y: 1.76,
    radius: 0.36,
    z: ROOM.backInner + 0.015,
} as const;

/** 书桌：窗前右中；桌面、桌脚与前沿的跑马灯条。 */
export const DESK = {
    x0: -1.95,
    x1: 0.45,
    z0: -3.95,
    z1: -3.05,
    top: 0.78,
    /** 前沿跑马灯的位置（面中心、宽、高）。 */
    tickerY: 0.58,
    tickerHeight: 0.09,
} as const;

/** 显示器：超宽屏，面朝着镜头方向（略转向 +x），下沿是图表区、上沿一条终端标题栏。 */
export const MONITOR = {
    x: -0.75,
    y: 1.2,
    z: -3.8,
    width: 1.4,
    height: 0.46,
    /** 面法线的方位角（朝向默认镜头）。 */
    azimuth: 30 * DEG,
    /** 标题栏占屏高的比例。 */
    header: 0.22,
} as const;

/** 左墙的矮书架：贴着左墙里皮，两格书脊；下沿一条暖光灯带。 */
export const SHELF = {
    x0: ROOM.leftInner,
    x1: ROOM.leftInner + 0.38,
    z0: -3.95,
    z1: -1.15,
    top: 1.04,
    mid: 0.56,
    /** 左墙上方的 K 线霓虹字面（面贴墙皮，朝 +x）。 */
    neon: { z0: -3.85, z1: -1.3, y0: 1.5, y1: 2.34 },
} as const;

/** 茶案一角：矮茶案、纸灯笼立灯、蒲团、地毯。 */
export const TEA = {
    table: { x: -3.55, z: -0.6, radius: 0.42, top: 0.42 },
    lantern: { x: -4.6, z: -0.5, height: 0.92 },
    cushion: { x: -3.15, z: 0.3, radius: 0.33 },
    rug: { x: -3.6, z: -0.15, width: 1.9, depth: 1.5 },
} as const;

/** 吊盆的两个挂位（seed 选一个）：后墙吊顶带下、窗的左上端或右上端。 */
export const PLANT_SLOTS = [
    { x: -4.75, z: -3.75 },
    { x: -0.6, z: -3.75 },
] as const;

/** 窗外街面：后墙之外到底座边的一条（伸到墙身底下），街上积着雨。 */
export const STREET = {
    z0: -6,
    z1: ROOM.z0 + 0.1,
} as const;

/** 窗外天际线（剪影层，由近到远）：近檐、两重唐风屋顶（亮窗的那排）、大雁塔、城楼、最远的屋脊带。 */
export const SKYLINE = {
    nearZ: -4.85,
    midZ0: -5.55,
    midZ1: -5.0,
    farZ: -5.92,
    /** 大雁塔：七层，落在一座矮殿基座上；架在近檐排里、透过窗看是偏右中的一盏暖金剪影。 */
    pagoda: { x: -1.9, z: -4.85, base: 0.3, height: 1.24 },
    /** 城楼：窗左端外的一座台门与重檐楼。 */
    gate: { x0: -5.95, x1: -4.9, z0: -5.6, z1: -5.15 },
} as const;

/** 房前右两侧底座上的矮檐群（房间架高在屋顶群之上的感觉）：右面一排、前面一排。 */
export const SURROUND_ROOFS = [
    { x0: 2.0, x1: 5.75, z0: -3.9, z1: -0.5 },
    { x0: -4.8, x1: 3.2, z0: 2.1, z1: 5.75 },
] as const;

/** 默认视角：与其他场景一致，从前右斜俯视；缩放把书房充满画面。 */
export const ZHUYING_VIEW = {
    azimuth: 45 * DEG,
    elevation: 31 * DEG,
    zoom: 1.62,
} as const;
