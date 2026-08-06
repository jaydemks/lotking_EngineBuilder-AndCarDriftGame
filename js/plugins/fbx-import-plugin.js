/* =========================================================
   LOT KING - FBX to GLB asset importer plugin

   This is intentionally a complete plugin example: it declares capabilities,
   commands and menu UI, then contributes an assetImporter extension. The core
   editor only sees the resulting GLB File and stays format-agnostic.
   ========================================================= */
(function(){
'use strict';

const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1WQAAAABJRU5ErkJggg==';
const IMAGE_RE = /\.(?:png|jpe?g|webp|gif|bmp|tga)$/i;
const MODEL_RE = /\.(?:fbx|glb|gltf)$/i;

function filePath(file){
  return String(file && (file.webkitRelativePath || file.name) || '');
}

function normalizePath(value){
  let result = String(value || '').trim().replace(/\\/g, '/').replace(/[?#].*$/, '');
  try { result = decodeURIComponent(result); } catch(err){}
  result = result.replace(/^file:\/\//i, '').replace(/^[a-z]:\//i, '').replace(/^\.\//, '').replace(/^\/+/, '');
  return result.toLowerCase();
}

function basename(value){
  const clean = normalizePath(value);
  return clean.slice(clean.lastIndexOf('/') + 1);
}

function dependencyIndex(files){
  const exact = new Map();
  const byName = new Map();
  Array.from(files || []).forEach(file => {
    const path = normalizePath(filePath(file));
    const name = basename(file && file.name);
    if(path) exact.set(path, file);
    if(name){
      if(!byName.has(name)) byName.set(name, []);
      byName.get(name).push(file);
    }
  });
  return {exact, byName};
}

function resolveDependency(index, request){
  const wanted = normalizePath(request);
  if(!wanted) return null;
  if(index.exact.has(wanted)) return index.exact.get(wanted);
  for(const [path, file] of index.exact){
    if(path.endsWith('/' + wanted) || wanted.endsWith('/' + path)) return file;
  }
  const matches = index.byName.get(basename(wanted)) || [];
  return matches.length ? matches[0] : null;
}

function timeout(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function convertFbx(file, dependencyFiles, context){
  const THREE = context && context.THREE || window.THREE;
  if(!THREE || !THREE.FBXLoader || !THREE.GLTFExporter){
    throw new Error('FBX plugin requires FBXLoader and GLTFExporter in the pinned Three.js bundle');
  }

  const index = dependencyIndex(dependencyFiles);
  const objectUrls = new Map();
  const usedFiles = new Set();
  const warnings = [];
  let dependencyLoads = 0;
  let dependenciesSettled = false;
  let settleDependencies;
  const dependenciesReady = new Promise(resolve => { settleDependencies = resolve; });
  const manager = new THREE.LoadingManager(() => {
    dependenciesSettled = true;
    settleDependencies();
  });
  if(THREE.TGALoader) manager.addHandler(/\.tga$/i, new THREE.TGALoader(manager));
  manager.onStart = () => { dependencyLoads++; };
  manager.onError = url => { warnings.push('Texture non caricata: ' + basename(url)); };
  manager.setURLModifier(url => {
    if(/^(?:data:|blob:)/i.test(url)) return url;
    const dependency = resolveDependency(index, url);
    if(!dependency){
      const label = basename(url) || String(url || 'texture');
      if(!warnings.includes('Texture mancante: ' + label)) warnings.push('Texture mancante: ' + label);
      return IMAGE_RE.test(label) ? TRANSPARENT_PIXEL : url;
    }
    usedFiles.add(dependency);
    if(!objectUrls.has(dependency)) objectUrls.set(dependency, URL.createObjectURL(dependency));
    return objectUrls.get(dependency);
  });

  try {
    if(context && context.progress) context.progress(file.name, 12, 'Parsing FBX hierarchy');
    const buffer = await file.arrayBuffer();
    const root = new THREE.FBXLoader(manager).parse(buffer, '');
    if(dependencyLoads && !dependenciesSettled){
      if(context && context.progress) context.progress(file.name, 38, 'Loading linked textures');
      await Promise.race([dependenciesReady, timeout(30000).then(() => {
        warnings.push('Timeout durante il caricamento di alcune texture');
      })]);
    }
    if(context && context.progress) context.progress(file.name, 62, 'Converting scene and animations to GLB');
    const animations = Array.isArray(root.animations) ? root.animations.filter(Boolean) : [];
    const result = await new THREE.GLTFExporter().parseAsync(root, {
      binary:true,
      animations,
      onlyVisible:false,
    });
    if(!(result instanceof ArrayBuffer)) throw new Error('GLTFExporter did not produce binary GLB data');
    const name = String(file.name || 'model.fbx').replace(/\.fbx$/i, '') + '.glb';
    const converted = new File([result], name, {type:'model/gltf-binary', lastModified:file.lastModified || Date.now()});
    Object.defineProperties(converted, {
      __lkImportSource:{value:file.name || name},
      __lkSourceFormat:{value:'fbx'},
      __lkSourceFile:{value:file},
      __lkSourceDependencies:{value:Array.from(usedFiles)},
      __lkConversionWarnings:{value:warnings.slice()},
    });
    if(context && context.progress) context.progress(file.name, 84, 'GLB conversion complete');
    return {file:converted, usedFiles, warnings};
  } finally {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
  }
}

function sourceDependencyIndex(dependencies){
  const exact=new Map(),byName=new Map();
  Array.from(dependencies||[]).forEach(item=>{
    const path=normalizePath(item&&item.path||item&&item.name);
    const name=basename(path);
    if(path&&item&&item.url)exact.set(path,item.url);
    if(name&&item&&item.url&&!byName.has(name))byName.set(name,item.url);
  });
  return {exact,byName};
}

function resolveDependencyUrl(index,request){
  const wanted=normalizePath(request);
  if(!wanted)return null;
  if(index.exact.has(wanted))return index.exact.get(wanted);
  for(const [path,url] of index.exact){
    if(path.endsWith('/'+wanted)||wanted.endsWith('/'+path))return url;
  }
  return index.byName.get(basename(wanted))||null;
}

async function loadFbxSource(asset,context){
  const THREE=context&&context.THREE||window.THREE;
  const blobs=context&&context.assetBlobs||window.LK_ASSET_BLOBS;
  if(!THREE||!THREE.FBXLoader)throw new Error('FBX source preview requires FBXLoader');
  if(!asset||(!asset.sourceDbKey&&!asset.sourceSrc))throw new Error('FBX source blob is missing');
  const sourceUrl=asset.sourceSrc||(blobs&&await blobs.getUrl(asset.sourceDbKey));
  if(!sourceUrl)throw new Error('FBX source URL is unavailable');
  const dependencies=[];
  for(const dependency of asset.sourceDependencies||[]){
    try {
      const url=dependency.src||(dependency.dbKey&&blobs&&await blobs.getUrl(dependency.dbKey));
      if(url)dependencies.push({path:dependency.path||dependency.name,name:dependency.name,url});
    } catch(err){}
  }
  const index=sourceDependencyIndex(dependencies);
  const manager=new THREE.LoadingManager();
  if(THREE.TGALoader)manager.addHandler(/\.tga$/i,new THREE.TGALoader(manager));
  manager.setURLModifier(url=>resolveDependencyUrl(index,url)||url);
  const loaded=await new THREE.FBXLoader(manager).loadAsync(sourceUrl);
  // Repair a doubled bone chain before anything can bind to it. The bundled
  // mannequins - and their original sources - carry every bone twice, nested, with
  // the two skinned meshes bound to DIFFERENT copies; a mixer drives the outer one,
  // so one mesh animates and the other stays in its T-pose. Done here because this
  // is the single funnel every FBX passes through, so a user import from the same
  // pipeline is fixed too.
  const repair=window.LK_SKINNED_RIG_REPAIR;
  if(repair&&loaded){
    const outcome=repair.collapseDuplicateBones(loaded);
    if(outcome.collapsed&&window.console&&console.info){
      console.info('[LOT KING] repaired doubled bone chain in '+(asset.name||asset.source||'FBX')+
        ': '+outcome.collapsed+' duplicate bones removed, '+outcome.remappedBones+
        ' skeleton slots repointed across '+outcome.meshes+' meshes');
    }
  }
  return loaded;
}

async function rebuildFbx(asset,context){
  const THREE=context&&context.THREE||window.THREE;
  if(!THREE||!THREE.GLTFExporter)throw new Error('FBX rebuild requires GLTFExporter');
  if(context&&context.progress)context.progress(asset.name||asset.source||'FBX',35,'Loading original FBX source');
  const root=await loadFbxSource(asset,context);
  if(context&&context.progress)context.progress(asset.name||asset.source||'FBX',68,'Building canonical GLB');
  const animations=Array.isArray(root.animations)?root.animations.filter(Boolean):[];
  const result=await new THREE.GLTFExporter().parseAsync(root,{binary:true,animations,onlyVisible:false});
  if(!(result instanceof ArrayBuffer))throw new Error('GLTFExporter did not produce binary GLB data');
  const base=String(asset.name||asset.source||'model').replace(/\.(?:fbx|glb)$/i,'');
  const compiled=new File([result],base+'.glb',{type:'model/gltf-binary',lastModified:Date.now()});
  Object.defineProperties(compiled,{
    __lkImportSource:{value:asset.source||base+'.fbx'},
    __lkSourceFormat:{value:'fbx'},
    __lkConversionWarnings:{value:[]},
  });
  return compiled;
}

async function prepareBatch(files, context){
  const input = Array.from(files || []);
  const fbxFiles = input.filter(file => /\.fbx$/i.test(file && file.name || ''));
  if(!fbxFiles.length) return input;
  const dependencies = input.filter(file => !/\.fbx$/i.test(file && file.name || ''));
  const usedDependencies = new Set();
  const converted = [];
  const failures = [];
  for(let index = 0; index < fbxFiles.length; index++){
    const source = fbxFiles[index];
    try {
      if(context && context.progress){
        context.progress(source.name, Math.round(index / fbxFiles.length * 80), 'Converting FBX ' + (index + 1) + ' of ' + fbxFiles.length);
      }
      const result = await convertFbx(source, dependencies, context || {});
      converted.push(result.file);
      result.usedFiles.forEach(file => usedDependencies.add(file));
      if(result.warnings.length && context && context.warn) context.warn(source.name + ': ' + result.warnings.join(' · '));
    } catch(err){
      failures.push(source.name + ': ' + (err && err.message || err));
      if(context && context.warn) context.warn(failures[failures.length - 1]);
    }
  }
  // Texture files actually consumed by an FBX are dependencies, not separate
  // library assets. Unused images and normal GLB/GLTF inputs remain importable.
  const placingConvertedModel = !!(context && context.options && context.options.placePoint);
  const passthrough = dependencies.filter(file => !usedDependencies.has(file) &&
    (MODEL_RE.test(file.name || '') || !placingConvertedModel && (IMAGE_RE.test(file.name || '') || /^image\//i.test(file.type || ''))));
  if(!converted.length && failures.length) throw new Error(failures.join(' | '));
  return converted.concat(passthrough);
}

const plugin = {
  id:'fbx-glb-importer',
  name:'FBX → GLB Importer',
  version:'1.0.0',
  category:'Asset Pipeline',
  builtIn:false,
  enabledByDefault:true,
  description:'Imports FBX models, resolves selected or folder textures, and stores a portable GLB in the normal asset library.',
  loadSource:loadFbxSource,
  capabilities:[
    'FBX binary/ASCII import',
    'External texture resolution',
    'Skeleton and animation conversion',
    'Browser-only GLB generation',
    'Folder import',
  ],
  register(api){
    if(!api) return;
    api.capability('asset-importer', 'Converts FBX input into the editor canonical GLB format');
    api.capability('multi-file-dependencies', 'Resolves external textures by relative path and filename');
    api.assetType('fbx-source', {
      label:'FBX source (converted to GLB)',
      icon:'⇄',
      description:'Transient source format. The project stores only the converted GLB.',
    });
    api.assetImporter('fbx', {
      label:'FBX → GLB',
      extensions:['fbx'],
      accepts:file => /\.fbx$/i.test(file && file.name || ''),
      prepare:prepareBatch,
      rebuild:rebuildFbx,
    });
    api.assetPreviewLoader('fbx-source', {
      label:'Direct FBX source preview',
      accepts:asset=>!!(asset&&asset.sourceFormat==='fbx'&&(asset.sourceDbKey||asset.sourceSrc)),
      load:loadFbxSource,
    });
    api.exportHook('fbx-canonical-glb', {
      label:'Canonical GLB output',
      description:'The original FBX is kept for authoring preview; portable runtime output resolves the linked canonical GLB.',
    });
    api.command('fbx.import-files', {
      label:'Import FBX + textures…',
      menu:'Plugins',
      run:() => {
        const env = api.env || {};
        const input = env.root && env.root.querySelector('#lkAssetInput');
        if(input) input.click();
        else if(env.status) env.status('FBX import picker unavailable');
      },
    });
    api.command('fbx.import-folder', {
      label:'Import FBX folder…',
      menu:'Plugins',
      run:() => {
        const env = api.env || {};
        const input = env.root && env.root.querySelector('#lkFbxFolderInput');
        if(input) input.click();
        else if(env.status) env.status('FBX folder picker unavailable');
      },
    });
    api.menu('plugins', {
      label:'FBX → GLB Importer',
      icon:'⇄',
      sub:[
        {label:'Import FBX + textures…', icon:'＋', action:() => api.runCommand('fbx.import-files')},
        {label:'Import an FBX folder…', icon:'📁', action:() => api.runCommand('fbx.import-folder')},
      ],
    });
  },
};

window.LK_FBX_IMPORT_PLUGIN = Object.freeze(plugin);
})();
