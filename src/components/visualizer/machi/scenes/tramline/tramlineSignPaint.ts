import type { MachiFont } from '../../engine/signRaster';
import { context2d, drawIcon, fitFont, fontSpec, wrapText } from '../../engine/signRaster';

// src/components/visualizer/machi/scenes/tramline/tramlineSignPaint.ts
// 港岛街景的招牌画面：茶餐厅门头灯箱（写曲名）、电车腰板广告（写歌手）、转角竖霓虹「茶餐廳」、
// 报刊亭海报、街角路牌、电车站牌、店里菜单牌与玻璃贴纸。画法跟兄弟场景一致：先画底再画字，
// 字放不下就 fitFont 缩、wrapText 折行，图标配 lucide 节点（没有就用回退图标）。

export interface TramlineFasciaPaint {
    font: MachiFont;
    title: string;
    artist: string;
    icon: string | undefined;
    fallbacks: readonly string[];
    base: string;
    text: string;
    accent: string;
    style: number;
}

/** 茶餐厅门头灯箱：暖底横匾，左侧一只主题图标，中间大字写曲名，右下小字写「茶餐廳」。 */
export const paintCafeFascia = (canvas: HTMLCanvasElement, paint: TramlineFasciaPaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = paint.base;
    context.fillRect(0, 0, width, height);
    // 上下两条招牌包边（跟几何上的金属边同色）。
    context.fillStyle = paint.accent;
    context.fillRect(0, height * 0.05, width, height * 0.05);
    context.fillRect(0, height * 0.9, width, height * 0.05);
    const badge = height * 0.62;
    const badgeX = height * 0.24;
    const badgeY = (height - badge) / 2;
    // 图标底：圆形小灯箱。
    context.beginPath();
    context.arc(badgeX + badge / 2, height / 2, badge / 2, 0, Math.PI * 2);
    context.fillStyle = paint.accent;
    context.fill();
    drawIcon(context, paint.icon, paint.fallbacks, badgeX + badge * 0.16, badgeY + badge * 0.16, badge * 0.68, paint.style === 1 ? '#f6efd8' : '#2f3f3a', 2.4);
    const textLeft = badgeX + badge + height * 0.32;
    const tagWidth = height * 2.2;
    const textRight = width - tagWidth - height * 0.3;
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.fillStyle = paint.text;
    fitFont(context, paint.font, paint.title, textRight - textLeft, height * 0.5);
    context.fillText(paint.title, textLeft, height * 0.52);
    // 右侧窄条：茶餐廳三个小字横排。
    context.textAlign = 'center';
    context.fillStyle = paint.accent;
    context.font = fontSpec({ ...paint.font, weight: 700 }, height * 0.3);
    context.fillText('茶餐廳', width - tagWidth / 2 - height * 0.15, height * 0.52);
    if (paint.artist) {
        context.fillStyle = paint.text;
        context.globalAlpha = 0.6;
        context.font = fontSpec(paint.font, height * 0.16);
        context.textAlign = 'right';
        context.fillText(paint.artist, textRight, height * 0.9);
        context.globalAlpha = 1;
    }
};

export interface TramlineAdPaint {
    font: MachiFont;
    artist: string;
    title: string;
    icon: string | undefined;
    fallbacks: readonly string[];
    base: string;
    text: string;
    accent: string;
    style: number;
}

/** 电车腰板广告：整块贴板画——底一条深绿、字写歌手，左边一行小字写曲名，角上一只图标。 */
export const paintTramAd = (canvas: HTMLCanvasElement, paint: TramlineAdPaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = paint.base;
    context.fillRect(0, 0, width, height);
    // 上窄下宽两条饰带（叮叮广告的经典版式）。
    context.fillStyle = paint.accent;
    context.fillRect(0, 0, width, height * 0.09);
    context.fillRect(0, height * 0.9, width, height * 0.1);
    context.fillStyle = paint.style === 2 ? paint.accent : paint.text;
    context.textBaseline = 'middle';
    const badge = height * 0.56;
    drawIcon(context, paint.icon, paint.fallbacks, width - badge - height * 0.2, (height - badge) / 2, badge, paint.style === 2 ? paint.text : paint.accent, 2.2);
    const textRight = width - badge - height * 0.42;
    context.textAlign = 'left';
    context.fillStyle = paint.style === 2 ? paint.accent : paint.text;
    fitFont(context, paint.font, paint.artist || 'MACHI', textRight - height * 0.3, height * 0.46);
    context.fillText(paint.artist || 'MACHI', height * 0.3, height * 0.52);
    if (paint.title) {
        context.globalAlpha = 0.72;
        context.font = fontSpec(paint.font, height * 0.17);
        context.fillStyle = paint.text;
        context.fillText(`♪ ${paint.title}`, height * 0.32, height * 0.85);
        context.globalAlpha = 1;
    }
};

export interface TramlinePosterPaint {
    font: MachiFont;
    text: string;
    sub: string;
    icon: string | undefined;
    fallbacks: readonly string[];
    scheme: { base: string; panel: string; text: string; accent: string };
}

/** 报刊亭海报：色块版式，上面主题图标，下面两行字（歌手 / 曲名）。 */
export const paintKioskPoster = (canvas: HTMLCanvasElement, paint: TramlinePosterPaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = paint.scheme.base;
    context.fillRect(0, 0, width, height);
    context.fillStyle = paint.scheme.panel;
    context.fillRect(width * 0.07, height * 0.06, width * 0.86, height * 0.55);
    drawIcon(context, paint.icon, paint.fallbacks, width * 0.3, height * 0.16, width * 0.4, paint.scheme.accent, 2.4);
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillStyle = paint.scheme.text;
    const lines = wrapText(context, paint.text, width * 0.84, 2);
    fitFont(context, paint.font, lines[0] ?? paint.text, width * 0.8, height * 0.16);
    lines.forEach((line, index) => {
        context.fillText(line, width / 2, height * (0.72 + index * 0.14));
    });
    context.globalAlpha = 0.66;
    context.font = fontSpec(paint.font, height * 0.09);
    context.fillText(paint.sub, width / 2, height * 0.94);
    context.globalAlpha = 1;
};

/** 街角路牌：白底蓝字「春秧街 CHUN YEUNG STREET」，蓝边。 */
export const paintStreetPlate = (canvas: HTMLCanvasElement, font: MachiFont) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = '#eef2f4';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = '#20508f';
    context.lineWidth = height * 0.09;
    context.strokeRect(height * 0.045, height * 0.045, width - height * 0.09, height - height * 0.09);
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillStyle = '#20508f';
    context.font = fontSpec({ ...font, weight: 800 }, height * 0.5);
    context.fillText('春秧街', width * 0.3, height * 0.52);
    context.font = fontSpec({ ...font, weight: 700 }, height * 0.28);
    context.fillText('CHUN YEUNG ST.', width * 0.74, height * 0.55);
};

/** 电车站牌：墨绿底白字「電車站 TRAM STOP」，下面一道白边。 */
export const paintStopPlate = (canvas: HTMLCanvasElement, font: MachiFont) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = '#24473c';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#f2ead2';
    context.fillRect(0, height * 0.82, width, height * 0.08);
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillStyle = '#f4f0e2';
    context.font = fontSpec({ ...font, weight: 800 }, height * 0.42);
    context.fillText('電車站', width * 0.3, height * 0.42);
    context.font = fontSpec({ ...font, weight: 700 }, height * 0.26);
    context.fillText('TRAM STOP', width * 0.76, height * 0.45);
};

/** 站牌下的小歌手牌：深底一行字「♪ 歌手」，字长自动缩。 */
export const paintArtistPlate = (canvas: HTMLCanvasElement, font: MachiFont, artist: string, text: string, accent: string) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = '#20302c';
    context.fillRect(0, 0, width, height);
    context.fillStyle = accent;
    context.fillRect(0, 0, width, height * 0.1);
    context.fillRect(0, height * 0.9, width, height * 0.1);
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillStyle = text;
    fitFont(context, font, `♪ ${artist}`, width * 0.88, height * 0.52);
    context.fillText(`♪ ${artist}`, width / 2, height * 0.52);
};

/** 转角竖霓虹「茶餐廳」：透明底，红芯白光灯管竖写三字。 */
export const paintCornerNeon = (canvas: HTMLCanvasElement, font: MachiFont, color: string) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    // 灯箱面板是暗色玻璃底（不透明材质下，画布的透明区会渲染成黑）：先铺一层压暗的霓虹色，
    // 面板才是一直亮着的粉，不是贴了字才算亮。
    context.fillStyle = '#241014';
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 0.18;
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = fontSpec({ ...font, weight: 800 }, width * 0.62);
    // 笔画多的字（餐、廳）用描边会在小尺度糊成块：实填灯管色，再压一遍白芯，远看仍是亮管字。
    const chars = ['茶', '餐', '廳'];
    chars.forEach((char, index) => {
        const y = height * (0.18 + index * 0.32);
        context.shadowColor = color;
        context.shadowBlur = width * 0.12;
        context.fillStyle = color;
        context.fillText(char, width / 2, y);
        context.fillText(char, width / 2, y);
        context.shadowBlur = width * 0.04;
        context.fillStyle = '#fff2f2';
        context.fillText(char, width / 2, y);
        context.shadowBlur = 0;
    });
    // 灯管外框一道细边。
    context.shadowColor = color;
    context.shadowBlur = width * 0.05;
    context.strokeStyle = color;
    context.lineWidth = width * 0.035;
    context.strokeRect(width * 0.09, height * 0.04, width * 0.82, height * 0.92);
    context.shadowBlur = 0;
};

/** 菜单牌：深绿底白粉笔字两栏，静态装饰（「招牌」与几样茶餐）。 */
export const paintCafeMenu = (canvas: HTMLCanvasElement, font: MachiFont, head: string, rows: readonly string[], text: string, accent: string) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = '#26332f';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = accent;
    context.lineWidth = height * 0.03;
    context.strokeRect(height * 0.05, height * 0.05, width - height * 0.1, height - height * 0.1);
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillStyle = accent;
    context.font = fontSpec({ ...font, weight: 800 }, height * 0.2);
    context.fillText(head, width / 2, height * 0.2);
    context.fillStyle = text;
    context.font = fontSpec(font, height * 0.15);
    rows.forEach((row, index) => {
        context.fillText(row, width / 2, height * (0.44 + index * 0.2));
    });
};

/** 玻璃圆贴纸：半透明底，主题图标一枚。 */
export const paintGlassDecal = (canvas: HTMLCanvasElement, icon: string | undefined, fallbacks: readonly string[], tint: string) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.beginPath();
    context.arc(width / 2, height / 2, width * 0.46, 0, Math.PI * 2);
    context.fillStyle = 'rgba(240,238,226,0.85)';
    context.fill();
    drawIcon(context, icon, fallbacks, width * 0.24, height * 0.24, width * 0.52, tint, 2.0);
};

/** 车头目的地箱：绿底白字「石塘咀 SHEK TONG TSUI」。 */
export const paintTramDestination = (canvas: HTMLCanvasElement, font: MachiFont, base: string, text: string) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = base;
    context.fillRect(0, 0, width, height);
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillStyle = text;
    context.font = fontSpec({ ...font, weight: 800 }, height * 0.5);
    context.fillText('石塘咀', width * 0.32, height * 0.52);
    context.font = fontSpec({ ...font, weight: 700 }, height * 0.24);
    context.fillText('SHEK TONG TSUI', width * 0.78, height * 0.55);
};
