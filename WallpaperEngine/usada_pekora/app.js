(function () {
  const PIXI = window.PIXI;
  const Live2DModel = PIXI.live2d.Live2DModel;
  const app = new PIXI.Application({ resizeTo: window, backgroundColor: 0x10191a, antialias: true, resolution: 1 });
  document.body.appendChild(app.view);
  let model;
  const settings = { scale: 1, x: 0, y: 0, brightness: 1 };
  function placeModel() {
    if (!model) return;
    const fit = Math.min((innerWidth * 0.82) / model.width, (innerHeight * 0.9) / model.height);
    model.scale.set(fit * settings.scale);
    model.x = innerWidth * (0.68 + settings.x);
    model.y = innerHeight * (0.98 + settings.y);
    const filter = new PIXI.filters.ColorMatrixFilter();
    filter.brightness(settings.brightness, false);
    model.filters = [filter];
  }
  Live2DModel.from('./usada_pekora.model3.json', { autoInteract: true }).then((loaded) => {
    model = loaded;
    model.anchor.set(0.5, 1);
    app.stage.addChild(model);
    model.motion('Idle', 0, 2);
    placeModel();
    window.addEventListener('resize', placeModel);
  });
  window.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      if (properties.scale) settings.scale = properties.scale.value;
      if (properties.horizontal) settings.x = properties.horizontal.value / 100;
      if (properties.vertical) settings.y = properties.vertical.value / 100;
      if (properties.brightness) settings.brightness = properties.brightness.value;
      placeModel();
    }
  };
}());
