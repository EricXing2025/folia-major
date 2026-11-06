import { context2d, drawIcon, fitFont, fontSpec, strokeNeonText, type MachiFont } from '../../engine/signRaster';

// src/components/visualizer/machi/scenes/changan/changanSignPaint.ts
// 长安夜市各块静态招牌的 Canvas 画法（纯 2D，不碰 three）：牌坊横匾（描金大字曲名）、柱上竖幡灯箱
// （竖排歌手名：中日韩逐字竖排，拉丁转 90°）、食摊幌子（布招 + 字号）、茶馆角的紫色小霓虹「茶」。
// 竖排的做法与 engine/actors/nobori.ts 的旗面一致。

/** 横匾：乌匾金字，曲名一行居中，四角一小段描金框线（匾身金框是几何做的）。 */
export const paintChanganPlaque = (canvas: HTMLCanvasElement, paint: { font: MachiFont; title: string; base: string; ink: string; accent: string }) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = paint.base;
    context.fillRect(0, 0, width, height);
    // 匾心一圈回纹式的细金边（四角短划线，暗示纹样）。
    context.strokeStyle = paint.accent;
    context.lineWidth = Math.max(2, height * 0.03);
    const inset = height * 0.12;
    const corner = height * 0.2;
    [[inset, inset], [width - inset, inset], [inset, height - inset], [width - inset, height - inset]].forEach(([x, y]) => {
        context.beginPath();
        context.moveTo(x! + (x! < width / 2 ? corner : -corner), y!);
        context.lineTo(x!, y!);
        context.lineTo(x!, y! + (y! < height / 2 ? corner : -corner));
        context.stroke();
    });
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const px = fitFont(context, paint.font, paint.title, width * 0.86, height * 0.6, 10);
    context.font = fontSpec(paint.font, px);
    context.fillStyle = paint.ink;
    context.shadowColor = paint.accent;
    context.shadowBlur = px * 0.12;
    context.fillText(paint.title, width / 2, height * 0.52);
    context.shadowBlur = 0;
};

/** 竖幡：中日韩逐字竖排（放不下就缩字），纯拉丁的名字转 90° 顺着写。 */
export const paintChanganBanner = (canvas: HTMLCanvasElement, paint: { font: MachiFont; text: string; base: string; ink: string; accent: string }) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = paint.base;
    context.fillRect(0, 0, width, height);
    // 幡的上下两条系带色。
    context.fillStyle = paint.accent;
    context.fillRect(0, 0, width, height * 0.07);
    context.fillRect(0, height * 0.93, width, height * 0.07);
    const text = paint.text.trim() || ' ';
    const latin = !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
    const top = height * 0.1;
    const bottom = height * 0.9;
    const available = bottom - top;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = paint.ink;
    if (latin) {
        let px = width * 0.8;
        context.font = fontSpec(paint.font, px);
        const measured = context.measureText(text).width;
        if (measured > available) px = (px * available) / measured;
        context.font = fontSpec(paint.font, px);
        context.save();
        context.translate(width / 2, (top + bottom) / 2);
        context.rotate(Math.PI / 2);
        context.fillText(text, 0, 0);
        context.restore();
        return;
    }
    const chars = Array.from(text);
    const px = Math.min(width * 0.84, available / chars.length / 1.06);
    context.font = fontSpec(paint.font, px);
    const step = px * 1.06;
    const start = top + (available - step * chars.length) / 2 + step / 2;
    chars.forEach((char, index) => context.fillText(char, width / 2, start + index * step));
};

/** 食摊幌子：布底大字一行，顶上一枚小图标，四角压边。 */
export const paintChanganStallSign = (canvas: HTMLCanvasElement, paint: { font: MachiFont; text: string; icon?: string; fallbacks: readonly string[]; base: string; ink: string; accent: string }) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.fillStyle = paint.base;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = paint.accent;
    context.lineWidth = Math.max(1.5, height * 0.05);
    context.strokeRect(height * 0.09, height * 0.09, width - height * 0.18, height - height * 0.18);
    context.textBaseline = 'middle';
    context.fillStyle = paint.ink;
    const iconSize = height * 0.62;
    drawIcon(context, paint.icon, paint.fallbacks, height * 0.22, height * 0.19, iconSize, paint.accent, iconSize * 0.09);
    context.textAlign = 'left';
    const px = fitFont(context, paint.font, paint.text, width - height * 1.15, height * 0.58, 8);
    context.font = fontSpec(paint.font, px);
    context.fillText(paint.text, height * 0.95, height * 0.53);
};

/** 茶馆角的紫色小霓虹：一个「茶」字灯管（加色，透明底）。 */
export const paintChanganTeaNeon = (canvas: HTMLCanvasElement, paint: { font: MachiFont; color: string }) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = fontSpec(paint.font, height * 0.62);
    strokeNeonText(context, '茶', width / 2, height * 0.54, paint.color, height * 0.12);
};
