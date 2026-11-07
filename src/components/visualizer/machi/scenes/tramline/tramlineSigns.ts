import * as THREE from 'three';
import type { Line } from '../../../../../types';
import { prepareWordColorMatchers } from '../../../wordColoring';
import { machiLightboxGroup, machiNeonGroup, type MachiBeatFrame } from '../../engine/beatFx';
import { resolveMachiTickerText, type MachiBoardTarget } from '../../engine/director';
import { clipToBase, createBaseClippingPlanes } from '../../engine/actors/traffic';
import { MACHI_BASE } from '../../engine/geometry/plinth';
import { MachiLedStrip } from '../../engine/ledStrip';
import { MachiLyricScreen } from '../../engine/lyricScreen';
import type { MachiColorBlend, MachiMaterials } from '../../engine/materials';
import { MACHI_REFLECT_LAYER } from '../../engine/fx/reflection';
import { createCanvas, createMachiMeasure, type MachiFont } from '../../engine/signRaster';
import type { MachiSceneContent } from '../types';
import type { TramlineFace } from './building';
import type { TramlineVariation } from './tramlineSeed';
import {
    paintArtistPlate,
    paintCafeFascia,
    paintCafeMenu,
    paintCornerNeon,
    paintGlassDecal,
    paintKioskPoster,
    paintStopPlate,
    paintStreetPlate,
    paintTramAd,
    paintTramDestination,
} from './tramlineSignPaint';

// src/components/visualizer/machi/scenes/tramline/tramlineSigns.ts
// 招牌与歌词系统：转角歌词灯箱（engine/lyricScreen.ts，当前行逐字点亮、闪拍）、站台电子信息牌
// （engine/ledStrip.ts：滚下一句 / 曲名歌手）、茶餐厅门头店招写曲名、电车腰板广告写歌手（跟着车走）、
// 转角竖霓虹「茶餐廳」、报刊亭两幅海报（主题图标 + 歌手）、街名板与站牌（静态装饰）、菜单牌与玻璃贴纸。
// 所有画面从主题取色取字体，换歌 / 换主题重画；亮度跟着 beat 的三组霓虹走：茶餐厅暖光、旧红商业霓虹、
// 冷色交通灯。

export interface TramlineSignPlacements {
    board: TramlineFace;
    fascia: TramlineFace;
    neon: TramlineFace[];
    menus: TramlineFace[];
    decals: TramlineFace[];
    ticker: TramlineFace;
    stopPlate: TramlineFace;
    artistPlate: TramlineFace;
    posters: TramlineFace[];
    streetPlate: TramlineFace;
    sticker: TramlineFace;
}

export interface TramlineSignFrame {
    songTime: number;
    ambientTime: number;
    delta: number;
    staticMode: boolean;
    chorus: number;
    audio: number;
    flicker: number;
    artificial: number;
    beat: MachiBeatFrame;
}

interface StaticSign {
    canvas: HTMLCanvasElement;
    texture: THREE.CanvasTexture;
    material: THREE.MeshBasicMaterial;
    level: number;
}

const canvasTexture = (canvas: HTMLCanvasElement, anisotropy = 4) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
};

const placedPlane = (material: THREE.Material, face: TramlineFace, name: string) => {
    const result = new THREE.Mesh(new THREE.PlaneGeometry(face.width, face.height), material);
    result.name = name;
    result.position.copy(face.position);
    result.rotation.y = face.rotationY;
    return result;
};

export class TramlineSigns {
    readonly group = new THREE.Group();
    private readonly screen: MachiLyricScreen;
    private readonly ticker: MachiLedStrip;
    private readonly statics: StaticSign[] = [];
    private readonly fascia: StaticSign;
    private readonly tramAd: StaticSign;
    private readonly neonFaces: StaticSign;
    private readonly posters: StaticSign[] = [];
    private readonly artistPlate: StaticSign;
    private readonly menus: StaticSign[] = [];
    private readonly tramDest: StaticSign;
    private readonly geometries: THREE.BufferGeometry[] = [];
    private content: MachiSceneContent | null = null;
    private boardTarget: MachiBoardTarget | null = null;
    private lines: readonly Line[] = [];

    constructor(
        materials: MachiMaterials,
        private readonly blend: MachiColorBlend,
        placements: TramlineSignPlacements,
        private readonly variation: TramlineVariation,
        adAnchor: THREE.Object3D,
        destAnchor: THREE.Object3D,
    ) {
        this.group.name = 'Signs';
        this.screen = new MachiLyricScreen(materials, blend, placements.board.width, placements.board.height);
        const face = this.screen.createFace(placements.board.position, placements.board.rotationY, 'Board/screen');
        face.layers.enable(MACHI_REFLECT_LAYER);
        this.group.add(face);
        this.ticker = new MachiLedStrip(materials, blend, placements.ticker.width, placements.ticker.height, 10);
        this.group.add(this.ticker.createFace(placements.ticker.position, placements.ticker.rotationY, 'Stop/ticker'));

        const staticSign = (width: number, height: number, level: number): StaticSign => {
            const canvas = createCanvas(width, height);
            const texture = canvasTexture(canvas);
            const material = materials.track(new THREE.MeshBasicMaterial({ map: texture }));
            material.color.setScalar(level);
            const sign = { canvas, texture, material, level };
            this.statics.push(sign);
            return sign;
        };
        const planeFor = (sign: StaticSign, faceDef: TramlineFace, name: string) => {
            const plane = placedPlane(sign.material, faceDef, name);
            this.geometries.push(plane.geometry);
            return plane;
        };

        this.fascia = staticSign(1792, 128, 0.92);
        const fasciaPlane = planeFor(this.fascia, placements.fascia, 'Fascia/sign');
        fasciaPlane.layers.enable(MACHI_REFLECT_LAYER);
        this.group.add(fasciaPlane);

        // 跟着车走的招牌也要吃底座裁切：车开出底座时牌子不能悬空漂着。
        const clipping = createBaseClippingPlanes(MACHI_BASE.half);
        this.tramAd = staticSign(1024, 185, 0.88);
        clipToBase(this.tramAd.material, clipping);
        adAnchor.add(planeFor(this.tramAd, { position: new THREE.Vector3(), rotationY: 0, width: 2.55, height: 0.46 }, 'Tram/ad'));
        this.tramDest = staticSign(256, 96, 0.9);
        clipToBase(this.tramDest.material, clipping);
        destAnchor.add(planeFor(this.tramDest, { position: new THREE.Vector3(), rotationY: 0, width: 0.6, height: 0.22 }, 'Tram/dest'));

        this.neonFaces = staticSign(128, 512, 1.1);
        placements.neon.forEach((faceDef, index) => {
            const plane = planeFor(this.neonFaces, faceDef, `Neon/face${index}`);
            plane.layers.enable(MACHI_REFLECT_LAYER);
            this.group.add(plane);
        });
        placements.posters.forEach((faceDef, index) => {
            const poster = staticSign(384, Math.round(384 * faceDef.height / faceDef.width), 0.78);
            this.posters.push(poster);
            this.group.add(planeFor(poster, faceDef, `Kiosk/poster${index}`));
        });
        this.artistPlate = staticSign(384, 117, 0.85);
        this.group.add(planeFor(this.artistPlate, placements.artistPlate, 'Stop/artist'));
        const stopPlate = staticSign(384, 140, 0.8);
        this.group.add(planeFor(stopPlate, placements.stopPlate, 'Stop/plate'));
        const streetPlate = staticSign(512, 148, 0.8);
        this.group.add(planeFor(streetPlate, placements.streetPlate, 'Street/plate'));
        placements.menus.forEach((faceDef, index) => {
            const menu = staticSign(384, 236, 0.72);
            this.menus.push(menu);
            this.group.add(planeFor(menu, faceDef, `Cafe/menu${index}`));
        });
        placements.decals.forEach((faceDef, index) => {
            const decal = staticSign(128, 128, 0.7);
            decal.material.transparent = true;
            this.group.add(planeFor(decal, faceDef, `Cafe/decal${index}`));
            this.menus.push(decal); // 同一批更新亮度（室内件）。
        });
        const sticker = staticSign(128, 128, 0.7);
        sticker.material.transparent = true;
        this.group.add(planeFor(sticker, placements.sticker, 'Stop/sticker'));
        this.menus.push(sticker);
        this.stopPlate = stopPlate;
        this.streetPlate = streetPlate;
        this.stickerSign = sticker;
    }

    private readonly stopPlate: StaticSign;
    private readonly streetPlate: StaticSign;
    private readonly stickerSign: StaticSign;

    private get font(): MachiFont {
        return this.content!.font;
    }

    /** 换歌 / 换主题：重画所有招牌。 */
    setContent(content: MachiSceneContent) {
        this.content = content;
        const { palette, font, song, fallbacks } = content;
        const art = palette.art;
        const icon = (index: number) => content.icons.length ? content.icons[index % content.icons.length] : undefined;
        const title = song.title || song.album || 'MACHI';
        const artist = song.artist || song.album || '';
        paintCafeFascia(this.fascia.canvas, {
            font,
            title,
            artist,
            icon: icon(0),
            fallbacks,
            base: art['cafeSignBase'] ?? '#f2ead2',
            text: art['cafeSignText'] ?? '#2f3f3a',
            accent: art['cafeSignAccent'] ?? '#8f2f33',
            style: this.variation.cafeSignStyle,
        });
        paintTramAd(this.tramAd.canvas, {
            font,
            artist,
            title,
            icon: icon(1),
            fallbacks,
            base: art['tramAdBase'] ?? '#20302c',
            text: art['tramAdText'] ?? '#f2ead2',
            accent: art['tramAdAccent'] ?? '#d8a24a',
            style: this.variation.tramAdStyle,
        });
        paintCornerNeon(this.neonFaces.canvas, font, art['neonRed'] ?? '#e46d78');
        const posterSchemes = [
            { base: art['posterBaseA'] ?? '#e8e0c8', panel: art['posterPanelA'] ?? '#2f5c40', text: art['posterTextA'] ?? '#2f3f3a', accent: art['posterAccentA'] ?? '#b8322e' },
            { base: art['posterBaseB'] ?? '#26332f', panel: art['posterPanelB'] ?? '#d8a24a', text: art['posterTextB'] ?? '#e8e0c8', accent: art['posterAccentB'] ?? '#6dcebf' },
        ];
        this.posters.forEach((poster, index) => {
            paintKioskPoster(poster.canvas, {
                font,
                text: index === 0 ? artist || title : title,
                sub: index === 0 ? title : artist,
                icon: icon(index + 1),
                fallbacks,
                scheme: posterSchemes[(index + this.variation.posterLayout) % posterSchemes.length]!,
            });
        });
        paintArtistPlate(this.artistPlate.canvas, font, artist || 'MACHI', art['signPlateText'] ?? '#e8e0c8', art['tramBody'] ?? '#2f5c40');
        paintStopPlate(this.stopPlate.canvas, font);
        paintStreetPlate(this.streetPlate.canvas, font);
        const menuRows = [['招牌', '絲襪奶茶 · 菠蘿油'], ['常餐', '沙嗲牛麵 · 煎蛋'], ['特飲', '咸檸七 · 好立克']];
        this.menus.forEach((menu, index) => {
            if (menu === this.stickerSign) return;
            if (index < 2) {
                const rows = menuRows[(index + this.variation.cafeSignStyle) % menuRows.length]!;
                paintCafeMenu(menu.canvas, font, rows[0]!, [rows[1]!], '#e8dcc0', '#d8a24a');
            } else {
                paintGlassDecal(menu.canvas, icon(index), fallbacks, art['tramBody'] ?? '#2f5c40');
            }
        });
        paintGlassDecal(this.stickerSign.canvas, icon(2), fallbacks, art['neonMint'] ?? '#6dcebf');
        paintTramDestination(this.tramDest.canvas, font, art['tramBody'] ?? '#24473c', '#f4f0e2');
        this.statics.forEach(sign => { sign.texture.needsUpdate = true; });
        this.screen.setContent({
            palette,
            font,
            measure: createMachiMeasure(font),
            matchers: prepareWordColorMatchers(content.theme.wordColors),
            cardTitle: `♪ ${title}`,
            cardSubtitle: artist,
        });
        this.ticker.invalidate();
    }

    showBoard(target: MachiBoardTarget, lines: readonly Line[], immediate: boolean, showText = true) {
        this.lines = lines;
        this.boardTarget = target;
        this.ticker.invalidate();
        this.screen.show(target, lines, immediate, showText);
    }

    preheat(target: MachiBoardTarget, lines: readonly Line[], showText: boolean) {
        this.screen.preheat(target, lines, showText);
    }

    update(frame: TramlineSignFrame) {
        const content = this.content;
        if (!content) return;
        this.screen.update(frame);
        const chorus = this.screen.chorus;
        if (!this.ticker.hasText && this.boardTarget) {
            this.ticker.setText(resolveMachiTickerText(this.boardTarget, this.lines, content.song, 'MACHI'), content.font);
        }
        this.ticker.update({ delta: frame.delta, staticMode: frame.staticMode, speed: 0.75 + 0.35 * chorus, audio: frame.audio });
        // 三组霓虹：门头与菜单走茶餐厅暖光（组 0），竖霓虹与报刊亭海报走旧红商业（组 1），
        // 站牌与车头目的地走冷色交通（组 2）。静态牌子不吃 beat。
        const { beat, artificial, flicker } = frame;
        this.fascia.material.color.setScalar(this.fascia.level * (0.45 + 0.55 * artificial) * machiNeonGroup(beat, 0));
        this.menus.forEach(menu => menu.material.color.setScalar(menu.level * (0.5 + 0.5 * artificial) * machiNeonGroup(beat, 0)));
        this.neonFaces.material.color.setScalar(this.neonFaces.level * artificial * (0.85 + 0.15 * flicker) * machiNeonGroup(beat, 1));
        this.posters.forEach(poster => poster.material.color.setScalar(poster.level * (0.55 + 0.45 * artificial) * machiLightboxGroup(beat, 1)));
        this.tramAd.material.color.setScalar(this.tramAd.level * (0.5 + 0.5 * artificial) * machiLightboxGroup(beat, 1));
        this.tramDest.material.color.setScalar(this.tramDest.level * artificial * machiNeonGroup(beat, 2));
        this.artistPlate.material.color.setScalar(this.artistPlate.level * artificial * machiNeonGroup(beat, 2));
        this.stopPlate.material.color.setScalar(this.stopPlate.level * (0.6 + 0.4 * artificial));
        this.streetPlate.material.color.setScalar(this.streetPlate.level * (0.6 + 0.4 * artificial));
    }

    get busy() {
        return this.screen.busy;
    }

    dispose() {
        this.screen.dispose();
        this.ticker.dispose();
        this.statics.forEach(sign => sign.texture.dispose());
        this.geometries.forEach(geometry => geometry.dispose());
    }
}
