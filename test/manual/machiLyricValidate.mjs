// V1.1 歌词联动验证（探针驱动，长歌 80 行中英混排，真实 MachiLyricScreen 管线）。
// 每个镜头用 start=<行起点> 锁定 currentLineIndex，再 renderAt 到行中某个时刻取逐字态。
import { chromium } from 'playwright';
import fs from 'node:fs';

const PORT = process.argv[2] ?? '3001';
const OUT = process.argv[3] ?? '/tmp/machi-v11-lyric';
fs.mkdirSync(OUT, { recursive: true });
const BASE = `http://127.0.0.1:${PORT}/dev-probe.html`;

const tuning = JSON.stringify({
    scene: 'tramline',
    timeOfDay: 'night',
    weather: 'rain',
    camera: 'default',
    motion: false,
    dof: 1,
    aperture: 8,
    dofRange: 1,
    tiltShift: 0.3,
    focus: 'center',
    focusOffset: 0,
    motionSpeed: 1,
    quality: { renderScale: 1, antialias: 'smaa', shadows: 'high', reflections: 'high', glow: true, adaptive: false, revision: 2 },
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 200)}`));

const load = async start => {
    await page.goto(`${BASE}?probe=visualizerMemory&vis=machi&long=1&meta=1&speed=0&start=${start}&tuning=${encodeURIComponent(tuning)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__machiDebug, null, { timeout: 60000 });
    await page.waitForTimeout(3000);
};

const shot = async (name, songT, ambient, view) => {
    await page.evaluate(({ songT, ambient, view }) => {
        const d = window.__machiDebug;
        if (view) d.setView(view.az, view.el, view.zoom); else d.resetView();
        d.renderAt(songT, ambient);
    }, { songT, ambient, view: view ?? null });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`${name}.png`, JSON.stringify(await page.evaluate(() => window.__machiDebug.stats())));
};

// 长歌行时刻（probe 生成器）：行0 6–8.4s 迷失在无边际这幽深的森林（副歌标）；行2 12.36–15.48 英文行；
// 行9 39.51–42.45 我听见远方的海潮一遍一遍拍打着沉默的礁石和那座早已熄灭多年的灯塔（30字长行，验折行）。
await load(7);
await shot('lyric-word-early', 7.0, 9);
await shot('lyric-word-late', 7.6, 9);
await shot('lyric-chorus', 6.6, 9);
await load(13.5);
await shot('lyric-english', 13.5, 9);
await shot('lyric-ticker', 13.5, 9, { az: 40, el: 14, zoom: 4.5 });
await load(41);
await shot('lyric-long-cjk', 41.0, 9);
// 暂停/恢复：同一时刻两帧应一致；推进 0.5s 高亮应走。
await shot('lyric-pause-a', 41.0, 12);
await shot('lyric-pause-b', 41.0, 12);
await shot('lyric-resume', 41.5, 12);

console.log('console.errors:', errors.length ? errors : 'none');
await browser.close();
