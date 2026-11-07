import type { MachiSceneId } from '../types';
import { CHANGAN_SCENE } from './changan/changanScene';
import { KONBINI_SCENE } from './konbini/konbiniScene';
import { KOWLOON_SCENE } from './kowloon/kowloonScene';
import { RECORDSTORE_SCENE } from './recordstore/recordstoreScene';
import { STATION_SCENE } from './station/stationScene';
import { TRAMLINE_SCENE } from './tramline/tramlineScene';
import { ZHUYING_SCENE } from './zhuying/zhuyingScene';
import type { MachiSceneDefinition } from './types';

// src/components/visualizer/machi/scenes/index.ts
// 町景的场景表：场景 id → 场景定义。场景都跟运行时在同一个按需加载的块里。

export const MACHI_SCENES: Record<MachiSceneId, MachiSceneDefinition> = {
    konbini: KONBINI_SCENE,
    station: STATION_SCENE,
    kowloon: KOWLOON_SCENE,
    recordstore: RECORDSTORE_SCENE,
    changan: CHANGAN_SCENE,
    zhuying: ZHUYING_SCENE,
    tramline: TRAMLINE_SCENE,
};
