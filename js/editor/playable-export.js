/* =========================================================
   LOT KING — PLAYABLE EXPORT
   HTML/ZIP export pipeline for editor-created playable builds.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const $ = deps.$ || (sel => document.querySelector(sel));
  const status = deps.status || function(){};
  const beginStatusWork = deps.beginStatusWork || function(){ return null; };
  const updateStatusWork = deps.updateStatusWork || function(){};
  const finishStatusWork = deps.finishStatusWork || function(){};
  const currentTrackMeta = deps.currentTrackMeta || function(){ return {trackId:'track', trackName:'track'}; };
  const slugifyTrackName = deps.slugifyTrackName || function(name){
    return (name || 'track').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track';
  };
  const assetLibraryLoad = deps.assetLibraryLoad || function(){ return []; };
  const levelsApi = deps.levelsApi || function(){ return null; };

function safeJsonForInlineScript(value){
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }
  function blobToDataUrl(blob){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('conversione asset in base64 fallita'));
      r.readAsDataURL(blob);
    });
  }
  async function blobUrlToDataUrl(url){
    const response = await fetch(url);
    if(!response.ok) throw new Error('blob non leggibile (' + response.status + ')');
    const blob = await response.blob();
    return blobToDataUrl(blob);
  }
  async function exportResolveAssetFromDbKey(dbKey, dbCache){
    if(!dbKey || !window.LK_ASSET_BLOBS) return null;
    if(dbCache && dbCache.has(dbKey)) return dbCache.get(dbKey);
    const blobUrl = await window.LK_ASSET_BLOBS.getUrl(dbKey);
    const dataUrl = await blobUrlToDataUrl(blobUrl);
    if(dbCache) dbCache.set(dbKey, dataUrl);
    return dataUrl;
  }
  function findAssetLibraryEntry(library, source){
    if(!Array.isArray(library) || !source || typeof source !== 'object') return null;
    const candidates = [
      source.key,
      source.id,
      source.dbKey,
      source.asset && source.asset.key,
      source.asset && source.asset.dbKey,
      source.asset && source.asset.id,
    ];
    for(const candidate of candidates){
      if(!candidate) continue;
      for(const item of library){
        if(!item) continue;
        if(item.key === candidate || item.id === candidate || item.dbKey === candidate || item.name === candidate) return item;
      }
    }
    return null;
  }
  async function normalizePlayableAssetRef(owner, prop, label, dbCache, library, warnings){
    if(!owner || !Object.prototype.hasOwnProperty.call(owner, prop)) return;
    const fallbackName = owner.name || owner.id || label || 'asset';
    const meta = {
      src: owner[prop],
      dbKey: owner.dbKey || (owner.asset && owner.asset.dbKey),
      key: owner.key || owner.id || (owner.asset && owner.asset.key),
    };
    if((!meta.src || /^blob:/i.test(meta.src)) && !meta.dbKey){
      const lib = findAssetLibraryEntry(library, meta);
      if(lib){
        if(lib.src && !/^blob:/i.test(lib.src)) meta.src = lib.src;
        if(lib.dbKey) meta.dbKey = lib.dbKey;
      }
    }
    if(typeof meta.src === 'string' && /^blob:/i.test(meta.src)){
      meta.dbKey = meta.dbKey || meta.src.slice(5);
      meta.src = null;
    }
    let resolved = meta.src || null;
    if(!resolved && meta.dbKey){
      try {
        resolved = await exportResolveAssetFromDbKey(meta.dbKey, dbCache);
      } catch(err) {
        warnings.push('Errore nell\'inclusione asset ' + fallbackName + ': ' + (err.message || 'blob mancante'));
        return;
      }
    }
    if(!resolved){
      if(typeof meta.src === 'string' && !/^blob:/i.test(meta.src)) return;
      warnings.push('Asset ' + fallbackName + ' non esportabile: nessuna sorgente recuperabile');
      return;
    }
    owner[prop] = resolved;
    if(owner.dbKey) owner.dbKey = null;
    if(owner.asset && owner.asset.dbKey) owner.asset.dbKey = null;
  }
  async function normalizePlayableObjectBlobs(obj, prefix, dbCache, library, warnings, depth){
    if(!obj || typeof obj !== 'object') return;
    if((depth || 0) > 8) return;
    if(Array.isArray(obj)){
      for(let i = 0; i < obj.length; i++){
        if(obj[i] && typeof obj[i] === 'object'){
          await normalizePlayableObjectBlobs(obj[i], prefix + '[' + i + ']', dbCache, library, warnings, (depth || 0) + 1);
        }
      }
      return;
    }
    if(typeof obj.src === 'string' && /^blob:/i.test(obj.src)){
      await normalizePlayableAssetRef(obj, 'src', prefix + '.src', dbCache, library, warnings);
    }
    for(const key in obj){
      if(!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      if(!obj[key] || typeof obj[key] !== 'object') continue;
      await normalizePlayableObjectBlobs(obj[key], prefix + '.' + key, dbCache, library, warnings, (depth || 0) + 1);
    }
  }
  async function preparePlayableProject(project){
    const prepared = JSON.parse(JSON.stringify(project || {}));
    const scene = prepared.scene || prepared;
    const warnings = [];
    const dbCache = new Map();
    const library = assetLibraryLoad();
  
    if(scene && scene.player && typeof scene.player.modelSrc === 'string'){
      await normalizePlayableAssetRef(scene.player, 'modelSrc', 'player.modelSrc', dbCache, library, warnings);
    }
    if(Array.isArray(scene && scene.added)){
      for(const entry of scene.added){
        if(entry && entry.kind === 'glb'){
          await normalizePlayableAssetRef(entry, 'src', 'added.glb' + (entry.name ? ' "' + entry.name + '"' : ''), dbCache, library, warnings);
        }
      }
    }
    if(scene && scene.player && scene.player.engineAudio && scene.player.engineAudio.set){
      await normalizePlayableObjectBlobs(scene.player.engineAudio.set, 'player.engineAudio.set', dbCache, library, warnings, 0);
    }
    return {
      project: prepared,
      warnings,
    };
  }
  function normalizePlayableProject(project, fallbackName){
    const src = project || {};
    const meta = src.meta || currentTrackMeta();
    const trackId = src.meta && src.meta.trackId ? src.meta.trackId : slugifyTrackName(fallbackName || meta.trackName || meta.levelName || 'track');
    const trackName = (src.meta && (src.meta.trackName || src.meta.levelName)) || fallbackName || 'track';
    return {
      format: 'LKEP',
      version: src.version || 1,
      game: src.game || 'Lot King Engine Builder & Car Drift Game',
      name: src.name || 'Lot King Engine Builder Editor Project',
      savedAt: src.savedAt || new Date().toISOString(),
      meta: Object.assign({}, meta, {trackId, trackName}),
      scene: src.scene || src,
    };
  }
  const PLAYABLE_ZIP_VENDOR_LIBS = [
    {remote: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', local: 'vendor/three.min.js'},
    {remote: 'https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js', local: 'vendor/cannon.min.js'},
    {remote: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', local: 'vendor/GLTFLoader.js'},
    {remote: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/objects/Lensflare.js', local: 'vendor/Lensflare.js'},
    {remote: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js', local: 'vendor/EffectComposer.js'},
    {remote: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js', local: 'vendor/RenderPass.js'},
    {remote: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js', local: 'vendor/CopyShader.js'},
    {remote: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js', local: 'vendor/ShaderPass.js'},
    {remote: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/BokehShader.js', local: 'vendor/BokehShader.js'},
    {remote: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/BokehPass.js', local: 'vendor/BokehPass.js'},
  ];
  const PLAYABLE_ZIP_RUNTIME_TEMPLATE = 'drift-parking-lot.html';
  const PLAYABLE_ZIP_STATIC_FILES = [
    'css/lot-king.css',
    'js/lot-king.js',
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
    script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    const p = new Promise((resolve, reject) => {
      script.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip non disponibile dopo il caricamento'));
      script.onerror = () => reject(new Error('Impossibile caricare JSZip dal CDN'));
    });
    document.head.appendChild(script);
    ensureJsZipForExport._pending = p;
    return p;
  }
  function exportAssetUrl(path){
    return new URL(path, location.href).href;
  }
  function normalizeExportPath(path){
    return (path || '').replace(/^\.\/+/, '');
  }
  function isRelativePlayableAssetPath(path){
    return typeof path === 'string' &&
      !/^(?:\w+:)?\/\//.test(path) &&
      !/^data:/.test(path) &&
      !/^blob:/.test(path) &&
      (path.indexOf('models/') === 0 || path.indexOf('media/') === 0 || path.indexOf('musics/') === 0);
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
    PLAYABLE_ZIP_STATIC_FILES.forEach(p => paths.add(p));
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
      if(!raw || raw === PLAYABLE_ZIP_RUNTIME_TEMPLATE) continue;
      if(raw.startsWith('js/editor/loader.js')) continue;
      if(isRelativePlayableAssetPath(raw) || raw.startsWith('js/') || raw.startsWith('css/')){
        refs.add(raw);
      }
    }
    return Array.from(refs);
  }
  function rewriteRuntimeHtmlForZip(html){
    let out = html;
    out = out.replace(/<button[^>]+id=["']editorBtn["'][^>]*>[\s\S]*?<\/button>/gi, '');
    PLAYABLE_ZIP_VENDOR_LIBS.forEach(item => {
      const quoted1 = `src="${item.remote}"`;
      const quoted2 = `src='${item.remote}'`;
      const href1 = `href="${item.remote}"`;
      const href2 = `href='${item.remote}'`;
      out = out.replaceAll(quoted1, `src="${item.local}"`);
      out = out.replaceAll(quoted2, `src='${item.local}'`);
      out = out.replaceAll(href1, `href="${item.local}"`);
      out = out.replaceAll(href2, `href='${item.local}'`);
    });
    return out.replace(/<script[^>]+src=["'][^"']*js\/editor\/loader\.js["'][^>]*><\/script>\s*/g, '');
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
    setProgress(4, 'Caricamento template runtime');
    const runtimeHtml = rewriteRuntimeHtmlForZip(await (await fetch(exportAssetUrl(PLAYABLE_ZIP_RUNTIME_TEMPLATE)).then(r => {
      if(!r.ok) throw new Error('template runtime non trovato');
      return r.text();
    })));
    const runtimeRefs = extractLocalRuntimeRefs(runtimeHtml);
    const referencedAssets = collectReferencedAssetsFromBundle(bundle);
    const totalToPack = 1 + runtimeRefs.length + PLAYABLE_ZIP_VENDOR_LIBS.length + referencedAssets.length + 1;
    let doneCount = 0;
    const done = () => Math.round((++doneCount / totalToPack) * 100);
    zip.file('index.html', buildPlayableBootstrapHtml(bundle));
    zip.file('README.txt',
      [
        'Lot King Engine Builder playable package',
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
    zip.file(PLAYABLE_ZIP_RUNTIME_TEMPLATE, runtimeHtml);
    for(const ref of runtimeRefs){
      await addFileToZip(zip, ref, ref, warnings, ref.startsWith('js/') || ref.startsWith('css/') || /^js\/(runtime|engine)\//.test(ref));
      setProgress(done(), 'Copiamento risorse runtime (' + doneCount + '/' + (totalToPack - 1) + ')');
    }
    for(const lib of PLAYABLE_ZIP_VENDOR_LIBS){
      await addFileToZip(zip, lib.remote, lib.local, warnings, true);
      setProgress(done(), 'Copiamento vendor (' + doneCount + '/' + (totalToPack - 1) + ')');
    }
    for(const asset of referencedAssets){
      await addFileToZip(zip, asset, asset, warnings, false);
      setProgress(done(), 'Copiamento asset (' + doneCount + '/' + (totalToPack - 1) + ')');
    }
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
  function getCurrentPlayableProject(){
    const sceneData = STORE.collect(GAME);
    return STORE.exportProject ? STORE.exportProject(sceneData, currentTrackMeta()) : {format:'LKEP', meta:currentTrackMeta(), scene:sceneData};
  }
  async function buildPlayableBundle(levelProjects, runtimePath, levelNameHint){
    const projects = Array.isArray(levelProjects) ? levelProjects : (levelProjects ? [levelProjects] : []);
    if(!projects.length) throw new Error('Nessun livello da esportare');
  
    const now = new Date().toISOString();
    const warnings = [];
    const levels = [];
    const usedIds = new Set();
  
    const orderedProjects = projects
      .slice()
      .sort((a, b) => {
        const aOrder = Number.isFinite(Number(a && a.__lkExportLevelOrder))
          ? Number(a && a.__lkExportLevelOrder)
          : Number.MAX_SAFE_INTEGER;
        const bOrder = Number.isFinite(Number(b && b.__lkExportLevelOrder))
          ? Number(b && b.__lkExportLevelOrder)
          : Number.MAX_SAFE_INTEGER;
        const av = Number.isFinite(aOrder) ? aOrder : Number.MAX_SAFE_INTEGER;
        const bv = Number.isFinite(bOrder) ? bOrder : Number.MAX_SAFE_INTEGER;
        if(av !== bv) return av - bv;
        const aLabel = String((a && a.__lkExportLevelName) || (a && a.meta && (a.meta.trackName || a.meta.levelName)) || (a && a.id) || '');
        const bLabel = String((b && b.__lkExportLevelName) || (b && b.meta && (b.meta.trackName || b.meta.levelName)) || (b && b.id) || '');
        if(aLabel !== bLabel) return aLabel.localeCompare(bLabel);
        return 0;
      });
    const orderedSources = orderedProjects.length ? orderedProjects : projects;
    const primaryProject = orderedSources.find(item => item && item.__lkExportLevelPrimary === true) || orderedSources[0] || null;
  
    for(let i = 0; i < orderedSources.length; i += 1){
      const sourceProject = orderedSources[i];
      if(!sourceProject || (!sourceProject.scene && !sourceProject.meta && !sourceProject.version)) continue;
      const sourceOrder = Number.isFinite(Number(sourceProject.__lkExportLevelOrder)) ? Number(sourceProject.__lkExportLevelOrder) : i;
      const exportMeta = {};
      if(sourceProject.__lkExportLevelId && String(sourceProject.__lkExportLevelId).trim()){
        exportMeta.trackId = String(sourceProject.__lkExportLevelId).trim();
      }
      if(sourceProject.__lkExportLevelName && String(sourceProject.__lkExportLevelName).trim()){
        exportMeta.trackName = String(sourceProject.__lkExportLevelName).trim();
      }
      const normalizedSource = Object.assign({}, sourceProject, {
        meta: Object.assign({}, sourceProject.meta || {}, exportMeta),
      });
  
      const normalizedProject = await preparePlayableProject(normalizePlayableProject(
        normalizedSource,
        i === 0 ? (levelNameHint || null) : null
      ));
      const finalProject = normalizedProject.project;
      const meta = finalProject.meta || {};
      let levelId = sourceProject.__lkExportLevelId && String(sourceProject.__lkExportLevelId).trim()
        ? String(sourceProject.__lkExportLevelId).trim()
        : (sourceProject.id ? String(sourceProject.id).trim() : null);
      if(!levelId){
        levelId = meta.trackId || slugifyTrackName((i === 0 ? levelNameHint : null) || meta.trackName || meta.levelName || 'track');
      }
      const baseId = levelId;
      let n = 2;
      while(usedIds.has(levelId)){
        levelId = baseId + '-' + n;
        n += 1;
      }
      usedIds.add(levelId);
      if(Array.isArray(normalizedProject.warnings)) warnings.push(...normalizedProject.warnings);
  
      levels.push({
        id: levelId,
        name: meta.trackName || meta.levelName || baseId || 'track',
        description: 'Playable track export',
        savedAt: finalProject.savedAt || now,
        project: finalProject,
        __lkExportOrder: i,
        __lkExportSourceOrder: sourceOrder,
        __lkExportPrimary: primaryProject && sourceProject === primaryProject,
      });
    }
  
    if(!levels.length) throw new Error('Nessun livello valido da esportare');
    const explicitActiveLevel = levels.find(item => item.__lkExportPrimary);
    const activeProject = explicitActiveLevel || levels[0];
  
    return {
      format: 'LKPKG',
      version: 1,
      game: 'Lot King Engine Builder & Car Drift Game',
      createdAt: now,
      exportMode: 'playable-track',
      runtime: runtimePath || 'drift-parking-lot.html',
      activeId: activeProject ? activeProject.id : (levels[0] ? levels[0].id : null),
      warnings: warnings,
      levels,
    };
  }
  function buildPlayableHtml(bundle){
    return buildPlayableBootstrapHtml(bundle);
  }
  function buildPlayableBootstrapHtml(bundle){
    const payload = safeJsonForInlineScript(bundle);
    const runtime = bundle && bundle.runtime ? bundle.runtime : PLAYABLE_ZIP_RUNTIME_TEMPLATE;
    return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LOT KING ENGINE BUILDER — Playable Track</title>
  </head>
  <body>
  <p>Loading playable Lot King Engine Builder level...</p>
  <script>
  (function(){
    'use strict';
    const PACKAGE = ${payload};
    const KEY_SCENE = 'lotking.scene.v1';
    const KEY_LEVELS = 'lotking.levels.v1';
    const KEY_PREFIX = 'lotking.level.';
  
    function safeDate(value){
      return value || new Date().toISOString();
    }
    function isObject(v){ return v && typeof v === 'object'; }
    function nId(value){ return value == null ? '' : String(value); }
    function cleanupOldLevels(levelIds){
      const keep = Object.create(null);
      levelIds.forEach(id => {
        const k = String(id || '').trim();
        if(k) keep[k] = true;
      });
      Object.keys(localStorage).forEach(key => {
        if(key.indexOf(KEY_PREFIX) !== 0) return;
        const id = key.slice(KEY_PREFIX.length);
        if(id && !keep[id]) localStorage.removeItem(key);
      });
    }
  
    function writeProject(key, project){
      localStorage.setItem(key, JSON.stringify(project));
    }
    function writeIndex(levels, activeId){
      writeProject(KEY_LEVELS, {
        activeId: activeId || (levels[0] ? levels[0].id : null),
        levels: levels.map(l => ({
          id: l.id,
          name: l.name || 'track',
          savedAt: safeDate(l.savedAt),
          __lkExportPrimary: !!l.__lkExportPrimary,
          __lkExportOrder: Number.isFinite(Number(l.__lkExportSourceOrder))
            ? Number(l.__lkExportSourceOrder)
            : (Number.isFinite(Number(l.__lkExportOrder)) ? Number(l.__lkExportOrder) : undefined),
        })),
      });
    }
  
      try {
        if(!isObject(PACKAGE) || !Array.isArray(PACKAGE.levels) || !PACKAGE.levels.length){
          throw new Error('package vuoto');
        }
        cleanupOldLevels(PACKAGE.levels.map(level => level && level.id).filter(level => level));
        const index = {
          activeId: PACKAGE.activeId || PACKAGE.levels[0].id,
          levels: [],
        };
        for(const level of PACKAGE.levels){
          if(!isObject(level) || !level.id || !level.project) continue;
          const project = level.project;
          writeProject(KEY_PREFIX + level.id, project);
          index.levels.push({
            id: level.id,
            name: level.name || (project.meta && (project.meta.trackName || project.meta.levelName)) || 'track',
            savedAt: safeDate(level.savedAt || project.savedAt),
            __lkExportPrimary: !!level.__lkExportPrimary,
            __lkExportOrder: Number.isFinite(Number(level.__lkExportSourceOrder))
              ? Number(level.__lkExportSourceOrder)
              : (Number.isFinite(Number(level.__lkExportOrder)) ? Number(level.__lkExportOrder) : undefined),
          });
        }
        if(!index.levels.length) throw new Error('nessun livello nel pacchetto');
        if(index.activeId && !index.levels.some(l => nId(l.id) === nId(index.activeId))){
          index.activeId = index.levels[0].id;
        }
        index.activeId = String(index.activeId || index.levels[0].id || '').trim();
        writeIndex(index.levels, index.activeId);
        writeProject(KEY_SCENE, (function(){
          for(const level of index.levels){
            if(nId(level.id) === nId(index.activeId)){
              const raw = localStorage.getItem(KEY_PREFIX + level.id);
              if(raw) return JSON.parse(raw);
            }
          }
          return JSON.parse(localStorage.getItem(KEY_PREFIX + index.levels[0].id));
        })());
        try { sessionStorage.setItem('lk.autolaunch', String(index.activeId || '')); } catch(err){}
        try { sessionStorage.setItem('lk.playableActive', String(index.activeId || '')); } catch(err){}
        try {
          var _act = index.levels.filter(function(l){ return nId(l.id) === nId(index.activeId); })[0];
          console.log('[LotKing bootstrap] activeId=' + index.activeId + ' → "' + (_act ? _act.name : '?') + '"; livelli: ' + index.levels.map(function(l){ return l.name + '[' + l.id + ']'; }).join(', '));
        } catch(e){}
        location.replace(${JSON.stringify(runtime)});
    } catch(err){
    document.body.textContent = 'Unable to start exported level: ' + err.message;
    throw err;
  }
  })();
  </script>
  </body>
  </html>`;
  }
  function exportPlayableProject(project, projectName){
    const progressToken = beginStatusWork('Export playable HTML', 'Preparazione pacchetto', 'loading');
    updateStatusWork(progressToken, 12, 'Costruzione bundle', 'loading');
    Promise.resolve().then(() => buildPlayableBundle(project, 'drift-parking-lot.html', projectName)).then(bundle => {
      updateStatusWork(progressToken, 60, 'Creazione documento HTML', 'loading');
      const level = bundle.levels[0];
      const html = buildPlayableHtml(bundle);
      updateStatusWork(progressToken, 80, 'Avvio download', 'loading');
      const blob = new Blob([html], {type: 'text/html'});
      const a = document.createElement('a');
      const warnings = bundle && Array.isArray(bundle.warnings) ? bundle.warnings : [];
      a.href = URL.createObjectURL(blob);
      a.download = 'lot-king-' + slugifyTrackName((level && level.name) || 'track') + '-playable.html';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
      finishStatusWork(progressToken, 'Export HTML pronto', 'File pronto per il download', 'success');
      status('PLAYABLE export created' + (warnings.length ? ' con avvisi: ' + warnings.join(' · ') : ' ✓'));
    }).catch(err => {
      console.error('Playable export failed', err);
      finishStatusWork(progressToken, 'Export HTML fallito', (err && err.message) ? err.message : 'Errore sconosciuto', 'error');
      status('⚠ Playable export failed: ' + err.message);
    });
  }
  async function exportCurrentPlayableProjectZip(){
    const progressToken = beginStatusWork('Export playable ZIP', 'Selezione livelli', 'loading');
    const LV = levelsApi();
    const list = LV && LV.list ? LV.list() : [];
    const activeId = LV && LV.activeId ? LV.activeId() : null;
    const selectable = Array.isArray(list) ? list : [];
    let projects = null;
    if(selectable.length){
      const selectedLevelProjects = await pickPlayableLevelsForZipExport(selectable, activeId);
      if(selectedLevelProjects === null){
        finishStatusWork(progressToken, 'Export ZIP annullato', 'Operazione annullata', 'warning');
        return;
      }
      if(!selectedLevelProjects.length){
        finishStatusWork(progressToken, 'Export ZIP annullato', 'Nessun livello selezionato', 'warning');
        return;
      }
      projects = selectedLevelProjects;
    } else {
      projects = [getCurrentPlayableProject()];
    }
  
    if(!projects.length){
      finishStatusWork(progressToken, 'Export ZIP annullato', 'Nessun livello da esportare', 'warning');
      return;
    }
    const bundleHint = projects.length === 1 && projects[0] && projects[0].meta ? (projects[0].meta.trackName || projects[0].meta.levelName) : null;
    try {
      updateStatusWork(progressToken, 18, 'Costruzione pacchetto livelli', 'loading');
      const bundle = await buildPlayableBundle(projects, PLAYABLE_ZIP_RUNTIME_TEMPLATE, bundleHint);
      // diagnostica: cosa finisce DAVVERO nel pacchetto (id/nome/#entità per livello)
      try {
        const diag = (bundle.levels || []).map(l => {
          const sc = l.project && l.project.scene || {};
          const nAdded = Array.isArray(sc.added) ? sc.added.length : 0;
          const nDeleted = Array.isArray(sc.deleted) ? sc.deleted.length : 0;
          return (l.id === bundle.activeId ? '▶ ' : '  ') + l.name + ' [' + l.id + '] · +' + nAdded + ' entità, -' + nDeleted + ' builtin';
        });
        console.log('[LotKing export] activeId=' + bundle.activeId + '\n' + diag.join('\n'));
        status('Export: avvio ▶ ' + (bundle.levels.find(l => l.id === bundle.activeId) || {}).name + ' · ' + bundle.levels.length + ' livello/i (dettagli in console F12)');
      } catch(diagErr){}
      const warnings = await buildPlayableProjectZip(bundle, (pct, step, tone) => {
        if(tone === 'error') return;
        updateStatusWork(progressToken, pct, step, 'loading');
      });
      finishStatusWork(progressToken, 'Export ZIP pronto', 'Pacchetto con ' + bundle.levels.length + ' livello/i pronto', 'success');
      status('PLAYABLE ZIP export created (' + bundle.levels.length + ' livelli)' + (warnings.length ? ' con avvisi: ' + warnings.join(' · ') : ' ✓'));
    } catch(err){
      console.error('Playable ZIP export failed', err);
      finishStatusWork(progressToken, 'Export ZIP fallito', (err && err.message) ? err.message : 'Errore sconosciuto', 'error');
      status('⚠ Playable ZIP export failed: ' + err.message);
    }
  }
  async function pickPlayableLevelsForZipExport(levels, activeId){
    const overlay = $('#lkConfirmOverlay');
    const title = $('#lkConfirmTitle');
    const message = $('#lkConfirmMessage');
    const ok = $('#lkConfirmOk');
    const cancel = $('#lkConfirmCancel');
    if(!overlay || !title || !message || !ok || !cancel) return null;
  
    const list = Array.isArray(levels) ? levels.slice() : [];
    if(!list.length) return null;
  
    const activeKey = activeId != null ? String(activeId) : '';
    const nameOf = level => level.name || (level.meta && (level.meta.trackName || level.meta.levelName)) || level.id || 'Livello';
  
    // preselezione: livello attivo (o il primo). E' anche il livello di avvio.
    const activeEntry = list.find(l => String(l.id) === activeKey) || (list.some(l => l.active) ? list.find(l => l.active) : list[0]);
    const primaryDefault = activeEntry && activeEntry.id ? String(activeEntry.id) : (list[0] && list[0].id ? String(list[0].id) : '');
    const selected = new Set();
    if(primaryDefault) selected.add(primaryDefault);
    let primaryId = primaryDefault;
  
    const oldInput = overlay.querySelector('.lk-confirm-input');
    if(oldInput) oldInput.remove();
    const oldPicker = overlay.querySelector('.lk-playable-level-picker');
    if(oldPicker) oldPicker.remove();
  
    title.textContent = 'Export livelli giocabili (ZIP)';
    ok.textContent = '⇩ Esporta ZIP';
    ok.classList.toggle('danger', false);
    message.textContent = '';
  
    const picker = document.createElement('div');
    picker.className = 'lk-playable-level-picker';
  
    const controls = document.createElement('div');
    controls.className = 'lk-playable-level-picker-controls';
  
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'lk-playable-level-picker-toggle';
    toggle.textContent = 'Seleziona tutto';
  
    const selectCount = document.createElement('div');
    selectCount.className = 'lk-playable-level-picker-count';
  
    // riga: [checkbox includi] [radio avvio] [nome + badge]
    const buildRows = [];   // {cb, radio, id}
    const rows = [];        // solo le checkbox (compat con la logica sotto)
  
    const updateCounters = () => {
      const totalChecked = rows.filter(r => r.checked).length;
      const allChecked = totalChecked === rows.length;
      toggle.textContent = allChecked ? 'Deseleziona tutto' : 'Seleziona tutto';
      selectCount.textContent = totalChecked + ' / ' + rows.length + ' livelli · avvio: ' +
        (primaryId ? (nameOf(list.find(l => String(l.id) === primaryId) || {})) : '—');
      // la radio "avvio" ha senso solo su livelli inclusi nell'export
      for(const r of buildRows){
        const on = r.cb.checked;
        r.radio.disabled = !on;
        r.row.classList.toggle('off', !on);
        r.row.classList.toggle('primary', on && String(r.id) === primaryId);
      }
    };
    const ensurePrimaryValid = () => {
      const checked = buildRows.filter(r => r.cb.checked).map(r => String(r.id));
      if(!checked.length){ primaryId = ''; return; }
      if(!checked.includes(primaryId)) primaryId = checked[0];   // il primario deve essere incluso
      for(const r of buildRows) r.radio.checked = String(r.id) === primaryId;
    };
  
    const rowsWrapper = document.createElement('div');
    rowsWrapper.className = 'lk-playable-level-picker-rows';
    for(const level of list){
      const id = level.id || '';
      const row = document.createElement('div');
      row.className = 'lk-playable-level-picker-row';
  
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'lk-playable-level-picker-check';
      cb.value = id;
      cb.checked = !!(id && selected.has(String(id)));
      cb.title = 'Includi questo livello nel pacchetto';
  
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'lk-export-primary';
      radio.className = 'lk-playable-level-picker-radio';
      radio.value = id;
      radio.checked = String(id) === primaryId;
      radio.title = 'Livello di avvio (parte per primo quando apri il pacchetto)';
  
      const label = document.createElement('span');
      label.className = 'lk-playable-level-picker-label';
      label.textContent = nameOf(level);
      if(level.active){
        const badge = document.createElement('span');
        badge.className = 'lk-playable-level-picker-badge';
        badge.textContent = 'ATTIVO';
        label.appendChild(badge);
      }
  
      cb.addEventListener('change', e => {
        const multi = e && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey);
        if(cb.checked && !multi){
          buildRows.forEach(other => { if(other.cb !== cb) other.cb.checked = false; });
        }
        ensurePrimaryValid();
        updateCounters();
      });
      radio.addEventListener('change', () => {
        if(!cb.checked) cb.checked = true;   // scegliere l'avvio implica includerlo
        primaryId = String(id);
        ensurePrimaryValid();
        updateCounters();
      });
  
      buildRows.push({cb, radio, row, id});
      rows.push(cb);
      row.appendChild(cb);
      row.appendChild(radio);
      row.appendChild(label);
      rowsWrapper.appendChild(row);
    }
  
    toggle.addEventListener('click', () => {
      const allChecked = rows.every(cb => cb.checked);
      rows.forEach(cb => { cb.checked = !allChecked; });
      ensurePrimaryValid();
      updateCounters();
    });
  
    const hint = document.createElement('div');
    hint.className = 'lk-playable-level-picker-hint';
    hint.textContent = 'Spunta i livelli da mettere nel pacchetto. Click su una casella = selezione singola; Ctrl/Cmd = multi. Il pallino ▶ indica il livello di avvio.';
  
    controls.appendChild(toggle);
    controls.appendChild(selectCount);
    picker.appendChild(controls);
    picker.appendChild(rowsWrapper);
    picker.appendChild(hint);
    message.appendChild(picker);
    ensurePrimaryValid();
    updateCounters();
  
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
  
    return new Promise(resolve => {
      const close = value => {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        picker.remove();
        ok.removeEventListener('click', yes);
        cancel.removeEventListener('click', no);
        overlay.removeEventListener('pointerdown', outside);
        removeEventListener('keydown', key, true);
        resolve(value);
      };
      const yes = () => {
        // ordine finale: livello di avvio per primo (ordine 0 = primario), poi gli
        // altri inclusi in ordine di lista. Cosi' bundle.activeId = il livello scelto.
        ensurePrimaryValid();
        const checkedIds = buildRows.filter(r => r.cb.checked).map(r => String(r.id).trim()).filter(Boolean);
        if(!checkedIds.length){
          status('⚠ Seleziona almeno un livello');
          return;
        }
        const orderedIds = [primaryId].concat(checkedIds.filter(id => id !== primaryId))
          .filter((id, i, arr) => id && arr.indexOf(id) === i);
        const LV = levelsApi();
        // il livello attivo nell'editor ha le modifiche in KEY_SCENE (copia di lavoro):
        // per quello usiamo la scena LIVE, non lo slot salvato che puo' essere stale
        const activeLevelId = LV && LV.activeId ? String(LV.activeId() || '') : '';
        const picked = [];
        let order = 0;
        for(const levelId of orderedIds){
          const listEntry = list.find(item => String(item.id) === levelId);
          const isActiveLive = activeLevelId && String(levelId) === activeLevelId;
          let project = isActiveLive ? getCurrentPlayableProject() : (LV && LV.get ? LV.get(levelId) : null);
          if(!project && LV && LV.get) project = LV.get(levelId);   // fallback allo slot salvato
          if(!project){
            status('⚠ Livello non trovato: ' + levelId);
            continue;
          }
          if(project.scene || project.meta || project.version){
            const selectedName = listEntry
              ? (listEntry.name || (listEntry.meta && (listEntry.meta.trackName || listEntry.meta.levelName)) || levelId)
              : (project.meta && (project.meta.trackName || project.meta.levelName) || levelId);
            picked.push(Object.assign({}, project, {
              __lkExportLevelId: levelId,
              __lkExportLevelName: selectedName,
              __lkExportLevelOrder: order,
              __lkExportLevelPrimary: order === 0,
            }));
            order += 1;
          }
        }
        close(picked.length ? picked : null);
      };
      const no = () => close(null);
      const outside = e => { if(e.target === overlay) close(null); };
      const key = e => {
        if(e.key === 'Escape'){ e.preventDefault(); close(null); }
        if(e.key === 'Enter'){ e.preventDefault(); yes(); }
      };
  
      ok.addEventListener('click', yes);
      cancel.addEventListener('click', no);
      overlay.addEventListener('pointerdown', outside);
      addEventListener('keydown', key, true);
      cancel.focus();
    });
  }
  function exportCurrentPlayableProject(){
    const LV = levelsApi();
    const activeId = LV && LV.activeId ? LV.activeId() : null;
    const active = LV && activeId && LV.get ? LV.get(activeId) : null;
    if(active){
      exportPlayableProject(active, active.meta && (active.meta.trackName || active.meta.levelName));
      return;
    }
    const sceneData = STORE.collect(GAME);
    const project = STORE.exportProject ? STORE.exportProject(sceneData, currentTrackMeta()) : {format:'LKEP', meta:currentTrackMeta(), scene:sceneData};
    exportPlayableProject(project, currentTrackMeta().trackName);
  }
  
  return Object.freeze({
    getCurrentPlayableProject,
    buildPlayableBundle,
    buildPlayableHtml,
    exportPlayableProject,
    exportCurrentPlayableProjectZip,
    exportCurrentPlayableProject,
    pickPlayableLevelsForZipExport,
  });
}

window.LK_EDITOR_PLAYABLE_EXPORT = Object.freeze({create});
})();
