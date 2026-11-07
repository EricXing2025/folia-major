// test/manual/machiScreenshot.mjs — 手动验收工具：在 dev-probe 里挂 machi 场景，按参数表截图。
// 用法：先起 dev 服务器，再 node test/manual/machiScreenshot.mjs [port] [outdir]
// 可用 MACHI_SCENE / MACHI_SEED / MACHI_SHOTS(JSON) 覆盖场景、种子与截图清单。
import { chromium } from 'playwright';
import fs from 'node:fs';

const PORT = process.argv[2] ?? '3000';
const OUT = process.argv[3] ?? '/tmp/machi-tramline';
fs.mkdirSync(OUT, { recursive: true });

const BASE = `http://127.0.0.1:${PORT}/dev-probe.html`;
const SHOTS = JSON.parse(process.env.MACHI_SHOTS ?? 'null') ?? [
    { name: 'night-rain', tuning: { timeOfDay: 'night', weather: 'rain' }, ambient: 9 },
    { name: 'day-clear', tuning: { timeOfDay: 'day', weather: 'clear' }, ambient: 9 },
    { name: 'dusk-rain', tuning: { timeOfDay: 'dusk', weather: 'rain' }, ambient: 9 },
    { name: 'night-fog', tuning: { timeOfDay: 'night', weather: 'fog' }, ambient: 9 },
    { name: 'night-snow', tuning: { timeOfDay: 'night', weather: 'snow' }, ambient: 9 },
    { name: 'detail-tram', tuning: { timeOfDay: 'night', weather: 'rain' }, ambient: 9, view: { az: 38, el: 16, zoom: 2.1 } },
];
const SCENE = process.env.MACHI_SCENE ?? 'tramline';
const SEED = process.env.MACHI_SEED ?? 'probe-0';

const browser = await chromium.launch();
const [VW, VH] = (process.env.MACHI_VIEWPORT ?? '1600x900').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
page.on('console', message => {
    if (message.type() === 'error') console.log(`[console.error] ${message.text().slice(0, 300)}`);
});
page.on('pageerror', error => console.log(`[pageerror] ${error.message.slice(0, 300)}`));

const tuning = JSON.stringify({
    scene: SCENE,
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
await page.goto(`${BASE}?probe=visualizerMemory&vis=machi&freeze=1&cjk=1&meta=1&lines=30&tuning=${encodeURIComponent(tuning)}`);
await page.waitForFunction(() => window.__machiDebug, null, { timeout: 60000 });
await page.waitForTimeout(3500); // 字体与招牌首绘。

for (const shot of SHOTS) {
    if (shot.w && shot.h) await page.setViewportSize({ width: shot.w, height: shot.h });
    await page.evaluate(({ tuning, ambient, view }) => {
        const d = window.__machiDebug;
        d.setTuning(tuning);
        if (view) d.setView(view.az, view.el, view.zoom); else d.resetView();
        d.renderAt(37.5, ambient);
    }, { tuning: shot.tuning, ambient: shot.ambient, view: shot.view ?? null });
    await page.waitForTimeout(350);
    await page.evaluate(({ ambient }) => window.__machiDebug.renderAt(37.5, ambient), { ambient: shot.ambient });
    await page.waitForTimeout(150);
    const stats = await page.evaluate(() => window.__machiDebug.stats());
    await page.screenshot({ path: `${OUT}/${shot.name}.png` });
    console.log(`${shot.name}.png`, JSON.stringify(stats));
}

await browser.close();
console.log(`done → ${OUT}`);
