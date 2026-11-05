"use strict";

// build/beforePack.cjs
// Stages native runtimes for electron-builder's target platform and architecture.

const ARCH_NAMES = ["ia32", "x64", "armv7l", "arm64", "universal"];

exports.default = async (context) => {
  const arch = ARCH_NAMES[context.arch];
  if (!arch)
    throw new Error(
      `Unsupported electron-builder architecture ordinal: ${context.arch}`,
    );
  const { prepareBundledFfmpeg } = await import(
    "../packaging/ffmpeg/fetch-ffmpeg.mjs"
  );
  await prepareBundledFfmpeg({ platform: context.electronPlatformName, arch });
  // The analysis models' runtime (electron/analysis/mnn.cjs), built from the pinned MNN source.
  const { prepareBundledMnn } = await import("./buildMnnRuntime.mjs");
  await prepareBundledMnn({ platform: context.electronPlatformName, arch });
  // The two models (Beat This! final0, htdemucs), verified against shared/modelManifest.json; one
  // file each for every platform.
  const { prepareBundledModels } = await import("./fetchModels.mjs");
  await prepareBundledModels({ outputDir: require("path").join(context.packager.projectDir, "models") });
  if (context.electronPlatformName === 'darwin') {
    const { prepareMacCompanion } = require('../electron/appleMusic/macos/prepareBundle.cjs');
    try {
      prepareMacCompanion({ arch, projectRoot: context.packager.projectDir });
    } catch (error) {
      // Fork-local leniency (env-gated): a broken local Swift toolchain must not block
      // packaging for users who do not use Apple Music. Default stays strict.
      if (process.env.FOLIA_LENIENT_COMPANION !== '1') throw error;
      console.warn('[beforePack] WARNING: Apple Music companion build failed; continuing without it (FOLIA_LENIENT_COMPANION=1).', error);
    }
    const { prepareBundledKoffi } = await import('../packaging/macos/prepare-koffi.mjs');
    await prepareBundledKoffi({ arch, projectRoot: context.packager.projectDir });
    // The wallpaper's Stage Manager click guard (issue #698), a small native helper.
    const { prepareDesktopClickGuard } = await import('../packaging/macos/build-desktop-click-guard.mjs');
    try {
      await prepareDesktopClickGuard({ arch, projectRoot: context.packager.projectDir });
    } catch (error) {
      // Same env-gated leniency as the Apple Music companion: the click guard is a
      // wallpaper-only helper; a broken local Swift toolchain must not block packaging.
      if (process.env.FOLIA_LENIENT_COMPANION !== '1') throw error;
      console.warn('[beforePack] WARNING: desktop click guard build failed; continuing without it (FOLIA_LENIENT_COMPANION=1).', error);
    }
  }
};
