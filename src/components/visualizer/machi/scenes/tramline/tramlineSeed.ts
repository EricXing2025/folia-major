import { createVisualizerRng } from '../../../visualizerSeedHash';

// src/components/visualizer/machi/scenes/tramline/tramlineSeed.ts
// 按歌变的东西：同一首歌同一个样（散列播种），换一首歌才变。电车涂装、茶餐厅招牌版式、楼上哪家亮灯、
// 空调外机与小阳台、报刊亭海报版式、水洼风向、电车出场相位，都从这一条确定性随机流里取。

export interface TramlineVariation {
    /** 电车涂装：0 经典墨绿奶油腰，1 浅绿广告涂装，2 墨绿配红边。 */
    tramLivery: 0 | 1 | 2;
    /** 车侧广告版式（画招牌用）。 */
    tramAdStyle: number;
    /** 茶餐厅门头招牌版式（底色与字色的组合）。 */
    cafeSignStyle: number;
    /** 二、三楼各窗亮不亮灯（前墙 5 扇、右墙 3 扇，按序）。 */
    litWindows: boolean[];
    /** 各窗有没有窗帘（按窗序，亮灯的也可以半挂——有生活气）。 */
    curtains: boolean[];
    /** 空调外机装哪几个（候选位见 building.ts）。 */
    acSpots: number[];
    /** 三楼小阳台：有 / 没有盆栽。 */
    balconyPlants: [boolean, boolean];
    /** 报刊亭海报版式（posterSchemes 两个里挑一个）。 */
    posterLayout: number;
    /** 候车凳与报亭小物的左右摆法。 */
    propFlip: boolean;
    /** 电车出场的相位（0..1，决定它刚进画面时在哪儿）。 */
    tramPhase: number;
    /** 风往哪边吹（粒子雨的朝向），与水洼范围（噪声域偏移，跟兄弟场景一样 ±40）。 */
    windYaw: number;
    windSlant: number;
    puddleOffset: [number, number];
    puddleAmount: number;
    /** 吊扇转多快。 */
    fanSpeed: number;
}

const WINDOWS = 8;
const AC_SPOTS = 6;

export const resolveTramlineVariation = (seed: string | number): TramlineVariation => {
    const rng = createVisualizerRng(`machi:tramline:${seed}`);
    const litWindows = Array.from({ length: WINDOWS }, () => rng() < 0.52);
    const curtains = Array.from({ length: WINDOWS }, (_, index) => litWindows[index] ? rng() < 0.4 : rng() < 0.55);
    const acCount = 3 + Math.floor(rng() * 3);
    const acPool = Array.from({ length: AC_SPOTS }, (_, index) => index);
    const acSpots: number[] = [];
    for (let index = 0; index < acCount; index += 1) {
        acSpots.push(acPool.splice(Math.floor(rng() * acPool.length), 1)[0]!);
    }
    return {
        tramLivery: Math.floor(rng() * 3) as TramlineVariation['tramLivery'],
        tramAdStyle: Math.floor(rng() * 3),
        cafeSignStyle: Math.floor(rng() * 3),
        litWindows,
        curtains,
        acSpots,
        balconyPlants: [rng() < 0.6, rng() < 0.45],
        posterLayout: Math.floor(rng() * 2),
        propFlip: rng() < 0.5,
        tramPhase: rng(),
        windYaw: (rng() - 0.5) * 0.5,
        windSlant: 0.3 + rng() * 0.55,
        puddleOffset: [rng() * 80 - 40, rng() * 80 - 40],
        puddleAmount: 0.5 + rng() * 0.3,
        fanSpeed: 1.8 + rng() * 1.4,
    };
};
