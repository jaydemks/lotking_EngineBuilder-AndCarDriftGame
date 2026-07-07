/* =========================================================
   LOT KING — EDITOR SIDE PANELS
   Wires left scene tools and asset dock controls.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const root = deps.root;
  const ED = deps.ED;
  const $ = deps.$;
  if(!root || !ED || !$) return null;

  $('#lkSearch').addEventListener('input', e => {
    ED.search = e.target.value.toLowerCase();
    deps.refreshOutliner();
  });

  $('#lkFilter').addEventListener('change', e => {
    ED.filter = e.target.value;
    deps.refreshOutliner();
  });

  $('#lkSceneTab').addEventListener('click', () => deps.setLeftMode('scene'));
  $('#lkViewGrid').addEventListener('click', () => deps.setViewMode('grid', 'scene'));
  $('#lkViewList').addEventListener('click', () => deps.setViewMode('list', 'scene'));
  const assetGrid = $('#lkAssetViewGrid');
  const assetList = $('#lkAssetViewList');
  if(assetGrid) assetGrid.addEventListener('click', () => deps.setViewMode('grid', 'assets'));
  if(assetList) assetList.addEventListener('click', () => deps.setViewMode('list', 'assets'));
  $('#lkAssetImport').addEventListener('click', () => $('#lkAssetInput').click());
  $('#lkAssetFolder').addEventListener('click', () => deps.newFolder('assets'));
  $('#lkSceneFolder').addEventListener('click', () => deps.newFolder('scene'));
  $('#lkAssetRefresh').addEventListener('click', () => {
    deps.refreshAssetsPanel();
    deps.status('Asset library refreshed');
  });

  $('#lkAssetInput').addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    deps.importAssetFiles(files);
  });

  root.querySelectorAll('[data-asset-filter]').forEach(chk => {
    chk.addEventListener('change', () => {
      ED.assetFilters[chk.dataset.assetFilter] = chk.checked;
      deps.refreshAssetsPanel();
    });
  });

  return Object.freeze({});
}

window.LK_EDITOR_SIDE_PANELS = Object.freeze({create});
})();
