import * as THREE from 'three';
import type { Line, Theme } from '../../../../../types';
import { prepareWordColorMatchers } from '../../../wordColoring';
import type { MachiSongContext } from '../../createMachiRuntime';
import { machiLightboxGroup, machiNeonGroup, type MachiBeatFrame } from '../../engine/beatFx';
import type { MachiBoardTarget } from '../../engine/director';
import { MachiLyricScreen } from '../../engine/lyricScreen';
import type { MachiColorBlend, MachiMaterials } from '../../engine/materials';
import type { MachiPalette } from '../../engine/palette';
import { createCanvas, createMachiMeasure, type MachiFont } from '../../engine/signRaster';
import { BOARD, STALLS } from './layout';
import { paintChanganBanner, paintChanganPlaque, paintChanganStallSign, paintChanganTeaNeon } from './changanSignPaint';
import type { ChanganTerraceParts } from './terrace';

// src/components/visualizer/machi/scenes/changan/changanSigns.ts
// 长安夜市的招牌：台基前墙的宽幅歌词屏（engine/lyricScreen.ts，当前行逐字点亮）、屏下一排 EQ 光柱
// （高低跟节拍 / 音频 / 副歌，InstancedMesh 每帧改 scale）、牌坊横匾（曲名）、两根柱上的竖幡灯箱
// （竖排歌手名）、三个食摊的布幌子（肉夹馍 / 羊肉泡馍 / 油泼面·酸梅汤）、茶馆角的紫色小霓虹「茶」。
// 颜色、图标、字体都从主题来；牌面贴图在换行 / 换歌 / 换主题时重画，每帧只改 uniform 与材质亮度。

/** 食摊幌子上的字（STALLS 的 menu 下标）。 */
export const STALL_MENUS = ['肉夹馍', '羊肉泡馍', '油泼面 · 酸梅汤'] as const;

export interface ChanganSignPlacements {
    boardFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    plaqueFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    bannerFaces: { position: THREE.Vector3; rotationY: number; width: number; height: number }[];
    stallSignFaces: { position: THREE.Vector3; rotationY: number; width: number; height: number }[];
    teaNeonFace: { position: THREE.Vector3; rotationY: number; width: number; height: number };
    eq: ChanganTerraceParts['eq'];
}

export interface ChanganSignContent {
    song: MachiSongContext;
    theme: Theme;
    palette: MachiPalette;
    font: MachiFont;
    icons: string[];
    fallbacks: readonly string[];
}

export interface ChanganSignFrame {
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

export class ChanganSigns {
    readonly group = new THREE.Group();
    private readonly screen: MachiLyricScreen;
    private readonly eq: ChanganSignPlacements['eq'];
    private readonly statics: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; material: THREE.MeshBasicMaterial | THREE.MeshToonMaterial; level: number }[] = [];
    private readonly plaque;
    private readonly banners;
    private readonly stallSigns;
    private readonly teaNeon;
    private content: ChanganSignContent | null = null;
    private readonly eqMatrix = new THREE.Matrix4();
    private readonly eqLevels: Float32Array;
    private eqTimer = 0;

    constructor(materials: MachiMaterials, blend: MachiColorBlend, placements: ChanganSignPlacements) {
        this.group.name = 'Signs';
        // 台基前墙的宽幅歌词屏。
        this.screen = new MachiLyricScreen(materials, blend, BOARD.width - 0.14, BOARD.height - 0.12);
        this.group.add(this.screen.createFace(placements.boardFace.position, placements.boardFace.rotationY, 'Board/face'));

        // 牌坊横匾（曲名）。
        const plaqueFace = placements.plaqueFace;
        this.plaque = this.staticSign(materials, 1024, Math.round(1024 * plaqueFace.height / plaqueFace.width), 0.95, 'basic');
        this.group.add(placedPlane(this.plaque.material, plaqueFace.width, plaqueFace.height, plaqueFace.position, plaqueFace.rotationY, 'Plaque/face'));

        // 柱上竖幡（歌手名）：两块小灯箱。
        this.banners = placements.bannerFaces.map((face, index) => {
            const sign = this.staticSign(materials, 192, Math.round(192 * face.height / face.width), 1.15, 'basic');
            this.group.add(placedPlane(sign.material, face.width, face.height, face.position, face.rotationY, `Banner/face${index}`));
            return sign;
        });

        // 食摊幌子。
        this.stallSigns = placements.stallSignFaces.map((face, index) => {
            const sign = this.staticSign(materials, 512, Math.round(512 * face.height / face.width), 0.9, 'basic');
            this.group.add(placedPlane(sign.material, face.width, face.height, face.position, face.rotationY, `StallSign/face${index}`));
            return sign;
        });

        // 茶馆角的紫色小霓虹。
        const teaFace = placements.teaNeonFace;
        this.teaNeon = this.staticSign(materials, 256, Math.round(256 * teaFace.height / teaFace.width), 1.5, 'additive');
        this.group.add(placedPlane(this.teaNeon.material, teaFace.width, teaFace.height, teaFace.position, teaFace.rotationY, 'TeaNeon/face'));

        this.eq = placements.eq;
        this.eqLevels = new Float32Array(this.eq.count).fill(0.4);
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
    setContent(content: ChanganSignContent) {
        this.content = content;
        const { palette, font, song, fallbacks } = content;
        const icon = (index: number) => content.icons.length ? content.icons[index % content.icons.length] : fallbacks[index % fallbacks.length];
        const title = song.title || song.album || '长安夜市';
        const artist = song.artist || song.album || 'CHANG\'AN';
        paintChanganPlaque(this.plaque.canvas, {
            font,
            title,
            base: '#141a26',
            ink: '#f2d9a4',
            accent: palette.art.paifangTrim ?? '#c9994e',
        });
        this.banners.forEach(sign => paintChanganBanner(sign.canvas, {
            font,
            text: artist,
            base: '#231a14',
            ink: '#ffdfae',
            accent: palette.art.paifangRed ?? '#8e3327',
        }));
        this.stallSigns.forEach((sign, index) => paintChanganStallSign(sign.canvas, {
            font,
            text: STALL_MENUS[STALLS[index]!.menu]!,
            icon: icon(index),
            fallbacks,
            base: '#2a1f16',
            ink: '#f2e3c2',
            accent: palette.art.paifangRed ?? '#8e3327',
        }));
        paintChanganTeaNeon(this.teaNeon.canvas, {
            font,
            color: palette.art.neonPurple ?? palette.neon,
        });
        this.statics.forEach(sign => { sign.texture.needsUpdate = true; });
        this.screen.setContent({
            palette,
            font,
            measure: createMachiMeasure(font),
            matchers: prepareWordColorMatchers(content.theme.wordColors),
            cardTitle: `♪ ${title}`,
            cardSubtitle: song.artist || song.album || '',
        });
    }

    /** 换牌面（静态模式、暂停时直接换）。 */
    showBoard(target: MachiBoardTarget, lines: readonly Line[], immediate: boolean, showText = true) {
        this.screen.show(target, lines, immediate, showText);
    }

    /** 空闲时提前画好下一行。 */
    preheat(target: MachiBoardTarget, lines: readonly Line[], showText: boolean) {
        this.screen.preheat(target, lines, showText);
    }

    /** 每帧：屏幕、EQ 光柱、招牌亮度（闪烁、副歌、音频）。 */
    update(frame: ChanganSignFrame) {
        const content = this.content;
        if (!content) return;
        this.screen.update(frame);
        const chorus = this.screen.chorus;

        // EQ 光柱：每根按自己的相位起伏，幅度跟音频、副歌与所属霓虹组；节拍里轮流抬升。
        const { beat } = frame;
        const eq = this.eq;
        const updateInterval = frame.staticMode ? 1 / 12 : 0;
        this.eqTimer -= frame.delta;
        if (this.eqTimer <= 0) {
            this.eqTimer = Math.max(updateInterval, 1 / 30);
            for (let index = 0; index < eq.count; index += 1) {
                const phase = eq.phases[index]!;
                const wave = 0.5 + 0.5 * Math.sin(frame.ambientTime * 2.4 + phase * 11.0) * Math.sin(frame.ambientTime * 1.3 + phase * 5.0);
                const target = Math.min(1.6, Math.max(0.12,
                    0.18 + wave * (0.35 + 0.55 * frame.audio + 0.25 * chorus) + 0.5 * (machiNeonGroup(beat, index) - 1)));
                this.eqLevels[index] = this.eqLevels[index]! + (target - this.eqLevels[index]!) * (frame.staticMode ? 1 : 0.35);
                const height = eq.maxHeight * this.eqLevels[index]!;
                this.eqMatrix.makeScale(1, Math.max(0.02, height), 1);
                this.eqMatrix.setPosition(eq.x0 + eq.spacing * index, eq.y0 + Math.max(0.02, height) / 2, eq.z);
                eq.mesh.setMatrixAt(index, this.eqMatrix);
            }
            eq.mesh.instanceMatrix.needsUpdate = true;
        }

        // 静态招牌：闪烁落在幌子与竖幡上，副歌时不闪、更亮；霓虹随副歌与节拍脉动。
        const flicker = chorus > 0.5 ? 1 : frame.flicker;
        const lift = 1 + 0.08 * chorus + 0.05 * frame.audio;
        this.setLevel(this.plaque, this.plaque.level * lift * machiLightboxGroup(beat, 0));
        this.banners.forEach((sign, index) => this.setLevel(sign, sign.level * lift * flicker * machiLightboxGroup(beat, index)));
        this.stallSigns.forEach((sign, index) => this.setLevel(sign, sign.level * lift * flicker * machiLightboxGroup(beat, index)));
        const neonPulse = frame.staticMode ? 1 : 0.85 + 0.15 * Math.sin(frame.ambientTime * 2.2) + 0.4 * chorus;
        this.setLevel(this.teaNeon, this.teaNeon.level * neonPulse * flicker * machiNeonGroup(beat, 2));
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
        this.statics.forEach(sign => sign.texture.dispose());
        this.group.traverse(object => {
            if (object instanceof THREE.Mesh && object.material !== this.screen.material) object.geometry.dispose();
        });
    }
}
