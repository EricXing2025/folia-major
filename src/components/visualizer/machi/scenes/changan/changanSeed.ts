import { createVisualizerRng } from '../../../visualizerSeedHash';

// src/components/visualizer/machi/scenes/changan/changanSeed.ts
// 长安夜市按歌变的小东西：同一首歌每次都一样，换一首歌广场就换个样子（灯串配色、摊上的烟气浓淡、
// 花树开得多不多、天灯从哪一段开始升、风向、水洼的位置与多少、灯串下垂多少）。只依赖 seed，不碰 three。

export interface ChanganVariation {
    /**
     * 灯串配色 0..2：0 全红、1 红与琥珀相间、2 红为主掺琥珀与一朵一朵的粉。
     * market.ts 按它给每只灯笼挑调色板键。
     */
    lanternScheme: number;
    /** 食摊蒸汽的密度倍数（每缕几片）。 */
    smokeDensity: number;
    /** 花树花球的密度倍数（花球多少）。 */
    blossomDensity: number;
    /** 两盏天灯升落循环的相位（0..1）。 */
    skyPhase: [number, number];
    /** 灯串下垂量的倍数。 */
    stringSag: number;
    /** 雨的风向偏角（弧度，绕 y）与倾斜量（每米下落的水平位移）。 */
    windYaw: number;
    windSlant: number;
    /** 水洼噪声的平移，让每首歌的水洼长在不同地方。 */
    puddleOffset: [number, number];
    /** 水洼覆盖量 0..1。 */
    puddleAmount: number;
}

/** seed → 这首歌的夜市变化。 */
export const resolveChanganVariation = (seed: string | number): ChanganVariation => {
    const random = createVisualizerRng(`machi:changan:${seed}`);
    const pick = (min: number, max: number) => min + (max - min) * random();
    return {
        lanternScheme: Math.floor(random() * 3),
        smokeDensity: pick(0.6, 1.4),
        blossomDensity: pick(0.6, 1.3),
        skyPhase: [random(), random()],
        stringSag: pick(0.8, 1.3),
        windYaw: pick(-0.6, 0.6),
        windSlant: pick(0.06, 0.2),
        puddleOffset: [pick(-40, 40), pick(-40, 40)],
        puddleAmount: pick(0.45, 0.8),
    };
};
