import { createVisualizerRng } from '../../../visualizerSeedHash';

// src/components/visualizer/machi/scenes/zhuying/zhuyingSeed.ts
// 烛影长安按歌变的小东西：同一首歌每次都一样，换一首歌书房就换个样子（樱花枝从窗的哪个角探进来、吊盆挂哪头、
// 窗外屋顶的灯窗排布、书脊的配色、显示器里那组蜡烛图、最后一根蜡烛红还是绿、风向、水洼、跑马灯那条字）。
// 只依赖 seed，不碰 three。

export interface ZhuyingVariation {
    /** 樱花枝从窗上沿的哪个角探进来：0 左角（屋角侧）、1 右角。 */
    blossomCorner: 0 | 1;
    /** 樱花枝的疏密（实例数倍数）。 */
    blossomDensity: number;
    /** 吊盆挂在 PLANT_SLOTS 的哪一个。 */
    plantSlot: 0 | 1;
    /** 窗外两重屋顶的高低与灯窗排布的打乱种子。 */
    skylineSeed: number;
    /** 书脊配色与摆放的打乱种子。 */
    shelfSeed: number;
    /** 显示器里那组蜡烛图的打乱种子。 */
    chartSeed: number;
    /** 最后一根蜡烛收阳（绿）还是收阴（红）。 */
    lastCandleUp: boolean;
    /** 书桌上跑马灯装饰字的版式。 */
    tickerIndex: number;
    /** 纸灯笼的款：0 圆、1 长。 */
    lanternStyle: 0 | 1;
    /** 小键盘上哪几颗键亮着的打乱种子。 */
    keySeed: number;
    /** 雨的风向偏角（弧度，绕 y）与倾斜量（每米下落的水平位移）。 */
    windYaw: number;
    windSlant: number;
    /** 水洼噪声的平移，让每首歌的水洼长在不同地方。 */
    puddleOffset: [number, number];
    /** 水洼覆盖量 0..1。 */
    puddleAmount: number;
}

/** seed → 这首歌的书房变化。 */
export const resolveZhuyingVariation = (seed: string | number): ZhuyingVariation => {
    const random = createVisualizerRng(`machi:zhuying:${seed}`);
    const pick = (min: number, max: number) => min + (max - min) * random();
    return {
        blossomCorner: random() < 0.5 ? 0 : 1,
        blossomDensity: pick(0.75, 1.3),
        plantSlot: random() < 0.5 ? 0 : 1,
        skylineSeed: Math.floor(random() * 0xffffffff),
        shelfSeed: Math.floor(random() * 0xffffffff),
        chartSeed: Math.floor(random() * 0xffffffff),
        lastCandleUp: random() < 0.55,
        tickerIndex: Math.floor(random() * 3),
        lanternStyle: random() < 0.5 ? 0 : 1,
        keySeed: Math.floor(random() * 0xffffffff),
        windYaw: pick(-0.6, 0.6),
        windSlant: pick(0.06, 0.2),
        puddleOffset: [pick(-40, 40), pick(-40, 40)],
        puddleAmount: pick(0.45, 0.75),
    };
};
