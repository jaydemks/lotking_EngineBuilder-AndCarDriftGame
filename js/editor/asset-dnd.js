/* =========================================================
   LOT KING - EDITOR ASSET DRAG / DROP
   Asset panel drops, viewport placement drops, and replace-target wiring.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const ED = deps.ED;
  const canvas = deps.canvas;
  let assetDragRef = null;

  function acceptEditorFileDrag(e){
    if(!deps.hasExternalFileDrag(e)) return false;
    e.preventDefault();
    e.stopPropagation();
    if(e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    return true;
  }

  function acceptAssetBrowserDrag(e){
    if(!e.dataTransfer || !e.dataTransfer.types || !Array.from(e.dataTransfer.types).includes('application/x-lotking-asset')) return false;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    return true;
  }

  function canReplaceTarget(o){
    return !!(o && o.userData && o.userData.editorType !== 'player' &&
      !['playerLight','playerEffect','playerDataWidget'].includes(o.userData.editorType));
  }

  function dragAssetModel(e){
    const ref = e.dataTransfer && (e.dataTransfer.getData('application/x-lotking-asset') || assetDragRef);
    const asset = ref ? deps.getAssetByRef(ref) : null;
    return asset && asset.kind === 'imported-glb' ? asset : null;
  }

  function updateViewportReplaceHint(e){
    const hasModelAsset = e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('application/x-lotking-asset');
    const hasFile = deps.hasExternalFileDrag(e);
    if(!hasModelAsset && !hasFile){ deps.clearReplaceDropHelper(); return null; }
    const hit = deps.pickAt(e.clientX, e.clientY);
    if(!hit || !hit.entity){ deps.clearReplaceDropHelper(); return null; }
    let modelOk = hasFile;
    if(hasModelAsset){
      const asset = dragAssetModel(e);
      modelOk = !!(asset && asset.kind === 'imported-glb');
    }
    const ok = modelOk && canReplaceTarget(hit.entity);
    deps.setReplaceDropHelper(hit.entity, ok);
    return ok ? hit.entity : null;
  }

  function objectLabel(o){
    if(!o) return 'object';
    return (o.userData && (o.userData.editorName || o.userData.name || o.userData.id)) || o.name || 'object';
  }

  function clonePoint(point){
    return point && point.clone ? point.clone() : point;
  }

  function openViewportDropChoice(e, opts){
    const target = opts && opts.target;
    const point = clonePoint(opts && opts.point);
    const asset = opts && opts.asset;
    const files = opts && opts.files ? Array.from(opts.files) : [];
    const replaceName = objectLabel(target);
    const items = [
      {
        label:'Put here',
        icon:'📍',
        action:() => {
          deps.clearReplaceDropHelper();
          if(asset){
            deps.placeAssetRef(asset, point);
            return;
          }
          if(files.length) deps.importAssetFiles(files, {placePoint: point});
        },
      },
      {
        label:'Replace with ' + replaceName,
        icon:'📦',
        action:() => {
          deps.clearReplaceDropHelper();
          if(asset && asset.kind === 'imported-glb'){
            deps.replaceSelectedWithAsset(asset.raw, target);
            return;
          }
          if(files.length) deps.replaceObjectWithFile(target, files[0]);
        },
      },
    ];
    if(deps.openMenu) deps.openMenu(items, e.clientX + 8, e.clientY + 8);
    else items[0].action();
  }

  function bindReplaceDropTarget(el, target){
    if(!el || !target) return;
    const clear = () => {
      el.classList.remove('replace-ok');
      el.classList.remove('replace-bad');
    };
    const evaluate = e => {
      const types = Array.from((e.dataTransfer && e.dataTransfer.types) || []);
      const hasAsset = types.includes('application/x-lotking-asset');
      const hasFile = deps.hasExternalFileDrag(e);
      if(!hasAsset && !hasFile) return null;
      const ok = canReplaceTarget(target) && (hasFile || !!dragAssetModel(e));
      return {ok, hasAsset, hasFile};
    };
    el.addEventListener('dragover', e => {
      const info = evaluate(e);
      if(!info) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.toggle('replace-ok', info.ok);
      el.classList.toggle('replace-bad', !info.ok);
      e.dataTransfer.dropEffect = info.ok ? 'copy' : 'none';
    });
    el.addEventListener('dragleave', clear);
    el.addEventListener('drop', e => {
      const info = evaluate(e);
      if(!info) return;
      e.preventDefault();
      e.stopPropagation();
      clear();
      if(!info.ok){
        deps.status('Questo oggetto non puo essere sostituito direttamente');
        return;
      }
      if(info.hasAsset){
        const asset = dragAssetModel(e);
        if(asset) deps.replaceSelectedWithAsset(asset.raw, target);
        return;
      }
      const files = deps.supportedAssetFiles(e.dataTransfer.files);
      if(files.length !== 1){
        deps.status('Drop one GLB/GLTF to replace this object');
        return;
      }
      deps.replaceObjectWithFile(target, files[0]);
    });
  }

  function bindAssetDropZone(el){
    if(!el) return;
    el.addEventListener('dragenter', e => { if(acceptEditorFileDrag(e)) el.classList.add('drag'); });
    el.addEventListener('dragover', e => acceptEditorFileDrag(e));
    el.addEventListener('dragleave', e => {
      if(!el.contains(e.relatedTarget)) el.classList.remove('drag');
    });
    el.addEventListener('drop', e => {
      if(!acceptEditorFileDrag(e)) return;
      el.classList.remove('drag');
      deps.importAssetFiles(e.dataTransfer.files);
    });
  }

  function wireViewportDrop(){
    canvas.addEventListener('dragover', e => {
      if(!ED.active || ED.playPreview) return;
      const target = updateViewportReplaceHint(e);
      if(target){
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        return;
      }
      if(acceptAssetBrowserDrag(e)) return;
      acceptEditorFileDrag(e);
    });
    canvas.addEventListener('dragleave', e => { if(e.target === canvas) deps.clearReplaceDropHelper(); });
    canvas.addEventListener('drop', e => {
      if(!ED.active || ED.playPreview) return;
      const replaceTargetNow = deps.getViewportReplaceTarget();
      const blockedReplaceNow = !!(deps.hasReplaceDropHelper() && !deps.getViewportReplaceTarget());
      if(acceptAssetBrowserDrag(e)){
        const asset = deps.getAssetByRef(e.dataTransfer.getData('application/x-lotking-asset') || assetDragRef);
        if(!asset){ deps.status('Asset non disponibile'); return; }
        if(blockedReplaceNow){
          deps.clearReplaceDropHelper();
          deps.status('Questo oggetto non puo essere sostituito direttamente');
          return;
        }
        if(replaceTargetNow && asset.kind === 'imported-glb'){
          openViewportDropChoice(e, {
            target: replaceTargetNow,
            asset,
            point: deps.groundPointAt(e.clientX, e.clientY),
          });
          return;
        }
        deps.clearReplaceDropHelper();
        deps.placeAssetRef(asset, deps.groundPointAt(e.clientX, e.clientY));
        return;
      }
      if(!acceptEditorFileDrag(e)) return;
      const files = deps.supportedAssetFiles(e.dataTransfer.files);
      if(files.length !== 1){
        deps.clearReplaceDropHelper();
        deps.status('Viewport drop accepts one model at a time');
        return;
      }
      if(blockedReplaceNow){
        deps.clearReplaceDropHelper();
        deps.status('Questo oggetto non puo essere sostituito direttamente');
        return;
      }
      if(replaceTargetNow){
        openViewportDropChoice(e, {
          target: replaceTargetNow,
          files,
          point: deps.groundPointAt(e.clientX, e.clientY),
        });
        return;
      }
      deps.clearReplaceDropHelper();
      const at = deps.groundPointAt(e.clientX, e.clientY);
      deps.importAssetFiles(files, {placePoint: at});
    });
  }

  function setAssetDragRef(ref){
    assetDragRef = ref;
  }

  bindAssetDropZone(deps.$('#lkAssetsPanel'));
  bindAssetDropZone(deps.$('#lkAssetsToolbar'));
  wireViewportDrop();

  return Object.freeze({
    acceptEditorFileDrag,
    acceptAssetBrowserDrag,
    canReplaceTarget,
    dragAssetModel,
    updateViewportReplaceHint,
    bindReplaceDropTarget,
    bindAssetDropZone,
    setAssetDragRef,
  });
}

window.LK_EDITOR_ASSET_DND = Object.freeze({create});
})();
