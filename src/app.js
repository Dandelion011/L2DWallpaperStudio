import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';
import { applyModelTransform, brightnessFilter, DEFAULT_BACKGROUND, drawBackground, fsrEasuFilter, fsrRcasFilter, getRenderResolution, migrateBackgroundSettings, patchCoreRenderOrderCompatibility, setModelGlowEnabled, sharpenFilter } from './live2d-scene.js';
import './styles.css';

window.PIXI = PIXI;
window.Live2DCubismCore = window.Live2DCubismCore || undefined;

const DEFAULT_MODEL_PATH = 'usada_pekora/usada_pekora.model3.json';
const DEFAULT_ACTION_WEIGHTS = { Ok: 80, R_Good: 6.67, R_Bad: 6.67, R_Verygood: 6.66 };
const DEFAULT_SETTINGS = { modelPath: DEFAULT_MODEL_PATH, scale: 1.0, x: 0, y: 0, brightness: 1.0, glowEnabled: false, autoStart: false, sharpen: 0, fsrEnabled: true, fsrPreset: 'custom', fsrScale: 2.12, fsrSharpness: 1, fps: 30, motion: 'Idle', motionSpeed: 1.0, clickActions: { ...DEFAULT_ACTION_WEIGHTS }, aspectPreset: '16:9', aspectWidth: 16, aspectHeight: 9, ...DEFAULT_BACKGROUND };
const FSR_PRESETS = {
  native: { scale: 1, sharpness: 1 },
  quality: { scale: 0.77, sharpness: 0.3 },
  balanced: { scale: 0.67, sharpness: 0.35 },
  performance: { scale: 0.59, sharpness: 0.5 },
  aggressive: { scale: 0.5, sharpness: 0.7 }
};

const root = document.querySelector('#root');
root.innerHTML = `
  <main class="shell">
    <section class="workspace">
      <div class="preview-panel">
        <div class="preview-head"><span id="modelTitle">Live2D / Cubism</span><button id="minimizeTray" class="button ghost tray-button" type="button" title="最小化到系统托盘">最小化到托盘</button></div>
        <span class="output-size">3840 x 2160 输出</span>
        <div id="preview" class="preview"></div>
        <div class="preview-foot"><span id="status">实时模型预览</span><button id="playMotion" class="button ghost">重播动作</button></div>
      </div>
      <aside id="controls" class="controls panel-float">
        <div class="panel-head"><div class="section-title">壁纸设置</div><button id="toggleControls" class="panel-toggle" type="button" aria-expanded="true" aria-controls="controlsBody" title="折叠设置">−</button></div>
        <div id="controlsBody" class="panel-body">
        <label>缩放 <output id="scaleValue">1.00</output><input id="scale" type="range" min="0.55" max="1.55" step="0.01" value="1" /></label>
        <label>水平位置 <output id="xValue">0%</output><input id="x" type="range" min="-0.5" max="0.5" step="0.01" value="0" /></label>
        <label>垂直位置 <output id="yValue">0%</output><input id="y" type="range" min="-0.5" max="0.5" step="0.01" value="0" /></label>
        <label>亮度 <output id="brightnessValue">1.00</output><input id="brightness" type="range" min="0.5" max="1.5" step="0.01" value="1" /></label>
        <label class="checkbox-label"><input id="glowEnabled" type="checkbox" />模型光晕</label>
        <label class="checkbox-label"><input id="autoStart" type="checkbox" />开机自启动</label>
        <label>锐化 <output id="sharpenValue">0.00</output><input id="sharpen" type="range" min="0" max="1" step="0.05" value="0" /></label>
        <div class="background-setting"><div class="control-caption">背景</div><div id="backgroundOptions" class="background-grid">
          <button class="background-swatch" data-background="black" aria-label="黑色"><span class="swatch black"></span><span>黑色</span></button>
          <button class="background-swatch" data-background="white" aria-label="白色"><span class="swatch white"></span><span>白色</span></button>
          <button class="background-swatch" data-background="gradient" aria-label="自定义渐变"><span class="swatch gradient" id="gradientSwatch"></span><span>自定义渐变</span></button>
          <label class="background-swatch image-background" data-background="image"><span class="swatch image" id="imageSwatch"></span><span>自定义图片</span><input id="backgroundImage" type="file" accept="image/*" aria-label="上传背景图片" /></label>
          <button class="background-swatch" data-background="transparent" aria-label="透明"><span class="swatch transparent"></span><span>透明</span></button>
        </div>
        <div id="gradientControls" class="gradient-controls">
          <label>起始色<input id="gradientStart" type="color" value="#303030" /></label>
          <label>结束色<input id="gradientEnd" type="color" value="#4a4a4a" /></label>
          <label>角度 <output id="gradientAngleValue">180°</output><input id="gradientAngle" type="range" min="0" max="360" step="1" value="180" /></label>
        </div></div>
        <label>模型<select id="model"></select></label>
        <label>模型动作<select id="motion"></select></label>
        <label>动作速度 <output id="motionSpeedValue">1.00x</output><input id="motionSpeed" type="range" min="0.25" max="2" step="0.05" value="1" /></label>
        <label>导出帧率 <output id="fpsValue">30 FPS</output><select id="fps"><option value="24">24 FPS</option><option value="30" selected>30 FPS</option><option value="60">60 FPS</option><option value="120">120 FPS</option><option value="144">144 FPS</option><option value="160">160 FPS</option><option value="180">180 FPS</option><option value="200">200 FPS</option></select></label>
        <details class="aspect-settings"><summary>画面比例</summary><div class="aspect-body"><label>比例<select id="aspectPreset"><option value="16:9">16:9（默认）</option><option value="custom">自定义比例</option></select></label><div id="customAspect" class="custom-aspect"><label>宽<input id="aspectWidth" type="number" min="1" max="100" step="1" value="16" /></label><span>:</span><label>高<input id="aspectHeight" type="number" min="1" max="100" step="1" value="9" /></label></div><p class="hint">窗口和画面会按此比例整体缩放。</p></div></details>
        <div class="divider"></div>
        <div class="mode-actions"><button id="startNative" class="button native">原生运行</button><button id="export" class="button compact">生成 4K 视频</button></div>
        <button id="stopNative" class="button ghost hidden">停止原生运行</button>
        <div id="progress" class="progress hidden"><div id="progressBar"></div><span id="progressLabel">准备中</span></div>
        <p class="hint">保存后生成的视频会由独立管理器播放，不依赖 Wallpaper Engine。</p>
        </div>
      </aside>
    </section>
    <aside id="fsrPanel" class="fsr-panel panel-float collapsed">
      <div class="panel-head"><div class="section-title">AMD FSR 1 设置</div><button id="toggleFsr" class="panel-toggle" type="button" aria-expanded="false" aria-controls="fsrBody" title="展开 FSR 设置">+</button></div>
      <div id="fsrBody" class="panel-body">
        <label class="checkbox-label"><input id="fsrEnabled" type="checkbox" />启用实时超分测试</label>
        <label>FSR 档位<select id="fsrPreset"><option value="native">原生 100%</option><option value="quality">质量 77%</option><option value="balanced">均衡 67%</option><option value="performance">性能 59%</option><option value="aggressive">激进 50%</option><option value="custom">自定义</option></select></label>
        <label>实时采样密度 <output id="fsrScaleValue">212%</output><input id="fsrScale" type="range" min="0.5" max="5" step="0.01" value="2.12" /><small id="fsrScaleLimit" class="hint">正在读取模型贴图尺寸</small></label>
        <label>重建锐度 <output id="fsrSharpnessValue">1.00</output><input id="fsrSharpness" type="range" min="0" max="5" step="0.05" value="1" /></label>
        <p class="hint">采样上限按当前模型贴图与屏幕占用估算；超过贴图原始信息量不会增加真实细节。该设置仅影响预览和原生运行，4K 导出保持原生分辨率。</p>
      </div>
    </aside>
    <aside id="actionPanel" class="action-panel panel-float collapsed">
      <div class="panel-head"><div class="section-title">点击反馈动作</div><button id="toggleActions" class="panel-toggle" type="button" aria-expanded="false" aria-controls="actionBody" title="展开点击动作设置">+</button></div>
      <div id="actionBody" class="panel-body">
        <label>确认 <output id="actionOkValue">80.0%</output><input id="actionOk" type="range" min="0" max="100" step="0.1" value="80" /></label>
        <label>评价：良好 <output id="actionGoodValue">6.7%</output><input id="actionGood" type="range" min="0" max="100" step="0.1" value="6.67" /></label>
        <label>评价：不佳 <output id="actionBadValue">6.7%</output><input id="actionBad" type="range" min="0" max="100" step="0.1" value="6.67" /></label>
        <label>评价：非常好 <output id="actionVerygoodValue">6.7%</output><input id="actionVerygood" type="range" min="0" max="100" step="0.1" value="6.66" /></label>
        <p class="hint">四个动作独立调节；总和超过 100% 时按比例归一化。模型缺少的动作会自动跳过。</p>
      </div>
    </aside>
    <section id="player" class="player panel-float hidden">
      <div class="panel-head"><span>已保存壁纸</span><div class="panel-head-actions"><button id="togglePlayer" class="panel-toggle" type="button" aria-expanded="true" aria-controls="playerBody" title="折叠播放器">−</button><button id="closePlayer" class="panel-close" type="button" title="关闭播放器">×</button></div></div>
      <div id="playerBody" class="panel-body">
        <video id="wallpaperVideo" controls loop autoplay muted></video>
        <a id="downloadVideo" class="button primary download" download>下载 4K 视频</a>
        <button id="setWallpaper" class="button accent">设为桌面动态壁纸</button>
      </div>
    </section>
  </main>`;

const settings = { ...DEFAULT_SETTINGS };
const previewHost = document.querySelector('#preview');
const app = new PIXI.Application({ backgroundAlpha: 0, antialias: true, resizeTo: previewHost, resolution: getRenderResolution() });
previewHost.appendChild(app.view);
const previewResizeObserver = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  app.renderer.resolution = getRenderResolution();
  if (app.renderer.screen.width !== width || app.renderer.screen.height !== height) app.renderer.resize(width, height);
  applySettings();
});
previewResizeObserver.observe(previewHost);
window.addEventListener('resize', () => {
  app.renderer.resolution = getRenderResolution();
  applySettings();
});
let model;
let models = [];
let batchExportRunning = false;
let samplingLimit = 5;

function setPlaybackSpeed(value) {
  app.ticker.speed = value;
  PIXI.Ticker.shared.speed = value;
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

function updateBackgroundControls() {
  document.querySelectorAll('[data-background]').forEach((button) => button.classList.toggle('selected', button.dataset.background === settings.background));
  document.querySelector('#gradientStart').value = settings.gradientStart;
  document.querySelector('#gradientEnd').value = settings.gradientEnd;
  document.querySelector('#gradientAngle').value = settings.gradientAngle;
  document.querySelector('#gradientAngleValue').textContent = `${settings.gradientAngle}°`;
  document.querySelector('#gradientSwatch').style.background = `linear-gradient(${settings.gradientAngle}deg, ${settings.gradientStart}, ${settings.gradientEnd})`;
  document.querySelector('#imageSwatch').style.backgroundImage = settings.backgroundImage ? `url(${settings.backgroundImage})` : '';
  document.querySelector('#gradientControls').classList.toggle('hidden', settings.background !== 'gradient');
}

function updateFsrControls() {
  document.querySelector('#fsrEnabled').checked = settings.fsrEnabled;
  document.querySelector('#fsrPreset').value = settings.fsrPreset || 'custom';
  document.querySelector('#fsrScale').value = settings.fsrScale;
  document.querySelector('#fsrSharpness').value = settings.fsrSharpness;
  document.querySelector('#fsrScaleValue').textContent = `${Math.round(settings.fsrScale * 100)}%`;
  document.querySelector('#fsrSharpnessValue').textContent = settings.fsrSharpness.toFixed(2);
}

function updateActionControls() {
  const fields = { Ok: 'actionOk', R_Good: 'actionGood', R_Bad: 'actionBad', R_Verygood: 'actionVerygood' };
  for (const [action, id] of Object.entries(fields)) {
    const value = Number(settings.clickActions?.[action] ?? DEFAULT_ACTION_WEIGHTS[action]);
    document.querySelector(`#${id}`).value = value;
    document.querySelector(`#${id}Value`).textContent = `${value.toFixed(1)}%`;
  }
}

function updateSamplingLimit(targetModel) {
  const dimensions = (targetModel.textures || []).flatMap((texture) => [texture.width, texture.height].map(Number).filter(Number.isFinite));
  const textureSize = Math.max(0, ...dimensions);
  const modelSize = Math.max(targetModel.width, targetModel.height, 1) * app.renderer.resolution;
  samplingLimit = Math.max(1, Math.min(5, textureSize > 0 ? textureSize / modelSize : 5));
  const slider = document.querySelector('#fsrScale');
  slider.max = '5';
  slider.value = settings.fsrScale;
  document.querySelector('#fsrScaleValue').textContent = `${Math.round(settings.fsrScale * 100)}%`;
  document.querySelector('#fsrScaleLimit').textContent = `贴图估算有效上限 ${Math.round(samplingLimit * 100)}%（最高 500%）`;
}

async function loadModel(modelEntry, targetApp = app) {
  const modelUrl = `/models/${modelEntry.path}`;
  let instance;
  try {
    instance = await Live2DModel.from(modelUrl, { autoInteract: true });
    patchCoreRenderOrderCompatibility(instance);
  } catch (error) {
    throw new Error(`MOC v${modelEntry.mocVersion}: ${error?.message || 'Core 初始化失败'}`);
  }
  const backdrop = new PIXI.Container();
  const fsrOutput = new PIXI.Container();
  fsrOutput.addChild(instance);
  drawBackground(PIXI, backdrop, settings, targetApp.renderer.screen.width, targetApp.renderer.screen.height);
  targetApp.stage.addChild(backdrop);
  targetApp.stage.addChild(fsrOutput);
  instance.anchor.set(0.5, 1);
  instance.__backdrop = backdrop;
  instance.__fsrOutput = fsrOutput;
  instance.__baseWidth = instance.width;
  instance.__baseHeight = instance.height;
  const definitions = instance.internalModel.motionManager.definitions;
  const motionSelect = document.querySelector('#motion');
  motionSelect.replaceChildren(...Object.keys(definitions).map((group) => {
    const option = document.createElement('option');
    option.value = group;
    option.textContent = ({ In: '入场', Idle: '待机', Ok: '确认', Out: '退场', R_Good: '评价：良好', R_Bad: '评价：不佳', R_Verygood: '评价：非常好' })[group] || group;
    return option;
  }));
  if (!definitions[settings.motion]) settings.motion = definitions.Idle ? 'Idle' : Object.keys(definitions)[0];
  motionSelect.value = settings.motion;
  instance.on('motionFinish', () => {
    if (settings.motion !== 'Idle') instance.motion(settings.motion, 0, 2);
  });
  instance.motion(settings.motion, 0, 2);
  document.querySelector('#modelTitle').textContent = modelEntry.name;
  return instance;
}

async function selectModel(modelEntry) {
  setStatus(`加载模型: ${modelEntry.name}`);
  disposeCurrentModel();
  settings.motion = modelEntry.defaultMotion || 'Idle';
  try {
    model = await loadModel(modelEntry);
    settings.modelPath = modelEntry.path;
    document.querySelector('#motion').value = settings.motion;
    readControls();
    updateSamplingLimit(model);
    updateFsrControls();
    applySettings();
    saveSettings();
    setStatus('实时预览');
  } catch (error) {
    setStatus(`模型加载失败: ${modelEntry.name} (${error.message})`);
    console.error(`Model load failed for ${modelEntry.path}`, error);
  }
}

function disposeCurrentModel() {
  if (!model) return;
  const backdrop = model.__backdrop;
  app.stage.removeChild(model.__fsrOutput || model);
  if (backdrop) app.stage.removeChild(backdrop);
  model.destroy({ children: true, texture: false, baseTexture: false });
  model.__fsrOutput?.destroy({ children: false });
  backdrop?.destroy();
  model = null;
}

function readControls() {
  settings.scale = Number(document.querySelector('#scale').value);
  settings.x = Number(document.querySelector('#x').value);
  settings.y = Number(document.querySelector('#y').value);
  settings.brightness = Number(document.querySelector('#brightness').value);
  settings.glowEnabled = document.querySelector('#glowEnabled').checked;
  settings.sharpen = Number(document.querySelector('#sharpen').value);
  settings.fps = Number(document.querySelector('#fps').value);
  settings.motion = document.querySelector('#motion').value || 'Idle';
  settings.motionSpeed = Number(document.querySelector('#motionSpeed').value);
  settings.clickActions = {
    Ok: Number(document.querySelector('#actionOk').value),
    R_Good: Number(document.querySelector('#actionGood').value),
    R_Bad: Number(document.querySelector('#actionBad').value),
    R_Verygood: Number(document.querySelector('#actionVerygood').value)
  };
  setPlaybackSpeed(settings.motionSpeed);
  document.querySelector('#scaleValue').textContent = settings.scale.toFixed(2);
  document.querySelector('#xValue').textContent = `${Math.round(settings.x * 100)}%`;
  document.querySelector('#yValue').textContent = `${Math.round(settings.y * 100)}%`;
  document.querySelector('#brightnessValue').textContent = settings.brightness.toFixed(2);
  document.querySelector('#sharpenValue').textContent = settings.sharpen.toFixed(2);
  document.querySelector('#fpsValue').textContent = `${settings.fps} FPS`;
  document.querySelector('#motionSpeedValue').textContent = `${settings.motionSpeed.toFixed(2)}x`;
  updateBackgroundControls();
  updateActionControls();
  applySettings();
  saveSettings();
}

function setStatus(label) { document.querySelector('#status').textContent = label; }
function saveSettings() { localStorage.setItem('v7-wallpaper-settings', JSON.stringify(settings)); }

function getAspectDimensions() {
  if (settings.aspectPreset !== 'custom') return { width: 16, height: 9 };
  const width = Number(settings.aspectWidth);
  const height = Number(settings.aspectHeight);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : { width: 16, height: 9 };
}

function updateAspectControls() {
  document.querySelector('#aspectPreset').value = settings.aspectPreset === 'custom' ? 'custom' : '16:9';
  document.querySelector('#aspectWidth').value = settings.aspectWidth;
  document.querySelector('#aspectHeight').value = settings.aspectHeight;
  document.querySelector('#customAspect').classList.toggle('hidden', settings.aspectPreset !== 'custom');
}

async function applyWindowAspectRatio() {
  const { width, height } = getAspectDimensions();
  if (!window.wallpaperAPI?.setWindowAspectRatio) return;
  try {
    await window.wallpaperAPI.setWindowAspectRatio(width, height);
  } catch (error) {
    setStatus(`比例设置失败: ${error.message}`);
  }
}

async function recordWallpaper(targetModel, modelEntry) {
  const progress = document.querySelector('#progress');
  const bar = document.querySelector('#progressBar');
  const label = document.querySelector('#progressLabel');
  progress.classList.remove('hidden');
  setStatus('生成 4K 视频中');
  const originalWidth = app.renderer.screen.width;
  const originalHeight = app.renderer.screen.height;
  const originalResolution = app.renderer.resolution;
  const originalTickerSpeed = app.ticker.speed;
  const originalSharedTickerSpeed = PIXI.Ticker.shared.speed;
  try {
    app.resizeTo = null;
    app.renderer.resolution = 1;
    app.renderer.resize(3840, 2160);
    drawBackground(PIXI, targetModel.__backdrop, settings, 3840, 2160);
    await targetModel.__backdrop.__backgroundReady;
    applyModelTransform(targetModel, settings, 3840, 2160);
    targetModel.cullable = false;
    targetModel.filterArea = new PIXI.Rectangle(0, 0, 3840, 2160);
    targetModel.__fsrOutput.cullable = false;
    targetModel.__fsrOutput.filterArea = new PIXI.Rectangle(0, 0, 3840, 2160);
    setModelGlowEnabled(targetModel, settings.glowEnabled);
    targetModel.filters = [brightnessFilter(PIXI, settings.brightness)];
    targetModel.__fsrOutput.filters = settings.sharpen > 0 ? [sharpenFilter(PIXI, settings.sharpen)] : null;
    app.ticker.maxFPS = settings.fps;
    setPlaybackSpeed(settings.motionSpeed);
    const motion = modelEntry.motionGroups.includes(settings.motion) ? settings.motion : modelEntry.defaultMotion;
    await targetModel.motion(motion, 0, 2);
    const mimeType = 'video/webm;codecs=vp9';
    if (settings.background === 'transparent' && !MediaRecorder.isTypeSupported(mimeType)) throw new Error('当前编码器不支持透明 WebM，请改用原生运行模式');
    const recorder = new MediaRecorder(app.view.captureStream(settings.fps), { mimeType, videoBitsPerSecond: 18_000_000 });
    const chunks = [];
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    const done = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = () => reject(recorder.error || new Error('视频编码失败'));
    });
    recorder.start(500);
    const duration = 8000;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        const ratio = Math.min(1, (now - start) / duration);
        bar.style.width = `${ratio * 100}%`;
        label.textContent = `渲染 ${Math.round(ratio * 100)}%`;
        ratio < 1 ? requestAnimationFrame(tick) : resolve();
      };
      requestAnimationFrame(tick);
    });
    recorder.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (!blob.size) throw new Error('没有生成视频数据');
    const url = URL.createObjectURL(blob);
    const video = document.querySelector('#wallpaperVideo');
    const filename = `${modelEntry.id}_4k_${settings.fps}fps.webm`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const saved = window.wallpaperAPI
      ? await window.wallpaperAPI.saveVideo(bytes, filename)
      : null;
    if (!saved && new URLSearchParams(window.location.search).get('batch') === '1') {
      const response = await fetch(`http://127.0.0.1:5176/save?filename=${encodeURIComponent(filename)}`, { method: 'POST', body: bytes });
      if (!response.ok) throw new Error(`本地保存失败 (${response.status})`);
    }
    video.src = saved?.url || url;
    video.dataset.path = saved?.path || '';
    video.dataset.filename = filename;
    const download = document.querySelector('#downloadVideo');
    download.href = url;
    download.download = filename;
    if (!batchExportRunning) {
      document.querySelector('#player').classList.remove('hidden');
    }
    setStatus(`壁纸已生成: ${modelEntry.name}`);
    saveSettings();
    return { filename, url, path: saved?.path || '' };
  } catch (error) {
    setStatus(`生成失败: ${error.message}`);
  } finally {
    app.ticker.maxFPS = 0;
    app.ticker.speed = originalTickerSpeed;
    PIXI.Ticker.shared.speed = originalSharedTickerSpeed;
    app.renderer.resolution = originalResolution;
    app.renderer.resize(originalWidth, originalHeight);
    app.resizeTo = previewHost;
    applySettings();
    progress.classList.add('hidden');
  }
}

async function exportWallpaper() {
  readControls();
  const entry = models.find((item) => item.path === settings.modelPath);
  if (!entry) return;
  if (!entry.supported) return setStatus(`无法生成：${entry.name} 的核心版本不兼容`);
  await recordWallpaper(model, entry);
}

async function exportAllWallpapers() {
  if (!window.wallpaperAPI && new URLSearchParams(window.location.search).get('batch') !== '1') return setStatus('批量导出请使用本地批处理页面');
  readControls();
  batchExportRunning = true;
  const failures = [];
  const requestedLimit = Number(new URLSearchParams(window.location.search).get('limit')) || models.length;
  const batchModels = models.filter((entry) => entry.supported).slice(0, requestedLimit);
  const unsupported = models.filter((entry) => !entry.supported);
  try {
    for (let index = 0; index < batchModels.length; index++) {
      const entry = batchModels[index];
      setStatus(`批量生成 ${index + 1}/${batchModels.length}: ${entry.name}`);
      try {
        if (!model || settings.modelPath !== entry.path) {
          disposeCurrentModel();
          settings.motion = entry.defaultMotion || 'Idle';
          settings.modelPath = entry.path;
          model = await loadModel(entry);
        }
        const result = await recordWallpaper(model, entry);
        if (window.wallpaperAPI && !result.path) throw new Error('没有写入本地文件');
      } catch (error) {
        failures.push(`${entry.name}: ${error.message}`);
        console.error(`Batch export failed for ${entry.path}`, error);
      }
    }
  } finally {
    batchExportRunning = false;
    const selected = models.find((item) => item.path === settings.modelPath) || models[0];
    if (!model || settings.modelPath !== selected.path) await selectModel(selected);
    setStatus(failures.length ? `批量完成，失败 ${failures.length}/${batchModels.length}` : `批量完成 ${batchModels.length}/${batchModels.length}，另有 ${unsupported.length} 个模型核心不兼容`);
    if (new URLSearchParams(window.location.search).get('batch') === '1') {
      await fetch('http://127.0.0.1:5176/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generated: batchModels.length - failures.length, failures, unsupported: unsupported.map((entry) => ({ path: entry.path, name: entry.name, mocVersion: entry.mocVersion })) }) });
    }
    if (failures.length) console.error('Batch export failures:', failures);
  }
}

async function runCompatibilityCheck() {
  const report = {
    generatedAt: new Date().toISOString(),
    coreVersion: window.Live2DCubismCore?.Version?.csmGetVersion?.() || 'unknown',
    latestMocVersion: window.Live2DCubismCore?.Version?.csmGetLatestMocVersion?.() || 'unknown',
    models: []
  };
  for (const entry of models) {
    disposeCurrentModel();
    try {
      model = await loadModel(entry);
      report.models.push({ id: entry.id, path: entry.path, mocVersion: entry.mocVersion, supported: true });
    } catch (error) {
      report.models.push({ id: entry.id, path: entry.path, mocVersion: entry.mocVersion, supported: false, error: error.message });
    }
  }
  disposeCurrentModel();
  if (window.wallpaperAPI?.writeCompatibilityReport) await window.wallpaperAPI.writeCompatibilityReport(report);
  setStatus(`兼容性检查完成：${report.models.filter((entry) => entry.supported).length}/${report.models.length}`);
}

for (const id of ['scale', 'x', 'y', 'brightness', 'sharpen', 'fps', 'motionSpeed', 'gradientStart', 'gradientEnd', 'gradientAngle']) document.querySelector(`#${id}`).addEventListener('input', () => {
  if (id === 'gradientStart' || id === 'gradientEnd') {
    settings[id] = document.querySelector(`#${id}`).value;
    settings.background = 'gradient';
  }
  if (id === 'gradientAngle') {
    settings.gradientAngle = Number(document.querySelector('#gradientAngle').value);
    settings.background = 'gradient';
  }
  readControls();
});
document.querySelector('#fsrEnabled').addEventListener('change', (event) => {
  settings.fsrEnabled = event.target.checked;
  applySettings();
  saveSettings();
});
document.querySelector('#glowEnabled').addEventListener('change', (event) => {
  settings.glowEnabled = event.target.checked;
  applySettings();
  saveSettings();
});
document.querySelector('#autoStart').addEventListener('change', async (event) => {
  const enabled = event.target.checked;
  try {
    if (!window.wallpaperAPI?.setAutoStart) throw new Error('请使用独立桌面程序设置开机自启动');
    await window.wallpaperAPI.setAutoStart(enabled);
    settings.autoStart = enabled;
    saveSettings();
  } catch (error) {
    event.target.checked = !enabled;
    setStatus(`开机自启动设置失败: ${error.message}`);
  }
});
document.querySelector('#fsrPreset').addEventListener('change', (event) => {
  settings.fsrPreset = event.target.value;
  const preset = FSR_PRESETS[settings.fsrPreset];
  if (preset) {
    settings.fsrScale = preset.scale;
    settings.fsrSharpness = preset.sharpness;
  }
  updateFsrControls();
  applySettings();
  saveSettings();
});
for (const id of ['fsrScale', 'fsrSharpness']) document.querySelector(`#${id}`).addEventListener('input', (event) => {
  settings[id] = Number(event.target.value);
  settings.fsrPreset = 'custom';
  document.querySelector('#fsrPreset').value = 'custom';
  document.querySelector(`#${id}Value`).textContent = id === 'fsrScale' ? `${Math.round(settings[id] * 100)}%` : settings[id].toFixed(2);
  applySettings();
  saveSettings();
});
for (const [id, action] of [['actionOk', 'Ok'], ['actionGood', 'R_Good'], ['actionBad', 'R_Bad'], ['actionVerygood', 'R_Verygood']]) document.querySelector(`#${id}`).addEventListener('input', (event) => {
  settings.clickActions[action] = Number(event.target.value);
  document.querySelector(`#${id}Value`).textContent = `${settings.clickActions[action].toFixed(1)}%`;
  saveSettings();
});
document.querySelectorAll('[data-background]').forEach((button) => button.addEventListener('click', () => {
  settings.background = button.dataset.background;
  readControls();
}));
document.querySelector('#backgroundImage').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = window.wallpaperAPI ? await window.wallpaperAPI.saveBackground(bytes, file.name) : null;
    settings.backgroundImage = saved?.url || URL.createObjectURL(file);
    settings.background = 'image';
    readControls();
    setStatus('背景图片已载入');
  } catch (error) {
    setStatus(`背景图片载入失败: ${error.message}`);
  }
});
document.querySelector('#motion').addEventListener('change', () => {
  readControls();
  model?.motion(settings.motion, 0, 2);
});
document.querySelector('#aspectPreset').addEventListener('change', async (event) => {
  settings.aspectPreset = event.target.value;
  updateAspectControls();
  await applyWindowAspectRatio();
  saveSettings();
});
for (const id of ['aspectWidth', 'aspectHeight']) document.querySelector(`#${id}`).addEventListener('change', async (event) => {
  settings[id] = Math.max(1, Math.min(100, Number(event.target.value) || (id === 'aspectWidth' ? 16 : 9)));
  updateAspectControls();
  await applyWindowAspectRatio();
  saveSettings();
});
document.querySelector('#export').addEventListener('click', exportWallpaper);
document.querySelector('#startNative').addEventListener('click', async () => {
  readControls();
  if (!window.wallpaperAPI) return setStatus('原生运行需要在独立管理器中使用');
  const entry = models.find((item) => item.path === settings.modelPath);
  if (!entry?.supported) return setStatus(`无法原生运行：${entry?.name || '当前模型'} 的核心版本不兼容`);
  try {
    await window.wallpaperAPI.startNativeWallpaper({ ...settings, minimumRenderResolution: app.renderer.resolution });
    document.querySelector('#startNative').classList.add('hidden');
    document.querySelector('#stopNative').classList.remove('hidden');
    setStatus('原生桌面壁纸运行中');
    saveSettings();
  } catch (error) {
    setStatus(`原生运行失败: ${error.message}`);
  }
});
document.querySelector('#stopNative').addEventListener('click', async () => {
  await window.wallpaperAPI?.stopNativeWallpaper();
  document.querySelector('#stopNative').classList.add('hidden');
  document.querySelector('#startNative').classList.remove('hidden');
  setStatus('原生运行已停止');
});
document.querySelector('#model').addEventListener('change', async (event) => {
  const modelEntry = models.find((item) => item.path === event.target.value);
  if (modelEntry) await selectModel(modelEntry);
});
document.querySelector('#setWallpaper').addEventListener('click', async () => {
  const path = document.querySelector('#wallpaperVideo').dataset.path;
  if (!path || !window.wallpaperAPI) return setStatus('请先在独立管理器中生成壁纸视频');
  try { await window.wallpaperAPI.setWallpaper(path); setStatus('已设置为桌面动态壁纸'); }
  catch (error) { setStatus(`桌面设置失败: ${error.message}`); }
});
document.querySelector('#playMotion').addEventListener('click', () => model?.motion(settings.motion, 0, 2));
document.querySelector('#minimizeTray').addEventListener('click', () => window.wallpaperAPI?.minimizeToTray());
document.querySelector('#closePlayer').addEventListener('click', () => document.querySelector('#player').classList.add('hidden'));

function togglePanel(panelId, buttonId) {
  const panel = document.querySelector(`#${panelId}`);
  const button = document.querySelector(`#${buttonId}`);
  const collapsed = panel.classList.toggle('collapsed');
  button.setAttribute('aria-expanded', String(!collapsed));
  button.textContent = collapsed ? '+' : '−';
}

document.querySelector('#toggleControls').addEventListener('click', () => togglePanel('controls', 'toggleControls'));
document.querySelector('#toggleFsr').addEventListener('click', () => togglePanel('fsrPanel', 'toggleFsr'));
document.querySelector('#toggleActions').addEventListener('click', () => togglePanel('actionPanel', 'toggleActions'));
document.querySelector('#togglePlayer').addEventListener('click', () => togglePanel('player', 'togglePlayer'));
try {
  const storedSettings = JSON.parse(localStorage.getItem('v7-wallpaper-settings') || '{}');
  Object.assign(settings, migrateBackgroundSettings(storedSettings));
  settings.clickActions = { ...DEFAULT_ACTION_WEIGHTS, ...(storedSettings.clickActions || {}) };
  if (!Object.prototype.hasOwnProperty.call(storedSettings, 'fsrPreset')) {
    settings.fsrEnabled = true;
    settings.fsrPreset = 'custom';
    settings.fsrScale = 2.12;
    settings.fsrSharpness = 1;
  } else if (storedSettings.fsrPreset === 'balanced' && storedSettings.fsrScale === 0.67 && storedSettings.fsrSharpness === 0.35) {
    settings.fsrPreset = 'custom';
    settings.fsrScale = 2.12;
    settings.fsrSharpness = 1;
  } else if (storedSettings.fsrScaleAuto) {
    settings.fsrScale = 2.12;
  }
  for (const key of ['scale', 'x', 'y', 'brightness', 'sharpen', 'fps', 'motionSpeed']) document.querySelector(`#${key}`).value = settings[key];
  document.querySelector('#glowEnabled').checked = settings.glowEnabled;
  document.querySelector('#autoStart').checked = settings.autoStart;
  document.querySelector('#fsrEnabled').checked = settings.fsrEnabled;
  document.querySelector('#fsrPreset').value = settings.fsrPreset || 'custom';
  document.querySelector('#fsrScale').value = settings.fsrScale;
  document.querySelector('#fsrSharpness').value = settings.fsrSharpness;
  updateActionControls();
} catch { /* use defaults */ }
updateFsrControls();
settings.aspectPreset = settings.aspectPreset === 'custom' ? 'custom' : '16:9';
settings.aspectWidth = Math.max(1, Math.min(100, Number(settings.aspectWidth) || 16));
settings.aspectHeight = Math.max(1, Math.min(100, Number(settings.aspectHeight) || 9));
updateAspectControls();
applyWindowAspectRatio();

fetch('/models/manifest.json').then((response) => response.json()).then(async (entries) => {
  models = entries;
  const modelSelect = document.querySelector('#model');
  modelSelect.replaceChildren(...models.map((entry) => {
    const option = document.createElement('option');
    option.value = entry.path;
    option.textContent = `${entry.name} · ${entry.path.split('/')[0]}${entry.supported ? '' : ` · 核心不兼容 (MOC v${entry.mocVersion})`}`;
    return option;
  }));
  const selected = models.find((entry) => entry.path === settings.modelPath) || models.find((entry) => entry.path === DEFAULT_MODEL_PATH) || models[0];
  modelSelect.value = selected.path;
  settings.modelPath = selected.path;
  try {
    model = await loadModel(selected);
  } catch (error) {
    selected.loadError = error.message;
    setStatus(`模型加载失败: ${selected.name} (${error.message})`);
  }
  readControls();
  if (model) {
    updateSamplingLimit(model);
    updateFsrControls();
    applySettings();
    saveSettings();
  }
  applySettings();
  const batchParams = new URLSearchParams(window.location.search);
  if (batchParams.get('batch') === '1') {
    await exportAllWallpapers();
    await window.wallpaperAPI?.finishBatch();
  } else if (batchParams.get('compat') === '1') {
    await runCompatibilityCheck();
    await window.wallpaperAPI?.finishBatch();
  }
}).catch((error) => setStatus(`模型清单加载失败: ${error.message}`));
