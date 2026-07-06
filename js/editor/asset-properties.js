/* =========================================================
   LOT KING - asset properties overlay
   Windows-style asset info panel with preview hooks.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE || window.THREE;
  const documentRef = deps.document || document;
  const resolveImportedAssetUrl = deps.resolveImportedAssetUrl || function(asset){ return Promise.reject(new Error('asset source missing')); };
  let overlay = null;
  let preview = null;

  function fmtBytes(bytes){
    const n = Number(bytes) || 0;
    if(!n) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = n, i = 0;
    while(v >= 1024 && i < units.length - 1){ v /= 1024; i += 1; }
    return (i ? v.toFixed(v >= 10 ? 1 : 2) : String(Math.round(v))) + ' ' + units[i];
  }

  function fmtDate(value){
    if(!value) return 'Unknown';
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }

  function cleanupPreview(){
    if(!preview) return;
    if(preview.raf) cancelAnimationFrame(preview.raf);
    if(preview.controls){
      if(preview.controls.dispose) preview.controls.dispose();
      preview.controls = null;
    }
    if(preview.renderer){
      try { preview.renderer.dispose(); } catch(err){}
      if(preview.renderer.domElement && preview.renderer.domElement.parentNode) preview.renderer.domElement.parentNode.removeChild(preview.renderer.domElement);
    }
    preview = null;
  }

  function close(){
    cleanupPreview();
    if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function row(label, value){
    const r = documentRef.createElement('div');
    r.className = 'lk-prop-row';
    const k = documentRef.createElement('b');
    k.textContent = label;
    const v = documentRef.createElement('span');
    v.textContent = value == null || value === '' ? 'None' : String(value);
    r.append(k, v);
    return r;
  }

  function renderGlbPreview(box, asset){
    if(!THREE || !THREE.GLTFLoader){
      box.textContent = '3D preview unavailable: GLTFLoader missing.';
      return;
    }
    if(!THREE.OrbitControls){
      box.textContent = '3D preview unavailable: OrbitControls missing.';
      return;
    }
    const w = Math.max(240, box.clientWidth || 420);
    const h = 240;
    const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    box.innerHTML = '';
    box.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, w / h, .01, 2000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(4, 6, 4.5);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0x8899cc, 0.4));
    const group = new THREE.Group();
    scene.add(group);
    preview = {renderer, raf:0, controls:null};
    resolveImportedAssetUrl(asset).then(src => new Promise((resolve, reject) => {
      new THREE.GLTFLoader().load(src, gltf => resolve(gltf.scene), undefined, reject);
    })).then(root => {
      group.add(root);
      const box3 = new THREE.Box3().setFromObject(group);
      const size = box3.getSize(new THREE.Vector3());
      const center = box3.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, .001);
      const radius = Math.max(Math.max(size.x, size.y), size.z) / 2;
      group.position.sub(center);
      const minView = Math.max(radius * 2, 0.7);
      const fitHeight = (radius * 1.35) / Math.tan((camera.fov * Math.PI / 180) / 2);
      const fitWidth = fitHeight / (w / h);
      const fitDist = Math.max(minView, Math.abs( Math.max(fitHeight, fitWidth) ) * 1.2);
      const baseAngle = Math.PI / 6;
      camera.position.set(Math.sin(baseAngle) * fitDist, Math.max(radius * 0.45, 0.45), Math.cos(baseAngle) * fitDist);
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = true;
      controls.minDistance = Math.max(0.3, fitDist * 0.28);
      controls.maxDistance = Math.max(fitDist * 6, 18);
      controls.autoRotate = false;
      controls.update();
      preview.controls = controls;

      const fitButton = box.querySelector('.lk-prop-fit');
      const resetButton = box.querySelector('.lk-prop-reset-view');
      const resetToFit = () => {
        controls.target.set(0, 0, 0);
        controls.minDistance = Math.max(0.3, fitDist * 0.28);
        controls.maxDistance = Math.max(fitDist * 6, 18);
        controls.object.position.set(Math.sin(baseAngle) * fitDist, Math.max(radius * 0.45, 0.45), Math.cos(baseAngle) * fitDist);
        controls.update();
      };
      if(fitButton){
        fitButton.onclick = () => {
          const boxForCenter = new THREE.Box3().setFromObject(group);
          const s = boxForCenter.getSize(new THREE.Vector3());
          const r = Math.max(Math.max(s.x, s.y), s.z) / 2;
          const fH = (r * 1.35) / Math.tan((camera.fov * Math.PI / 180) / 2);
          const fW = fH / (w / h);
          const d = Math.max(0.7, Math.abs(Math.max(fH, fW)) * 1.2);
          camera.near = 0.01;
          camera.far = Math.max(200, d * 12);
          camera.updateProjectionMatrix();
          controls.target.set(0, 0, 0);
          controls.minDistance = Math.max(0.35, d * 0.28);
          controls.maxDistance = Math.max(d * 6, 18);
          controls.object.position.set(0, 0, d);
          controls.object.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), baseAngle);
          controls.object.lookAt(0, 0, 0);
          controls.update();
        };
      }
      if(resetButton){
        resetButton.onclick = resetToFit;
      }
      const animate = () => {
        if(!preview || preview.renderer !== renderer) return;
        if(preview.controls) preview.controls.update();
        renderer.render(scene, camera);
        preview.raf = requestAnimationFrame(animate);
      };
      resetToFit();
      animate();
    }).catch(err => {
      box.textContent = 'Preview failed: ' + (err && err.message || 'unknown error');
    });
  }

  function openImportedGlb(asset){
    close();
    overlay = documentRef.createElement('div');
    overlay.className = 'lk-prop-overlay open';
    overlay.innerHTML = [
      '<div class="lk-prop-window">',
      '  <div class="lk-prop-title"><span>Asset Properties</span><button type="button" title="Close">×</button></div>',
      '  <div class="lk-prop-body">',
      '    <div class="lk-prop-preview">',
      '      <div class="lk-prop-preview-toolbar">',
      '        <button type="button" class="lk-prop-fit">Fit</button>',
      '        <button type="button" class="lk-prop-reset-view">Reset view</button>',
      '      </div>',
      '    </div>',
      '    <div class="lk-prop-info"></div>',
      '  </div>',
      '</div>',
    ].join('');
    const title = overlay.querySelector('.lk-prop-title span');
    title.textContent = (asset.source || asset.name || 'Asset') + ' Properties';
    overlay.querySelector('button').addEventListener('click', close);
    overlay.addEventListener('pointerdown', e => { if(e.target === overlay) close(); });
    const info = overlay.querySelector('.lk-prop-info');
    info.append(
      row('Name', asset.source || asset.name || 'Imported Asset'),
      row('Display name', asset.name || ''),
      row('Type', 'GLB/GLTF model'),
      row('Size', fmtBytes(asset.size)),
      row('Storage', asset.dbKey ? 'IndexedDB blob' : (asset.src ? 'Inline/data URL' : 'Unknown')),
      row('Rigged', asset.rigged ? 'Yes' : 'Unknown'),
      row('Used as player model', asset.usedAsPlayerModel ? 'Yes' : 'No'),
      row('Imported at', fmtDate(asset.importedAt)),
      row('Player model at', fmtDate(asset.playerModelAt)),
      row('Asset id', asset.id || ''),
      row('Asset key', asset.key || ''),
      row('Blob key', asset.dbKey || '')
    );
    documentRef.body.appendChild(overlay);
    renderGlbPreview(overlay.querySelector('.lk-prop-preview'), asset);
  }

  function open(item){
    const raw = item && item.raw;
    if(item && item.kind === 'imported-glb' && raw) openImportedGlb(raw);
    else if(item && item.kind === 'player-blueprint' && raw) openBlueprint(item, raw);
  }

  function openBlueprint(item, asset){
    close();
    const player = asset.player || asset || {};
    overlay = documentRef.createElement('div');
    overlay.className = 'lk-prop-overlay open';
    overlay.innerHTML = [
      '<div class="lk-prop-window">',
      '  <div class="lk-prop-title"><span>Player Car Logic Properties</span><button type="button" title="Close">×</button></div>',
      '  <div class="lk-prop-body">',
      '    <div class="lk-prop-preview lk-prop-preview-blueprint">🚗</div>',
      '    <div class="lk-prop-info"></div>',
      '  </div>',
      '</div>',
    ].join('');
    overlay.querySelector('.lk-prop-title span').textContent = (asset.name || item.name || 'player_car Logic') + ' Properties';
    overlay.querySelector('button').addEventListener('click', close);
    overlay.addEventListener('pointerdown', e => { if(e.target === overlay) close(); });
    const info = overlay.querySelector('.lk-prop-info');
    info.append(
      row('Name', asset.name || item.name || 'player_car Logic'),
      row('Type', 'Player Car Logic'),
      row('Base', asset.base || item.base ? 'Yes' : 'No'),
      row('Source level', asset.source && asset.source.levelName || item.source || ''),
      row('Model', player.modelName || player.modelSrc || player.modelDbKey || 'Default/procedural'),
      row('Model storage', player.modelDbKey ? 'IndexedDB blob' : (player.modelSrc ? 'Inline/path' : 'None')),
      row('Sound set', player.engineAudio && player.engineAudio.setId || 'None'),
      row('Tuning values', player.tuning ? Object.keys(player.tuning).length : 0),
      row('Camera config', player.cam ? 'Yes' : 'No'),
      row('Lights config', player.lights ? 'Yes' : 'No'),
      row('Exhaust sources', player.exhaust && player.exhaust.sources ? player.exhaust.sources.length : 0),
      row('Data widgets', player.dataWidgets ? Object.keys(player.dataWidgets).length : 0),
      row('Spawn', player.spawn ? [player.spawn.x || 0, player.spawn.z || 0].join(', ') : 'Not stored')
    );
    documentRef.body.appendChild(overlay);
  }

  return Object.freeze({open, close});
}

window.LK_EDITOR_ASSET_PROPERTIES = Object.freeze({create});
})();
