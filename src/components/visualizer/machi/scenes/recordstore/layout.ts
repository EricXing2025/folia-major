// src/components/visualizer/machi/scenes/recordstore/layout.ts
// 深夜唱片店街角的尺寸表（米，原点在底座中心，y 向上，+z 是前、+x 是右）。几何、灯、天气、招牌、镜头都按这里摆，
// 改一处尺寸不用到处找。与便利店同款的街角：两条路在前右角相交，店占后左象限。

export const DEG = Math.PI / 180;

/** 底座：12m 见方、0.6m 厚，顶面就是路面。 */
export const BASE = { half: 6, depth: 0.6, radius: 0.12 } as const;

/** 各层地面的高度。 */
export const LEVEL = {
    road: 0,
    lot: 0.12,
    floor: 0.16,
} as const;

/** 两条路：前面（+z）一条沿 x，右面（+x）一条沿 z，在前右角相交；路外侧各有一条窄人行道到底座边。 */
export const ROAD = {
    inner: 2.2,
    outer: 5.5,
    curbWidth: 0.16,
    edgeLineInset: 0.24,
} as const;

/** 唱片店：占后左象限；前面、右面前段是整面落地玻璃，右面后段和后墙、左墙是实墙。 */
export const STORE = {
    x0: -5.4,
    x1: 0.5,
    z0: -5.4,
    z1: 0.3,
    wall: 0.18,
    wallHeight: 3.05,
    roofTop: 3.27,
    parapetTop: 3.47,
    overhang: 0.1,
    /** 右面玻璃到这里为止，往后是实墙（试听角在里面、仓库在后）。 */
    rightGlassEnd: -2.0,
    /** 前面左端的实墙垛。 */
    frontPillarEnd: -4.75,
    glassBottom: 0.22,
    glassTop: 2.5,
} as const;

/** 自动门（前面靠右，两扇对开）。 */
export const DOOR = {
    x0: -1.0,
    x1: 0.38,
    height: 2.15,
    panelWidth: 0.71,
    slide: 0.66,
} as const;

/** 店招带：绕前面与右面一圈，挂在玻璃上沿与屋顶之间。 */
export const FASCIA = {
    y0: 2.56,
    y1: 3.14,
    depth: 0.15,
} as const;

/** 屋顶的歌词屏：一块横屏，屏面正对默认视线（前右角），两根立柱撑在女儿墙里。 */
export const BOARD = {
    cx: -1.85,
    cz: -1.85,
    width: 4.9,
    height: 1.6,
    y0: 3.68,
    depth: 0.16,
    /** 正面法线的方位角（与默认镜头一致）。 */
    azimuth: 45 * DEG,
} as const;

/** 店角竖挂的霓虹招牌：45° 朝着路口，两面同一幅字面（深夜唱片 / MIDNIGHT RECORDS）。 */
export const NEON = {
    cx: 0.78,
    cz: 0.78,
    width: 0.52,
    height: 2.3,
    depth: 0.14,
    y0: 0.95,
    azimuth: 45 * DEG,
} as const;

/** 右面实墙上的横式英文霓虹（青色 MIDNIGHT RECORDS）：贴右面后段实墙正中，两端与上沿留边（LED 跑马灯所在的店招带之下）。 */
export const WALL_NEON = {
    z0: STORE.z0 + 0.15,
    z1: STORE.rightGlassEnd - 0.15,
    y0: 1.7,
    y1: 2.4,
} as const;

/** 默认视角：从前右斜俯视（方位角按 three 的球坐标，从 +z 转向 +x）；整座底座框进去是缩放 1，默认再拉近一些。 */
export const RECORDSTORE_VIEW = {
    azimuth: 45 * DEG,
    elevation: 31 * DEG,
    zoom: 1.56,
} as const;

/** 道具的位置。 */
export const PROPS = {
    utilityPole: { x: -5.3, z: 1.96, height: 7.6 },
    streetLamp: { x: 5.74, z: -1.2, height: 5.2, arm: 1.3 },
    curveMirror: { x: -1.2, z: 5.74, height: 2.7 },
    stopSign: { x: 1.95, z: 5.74, height: 2.4 },
    bikeSlots: [{ x: -4.85, z: 1.32 }, { x: -2.9, z: 1.36 }] as const,
    aFrame: { x: 0.92, z: 1.3 },
    saleCrate: { x: -1.55, z: 0.75 },
    nobori: { x: -1.9, z: 1.95 },
    groundAc: { x: -5.7, z: [-1.9, -3.0] as const },
    roofAc: [{ x: -0.55, z: -4.6 }, { x: -4.75, z: -0.75 }] as const,
} as const;

/** 底座顶面上，雨能落到的高度：店顶上是屋顶，店外是地面（路面或人行道）。 */
export const groundHeightAt = (x: number, z: number) => {
    if (x >= STORE.x0 - STORE.overhang && x <= STORE.x1 + STORE.overhang && z >= STORE.z0 - STORE.overhang && z <= STORE.z1 + STORE.overhang) {
        return STORE.roofTop;
    }
    const onRoad = (x > ROAD.inner && x < ROAD.outer) || (z > ROAD.inner && z < ROAD.outer);
    return onRoad ? LEVEL.road : LEVEL.lot;
};
