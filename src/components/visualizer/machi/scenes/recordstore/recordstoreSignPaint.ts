import { context2d, drawIcon, fitFont, fontSpec, strokeNeonText, wrapText, type MachiFont } from '../../engine/signRaster';

// src/components/visualizer/machi/scenes/recordstore/recordstoreSignPaint.ts
// 唱片店各块招牌的 Canvas 2D 画法：店招（黑胶 logo + 店名）、店角竖挂霓虹（深夜唱片 / MIDNIGHT RECORDS，
// 粉青双色灯管）、右墙横式英文霓虹（青色 MIDNIGHT RECORDS）、橱窗海报（歌手）、门口 A 字立牌
// （OPEN / 营业中）、特价箱的小价签。
// 共用的字体、图标、缩字、折行、灯管描边在 engine/signRaster.ts。

/** 一张黑胶：外圈、几道纹、中心标签。 */
const drawVinyl = (context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string, label: string) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.28)';
    context.lineWidth = Math.max(1.5, radius * 0.035);
    [0.82, 0.68, 0.55].forEach(scale => {
        context.beginPath();
        context.arc(cx, cy, radius * scale, 0, Math.PI * 2);
        context.stroke();
    });
    context.fillStyle = label;
    context.beginPath();
    context.arc(cx, cy, radius * 0.34, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color;
    context.beginPath();
    context.arc(cx, cy, radius * 0.06, 0, Math.PI * 2);
    context.fill();
};

export interface RecordstoreFasciaPaint {
    font: MachiFont;
    title: string;
    base: string;
    text: string;
    accent: string;
    vinyl: string;
}

/** 前面店招：深色板上左边一张黑胶 logo，中间店名（曲名），右边竖排小字「深夜」。 */
export const paintRecordstoreFascia = (canvas: HTMLCanvasElement, paint: RecordstoreFasciaPaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = paint.base;
    context.fillRect(0, 0, width, height);
    // 黄铜的上下细边，与几何上的黄铜条对齐。
    context.fillStyle = paint.accent;
    context.fillRect(0, height * 0.045, width, height * 0.02);
    context.fillRect(0, height * 0.935, width, height * 0.02);
    const badge = height * 0.72;
    const badgeX = height * 0.26;
    const badgeY = (height - badge) / 2;
    drawVinyl(context, badgeX + badge / 2, badgeY + badge / 2, badge / 2, '#15181d', paint.accent);
    const tagWidth = height * 0.62;
    const textLeft = badgeX + badge + height * 0.3;
    const textRight = width - tagWidth - height * 0.36;
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.fillStyle = paint.text;
    fitFont(context, paint.font, paint.title, textRight - textLeft, height * 0.58);
    context.fillText(paint.title, textLeft, height * 0.52);
    // 右边竖排「深夜」两个黄铜字。
    context.textAlign = 'center';
    context.fillStyle = paint.accent;
    context.font = fontSpec({ ...paint.font, weight: 800 }, tagWidth * 0.36);
    context.fillText('深', width - tagWidth * 0.68, height * 0.34);
    context.fillText('夜', width - tagWidth * 0.68, height * 0.7);
    drawVinyl(context, width - tagWidth * 0.24, height * 0.5, tagWidth * 0.17, 'rgba(255,255,255,0.12)', paint.accent);
};

export interface RecordstoreNeonPaint {
    font: MachiFont;
    pink: string;
    cyan: string;
}

/** 店角竖挂霓虹：透明底，粉色灯管竖写「深夜唱片」，下面两行青色 MIDNIGHT / RECORDS，一圈灯管边。 */
export const paintRecordstoreNeon = (canvas: HTMLCanvasElement, paint: RecordstoreNeonPaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const inset = width * 0.09;
    context.save();
    context.shadowColor = paint.pink;
    context.shadowBlur = width * 0.06;
    context.strokeStyle = paint.pink;
    context.lineWidth = Math.max(2, width * 0.035);
    context.beginPath();
    context.roundRect(inset, inset, width - inset * 2, height - inset * 2, width * 0.1);
    context.stroke();
    context.restore();
    // 竖排四个粉色灯管字。
    const chars = ['深', '夜', '唱', '片'];
    const top = height * 0.05;
    const bottom = height * 0.74;
    const step = (bottom - top) / chars.length;
    const px = Math.min(width * 0.66, step * 0.82);
    context.font = fontSpec({ ...paint.font, weight: 800 }, px);
    chars.forEach((char, index) => {
        const cy = top + step * (index + 0.5);
        context.save();
        context.shadowColor = paint.pink;
        context.shadowBlur = px * 0.24;
        context.fillStyle = paint.pink;
        context.fillText(char, width / 2, cy);
        context.restore();
        strokeNeonText(context, char, width / 2, cy, paint.pink, px * 0.07);
    });
    // 下面两行青色英文。
    ['MIDNIGHT', 'RECORDS'].forEach((word, index) => {
        const cy = height * (0.82 + index * 0.1);
        const wordPx = fitFont(context, { ...paint.font, weight: 800 }, word, width * 0.8, height * 0.055);
        context.save();
        context.shadowColor = paint.cyan;
        context.shadowBlur = wordPx * 0.3;
        context.fillStyle = paint.cyan;
        context.fillText(word, width / 2, cy);
        context.restore();
        strokeNeonText(context, word, width / 2, cy, paint.cyan, wordPx * 0.08);
    });
};

export interface RecordstoreWallNeonPaint {
    font: MachiFont;
    cyan: string;
}

/** 右墙横式英文霓虹：透明底，一圈青色灯管框，中间一行青色灯管字 MIDNIGHT RECORDS（与竖霓虹同画法）。 */
export const paintRecordstoreWallNeon = (canvas: HTMLCanvasElement, paint: RecordstoreWallNeonPaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const inset = height * 0.12;
    context.save();
    context.shadowColor = paint.cyan;
    context.shadowBlur = height * 0.07;
    context.strokeStyle = paint.cyan;
    context.lineWidth = Math.max(2, height * 0.035);
    context.beginPath();
    context.roundRect(inset, inset, width - inset * 2, height - inset * 2, height * 0.16);
    context.stroke();
    context.restore();
    const text = 'MIDNIGHT RECORDS';
    const px = fitFont(context, { ...paint.font, weight: 800 }, text, width - inset * 6, height * 0.42);
    const cy = height * 0.52;
    context.save();
    context.shadowColor = paint.cyan;
    context.shadowBlur = px * 0.3;
    context.fillStyle = paint.cyan;
    context.fillText(text, width / 2, cy);
    context.restore();
    strokeNeonText(context, text, width / 2, cy, paint.cyan, px * 0.08);
};

export interface RecordstorePosterPaint {
    font: MachiFont;
    heading: string;
    body: string;
    icon?: string;
    fallbacks: readonly string[];
    background: string;
    ink: string;
    accent: string;
    tag: string;
    /** 版式 0..2（按歌变）。 */
    layout: number;
}

/** 橱窗海报：色底上一张「唱片封面」与歌手名；三种版式按歌变。 */
export const paintRecordstorePoster = (canvas: HTMLCanvasElement, paint: RecordstorePosterPaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = paint.background;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = paint.ink;
    context.globalAlpha = 0.16;
    context.lineWidth = width * 0.02;
    context.strokeRect(width * 0.05, width * 0.05, width * 0.9, height - width * 0.1);
    context.globalAlpha = 1;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const layout = paint.layout % 3;
    if (layout === 0) {
        // 上半一张大封面（黑胶探出半个），下半歌手名。
        const size = width * 0.72;
        const cx = width / 2;
        const cy = height * 0.34;
        context.fillStyle = paint.accent;
        context.fillRect(cx - size / 2, cy - size / 2, size, size);
        drawVinyl(context, cx + size * 0.28, cy, size * 0.46, '#14171c', paint.background);
        drawIcon(context, paint.icon, paint.fallbacks, cx - size * 0.34, cy - size * 0.24, size * 0.3, paint.ink, 2.2);
        context.fillStyle = paint.ink;
        const headingPx = fitFont(context, paint.font, paint.heading, width * 0.84, width * 0.14);
        wrapText(context, paint.heading, width * 0.84, 2).forEach((line, index) =>
            context.fillText(line, width / 2, height * 0.7 + index * headingPx * 1.15));
        context.globalAlpha = 0.8;
        fitFont(context, { ...paint.font, weight: Math.max(400, paint.font.weight - 300) }, paint.body, width * 0.8, width * 0.07);
        context.fillText(paint.body, width / 2, height * 0.9);
        context.globalAlpha = 1;
    } else if (layout === 1) {
        // 左侧半张黑胶、右侧大字名与一条色带。
        drawVinyl(context, width * 0.14, height * 0.42, width * 0.4, '#14171c', paint.accent);
        context.fillStyle = paint.ink;
        context.textAlign = 'left';
        const headingPx = fitFont(context, paint.font, paint.heading, width * 0.5, width * 0.15);
        wrapText(context, paint.heading, width * 0.52, 3).forEach((line, index) =>
            context.fillText(line, width * 0.44, height * 0.34 + index * headingPx * 1.15));
        context.fillStyle = paint.accent;
        context.fillRect(width * 0.44, height * 0.62, width * 0.4, height * 0.035);
        context.textAlign = 'center';
        context.globalAlpha = 0.8;
        fitFont(context, { ...paint.font, weight: Math.max(400, paint.font.weight - 300) }, paint.body, width * 0.8, width * 0.075);
        context.fillText(paint.body, width / 2, height * 0.82);
        context.globalAlpha = 1;
    } else {
        // 顶部色条 + 大图标 + 名（与便利店海报同构、换唱片语境）。
        context.fillStyle = paint.accent;
        context.fillRect(0, 0, width, height * 0.16);
        context.fillStyle = paint.ink;
        fitFont(context, { ...paint.font, weight: 800 }, 'NEW ARRIVAL', width * 0.7, height * 0.07);
        context.fillText('NEW ARRIVAL', width / 2, height * 0.09);
        const iconSize = width * 0.44;
        drawIcon(context, paint.icon, paint.fallbacks, (width - iconSize) / 2, height * 0.22, iconSize, paint.ink, 2.4);
        context.fillStyle = paint.ink;
        const headingPx = fitFont(context, paint.font, paint.heading, width * 0.84, width * 0.14);
        wrapText(context, paint.heading, width * 0.84, 2).forEach((line, index) =>
            context.fillText(line, width / 2, height * 0.62 + index * headingPx * 1.15));
        context.globalAlpha = 0.8;
        fitFont(context, { ...paint.font, weight: Math.max(400, paint.font.weight - 300) }, paint.body, width * 0.8, width * 0.07);
        context.fillText(paint.body, width / 2, height * 0.88);
        context.globalAlpha = 1;
    }
    // 角上的小标签。
    context.save();
    context.translate(width * 0.8, height * 0.055);
    context.rotate(0.2);
    context.fillStyle = paint.ink;
    context.beginPath();
    context.roundRect(-width * 0.18, -width * 0.055, width * 0.36, width * 0.11, width * 0.03);
    context.fill();
    context.fillStyle = paint.background;
    fitFont(context, { ...paint.font, weight: 800 }, paint.tag, width * 0.3, width * 0.07);
    context.fillText(paint.tag, 0, 0);
    context.restore();
};

export interface RecordstoreAFramePaint {
    font: MachiFont;
    chalk: string;
    accent: string;
}

/** 门口 A 字立牌：黑板底、粉笔字 OPEN 与营业中。 */
export const paintRecordstoreAFrame = (canvas: HTMLCanvasElement, paint: RecordstoreAFramePaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = '#7a5a3a';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#1c2420';
    context.fillRect(width * 0.05, width * 0.05, width * 0.9, height - width * 0.1);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = paint.accent;
    fitFont(context, { ...paint.font, weight: 800 }, 'OPEN', width * 0.8, height * 0.22);
    context.fillText('OPEN', width / 2, height * 0.24);
    context.strokeStyle = paint.chalk;
    context.globalAlpha = 0.5;
    context.lineWidth = width * 0.015;
    context.beginPath();
    context.moveTo(width * 0.2, height * 0.42);
    context.lineTo(width * 0.8, height * 0.42);
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = paint.chalk;
    context.font = fontSpec(paint.font, width * 0.21);
    context.fillText('営業中', width / 2, height * 0.56);
    context.globalAlpha = 0.85;
    context.font = fontSpec({ ...paint.font, weight: Math.max(400, paint.font.weight - 300) }, width * 0.075);
    wrapText(context, '深夜までレコードをかけています', width * 0.8, 2).forEach((line, index) =>
        context.fillText(line, width / 2, height * 0.74 + index * width * 0.1));
    context.globalAlpha = 1;
    drawVinyl(context, width / 2, height * 0.9, width * 0.11, 'rgba(255,255,255,0.16)', paint.accent);
};

export interface RecordstoreCrateTagPaint {
    font: MachiFont;
    base: string;
    ink: string;
    accent: string;
}

/** 特价箱的小价签：USED SALE 与「中古盤」。 */
export const paintRecordstoreCrateTag = (canvas: HTMLCanvasElement, paint: RecordstoreCrateTagPaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = paint.base;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = paint.accent;
    context.lineWidth = height * 0.045;
    context.strokeRect(height * 0.09, height * 0.09, width - height * 0.18, height - height * 0.18);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = paint.accent;
    fitFont(context, { ...paint.font, weight: 800 }, 'USED SALE', width * 0.8, height * 0.34);
    context.fillText('USED SALE', width / 2, height * 0.34);
    context.fillStyle = paint.ink;
    fitFont(context, paint.font, '中古盤', width * 0.7, height * 0.3);
    context.fillText('中古盤', width / 2, height * 0.72);
};
