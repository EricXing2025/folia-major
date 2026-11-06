import * as THREE from 'three';
import type { Line, Theme } from '../../../../../types';
import { prepareWordColorMatchers } from '../../../wordColoring';
import type { MachiSongContext } from '../../createMachiRuntime';
import { machiLightboxGroup, machiNeonGroup, type MachiBeatFrame } from '../../engine/beatFx';
import { resolveMachiTickerText, type MachiBoardTarget } from '../../engine/director';
import { MachiLedStrip } from '../../engine/ledStrip';
import { MachiLyricScreen } from '../../engine/lyricScreen';
import type { MachiColorBlend, MachiMaterials } from '../../engine/materials';
import type { MachiPalette } from '../../engine/palette';
import { createCanvas, createMachiMeasure, type MachiFont } from '../../engine/signRaster';
import { BOARD, DEG, STORE } from './layout';
import type { RecordstorePlacement } from './props';
import type { RecordstoreVariation } from './recordstoreSeed';
import {
    paintRecordstoreAFrame,
    paintRecordstoreCrateTag,
    paintRecordstoreFascia,
    paintRecordstoreNeon,
    paintRecordstorePoster,
} from './recordstoreSignPaint';

// src/components/visualizer/machi/scenes/recordstore/recordstoreSigns.ts
// 唱片店的招牌：屋顶歌词屏（engine/lyricScreen.ts，当前行逐字点亮）、右面店招上的 LED 跑马灯（下一句 / 译文）、
// 前面店招（黑胶 logo + 曲名当店名）、店角竖挂霓虹（深夜唱片 / MIDNIGHT RECORDS，粉青双色）、橱窗海报（歌手）、
// 门口 A 字立牌（OPEN / 营业中）、特价箱价签。颜色、图标、字体都从主题来；牌面贴图在换行 / 换歌 / 换主题时重画，
// 每帧只改 uniform 与材质亮度。

export interface RecordstoreSignPlacements {
    boardFace: { position: THREE.Vector3; rotationY: number };
    fasciaFaces: { position: THREE.Vector3; rotationY: number; width: number; height: number }[];
    neonFaces: { position: THREE.Vector3; rotationY: number; width: number; height: number }[];
    aFrameFaces: (RecordstorePlacement & { lean?: number })[];
    crateTagFaces: RecordstorePlacement[];
}

export interface RecordstoreSignContent {
    song: MachiSongContext;
    theme: Theme;
    palette: MachiPalette;
    font: MachiFont;
    /** 主题图标（已加载、已规范化的名字），可能是空的。 */
    icons: string[];
    fallbacks: readonly string[];
}

export interface RecordstoreSignFrame {
    songTime: number;
    ambientTime: number;
    delta: number;
    staticMode: boolean;
    chorus: number;
    audio: number;
    flicker: number;
    beat: MachiBeatFrame;
}

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

export class RecordstoreSigns {
    readonly group = new THREE.Group();
    private readonly screen: MachiLyricScreen;
    private readonly led: MachiLedStrip;
    private boardTarget: MachiBoardTarget | null = null;
    private readonly statics: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; material: THREE.MeshBasicMaterial | THREE.MeshToonMaterial; level: number }[] = [];
    private readonly fascia;
    private readonly neonSign;
    private readonly posters;
    private readonly aFrame;
    private readonly crateTag;
    private content: RecordstoreSignContent | null = null;
    private lines: readonly Line[] = [];
    private variation: Pick<RecordstoreVariation, 'posterLayout'> = { posterLayout: 0 };

    constructor(materials: MachiMaterials, blend: MachiColorBlend, placements: RecordstoreSignPlacements) {
        this.group.name = 'Signs';
        // 屋顶歌词屏：一块横屏，正对默认镜头。
        this.screen = new MachiLyricScreen(materials, blend, BOARD.width - 0.14, BOARD.height - 0.12);
        this.group.add(this.screen.createFace(placements.boardFace.position, placements.boardFace.rotationY, 'Board/face'));

        // 前面店招、右面 LED。
        const fasciaFront = placements.fasciaFaces[0]!;
        this.fascia = this.staticSign(materials, 1600, Math.round(1600 * fasciaFront.height / fasciaFront.width), 0.9, 'basic');
        this.group.add(placedPlane(this.fascia.material, fasciaFront.width, fasciaFront.height, fasciaFront.position, fasciaFront.rotationY, 'Fascia/front'));
        const fasciaRight = placements.fasciaFaces[1]!;
        this.led = new MachiLedStrip(materials, blend, fasciaRight.width, fasciaRight.height);
        this.group.add(this.led.createFace(fasciaRight.position, fasciaRight.rotationY, 'Fascia/led'));

        // 店角竖霓虹：两面各一张字面（背面不反字）。
        this.neonSign = placements.neonFaces.map((face, index) => {
            const sign = this.staticSign(materials, 192, Math.round(192 * face.height / face.width), 1.5, 'additive');
            this.group.add(placedPlane(sign.material, face.width, face.height, face.position, face.rotationY, `NeonSign/face${index}`));
            return sign;
        });

        // 橱窗海报：前面左段玻璃后面两张。
        this.posters = [0, 1].map(index => {
            const sign = this.staticSign(materials, 256, 364, 0.95, 'basic');
            const position = new THREE.Vector3(-4.32 + index * 0.74, 1.58, STORE.z1 - 0.075);
            this.group.add(placedPlane(sign.material, 0.56, 0.8, position, 0, `Poster${index}`));
            return sign;
        });

        // 门口 A 字立牌与特价箱价签。
        const aFace = placements.aFrameFaces[0]!;
        this.aFrame = this.staticSign(materials, 256, Math.round(256 * aFace.height / aFace.width), 1, 'toon');
        const aMesh = placedPlane(this.aFrame.material, aFace.width, aFace.height, aFace.position, aFace.rotationY, 'AFrame/face');
        aMesh.rotateX(-(aFace.lean ?? 12 * DEG));
        this.group.add(aMesh);
        const tagFace = placements.crateTagFaces[0]!;
        this.crateTag = this.staticSign(materials, 192, Math.round(192 * tagFace.height / tagFace.width), 0.9, 'basic');
        this.group.add(placedPlane(this.crateTag.material, tagFace.width, tagFace.height, tagFace.position, tagFace.rotationY, 'SaleCrate/tag'));
    }

    /** 一块静态招牌：一张 canvas 贴图 + 材质（自发光、加色或受光）。 */
    private staticSign(materials: MachiMaterials, width: number, height: number, level: number, kind: 'basic' | 'additive' | 'toon') {
        const canvas = createCanvas(width, height);
        const texture = canvasTexture(canvas);
        const material = kind === 'toon'
            ? materials.track(new THREE.MeshToonMaterial({ map: texture, gradientMap: materials.gradient }))
            : materials.track(new THREE.MeshBasicMaterial({
                map: texture,
                transparent: kind === 'additive',
                blending: kind === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
                depthWrite: kind !== 'additive',
            }));
        if (material instanceof THREE.MeshBasicMaterial) material.color.setScalar(level);
        const sign = { canvas, texture, material, level };
        this.statics.push(sign);
        return sign;
    }

    /** 换歌 / 换主题：重画所有静态招牌，牌面按新颜色重画。 */
    setContent(content: RecordstoreSignContent, variation: Pick<RecordstoreVariation, 'posterLayout'>) {
        this.content = content;
        this.variation = variation;
        const { palette, font, song, fallbacks } = content;
        const icon = (index: number) => content.icons.length ? content.icons[index % content.icons.length] : fallbacks[index % fallbacks.length];
        const title = song.title || song.album || 'RECORDS';
        paintRecordstoreFascia(this.fascia.canvas, {
            font,
            title,
            base: '#161d18',
            text: '#f2e9d4',
            accent: palette.art.brass ?? '#c99a4e',
            vinyl: '#15181d',
        });
        this.neonSign.forEach(sign => paintRecordstoreNeon(sign.canvas, {
            font,
            pink: palette.art.neonPink ?? palette.neon,
            cyan: palette.art.neonCyan ?? '#6fd9e8',
        }));
        // 两张橱窗海报：歌手（版式按歌变）与主题 / 专辑。
        paintRecordstorePoster(this.posters[0]!.canvas, {
            font,
            heading: song.artist || title,
            body: song.album || 'NOW PLAYING',
            icon: icon(1),
            fallbacks,
            background: palette.brand[1],
            ink: '#1b1f27',
            accent: palette.brand[0],
            tag: 'NEW',
            layout: this.variation.posterLayout,
        });
        paintRecordstorePoster(this.posters[1]!.canvas, {
            font,
            heading: content.theme.name && content.theme.provider === 'AI' ? content.theme.name : (song.album || title),
            body: 'MIDNIGHT PRESS',
            icon: icon(2),
            fallbacks,
            background: palette.brand[2],
            ink: '#ffffff',
            accent: palette.brand[0],
            tag: 'LP',
            layout: this.variation.posterLayout + 1,
        });
        paintRecordstoreAFrame(this.aFrame.canvas, { font, chalk: '#eef1ea', accent: palette.art.neonPink ?? palette.brand[0] });
        paintRecordstoreCrateTag(this.crateTag.canvas, { font, base: '#f2e9d4', ink: '#3a3226', accent: palette.art.brass ?? '#c99a4e' });
        this.statics.forEach(sign => { sign.texture.needsUpdate = true; });
        this.screen.setContent({
            palette,
            font,
            measure: createMachiMeasure(font),
            matchers: prepareWordColorMatchers(content.theme.wordColors),
            cardTitle: `♪ ${song.title || 'RECORDS'}`,
            cardSubtitle: song.artist || song.album || '',
        });
        this.led.invalidate();
    }

    /** 换牌面（静态模式、暂停时直接换）。 */
    showBoard(target: MachiBoardTarget, lines: readonly Line[], immediate: boolean, showText = true) {
        this.lines = lines;
        this.boardTarget = target;
        this.screen.show(target, lines, immediate, showText);
        this.led.invalidate();
    }

    /** 空闲时提前画好下一行。 */
    preheat(target: MachiBoardTarget, lines: readonly Line[], showText: boolean) {
        this.screen.preheat(target, lines, showText);
    }

    /** 每帧：屏幕、LED 滚动、招牌亮度（闪烁、副歌、音频）。 */
    update(frame: RecordstoreSignFrame) {
        const content = this.content;
        if (!content) return;
        this.screen.update(frame);
        const chorus = this.screen.chorus;

        if (!this.led.hasText && this.boardTarget) {
            this.led.setText(resolveMachiTickerText(this.boardTarget, this.lines, content.song, 'RECORDS'), content.font);
        }
        this.led.update({ delta: frame.delta, staticMode: frame.staticMode, speed: 1 + 0.5 * chorus, audio: frame.audio });

        // 静态招牌：闪烁落在店招与霓虹上，副歌时不闪、更亮；霓虹随副歌与节拍脉动。
        const flicker = chorus > 0.5 ? 1 : frame.flicker;
        const lift = 1 + 0.08 * chorus + 0.05 * frame.audio;
        const { beat } = frame;
        this.setLevel(this.fascia, this.fascia.level * lift * machiLightboxGroup(beat, 2));
        this.setLevel(this.crateTag, this.crateTag.level * lift);
        const neonPulse = frame.staticMode ? 1 : 0.85 + 0.15 * Math.sin(frame.ambientTime * 2.2) + 0.4 * chorus;
        this.neonSign.forEach((sign, index) => {
            this.setLevel(sign, sign.level * neonPulse * flicker * machiNeonGroup(beat, index));
        });
    }

    private setLevel(sign: { material: THREE.Material }, level: number) {
        if (sign.material instanceof THREE.MeshBasicMaterial) sign.material.color.setScalar(level);
    }

    /** 屏幕上有招牌在动画：暂停时也要继续出帧。 */
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
