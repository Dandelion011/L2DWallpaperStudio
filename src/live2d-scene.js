export const DEFAULT_BACKGROUND = {
  background: 'gradient',
  gradientStart: '#303030',
  gradientEnd: '#4a4a4a',
  gradientAngle: 180,
  backgroundImage: ''
};

export function migrateBackgroundSettings(settings) {
  const next = { ...DEFAULT_BACKGROUND, ...settings };
  if (settings.background === 'stage') {
    next.background = 'gradient';
    next.gradientStart = '#bbbbbb';
    next.gradientEnd = '#e6e6e6';
    next.gradientAngle = 180;
  } else if (settings.background === 'stage-dark') {
    next.background = 'gradient';
    next.gradientStart = '#303030';
    next.gradientEnd = '#4a4a4a';
    next.gradientAngle = 180;
  } else if (settings.background === 'grey') {
    next.background = 'gradient';
    next.gradientStart = '#808080';
    next.gradientEnd = '#808080';
    next.gradientAngle = 180;
  } else if (settings.background === 'custom') {
    next.background = 'gradient';
    next.gradientStart = settings.backgroundColor || '#808080';
    next.gradientEnd = settings.backgroundColor || '#808080';
    next.gradientAngle = 180;
  }
  next.gradientAngle = Number.isFinite(Number(next.gradientAngle)) ? Number(next.gradientAngle) : 180;
  return next;
}

function hexToRgb(value) {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : '303030';
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function clearBackdrop(target) {
  for (const child of target.removeChildren()) child.destroy({ children: true, texture: true, baseTexture: true });
  target.__backgroundUrl = '';
  target.__backgroundReady = Promise.resolve();
}

function createGradientTexture(PIXI, settings) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const angle = Number(settings.gradientAngle || 180) * Math.PI / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const length = Math.abs(dx) * canvas.width + Math.abs(dy) * canvas.height;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const gradient = context.createLinearGradient(centerX - dx * length / 2, centerY - dy * length / 2, centerX + dx * length / 2, centerY + dy * length / 2);
  const start = hexToRgb(settings.gradientStart);
  const end = hexToRgb(settings.gradientEnd);
  gradient.addColorStop(0, `rgb(${start.r} ${start.g} ${start.b})`);
  gradient.addColorStop(1, `rgb(${end.r} ${end.g} ${end.b})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return PIXI.Texture.from(canvas);
}

export function drawBackground(PIXI, target, settings, width, height) {
  clearBackdrop(target);
  if (settings.background === 'transparent') return;
  if (settings.background === 'image' && settings.backgroundImage) {
    const texture = PIXI.Texture.from(settings.backgroundImage);
    const ready = texture.baseTexture.valid ? Promise.resolve() : new Promise((resolve, reject) => {
      texture.baseTexture.once('loaded', resolve);
      texture.baseTexture.once('error', reject);
    });
    target.__backgroundReady = ready;
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    const scale = Math.max(width / sprite.texture.width, height / sprite.texture.height);
    sprite.width = sprite.texture.width * scale;
    sprite.height = sprite.texture.height * scale;
    sprite.x = width / 2;
    sprite.y = height / 2;
    target.addChild(sprite);
    target.__backgroundUrl = settings.backgroundImage;
    return;
  }
  if (settings.background === 'black' || settings.background === 'white') {
    const color = settings.background === 'black' ? 0x000000 : 0xffffff;
    target.addChild(new PIXI.Graphics().beginFill(color).drawRect(0, 0, width, height).endFill());
    return;
  }
  const sprite = new PIXI.Sprite(createGradientTexture(PIXI, settings));
  sprite.width = width;
  sprite.height = height;
  target.addChild(sprite);
}

export function brightnessFilter(PIXI, value) {
  const filter = new PIXI.filters.ColorMatrixFilter();
  filter.brightness(value, false);
  return filter;
}

export function setModelGlowEnabled(model, enabled) {
  const coreModel = model?.internalModel?.coreModel;
  if (!coreModel?.getDrawableBlendMode) return;
  if (!coreModel.__originalGetDrawableBlendMode) {
    coreModel.__originalGetDrawableBlendMode = coreModel.getDrawableBlendMode.bind(coreModel);
    coreModel.getDrawableBlendMode = (drawableIndex) => {
      const blendMode = coreModel.__originalGetDrawableBlendMode(drawableIndex);
      return coreModel.__glowEnabled || blendMode !== 1 ? blendMode : 0;
    };
  }
  coreModel.__glowEnabled = Boolean(enabled);
}

const sharpenFragment = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform highp vec4 inputSize;
uniform float strength;

void main(void) {
  vec2 texel = inputSize.zw;
  vec4 center = texture2D(uSampler, vTextureCoord);
  vec4 neighbors = texture2D(uSampler, vTextureCoord + vec2(texel.x, 0.0))
    + texture2D(uSampler, vTextureCoord - vec2(texel.x, 0.0))
    + texture2D(uSampler, vTextureCoord + vec2(0.0, texel.y))
    + texture2D(uSampler, vTextureCoord - vec2(0.0, texel.y));
  vec4 sharpened = center * (1.0 + 4.0 * strength) - neighbors * strength;
  sharpened.a = center.a;
  gl_FragColor = clamp(sharpened, 0.0, 1.0);
}
`;

const fsrEasuFragment = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform highp vec4 inputPixel;
uniform highp vec4 inputClamp;

vec4 fsrSample(vec2 pixel, vec2 sourceSize) {
  vec2 uv = clamp((pixel + 0.5) / sourceSize, inputClamp.xy, inputClamp.zw);
  return texture2D(uSampler, uv);
}

float fsrLuma(vec3 color) { return color.b * 0.5 + (color.r * 0.5 + color.g); }

void fsrSetDirection(inout vec2 direction, inout float edgeLength, float weight, float center, float left, float right, float top, float bottom) {
  float dc = right - center;
  float cb = center - left;
  float lenX = abs(right - left) / max(max(abs(dc), abs(cb)), 0.00001);
  direction.x += (right - left) * weight;
  lenX = clamp(abs(right - left) * lenX, 0.0, 1.0);
  edgeLength += lenX * lenX * weight;
  float ec = bottom - center;
  float ca = center - top;
  float lenY = abs(bottom - top) / max(max(abs(ec), abs(ca)), 0.00001);
  direction.y += (bottom - top) * weight;
  lenY = clamp(abs(bottom - top) * lenY, 0.0, 1.0);
  edgeLength += lenY * lenY * weight;
}

void fsrTap(inout vec4 accumulated, inout float weightSum, vec2 offset, vec2 direction, vec2 kernelLength, float lobe, float clipPoint, vec4 sampleColor) {
  vec2 rotated = vec2(dot(offset, direction), dot(offset, vec2(-direction.y, direction.x))) * kernelLength;
  float d2 = min(dot(rotated, rotated), clipPoint);
  float wb = 0.4 * d2 - 1.0;
  float wa = lobe * d2 - 1.0;
  wb *= wb;
  wa *= wa;
  float weight = (1.5625 * wb - 0.5625) * wa;
  accumulated += sampleColor * weight;
  weightSum += weight;
}

void main(void) {
  vec2 sourceSize = max(inputPixel.xy, vec2(1.0));
  vec2 position = vTextureCoord * sourceSize - 0.5;
  vec2 base = floor(position);
  vec2 pp = position - base;
  vec4 b = fsrSample(base + vec2(0.0, -1.0), sourceSize);
  vec4 c = fsrSample(base + vec2(1.0, -1.0), sourceSize);
  vec4 i = fsrSample(base + vec2(-1.0, 1.0), sourceSize);
  vec4 j = fsrSample(base + vec2(0.0, 1.0), sourceSize);
  vec4 f = fsrSample(base, sourceSize);
  vec4 e = fsrSample(base + vec2(-1.0, 0.0), sourceSize);
  vec4 k = fsrSample(base + vec2(1.0, 1.0), sourceSize);
  vec4 l = fsrSample(base + vec2(2.0, 1.0), sourceSize);
  vec4 h = fsrSample(base + vec2(2.0, 0.0), sourceSize);
  vec4 g = fsrSample(base + vec2(1.0, 0.0), sourceSize);
  vec4 o = fsrSample(base + vec2(1.0, 2.0), sourceSize);
  vec4 n = fsrSample(base + vec2(0.0, 2.0), sourceSize);
  float bL=fsrLuma(b.rgb), cL=fsrLuma(c.rgb), iL=fsrLuma(i.rgb), jL=fsrLuma(j.rgb);
  float fL=fsrLuma(f.rgb), eL=fsrLuma(e.rgb), kL=fsrLuma(k.rgb), lL=fsrLuma(l.rgb);
  float hL=fsrLuma(h.rgb), gL=fsrLuma(g.rgb), oL=fsrLuma(o.rgb), nL=fsrLuma(n.rgb);
  vec2 direction = vec2(0.0);
  float edgeLength = 0.0;
  fsrSetDirection(direction, edgeLength, (1.0-pp.x)*(1.0-pp.y), fL,eL,gL,bL,jL);
  fsrSetDirection(direction, edgeLength, pp.x*(1.0-pp.y), gL,fL,hL,cL,kL);
  fsrSetDirection(direction, edgeLength, (1.0-pp.x)*pp.y, jL,iL,kL,fL,nL);
  fsrSetDirection(direction, edgeLength, pp.x*pp.y, kL,jL,lL,gL,oL);
  if (dot(direction,direction) < 0.000030517578125) direction = vec2(1.0,0.0);
  else direction *= inversesqrt(dot(direction,direction));
  edgeLength = edgeLength * 0.5;
  edgeLength *= edgeLength;
  float stretch = dot(direction,direction) / max(max(abs(direction.x),abs(direction.y)),0.00001);
  vec2 kernelLength = vec2(1.0+(stretch-1.0)*edgeLength,1.0-0.5*edgeLength);
  float lobe = 0.5+(0.21-0.5)*edgeLength;
  float clipPoint = 1.0/max(lobe,0.00001);
  vec4 accum=vec4(0.0);
  float weightSum=0.0;
  fsrTap(accum,weightSum,vec2(0.0,-1.0)-pp,direction,kernelLength,lobe,clipPoint,b);
  fsrTap(accum,weightSum,vec2(1.0,-1.0)-pp,direction,kernelLength,lobe,clipPoint,c);
  fsrTap(accum,weightSum,vec2(-1.0,1.0)-pp,direction,kernelLength,lobe,clipPoint,i);
  fsrTap(accum,weightSum,vec2(0.0,1.0)-pp,direction,kernelLength,lobe,clipPoint,j);
  fsrTap(accum,weightSum,-pp,direction,kernelLength,lobe,clipPoint,f);
  fsrTap(accum,weightSum,vec2(-1.0,0.0)-pp,direction,kernelLength,lobe,clipPoint,e);
  fsrTap(accum,weightSum,vec2(1.0,1.0)-pp,direction,kernelLength,lobe,clipPoint,k);
  fsrTap(accum,weightSum,vec2(2.0,1.0)-pp,direction,kernelLength,lobe,clipPoint,l);
  fsrTap(accum,weightSum,vec2(2.0,0.0)-pp,direction,kernelLength,lobe,clipPoint,h);
  fsrTap(accum,weightSum,vec2(1.0,0.0)-pp,direction,kernelLength,lobe,clipPoint,g);
  fsrTap(accum,weightSum,vec2(1.0,2.0)-pp,direction,kernelLength,lobe,clipPoint,o);
  fsrTap(accum,weightSum,vec2(0.0,2.0)-pp,direction,kernelLength,lobe,clipPoint,n);
  vec3 low=min(min(f.rgb,g.rgb),min(j.rgb,k.rgb));
  vec3 high=max(max(f.rgb,g.rgb),max(j.rgb,k.rgb));
  vec4 reconstructed=accum/max(weightSum,0.00001);
  reconstructed.rgb=clamp(reconstructed.rgb,low,high);
  reconstructed.a=clamp(reconstructed.a,min(min(f.a,g.a),min(j.a,k.a)),max(max(f.a,g.a),max(j.a,k.a)));
  gl_FragColor=reconstructed;
}
`;

const fsrRcasFragment = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform highp vec4 inputPixel;
uniform float sharpness;
float fsrLuma(vec3 c){return c.b*0.5+(c.r*0.5+c.g);}
void main(void){
  vec2 t=inputPixel.zw;
  vec4 e=texture2D(uSampler,vTextureCoord);
  vec3 b=texture2D(uSampler,vTextureCoord-vec2(0.0,t.y)).rgb;
  vec3 d=texture2D(uSampler,vTextureCoord-vec2(t.x,0.0)).rgb;
  vec3 f=texture2D(uSampler,vTextureCoord+vec2(t.x,0.0)).rgb;
  vec3 h=texture2D(uSampler,vTextureCoord+vec2(0.0,t.y)).rgb;
  float bL=fsrLuma(b),dL=fsrLuma(d),eL=fsrLuma(e.rgb),fL=fsrLuma(f),hL=fsrLuma(h);
  float range = max(max(max(bL, dL), max(eL, fL)), hL)
    - min(min(min(bL, dL), min(eL, fL)), hL);
  float nz=clamp(abs(0.25*(bL+dL+fL+hL)-eL)/max(range,0.00001),0.0,1.0);
  nz=1.0-0.5*nz;
  vec3 mn=min(min(b,d),min(f,h));
  vec3 mx=max(max(b,d),max(f,h));
  vec3 hitMin=min(mn,e.rgb)/max(4.0*mx,vec3(0.00001));
  vec3 hitMaxDenom=4.0*mn-4.0;
  hitMaxDenom=mix(vec3(-0.00001),hitMaxDenom,step(vec3(0.00001),abs(hitMaxDenom)));
  vec3 hitMax=(1.0-max(mx,e.rgb))/hitMaxDenom;
  vec3 lobeRGB=max(-hitMin,hitMax);
  float lobe=max(-0.1875,min(max(max(lobeRGB.r,lobeRGB.g),lobeRGB.b),0.0));
  lobe*=exp2(2.0*(clamp(sharpness,0.0,5.0)-1.0))*nz;
  vec3 result=(lobe*(b+d+f+h)+e.rgb)/(4.0*lobe+1.0);
  gl_FragColor=vec4(clamp(result,0.0,1.0),e.a);
}
`;

export function sharpenFilter(PIXI, value) {
  return new PIXI.Filter(undefined, sharpenFragment, { strength: Math.max(0, Math.min(1, Number(value) || 0)) });
}

export function fsrEasuFilter(PIXI) {
  return new PIXI.Filter(undefined, fsrEasuFragment);
}

export function fsrRcasFilter(PIXI, sharpness) {
  return new PIXI.Filter(undefined, fsrRcasFragment, { sharpness: Math.max(0, Math.min(5, Number(sharpness) || 0)) });
}

export function getRenderResolution(minimum = 1) {
  return Math.max(1, Number(window.devicePixelRatio) || 1, Number(minimum) || 1);
}

export function patchCoreRenderOrderCompatibility(model) {
  const coreModel = model.internalModel.coreModel;
  if (coreModel.getDrawableRenderOrders()?.length) return;
  const runtimeModel = coreModel._model;
  if (typeof runtimeModel?.getRenderOrders === 'function') {
    coreModel.getDrawableRenderOrders = () => runtimeModel.getRenderOrders();
  }
}

export function applyModelTransform(model, settings, width, height, fitWidth = width, fitHeight = height) {
  const fit = Math.min((fitWidth * 0.82) / model.__baseWidth, (fitHeight * 0.9) / model.__baseHeight);
  model.scale.set(fit * settings.scale);
  model.x = width * (0.5 + settings.x);
  model.y = height * (0.5 + settings.y) + model.height * 0.5;
}
