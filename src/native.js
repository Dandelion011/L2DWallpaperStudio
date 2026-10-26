import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';
import { applyModelTransform, brightnessFilter, drawBackground, fsrEasuFilter, fsrRcasFilter, getRenderResolution, migrateBackgroundSettings, patchCoreRenderOrderCompatibility, setModelGlowEnabled, sharpenFilter } from './live2d-scene.js';

window.PIXI = PIXI;
window.Live2DCubismCore = window.Live2DCubismCore || undefined;

const params = new URLSearchParams(window.location.search);
const settings = migrateBackgroundSettings(JSON.parse(params.get('config') || '{}'));
const app = new PIXI.Application({ backgroundAlpha: 0, antialias: true, resizeTo: document.body, resolution: getRenderResolution(settings.minimumRenderResolution) });
document.body.appendChild(app.view);

let model;
let definitions = {};
let currentMotion = 'Idle';
let busy = false;
let desktopActive = true;
let motionFallbackTimer;
const DEFAULT_CLICK_ACTIONS = { Ok: 80, R_Good: 6.67, R_Bad: 6.67, R_Verygood: 6.66 };

function syncRendererSize() {
  const width = Math.max(1, document.documentElement.clientWidth);
  const height = Math.max(1, document.documentElement.clientHeight);
  const resolution = getRenderResolution(settings.minimumRenderResolution);
  if (app.renderer.resolution !== resolution) app.renderer.resolution = resolution;
  if (app.renderer.screen.width !== width || app.renderer.screen.height !== height) app.renderer.resize(width, height);
  applySettings();
  updateInteractionRegion();
}

function scheduleMotionEnd(name) {
  if (motionFallbackTimer) clearTimeout(motionFallbackTimer);
  const defaultDuration = 12000;
  motionFallbackTimer = setTimeout(() => { if (busy && currentMotion === name) playIdle(); }, defaultDuration);
  const definition = definitions[name]?.[0];
  const file = definition?.File;
  if (!file) return;
  const slash = settings.modelPath.lastIndexOf('/');
  const base = slash >= 0 ? settings.modelPath.slice(0, slash + 1) : '';
  fetch(`/models/${base}${file}`).then((response) => response.ok ? response.json() : null).then((motion) => {
    const duration = Number(motion?.Meta?.Duration);
    if (!Number.isFinite(duration) || duration <= 0 || currentMotion !== name || !busy) return;
    clearTimeout(motionFallbackTimer);
    motionFallbackTimer = setTimeout(() => { if (busy && currentMotion === name) playIdle(); }, Math.ceil(duration * 1000 / Math.max(0.1, settings.motionSpeed)) + 150);
  }).catch(() => {});
}

function playIdle() {
  if (motionFallbackTimer) clearTimeout(motionFallbackTimer);
  if (definitions.Idle) {
    currentMotion = 'Idle';
    busy = false;
    model.motion('Idle', 0, 2);
  }
}

function playAction(name) {
  if (!model || busy || !definitions[name]) return false;
  busy = true;
  currentMotion = name;
  Promise.resolve(model.motion(name, 0, 2)).then((started) => {
    if (!started && currentMotion === name) playIdle();
  });
  scheduleMotionEnd(name);
  return true;
}

function playEntry() {
  if (!definitions.In) return playIdle();
  busy = true;
  currentMotion = 'In';
  Promise.resolve(model.motion('In', 0, 2)).then((started) => {
    if (!started && currentMotion === 'In') playIdle();
  });
  scheduleMotionEnd('In');
}

function handleClick() {
  // The input window is parented to the desktop icon layer, so it can only
  // receive clicks while the desktop is exposed. Do not gate the action on
  // the foreground-window watcher, which can briefly lag during transitions.
  if (busy) return;
  const available = ['Ok', 'R_Good', 'R_Bad', 'R_Verygood'].filter((name) => definitions[name]);
  if (!available.length) return;
  const configured = { ...DEFAULT_CLICK_ACTIONS, ...(settings.clickActions || {}) };
  const total = available.reduce((sum, name) => sum + Math.max(0, Number(configured[name]) || 0), 0);
  const weights = total > 0 ? configured : Object.fromEntries(available.map((name) => [name, 1]));
  const weightTotal = total > 0 ? total : available.length;
  let cursor = Math.random() * weightTotal;
  for (const name of available) {
    cursor -= Math.max(0, Number(weights[name]) || 0);
    if (cursor < 0) {
      playAction(name);
      return;
    }
  }
  playAction(available[available.length - 1]);
}

function applySettings() {
  if (!model) return;
  applyModelTransform(model, settings, app.renderer.screen.width, app.renderer.screen.height);
  model.cullable = false;
  model.filterArea = new PIXI.Rectangle(0, 0, app.renderer.screen.width, app.renderer.screen.height);
  model.__fsrOutput.cullable = false;
  model.__fsrOutput.filterArea = new PIXI.Rectangle(0, 0, app.renderer.screen.width, app.renderer.screen.height);
  setModelGlowEnabled(model, settings.glowEnabled);
  const modelFilter = brightnessFilter(PIXI, settings.brightness);
  modelFilter.resolution = settings.fsrEnabled ? settings.fsrScale : 1;
  model.filters = [modelFilter];
  model.__fsrOutput.filters = [...(settings.fsrEnabled ? [fsrEasuFilter(PIXI), fsrRcasFilter(PIXI, settings.fsrSharpness)] : []), ...(settings.sharpen > 0 ? [sharpenFilter(PIXI, settings.sharpen)] : [])];
  drawBackground(PIXI, model.__backdrop, settings, app.renderer.screen.width, app.renderer.screen.height);
}

async function start() {
  const response = await fetch(`/models/${settings.modelPath}`);
  if (!response.ok) throw new Error(`模型文件加载失败 (${response.status})`);
  model = await Live2DModel.from(`/models/${settings.modelPath}`, { autoInteract: true });
  patchCoreRenderOrderCompatibility(model);
  model.anchor.set(0.5, 1);
  model.interactive = true;
  model.cursor = 'default';
  const backdrop = new PIXI.Container();
  const fsrOutput = new PIXI.Container();
  fsrOutput.addChild(model);
  model.__backdrop = backdrop;
  model.__fsrOutput = fsrOutput;
  model.__baseWidth = model.width;
  model.__baseHeight = model.height;
  app.stage.addChild(backdrop, fsrOutput);
  definitions = model.internalModel.motionManager.definitions;
  model.internalModel.motionManager.on('motionFinish', () => {
    if (currentMotion !== 'Idle') playIdle();
  });
  app.ticker.speed = settings.motionSpeed;
  PIXI.Ticker.shared.speed = settings.motionSpeed;
  syncRendererSize();
  playEntry();
}

function updateInteractionRegion() {
  if (!model) return;
  const bounds = model.getBounds();
  const width = app.renderer.screen.width;
  const height = app.renderer.screen.height;
  const x = Math.max(0, Math.min(bounds.x, width));
  const y = Math.max(0, Math.min(bounds.y, height));
  const right = Math.max(x, Math.min(bounds.right, width));
  const bottom = Math.max(y, Math.min(bounds.bottom, height));
  if (right > x && bottom > y) window.nativeWallpaperAPI?.setInteractionRegion({ x, y, width: right - x, height: bottom - y });
}

window.addEventListener('resize', syncRendererSize);
new ResizeObserver(syncRendererSize).observe(document.documentElement);
window.nativeWallpaperAPI?.onRenderSync(syncRendererSize);
window.nativeWallpaperAPI?.onDesktopEnter(() => {
  desktopActive = true;
  if (!busy) playEntry();
});
window.nativeWallpaperAPI?.onDesktopLeave(() => { desktopActive = false; });
window.nativeWallpaperAPI?.onModelClick(handleClick);
window.nativeWallpaperAPI?.onPointerPosition(({ x, y }) => model?.focus(x, y));
window.nativeWallpaperAPI?.onInteractionError((message) => console.error('Native interaction window failed', message));

start().catch((error) => console.error('Native wallpaper failed to start', error));
