/* =========================================================
   LOT KING - PLAYABLE EXPORT ZIP
   Packages playable runtime files, vendor scripts and assets.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const slugifyTrackName = deps.slugifyTrackName || function(name){
    return (name || 'track').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track';
  };
  const buildPlayableBootstrapHtml = deps.buildPlayableBootstrapHtml || function(){ return ''; };
  const tr = (en, it) => window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it' ? (it || en) : en;

  const VENDOR_LIBS = [
    {source:'vendor/three-r185-compat.min.js', local:'vendor/three-r185-compat.min.js'},
    {source:'vendor/helvetiker_regular.typeface.json', local:'vendor/helvetiker_regular.typeface.json'},
    {source:'vendor/cannon-0.6.2.min.js', local:'vendor/cannon-0.6.2.min.js'},
    {source:'vendor/THIRD_PARTY_LICENSES.md', local:'vendor/THIRD_PARTY_LICENSES.md'},
  ];
  const RUNTIME_TEMPLATE = 'gameplay.html';
  const STATIC_FILES = [
    'css/lot-king.css',
    'js/lot-king.js',
    'js/runtime/player-light-rig.js',
    'js/engine/scene-store.js',
    'models/car1.glb',
    'models/car2.glb',
    'models/cone.glb',
    'models/player.glb',
    'musics/02 - Num0 - Getting serious.mp3',
    'musics/01 - Num0 - Block Road.mp3',
    'musics/03 - Num0 - Look into the mirror.mp3',
    'musics/menu/Num0  JustWait.mp3',
    'media/soundhud.png',
    'media/lensflare/lensDirtTexture.jpg',
    'media/lensflare/LICENSE-CC0.txt',
    'media/hdri/README.md',
    'media/sfx/engine/BAC_Mono_onmid.wav',
    'media/sfx/engine/BAC_Mono_onlow.wav',
    'media/sfx/engine/BAC_Mono_onhigh.wav',
    'media/sfx/engine/BAC_Mono_offveryhigh.wav',
    'media/sfx/engine/BAC_Mono_offmid.wav',
    'media/sfx/engine/BAC_Mono_offlow.wav',
    'media/sfx/engine/BAC_Mono_offhigh.wav',
    'media/sfx/engine/tw_offhigh_4.wav',
    'media/sfx/engine/tw_offverylow_4.wav',
    'media/sfx/engine/tw_offlow_4.wav',
    'media/sfx/engine/tw_offlowmid_4.wav',
    'media/sfx/engine/procar/on_high.wav',
    'media/sfx/engine/procar/off_midhigh.wav',
    'media/sfx/engine/procar/off_lower.wav',
    'media/sfx/engine/procar/on_low.wav',
    'media/sfx/engine/procar/on_midhigh.wav',
    'media/sfx/engine/REV.wav',
    'media/sfx/engine/trany_power_high.wav',
  ];

  function ensureJsZipForExport(){
    if(window.JSZip) return Promise.resolve(window.JSZip);
    if(ensureJsZipForExport._pending) return ensureJsZipForExport._pending;
    const script = document.createElement('script');
    script.src = 'vendor/jszip-3.10.1.min.js?v=3.10.1-lk1';
    const p = new Promise((resolve, reject) => {
      script.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error(tr('JSZip unavailable after loading', 'JSZip non disponibile dopo il caricamento')));
      script.onerror = () => reject(new Error(tr('Unable to load local JSZip', 'Impossibile caricare JSZip locale')));
    });
    document.head.appendChild(script);
    ensureJsZipForExport._pending = p;
    return p;
  }

  function exportAssetUrl(path){
    return new URL(path, location.href).href;
  }

  function normalizeExportPath(path){
    return (path || '').replace(/^\.\/+/, '').replace(/[?#].*$/, '');
  }

  function isRelativePlayableAssetPath(path){
    return typeof path === 'string' &&
      !/^(?:\w+:)?\/\//.test(path) &&
      !/^data:/.test(path) &&
      !/^blob:/.test(path) &&
      (path.indexOf('models/') === 0 || path.indexOf('media/') === 0 || path.indexOf('musics/') === 0);
  }

  function isEditorOnlyExportPath(path){
    const p = normalizeExportPath(path);
    return p === 'engine_editor.html' ||
      p === 'index.html' ||
      p === 'css/editor.css' ||
      p.indexOf('js/editor/') === 0;
  }

  function collectAssetPathsFromObject(node, bag, seen){
    if(!node || seen.has(node)) return;
    if(typeof node === 'string'){
      if(/\.(?:glb|gltf|wav|mp3|png|jpg|jpeg|webp|hdr)$/i.test(node.trim()) && isRelativePlayableAssetPath(node.trim())){
        bag.add(normalizeExportPath(node.trim()));
      }
      return;
    }
    if(typeof node !== 'object') return;
    seen.add(node);
    if(Array.isArray(node)) {
      for(let i = 0; i < node.length; i += 1){
        collectAssetPathsFromObject(node[i], bag, seen);
      }
      return;
    }
    Object.keys(node).forEach(key => collectAssetPathsFromObject(node[key], bag, seen));
  }

  function collectReferencedAssetsFromBundle(bundle){
    const paths = new Set();
    STATIC_FILES.forEach(p => paths.add(p));
    if(bundle && Array.isArray(bundle.levels)){
      bundle.levels.forEach(level => collectAssetPathsFromObject(level, paths, new Set()));
    }
    return Array.from(paths).filter(isRelativePlayableAssetPath);
  }

  function extractLocalRuntimeRefs(html){
    const refs = new Set();
    const re = /<(?:script|link|img|audio|video)\b[^>]+\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m;
    while((m = re.exec(html))){
      const raw = normalizeExportPath(m[1] || '');
      if(!raw || raw === RUNTIME_TEMPLATE) continue;
      if(isEditorOnlyExportPath(raw)) continue;
      if(isRelativePlayableAssetPath(raw) || raw.startsWith('js/') || raw.startsWith('css/')){
        refs.add(raw);
      }
    }
    return Array.from(refs);
  }

  function rewriteRuntimeHtmlForZip(html){
    let out = html;
    VENDOR_LIBS.forEach(item => {
      if(!item.remote) return;
      const quoted1 = `src="${item.remote}"`;
      const quoted2 = `src='${item.remote}'`;
      const href1 = `href="${item.remote}"`;
      const href2 = `href='${item.remote}'`;
      out = out.replaceAll(quoted1, `src="${item.local}"`);
      out = out.replaceAll(quoted2, `src='${item.local}'`);
      out = out.replaceAll(href1, `href="${item.local}"`);
      out = out.replaceAll(href2, `href='${item.local}'`);
    });
    return out;
  }

  async function addFileToZip(zip, sourcePath, targetPath, warnings, required){
    try {
      const response = await fetch(exportAssetUrl(sourcePath));
      if(!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.blob();
      zip.file(targetPath || sourcePath, data);
    } catch(err){
      const msg = sourcePath + ': ' + err.message;
      if(required) throw new Error(msg);
      if(warnings) warnings.push(msg);
    }
  }

  async function runExportQueue(tasks, concurrency){
    let cursor = 0;
    const workers = Array.from({length: Math.min(concurrency || 6, tasks.length)}, async () => {
      while(cursor < tasks.length){
        const task = tasks[cursor++];
        await task();
      }
    });
    await Promise.all(workers);
  }

  async function buildPlayableProjectZip(bundle, onProgress){
    const report = typeof onProgress === 'function'
      ? onProgress
      : () => {};
    const setProgress = (pct, step, tone) => report(Math.max(0, Math.min(100, Math.round(pct))), step || '', tone || 'loading');
    const warnings = Array.isArray(bundle && bundle.warnings) ? bundle.warnings.slice() : [];
    const JSZip = await ensureJsZipForExport();
    const zip = new JSZip();
    const level = bundle.levels && bundle.levels[0];
    const slug = slugifyTrackName((level && level.name) || 'track');
    setProgress(4, tr('Loading runtime template', 'Caricamento template runtime'));
    const runtimeHtml = rewriteRuntimeHtmlForZip(await (await fetch(exportAssetUrl(RUNTIME_TEMPLATE)).then(r => {
      if(!r.ok) throw new Error(tr('runtime template not found', 'template runtime non trovato'));
      return r.text();
    })));
    const runtimeRefs = extractLocalRuntimeRefs(runtimeHtml);
    const referencedAssets = collectReferencedAssetsFromBundle(bundle);
    const totalToPack = 1 + runtimeRefs.length + VENDOR_LIBS.length + referencedAssets.length + 1;
    let doneCount = 0;
    const done = () => Math.round((++doneCount / totalToPack) * 100);
    zip.file('index.html', buildPlayableBootstrapHtml(bundle));
    zip.file('export-manifest.json', JSON.stringify({
      format: 'LK_PLAYABLE_EXPORT_MANIFEST',
      version: 1,
      createdAt: new Date().toISOString(),
      runtime: RUNTIME_TEMPLATE,
      activeId: bundle.activeId || null,
      levels: (bundle.levels || []).map(level => ({
        id: level.id,
        name: level.name,
        levelRole: level.levelRole || 'gameplay',
        savedAt: level.savedAt || null,
        primary: !!level.__lkExportPrimary,
      })),
      runtimeFiles: runtimeRefs.slice().sort(),
      assetFiles: referencedAssets.slice().sort(),
      excludedEditorOnly: ['engine_editor.html', 'index.html', 'css/editor.css', 'js/editor/*'],
      warnings,
    }, null, 2));
    zip.file('README.txt',
      [
        'LOT KING ENGINE EDITOR playable package',
        '',
        'Contiene solo il runtime gameplay esportabile e i livelli selezionati.',
        'Non include la pagina editor standalone.',
        '',
        'Verifica contenuto: export-manifest.json',
        '',
        'Windows: doppio click su play.bat',
        'Linux/macOS: eseguire bash play.sh',
        'Oppure: python -m http.server 8000 e aprire http://127.0.0.1:8000/index.html',
      ].join('\n')
    );
    zip.file('play.bat', [
      '@echo off',
      'setlocal',
      'set PORT=8000',
      'cd /d "%~dp0"',
      'python --version >nul 2>nul && (',
      '  start "" "http://127.0.0.1:%PORT%/index.html"',
      '  python -m http.server %PORT%',
      ') || (',
      '  where py >nul 2>nul && (',
      '    start "" "http://127.0.0.1:%PORT%/index.html"',
      '    py -3 -m http.server %PORT%',
      '  ) || (',
      '    echo Python non trovato. Installare Python 3 per avviare il server locale.',
      '    pause',
      '    exit /b 1',
      '  )',
      ')',
      '',
    ].join('\n')
    );
    zip.file('play.sh', [
      '#!/usr/bin/env sh',
      'set -eu',
      'ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
      'PORT="8000"',
      'if command -v python3 >/dev/null 2>&1; then',
      '  PY="python3"',
      'elif command -v python >/dev/null 2>&1; then',
      '  PY="python"',
      'else',
      '  echo "Python non trovato. Installare Python 3 per avviare il server locale."',
      '  exit 1',
      'fi',
      '{',
      '  sleep 1',
      '  if command -v xdg-open >/dev/null 2>&1; then',
      '    xdg-open "http://127.0.0.1:$PORT/index.html" >/dev/null 2>&1 || true',
      '  elif command -v open >/dev/null 2>&1; then',
      '    open "http://127.0.0.1:$PORT/index.html" >/dev/null 2>&1 || true',
      '  fi',
      '} &',
      `"${'$'}PY" -m http.server "${'$'}PORT" --directory "${'$'}ROOT_DIR"`,
      '',
    ].join('\n')
    );
    zip.file(RUNTIME_TEMPLATE, runtimeHtml);
    const packTasks = [];
    runtimeRefs.forEach(ref => packTasks.push(async () => {
      await addFileToZip(zip, ref, ref, warnings, ref.startsWith('js/') || ref.startsWith('css/') || /^js\/(runtime|engine)\//.test(ref));
      setProgress(done(), 'Copiamento risorse runtime (' + doneCount + '/' + (totalToPack - 1) + ')');
    }));
    VENDOR_LIBS.forEach(lib => packTasks.push(async () => {
      await addFileToZip(zip, lib.source || lib.remote, lib.local, warnings, true);
      setProgress(done(), 'Copiamento vendor (' + doneCount + '/' + (totalToPack - 1) + ')');
    }));
    referencedAssets.forEach(asset => packTasks.push(async () => {
      await addFileToZip(zip, asset, asset, warnings, false);
      setProgress(done(), 'Copiamento asset (' + doneCount + '/' + (totalToPack - 1) + ')');
    }));
    await runExportQueue(packTasks, 6);
    setProgress(done(), 'Creazione archivio ZIP', 'loading');
    const blob = await zip.generateAsync({type: 'blob'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lot-king-' + slug + '-playable.zip';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    setProgress(100, 'ZIP pronto per il download', 'success');
    return warnings;
  }

  return Object.freeze({
    RUNTIME_TEMPLATE,
    buildPlayableProjectZip,
  });
}

window.LK_EDITOR_PLAYABLE_EXPORT_ZIP = Object.freeze({create});
})();
