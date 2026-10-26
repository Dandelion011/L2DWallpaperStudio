# V7 Wallpaper Studio

This project contains the extracted Live2D library, a Wallpaper Engine web wallpaper sample, and a standalone Electron wallpaper manager. The manager runs as a Windows desktop application and does not require a browser or Wallpaper Engine.

## Outputs

- `exports/usada_pekora_4k_30fps.webm`: 3840 x 2160, 30 FPS, approximately 8 seconds.
- `WallpaperEngine/usada_pekora`: import this folder from Wallpaper Engine's Create Wallpaper workflow. It renders the Live2D model in real time and exposes scale, position, and brightness properties.
- `public/models` and `public/wallpapers`: model and pre-rendered wallpaper data used during development. The large library is distributed separately as `V7.Wallpaper.Studio.Resources.asar` in Releases and is intentionally excluded from Git history.

The manager supports black, white, two-color gradient, uploaded image, and transparent backgrounds. It can either export a 4K WebM wallpaper or run the selected Live2D model directly as an interactive Windows desktop wallpaper.

The bundled Live2D Core is Cubism 5.3 Web Core. It supports the included MOC v1-v5 models; the compatibility probe currently loads all 84 bundled models successfully (Core reports latest MOC version 6).

## Run the desktop application

For the portable build, keep these two files in the same directory and open the executable:

```text
V7.Wallpaper.Studio.0.1.0.exe
V7.Wallpaper.Studio.Resources.asar
```

The executable includes the desktop runtime; the adjacent resource library contains the models, wallpaper assets, and native desktop scripts. It does not require a browser or Wallpaper Engine.

## Manager development

Install Node.js 20 or newer, download the matching resource-library Release asset, and place it beside the packaged executable (or populate `public/models` and `public/wallpapers` for development), then run:

```powershell
npm install
npm run dev
```

For browser-based development only, the live-preview workflow runs at `http://127.0.0.1:5173/`. To run the desktop manager from source, use `npm run app`. The manager saves rendered videos under its Electron user-data directory and its Windows wallpaper window is hosted behind desktop icons. A source checkout without the external resource library can build the UI, but model loading requires the library or populated `public/models` and `public/wallpapers` directories.

To rebuild the desktop application directory, use `npm run dist`. The output is intentionally a directory target because the bundled model and video library is larger than the Windows single-file portable executable format can safely embed.

To run the model compatibility probe without exporting videos, use `npm run compat`. The report is written to `exports/core-compatibility-report.json` during development and to the Electron user-data directory in a packaged build.
