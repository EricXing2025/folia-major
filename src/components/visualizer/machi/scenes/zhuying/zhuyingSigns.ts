import * as THREE from 'three';
import type { Line, Theme } from '../../../../../types';
import { mixHexColors } from '../../../../../utils/themeColorMath';
import { prepareWordColorMatchers } from '../../../wordColoring';
import type { MachiSongContext } from '../../createMachiRuntime';
import { machiNeonGroup, type MachiBeatFrame } from '../../engine/beatFx';
import type { MachiBoardTarget } from '../../engine/director';
import { MachiLedStrip } from '../../engine/ledStrip';
import { MachiLyricScreen } from '../../engine/lyricScreen';
import type { MachiColorBlend, MachiMaterials } from '../../engine/materials';
import type { MachiPalette } from '../../engine/palette';
import { createCanvas, createMachiMeasure, type MachiFont } from '../../engine/signRaster';
import { LYRIC, MONITOR, RING, SHELF } from './layout';
import { paintZhuyingKline, paintZhuyingMonitor, paintZhuyingRing, ZHUYING_TICKER_TEXTS, type ZhuyingChartMarks } from './zhuyingSignPaint';
import type { ZhuyingVariation } from './zhuyingSeed';

// src/components/visualizer/machi/scenes/zhuying/zhuyingSigns.ts
// 书房的内容面：窗内侧上部的歌词点阵条（engine/lyricScreen.ts，当前行逐字点亮，投在夜色里）；书桌前沿的
// LED 跑马灯（一条静态装饰行情字，不是歌的内容）；显示器整屏（上沿标题栏写「♪ 曲名」、下面是 K 线图，
// 底部量柱与最后一根蜡烛是会动的网格，随拍子长）；后墙右段实墙的环形灯（灯环 + 环里歌手名霓虹 + 一排
// EQ 柱随节拍起伏）；左墙的 K 线霓虹（红绿蜡烛灯管）。牌面在换歌 / 换主题时重画，每帧只改 uniform、材质亮度与实例缩放。

export interface ZhuyingSignPlacements {
    monitorFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    tickerFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
}

export interface ZhuyingSignContent {
    song: MachiSongContext;
    theme: Theme;
    palette: MachiPalette;
    font: MachiFont;
    icons: string[];
    fallbacks: readonly string[];
}

export interface ZhuyingSignFrame {
    songTime: number;
    ambientTime: number;
    delta: number;
    staticMode: boolean;
    chorus: number;
    audio: number;
    flicker: number;
    beat: MachiBeatFrame;
}

const MONITOR_PX = { width: 1408, height: 464 };
const EQ_BARS = 9;
const VOL_BARS = 6;

const canvasTexture = (canvas: HTMLCanvasElement, anisotropy = 4) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
};

const placedPlane = (material: THREE.Material, width: number, height: number, position: THREE.Vector3, rotationY: number, name: string) => {
    const result = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    result.name = name;
    result.position.copy(position);
    result.rotation.y = rotationY;
    return result;
};

export class ZhuyingSigns {
    readonly group = new THREE.Group();
    private readonly screen: MachiLyricScreen;
    private readonly led: MachiLedStrip;
    private readonly statics: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; material: THREE.MeshBasicMaterial; level: number }[] = [];
    private readonly monitor;
    private readonly ring;
    private readonly kline;
    private readonly chartAnchor = new THREE.Group();
    private readonly volBars: THREE.InstancedMesh;
    private readonly eqBars: THREE.InstancedMesh;
    private readonly lastCandle: THREE.Group;
    private readonly matrix = new THREE.Matrix4();
    private readonly materials: MachiMaterials;
    private content: ZhuyingSignContent | null = null;
    private marks: ZhuyingChartMarks | null = null;
    /** 环里 EQ 排的布局（屏面局部坐标，基线在名字下面；setContent 按画出来的环换算）。 */
    private eqBase = { x0: -0.15, step: 0.038, width: 0.024, baseline: -0.13 };

    constructor(materials: MachiMaterials, blend: MachiColorBlend, placements: ZhuyingSignPlacements) {
        this.materials = materials;
        this.group.name = 'Signs';
        // 歌词点阵条：窗内侧上部，面朝屋里（在玻璃与雨痕之前）。
        this.screen = new MachiLyricScreen(materials, blend, LYRIC.width - 0.1, LYRIC.height - 0.05);
        const lyricFace = this.screen.createFace(
            new THREE.Vector3((LYRIC.x0 + LYRIC.x1) / 2, (LYRIC.y0 + LYRIC.y1) / 2, LYRIC.z),
            0,
            'Lyric/face',
        );
        lyricFace.renderOrder = 4;
        this.group.add(lyricFace);

        // 显示器：一整屏画布（标题栏 + K 线图）；会动的量柱与末根蜡烛挂在屏面的局部坐标里。
        this.monitor = this.staticSign(materials, MONITOR_PX.width, MONITOR_PX.height, 0.85, 'basic');
        const monitorFace = placements.monitorFace;
        this.group.add(placedPlane(this.monitor.material, monitorFace.width, monitorFace.height, monitorFace.position, monitorFace.rotationY, 'Monitor/face'));
        this.chartAnchor.name = 'Monitor/live';
        this.chartAnchor.position.copy(monitorFace.position);
        this.chartAnchor.rotation.y = monitorFace.rotationY;
        this.group.add(this.chartAnchor);
        const volGeometry = new THREE.PlaneGeometry(1, 1);
        this.volBars = new THREE.InstancedMesh(volGeometry, materials.glow('chartMark'), VOL_BARS);
        this.volBars.name = 'Monitor/volBars';
        this.volBars.castShadow = false;
        this.volBars.userData.dynamic = true;
        this.chartAnchor.add(this.volBars);
        this.lastCandle = new THREE.Group();
        this.lastCandle.name = 'Monitor/lastCandle';
        this.lastCandle.userData.dynamic = true;
        const candleBody = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materials.glow('chartUp'));
        candleBody.name = 'body';
        const candleWick = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materials.glow('chartUp'));
        candleWick.name = 'wick';
        this.lastCandle.add(candleBody, candleWick);
        this.chartAnchor.add(this.lastCandle);

        // 书桌前沿的 LED 跑马灯。
        const tickerFace = placements.tickerFace;
        this.led = new MachiLedStrip(materials, blend, tickerFace.width, tickerFace.height);
        this.group.add(this.led.createFace(tickerFace.position, tickerFace.rotationY, 'Ticker/led'));

        // 环形灯字面：后墙右段实墙正中一圈；EQ 柱是环里一排实例细柱，各自接一组霓虹拍。
        this.ring = this.staticSign(materials, 512, 512, 1.4, 'additive');
        this.group.add(placedPlane(this.ring.material, RING.radius * 2, RING.radius * 2, new THREE.Vector3(RING.x, RING.y, RING.z), 0, 'Ring/face'));
        const eqGeometry = new THREE.BoxGeometry(1, 1, 0.012);
        this.eqBars = new THREE.InstancedMesh(eqGeometry, materials.glow('eqBar'), EQ_BARS);
        this.eqBars.name = 'Ring/eqBars';
        this.eqBars.castShadow = false;
        this.eqBars.userData.dynamic = true;
        const eqAnchor = new THREE.Group();
        eqAnchor.name = 'Ring/eq';
        eqAnchor.position.set(RING.x, RING.y, RING.z + 0.008);
        eqAnchor.add(this.eqBars);
        this.group.add(eqAnchor);

        // 左墙的 K 线霓虹：面贴墙皮朝 +x。
        this.kline = this.staticSign(materials, 768, 256, 1.5, 'additive');
        const neon = SHELF.neon;
        this.group.add(placedPlane(
            this.kline.material,
            neon.z1 - neon.z0,
            neon.y1 - neon.y0,
            new THREE.Vector3(SHELF.x0 + 0.006, (neon.y0 + neon.y1) / 2, (neon.z0 + neon.z1) / 2),
            Math.PI / 2,
            'Kline/face',
        ));
    }

    /** 一块静态字面：一张 canvas 贴图 + 材质（受光或加色发光）。 */
    private staticSign(materials: MachiMaterials, width: number, height: number, level: number, kind: 'basic' | 'additive') {
        const canvas = createCanvas(width, height);
        const texture = canvasTexture(canvas);
        const material = materials.track(new THREE.MeshBasicMaterial({
            map: texture,
            transparent: kind === 'additive',
            blending: kind === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
            depthWrite: kind !== 'additive',
        }));
        material.color.setScalar(level);
        const sign = { canvas, texture, material, level };
        this.statics.push(sign);
        return sign;
    }

    /** 显示器画布上的 x / y（像素）→ 屏面局部坐标（x 右、y 上）。 */
    private chartLocalX(px: number) {
        return (px / MONITOR_PX.width - 0.5) * MONITOR.width;
    }

    private chartLocalY(py: number) {
        return (0.5 - py / MONITOR_PX.height) * MONITOR.height;
    }

    /** 换歌后按新画好的蜡烛图摆会动的件：量柱的 x 与宽度、末根蜡烛的实体与影线。 */
    private placeChartMarks() {
        const marks = this.marks;
        if (!marks) return;
        const candleMaterial = this.materials.glow(marks.candleUp ? 'chartUp' : 'chartDown');
        const body = this.lastCandle.getObjectByName('body') as THREE.Mesh;
        const wick = this.lastCandle.getObjectByName('wick') as THREE.Mesh;
        body.material = candleMaterial;
        wick.material = candleMaterial;
        const bx0 = this.chartLocalX(marks.candle.x0);
        const bx1 = this.chartLocalX(marks.candle.x1);
        const by0 = this.chartLocalY(marks.candle.y0);
        const by1 = this.chartLocalY(marks.candle.y1);
        // 组心放在蜡烛中心：update 里的拍子缩放围着它跳，不然蜡烛会随缩放横向漂移。
        this.lastCandle.position.set((bx0 + bx1) / 2, (by0 + by1) / 2, 0.012);
        body.scale.set(Math.abs(bx1 - bx0), Math.abs(by0 - by1), 1);
        body.position.set(0, 0, 0);
        const wx = this.chartLocalX(marks.wick.x);
        const wy0 = this.chartLocalY(marks.wick.y0);
        const wy1 = this.chartLocalY(marks.wick.y1);
        wick.scale.set(Math.max(0.002, Math.abs(bx1 - bx0) * 0.14), Math.abs(wy0 - wy1), 1);
        wick.position.set(wx - this.lastCandle.position.x, (wy0 + wy1) / 2 - this.lastCandle.position.y, 0);
    }

    /** 换歌 / 换主题：重画所有静态字面，牌面按新颜色重画。 */
    setContent(content: ZhuyingSignContent, variation: ZhuyingVariation) {
        this.content = content;
        const { palette, font, song } = content;
        const art = palette.art;
        const up = art.chartUp ?? '#35d07f';
        const down = art.chartDown ?? '#f0485c';
        this.marks = paintZhuyingMonitor(this.monitor.canvas, {
            font,
            title: song.title || song.album || 'CHANG\'AN',
            chartSeed: variation.chartSeed,
            lastCandleUp: variation.lastCandleUp,
            base: '#0b0e13',
            panel: '#131a24',
            grid: 'rgba(180,200,230,0.09)',
            text: '#e8eef8',
            dim: 'rgba(180,196,220,0.55)',
            up,
            down,
            maFast: '#ffcf70',
            maSlow: '#6aa9ff',
            accent: art.neonCyan ?? palette.neon,
        });
        this.placeChartMarks();
        const ringMarks = paintZhuyingRing(this.ring.canvas, {
            font,
            artist: song.artist || song.title || 'CHANG\'AN',
            ring: art.ringLight ?? '#ffd9e8',
            text: art.neonPink ?? palette.neon,
            dim: 'rgba(220,205,215,0.4)',
        });
        // 环是 512px 画到 0.72m 面上：EQ 排按画出来的半径与基线换算，盖在它上面才准。
        const ringScale = (RING.radius * 2) / this.ring.canvas.width;
        this.eqBase = {
            x0: -ringMarks.radius * 0.62 * ringScale,
            step: (ringMarks.radius * 1.24 * ringScale) / 8,
            width: Math.max(0.016, ringMarks.radius * 0.1 * ringScale),
            baseline: -(ringMarks.eqY - ringMarks.cy) * ringScale,
        };
        paintZhuyingKline(this.kline.canvas, {
            up,
            down,
            axis: 'rgba(200,215,235,0.45)',
        });
        this.statics.forEach(sign => { sign.texture.needsUpdate = true; });
        this.screen.setContent({
            // 窗上这条点阵带隔着雨痕看：压暗底色与未唱字，唱到的字才读得出来。
            palette: {
                ...palette,
                boardBase: mixHexColors(palette.boardBase, '#000000', palette.boardIsLight ? 0 : 0.45),
                boardUnlit: mixHexColors(palette.boardUnlit, '#000000', palette.boardIsLight ? 0.2 : 0.4),
            },
            font,
            measure: createMachiMeasure(font),
            matchers: prepareWordColorMatchers(content.theme.wordColors),
            cardTitle: `♪ ${song.title || 'CHANG\'AN'}`,
            cardSubtitle: song.artist || song.album || '',
        });
        // 换主题 / 字体时同一条字也要重画。
        this.led.invalidate();
        this.led.setText(ZHUYING_TICKER_TEXTS[variation.tickerIndex % ZHUYING_TICKER_TEXTS.length]!, font);
    }

    /** 换牌面（静态模式、暂停时直接换）。 */
    showBoard(target: MachiBoardTarget, lines: readonly Line[], immediate: boolean, showText = true) {
        this.screen.show(target, lines, immediate, showText);
    }

    /** 空闲时提前画好下一行。 */
    preheat(target: MachiBoardTarget, lines: readonly Line[], showText: boolean) {
        this.screen.preheat(target, lines, showText);
    }

    /** 每帧：屏幕、LED 滚动、字面亮度（闪烁、副歌、拍子组）、EQ 与量柱的实例缩放。 */
    update(frame: ZhuyingSignFrame) {
        const content = this.content;
        if (!content) return;
        this.screen.update(frame);
        const chorus = this.screen.chorus;
        this.led.update({ delta: frame.delta, staticMode: frame.staticMode, speed: 1 + 0.5 * chorus, audio: frame.audio });

        const flicker = chorus > 0.5 ? 1 : frame.flicker;
        const lift = 1 + 0.08 * chorus + 0.05 * frame.audio;
        const { beat } = frame;
        this.setLevel(this.monitor, this.monitor.level * lift * (0.9 + 0.1 * beat.warm));
        // 霓虹随拍：K 线霓虹是第 0 组，环形灯稳一点、算第 1 组轻轻哼。
        const neonPulse = frame.staticMode ? 1 : 0.85 + 0.15 * Math.sin(frame.ambientTime * 2.2) + 0.4 * chorus;
        this.setLevel(this.kline, this.kline.level * neonPulse * flicker * machiNeonGroup(beat, 0));
        this.setLevel(this.ring, this.ring.level * (0.92 + 0.08 * flicker) * (0.8 + 0.2 * machiNeonGroup(beat, 1)));

        // EQ 柱：九根各接一组霓虹拍，音频包络抬底子；静态模式下一律中高。
        const eq = this.eqBase;
        for (let index = 0; index < EQ_BARS; index += 1) {
            const groupLevel = machiNeonGroup(beat, index % 3);
            const level = frame.staticMode ? 0.55 : Math.min(1, Math.max(0.06, 0.18 + frame.audio * 0.55 + (groupLevel - 0.4) * 0.75));
            const h = 0.015 + level * (RING.radius * 0.24);
            this.matrix.makeScale(eq.width, h, 1).setPosition(eq.x0 + eq.step * index, eq.baseline + h / 2, 0);
            this.eqBars.setMatrixAt(index, this.matrix);
        }
        this.eqBars.instanceMatrix.needsUpdate = true;

        // 量柱与末根蜡烛：跟着拍子组长；蜡烛连实体带影线一起跳。
        const marks = this.marks;
        if (marks) {
            const bottom = this.chartLocalY(marks.volBaseline);
            marks.volumes.forEach((rect, index) => {
                const groupLevel = machiNeonGroup(beat, index % 3);
                const level = frame.staticMode ? 0.7 : Math.min(1.35, 0.55 + 0.45 * groupLevel * (0.6 + frame.audio));
                const h = Math.max(0.004, (this.chartLocalY(rect.y0) - bottom) * level);
                this.matrix.makeScale(this.chartLocalX(rect.x1) - this.chartLocalX(rect.x0), h, 1)
                    .setPosition(this.chartLocalX((rect.x0 + rect.x1) / 2), bottom + h / 2, 0.012);
                this.volBars.setMatrixAt(index, this.matrix);
            });
            this.volBars.instanceMatrix.needsUpdate = true;
            const pulse = frame.staticMode ? 1 : 1 + 0.12 * beat.thump + 0.08 * Math.max(0, machiNeonGroup(beat, 2) - 0.5) * frame.audio;
            this.lastCandle.scale.set(pulse, pulse, 1);
        }
    }

    private setLevel(sign: { material: THREE.Material }, level: number) {
        if (sign.material instanceof THREE.MeshBasicMaterial) sign.material.color.setScalar(level);
    }

    /** 屏幕上有字面在动画：暂停时也要继续出帧。 */
    get busy() {
        return this.screen.busy;
    }

    dispose() {
        this.screen.dispose();
        this.led.dispose();
        this.statics.forEach(sign => sign.texture.dispose());
        this.group.traverse(object => {
            if (object instanceof THREE.Mesh && object.material !== this.screen.material && object.material !== this.led.material) object.geometry.dispose();
        });
    }
}
