import { context2d, fitFont, strokeNeonText, type MachiFont } from '../../engine/signRaster';
import { createVisualizerRng } from '../../../visualizerSeedHash';

// src/components/visualizer/machi/scenes/zhuying/zhuyingSignPaint.ts
// 烛影长安各块字面的 Canvas 2D 画法：显示器（深色终端底 + K 线图 + 量柱 + 均线 + 上沿标题栏「♪ 曲名」）、
// 后墙右段实墙上的环形灯字面（灯环 + 环里歌手名霓虹）、左墙的 K 线霓虹（红绿蜡烛灯管）。
// 显示器上随拍动的量柱与最后一根蜡烛是另建的网格（zhuyingSigns.ts），这里把它们的画布位置记下来交给它。

export interface ZhuyingMonitorPaint {
    font: MachiFont;
    title: string;
    /** 蜡烛图的打乱种子（按歌变）。 */
    chartSeed: number;
    /** 最后一根蜡烛收阳（绿）还是收阴（红）。 */
    lastCandleUp: boolean;
    base: string;
    panel: string;
    grid: string;
    text: string;
    dim: string;
    up: string;
    down: string;
    maFast: string;
    maSlow: string;
    accent: string;
}

/** 蜡烛图上一处矩形（画布像素，y 向下）。 */
export interface ZhuyingChartRect {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
}

/** 显示器画完以后要交给会动件的标记：最后一根蜡烛的实体与影线、量柱基线与各柱。 */
export interface ZhuyingChartMarks {
    candle: ZhuyingChartRect;
    wick: { x: number; y0: number; y1: number };
    candleUp: boolean;
    volBaseline: number;
    volMax: number;
    volumes: ZhuyingChartRect[];
}

const WALK_N = 26;

/** 显示器：一整屏终端——上沿标题栏（♪ 曲名、右边一行装饰小字），下面网格上一组蜡烛图、两条均线与底部量柱。 */
export const paintZhuyingMonitor = (canvas: HTMLCanvasElement, paint: ZhuyingMonitorPaint): ZhuyingChartMarks => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    const random = createVisualizerRng(`zhuying:chart:${paint.chartSeed}`);
    context.clearRect(0, 0, width, height);
    context.fillStyle = paint.base;
    context.fillRect(0, 0, width, height);

    // 标题栏：一块稍亮的底板，左边「♪ 曲名」、右边一行会话小字。
    const header = Math.round(height * 0.22);
    context.fillStyle = paint.panel;
    context.fillRect(0, 0, width, header);
    context.fillStyle = paint.accent;
    context.fillRect(0, header - Math.max(2, height * 0.008), width, Math.max(2, height * 0.008));
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    const pad = width * 0.018;
    const session = 'CHANG\'AN DESK · 1H';
    fitFont(context, { ...paint.font, weight: Math.max(400, paint.font.weight - 200) }, session, width * 0.26, header * 0.4);
    context.textAlign = 'right';
    context.fillStyle = paint.dim;
    context.fillText(session, width - pad, header * 0.52);
    context.textAlign = 'left';
    context.fillStyle = paint.text;
    const titleLeft = pad;
    const titleRight = width - pad - width * 0.29;
    fitFont(context, { ...paint.font, weight: 800 }, `♪ ${paint.title}`, titleRight - titleLeft, header * 0.58);
    context.fillText(`♪ ${paint.title}`, titleLeft, header * 0.54);

    // 图表区：标题栏之下到底部量柱带之上。
    const chartTop = header + height * 0.035;
    const chartBottom = height * 0.78;
    const volTop = height * 0.82;
    const volBottom = height * 0.955;
    const plotX0 = pad;
    const plotX1 = width - pad - width * 0.055;

    // 网格：横五竖十，淡淡的。
    context.strokeStyle = paint.grid;
    context.lineWidth = Math.max(1, height * 0.004);
    for (let index = 0; index <= 5; index += 1) {
        const y = chartTop + ((chartBottom - chartTop) * index) / 5;
        context.beginPath();
        context.moveTo(plotX0, y);
        context.lineTo(width - pad, y);
        context.stroke();
    }
    for (let index = 0; index <= 9; index += 1) {
        const x = plotX0 + ((plotX1 - plotX0) * index) / 9;
        context.beginPath();
        context.moveTo(x, chartTop);
        context.lineTo(x, volBottom);
        context.stroke();
    }

    // 一支随机游走的蜡烛图：开收高低都在带内，最后一根的方向跟着 seed。
    const step = (plotX1 - plotX0) / WALK_N;
    const body = step * 0.58;
    let close = 0.35 + random() * 0.3;
    const highs: number[] = [];
    const lows: number[] = [];
    const closes: number[] = [];
    const opens: number[] = [];
    for (let index = 0; index < WALK_N; index += 1) {
        const open = close;
        close = Math.min(0.88, Math.max(0.12, open + (random() - 0.47) * 0.16));
        opens.push(open);
        closes.push(close);
        highs.push(Math.max(open, close) + random() * 0.06);
        lows.push(Math.min(open, close) - random() * 0.06);
    }
    closes[WALK_N - 1] = paint.lastCandleUp ? Math.min(0.88, opens[WALK_N - 1]! + 0.07 + random() * 0.05) : Math.max(0.12, opens[WALK_N - 1]! - 0.07 - random() * 0.05);
    highs[WALK_N - 1] = Math.max(opens[WALK_N - 1]!, closes[WALK_N - 1]!) + 0.02;
    lows[WALK_N - 1] = Math.min(opens[WALK_N - 1]!, closes[WALK_N - 1]!) - 0.02;
    const yAt = (value: number) => chartBottom - ((value - 0.06) / (0.9 - 0.06)) * (chartBottom - chartTop);

    // 量柱：底部一带，跟着当根涨跌着色，末尾几根留给会动的实例柱（画成虚的）。
    const marks: ZhuyingChartMarks = {
        candle: { x0: 0, x1: 0, y0: 0, y1: 0 },
        wick: { x: 0, y0: 0, y1: 0 },
        candleUp: closes[WALK_N - 1]! >= opens[WALK_N - 1]!,
        volBaseline: volBottom,
        volMax: volBottom - volTop,
        volumes: [],
    };
    const vols = closes.map((_, index) => 0.25 + random() * 0.75 * (index > WALK_N - 6 ? 0.9 : 0.55));
    vols[WALK_N - 1] = 0.95;
    const LIVE_VOLUMES = 6;
    for (let index = 0; index < WALK_N; index += 1) {
        const x0 = plotX0 + step * index + (step - body) / 2;
        const live = index >= WALK_N - LIVE_VOLUMES;
        const h = vols[index]! * (volBottom - volTop);
        const color = closes[index]! >= opens[index]! ? paint.up : paint.down;
        context.globalAlpha = live ? 0.22 : 0.5;
        context.fillStyle = color;
        context.fillRect(x0, volBottom - h, body, h);
        context.globalAlpha = 1;
        if (live) marks.volumes.push({ x0, x1: x0 + body, y0: volBottom - h, y1: volBottom });
    }

    // 蜡烛实体与影线（最后一根也画上，会动的烛身叠在它上面，所以这根画得暗一点）。
    for (let index = 0; index < WALK_N; index += 1) {
        const x = plotX0 + step * index + step / 2;
        const up = closes[index]! >= opens[index]!;
        const color = up ? paint.up : paint.down;
        const last = index === WALK_N - 1;
        context.globalAlpha = last ? 0.35 : 1;
        context.strokeStyle = color;
        context.lineWidth = Math.max(1.5, body * 0.14);
        context.beginPath();
        context.moveTo(x, yAt(highs[index]!));
        context.lineTo(x, yAt(lows[index]!));
        context.stroke();
        context.fillStyle = color;
        const y0 = yAt(Math.max(opens[index]!, closes[index]!));
        const y1 = Math.max(y0 + body * 0.18, yAt(Math.min(opens[index]!, closes[index]!)));
        context.fillRect(x - body / 2, y0, body, y1 - y0);
        context.globalAlpha = 1;
        if (last) {
            marks.candle = { x0: x - body / 2, x1: x + body / 2, y0, y1 };
            marks.wick = { x, y0: yAt(highs[index]!), y1: yAt(lows[index]!) };
        }
    }

    // 两条均线：快均线暖、慢均线冷，各走各的平滑。
    const drawMa = (period: number, color: string) => {
        context.strokeStyle = color;
        context.lineWidth = Math.max(1.5, height * 0.006);
        context.beginPath();
        closes.forEach((_, index) => {
            const from = Math.max(0, index + 1 - period);
            const mean = closes.slice(from, index + 1).reduce((sum, value) => sum + value, 0) / (index + 1 - from);
            const x = plotX0 + step * index + step / 2;
            const y = yAt(mean);
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        });
        context.stroke();
    };
    drawMa(5, paint.maFast);
    drawMa(12, paint.maSlow);

    // 右侧几根价签小字。
    context.textAlign = 'right';
    context.fillStyle = paint.dim;
    context.font = `${paint.font.weight} ${(height * 0.035).toFixed(1)}px ${paint.font.stack}`;
    for (let index = 0; index < 4; index += 1) {
        const y = chartTop + ((chartBottom - chartTop) * index) / 3.4;
        context.fillText((83.4 + (3 - index) * 0.4).toFixed(1), width - pad * 0.4, y);
    }
    return marks;
};

export interface ZhuyingRingPaint {
    font: MachiFont;
    artist: string;
    ring: string;
    text: string;
    dim: string;
}

/** 环形灯字面（透明底）：一圈带辉光的灯环（内沿一条白芯），环里歌手名霓虹，名字下面一排 EQ 的基线。 */
export const paintZhuyingRing = (canvas: HTMLCanvasElement, paint: ZhuyingRingPaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = width * 0.42;
    context.save();
    context.shadowColor = paint.ring;
    context.shadowBlur = width * 0.045;
    context.strokeStyle = paint.ring;
    context.lineWidth = Math.max(4, width * 0.045);
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(1.5, width * 0.012);
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const name = paint.artist || 'CHANG\'AN';
    const px = fitFont(context, { ...paint.font, weight: 800 }, name, width * 0.74, width * 0.21);
    context.save();
    context.shadowColor = paint.text;
    context.shadowBlur = px * 0.34;
    context.fillStyle = paint.text;
    context.fillText(name, cx, cy - radius * 0.16);
    context.restore();
    strokeNeonText(context, name, cx, cy - radius * 0.16, paint.text, px * 0.16);

    // EQ 条基线与两侧的刻度小点（会动的 EQ 柱盖在它上面，压在环内下三分之一）。
    const eqY = cy + radius * 0.48;
    context.strokeStyle = paint.dim;
    context.lineWidth = Math.max(1, width * 0.008);
    context.beginPath();
    context.moveTo(cx - radius * 0.56, eqY);
    context.lineTo(cx + radius * 0.56, eqY);
    context.stroke();
    context.fillStyle = paint.dim;
    [-0.62, 0.62].forEach(side => {
        context.beginPath();
        context.arc(cx + radius * side, eqY, width * 0.012, 0, Math.PI * 2);
        context.fill();
    });
    return { eqY, radius, cx, cy };
};

export interface ZhuyingKlinePaint {
    up: string;
    down: string;
    axis: string;
}

/** 左墙的 K 线霓虹：透明底，几根红绿蜡烛灯管带影线，下面一条细细的坐标轴（灯管画法同唱片店霓虹）。 */
export const paintZhuyingKline = (canvas: HTMLCanvasElement, paint: ZhuyingKlinePaint) => {
    const context = context2d(canvas);
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    const axisY = height * 0.88;
    context.save();
    context.shadowColor = paint.axis;
    context.shadowBlur = height * 0.05;
    context.strokeStyle = paint.axis;
    context.lineWidth = Math.max(1.5, height * 0.02);
    context.beginPath();
    context.moveTo(width * 0.05, axisY);
    context.lineTo(width * 0.96, axisY);
    context.stroke();
    context.restore();

    // 六根蜡烛：实体是圆角灯管段，影线是一条灯管线。
    const candles = [
        { x: 0.1, open: 0.72, close: 0.5, high: 0.42, low: 0.8 },
        { x: 0.25, open: 0.5, close: 0.64, high: 0.4, low: 0.72 },
        { x: 0.4, open: 0.64, close: 0.36, high: 0.3, low: 0.7 },
        { x: 0.55, open: 0.36, close: 0.55, high: 0.28, low: 0.62 },
        { x: 0.7, open: 0.55, close: 0.26, high: 0.2, low: 0.6 },
        { x: 0.85, open: 0.26, close: 0.44, high: 0.16, low: 0.52 },
    ];
    const bodyWidth = width * 0.075;
    candles.forEach(candle => {
        const up = candle.close < candle.open;
        const color = up ? paint.up : paint.down;
        const cx = candle.x * width;
        const yAt = (value: number) => value * height;
        context.save();
        context.shadowColor = color;
        context.shadowBlur = height * 0.09;
        context.strokeStyle = color;
        context.lineWidth = Math.max(2, height * 0.028);
        context.beginPath();
        context.moveTo(cx, yAt(candle.high));
        context.lineTo(cx, yAt(candle.low));
        context.stroke();
        context.fillStyle = color;
        context.beginPath();
        context.roundRect(cx - bodyWidth / 2, yAt(Math.min(candle.open, candle.close)), bodyWidth, yAt(Math.abs(candle.close - candle.open)), bodyWidth * 0.3);
        context.fill();
        context.restore();
        // 白芯。
        context.strokeStyle = '#ffffff';
        context.lineWidth = Math.max(1, height * 0.008);
        context.beginPath();
        context.moveTo(cx, yAt(candle.high));
        context.lineTo(cx, yAt(candle.low));
        context.stroke();
    });
};

/** 书桌上跑马灯的装饰字（不是行情、不是歌的内容，按歌换一条）。 */
export const ZHUYING_TICKER_TEXTS = [
    'BTC ▲ 84.2K  ETH ▲ 4.3K  SOL ▲ 178  DOGE ▼ 0.19   CHANG\'AN DESK',
    'HSI ▲  GOLD ▲  USD/CNH ▼  TAO ▲  LONG · 長安   夜盘未眠',
    'BTC ▲ ETH ▲ SOL ▲ DOGE ▼ BNB ▲   长安十二时辰 · SWING',
] as const;
