/* =========================================================
   LOT KING — ASSET SCOUT

   Floating viewport button + panel that searches free online asset
   catalogues and imports the result straight into the project asset library.

   Ownership boundary:
     · asset-scout-providers.js   what the catalogues are and how to read them
     · this file                  the panel, the download queue, the conversion
                                  to a File the normal importer already accepts

   Nothing here knows about a specific provider: the panel renders whatever
   LK_EDITOR_ASSET_SCOUT_PROVIDERS.list() returns.

   Downloaded models arrive as a single canonical GLB, exactly like a local
   drag-and-drop import, so the asset behaves identically from that point on.
   ========================================================= */
(function(){
'use strict';

const RESULT_LIMIT = 48;
const LICENSE_CONCURRENCY = 6;   // parallel per-asset license lookups
const MAX_TOTAL_BYTES = 220 * 1024 * 1024;   // guard against a runaway bundle

function el(tag, className, text){
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text != null) node.textContent = text;
  return node;
}
function bytes(size){
  const value = Number(size) || 0;
  if(!value) return '';
  if(value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + ' KB';
  return (value / (1024 * 1024)).toFixed(value > 10 * 1024 * 1024 ? 0 : 1) + ' MB';
}

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const THREE = deps.THREE || window.THREE;
  const status = deps.status || function(){};
  const setAssetLoading = deps.setAssetLoading || function(){};
  const importAssetFiles = deps.importAssetFiles || function(){ return Promise.resolve([]); };
  const refreshAssetsPanel = deps.refreshAssetsPanel || function(){};
  const confirmEditorAction = deps.confirmEditorAction || function(){ return Promise.resolve(false); };
  const providersApi = window.LK_EDITOR_ASSET_SCOUT_PROVIDERS || null;
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  const state = {
    open:false,
    providerId:null,
    category:null,
    resolution:'1k',
    format:'gltf',
    query:'',
    results:[],
    busy:false,
    lastError:'',
    searchToken:0,   // invalidates in-flight license lookups from an older search
  };

  let renderScheduled = false;

  let fab = null;
  let panel = null;
  let dom = null;

  // ------------------------------------------------ download → File

  function downloadFile(descriptor, onProgress){
    return fetch(descriptor.url, {mode:'cors', credentials:'omit'})
      .then(response => {
        if(!response.ok) throw new Error('HTTP ' + response.status + ' for ' + descriptor.name);
        return response.blob();
      })
      .then(blob => {
        if(onProgress) onProgress(descriptor, blob.size);
        return new File([blob], descriptor.name, {type:blob.type || 'application/octet-stream', lastModified:Date.now()});
      });
  }

  function estimatedSize(download){
    return (download.files || []).reduce((total, file) => total + (Number(file.size) || 0), 0);
  }

  // A Poly Haven glTF is a .gltf plus loose .bin and texture files whose paths
  // do not resolve relative to the .gltf URL. They are re-linked through a
  // LoadingManager URL modifier and re-exported as one GLB, mirroring what the
  // FBX plugin does for its own sources.
  function bundleGltfToGlb(download, asset, progress){
    if(!THREE || !THREE.GLTFLoader || !THREE.GLTFExporter){
      return Promise.reject(new Error('glTF bundling requires GLTFLoader and GLTFExporter in the pinned Three.js bundle'));
    }
    const objectUrls = [];
    const byName = new Map();
    const byPath = new Map();
    const dependencies = download.dependencies || [];
    return Promise.all(dependencies.map(dependency => downloadFile(dependency).then(file => {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      byName.set(String(dependency.name || '').toLowerCase(), url);
      byPath.set(String(dependency.path || dependency.name || '').toLowerCase(), url);
      return file;
    }))).then(() => {
      progress(58, tr('Linking model dependencies', 'Collegamento dipendenze modello'));
      return downloadFile(download.root);
    }).then(rootFile => {
      const rootUrl = URL.createObjectURL(rootFile);
      objectUrls.push(rootUrl);
      const manager = new THREE.LoadingManager();
      manager.setURLModifier(url => {
        if(/^(?:data:|blob:)/i.test(url)) return url;
        const clean = String(url || '').replace(/\\/g, '/').split(/[?#]/)[0].toLowerCase();
        const name = clean.slice(clean.lastIndexOf('/') + 1);
        return byPath.get(clean) || byName.get(name) || url;
      });
      return new Promise((resolve, reject) => {
        new THREE.GLTFLoader(manager).load(rootUrl, resolve, undefined, reject);
      });
    }).then(gltf => {
      progress(76, tr('Converting to GLB', 'Conversione in GLB'));
      const root = gltf && gltf.scene;
      if(!root) throw new Error('The downloaded glTF contained no scene');
      return new THREE.GLTFExporter().parseAsync(root, {binary:true, animations:gltf.animations || [], onlyVisible:false});
    }).then(result => {
      if(!(result instanceof ArrayBuffer)) throw new Error('GLTFExporter did not produce binary GLB data');
      const name = String(asset.id || 'model').replace(/[^\w.-]+/g, '_') + '.glb';
      return [new File([result], name, {type:'model/gltf-binary', lastModified:Date.now()})];
    }).finally(() => {
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    });
  }

  // A texture set or an FBX with sidecars is several independent files, so they
  // are fetched concurrently. The result keeps the descriptor order, which the
  // FBX plugin and the texture importer both rely on.
  function collectFiles(download, asset, progress){
    if(download.mode === 'gltf-bundle') return bundleGltfToGlb(download, asset, progress);
    const list = download.files || [];
    let done = 0;
    return Promise.all(list.map(descriptor => downloadFile(descriptor).then(file => {
      done++;
      progress(20 + Math.round(done / Math.max(1, list.length) * 55), tr('Downloaded ', 'Scaricato ') + descriptor.name);
      return file;
    })));
  }

  // ------------------------------------------------ import

  function licenseNoteFor(asset){
    const license = asset.license || {};
    return [asset.providerLabel, asset.name, license.label].filter(Boolean).join(' · ');
  }

  function importAsset(asset){
    if(state.busy) return Promise.resolve(null);
    const provider = providersApi && providersApi.get(asset.providerId);
    if(!provider) return Promise.resolve(null);
    const license = asset.license || {};
    // The confirm dialog renders a single text run, so the terms are stated as
    // one continuous sentence rather than relying on line breaks.
    const confirmIfNeeded = license.permissive
      ? Promise.resolve(true)
      : confirmEditorAction({
          title:tr('License confirmation', 'Conferma licenza') + ' — ' + (license.label || tr('not resolved', 'non risolta')),
          message:[
            asset.name + ' (' + asset.providerLabel + ').',
            license.summary || tr('The catalogue returned no usable license terms for this asset.', 'Il catalogo non ha restituito termini di licenza utilizzabili per questo asset.'),
            tr('This asset is not public domain: respecting its terms in anything you publish is your responsibility. Import it?',
               'Questo asset non è di pubblico dominio: rispettarne i termini in ciò che pubblichi è una tua responsabilità. Importarlo?'),
          ].join(' '),
          okText:tr('Import', 'Importa'),
          danger:false,
        });

    return Promise.resolve(confirmIfNeeded).then(ok => {
      if(!ok) return null;
      state.busy = true;
      render();
      const progress = (pct, step) => setAssetLoading(true, asset.name, pct, step);
      progress(8, tr('Resolving download', 'Risoluzione download'));
      return provider.resolveDownload(asset, {resolution:state.resolution, format:state.format})
        .then(download => {
          const total = estimatedSize(download);
          if(total > MAX_TOTAL_BYTES){
            throw new Error(tr('Download is ', 'Il download è di ') + bytes(total) + tr('; choose a smaller resolution.', '; scegli una risoluzione più bassa.'));
          }
          return collectFiles(download, asset, progress);
        })
        .then(files => {
          if(!files || !files.length) throw new Error(tr('No file was downloaded', 'Nessun file scaricato'));
          progress(88, tr('Importing into the project', 'Importazione nel progetto'));
          // Tag provenance on the File objects so the asset library records
          // where the asset came from and under which license.
          files.forEach(file => {
            try {
              Object.defineProperties(file, {
                __lkScoutProvider:{value:asset.providerLabel},
                __lkScoutSourceUrl:{value:asset.pageUrl},
                __lkScoutLicense:{value:(asset.license || {}).label || ''},
              });
            } catch(err){ /* File property definition is best-effort */ }
          });
          return importAssetFiles(files);
        })
        .then(imported => {
          setAssetLoading(false);
          refreshAssetsPanel();
          status(tr('Asset Scout imported: ', 'Asset Scout ha importato: ') + licenseNoteFor(asset));
          return imported;
        })
        .catch(error => {
          setAssetLoading(false);
          const message = String(error && error.message || error);
          state.lastError = message;
          status(tr('Asset Scout import failed: ', 'Import Asset Scout fallito: ') + message);
          return null;
        })
        .finally(() => { state.busy = false; render(); });
    });
  }

  // ------------------------------------------------ search

  function activeProvider(){
    if(!providersApi) return null;
    return providersApi.get(state.providerId) || providersApi.list()[0] || null;
  }

  function runSearch(){
    const provider = activeProvider();
    if(!provider) return;
    state.busy = true;
    state.lastError = '';
    state.searchToken++;
    render();
    provider.search(state.query, {category:state.category, limit:RESULT_LIMIT})
      .then(results => {
        state.results = results || [];
        state.busy = false;
        render();
        resolvePendingLicenses(provider);
      })
      .catch(error => {
        state.results = [];
        state.busy = false;
        state.lastError = String(error && error.message || error);
        render();
      });
  }

  // Providers whose license lives outside the catalogue index fill it in
  // afterwards. Until it resolves the card shows "License not resolved" and
  // import stays behind the confirmation prompt.
  //
  // Each result needs its own request, so they are run a few at a time and the
  // repaints are coalesced: rendering once per resolved license would rebuild
  // the whole grid dozens of times and throw away the user's scroll position.
  function resolvePendingLicenses(provider){
    if(typeof provider.resolveLicense !== 'function') return;
    const pending = state.results.filter(asset => asset.licensePending);
    if(!pending.length) return;
    // runSearch already bumped the token, so this only has to capture it.
    const token = state.searchToken;
    let next = 0;
    const worker = () => {
      if(next >= pending.length || token !== state.searchToken) return Promise.resolve();
      const asset = pending[next++];
      return provider.resolveLicense(asset).then(resolved => {
        if(resolved && token === state.searchToken){
          asset.license = resolved.license || asset.license;
          asset.licensePending = false;
          if(resolved.author) asset.authors = [resolved.author];
          scheduleRender();
        }
        return worker();
      });
    };
    for(let lane = 0; lane < LICENSE_CONCURRENCY; lane++) worker();
  }

  // ------------------------------------------------ rendering

  function buildDom(){
    if(dom) return dom;
    fab = document.getElementById('lkAssetScoutFab');
    panel = document.getElementById('lkAssetScoutPanel');
    if(!fab || !panel) return null;
    dom = {
      close:panel.querySelector('#lkAssetScoutClose'),
      providers:panel.querySelector('#lkAssetScoutProviders'),
      categories:panel.querySelector('#lkAssetScoutCategories'),
      options:panel.querySelector('#lkAssetScoutOptions'),
      query:panel.querySelector('#lkAssetScoutQuery'),
      searchBtn:panel.querySelector('#lkAssetScoutSearch'),
      note:panel.querySelector('#lkAssetScoutNote'),
      results:panel.querySelector('#lkAssetScoutResults'),
      state:panel.querySelector('#lkAssetScoutState'),
    };
    fab.addEventListener('click', () => setOpen(!state.open));
    dom.close.addEventListener('click', () => setOpen(false));
    dom.searchBtn.addEventListener('click', runSearch);
    dom.query.addEventListener('keydown', event => {
      if(event.key === 'Enter'){ event.preventDefault(); runSearch(); }
    });
    document.addEventListener('keydown', event => {
      if(event.key === 'Escape' && state.open && !state.busy) setOpen(false);
    });
    return dom;
  }

  function chip(label, active, onClick, title){
    const node = el('button', 'lk-scout-chip' + (active ? ' on' : ''), label);
    node.type = 'button';
    if(title) node.title = title;
    node.addEventListener('click', onClick);
    return node;
  }

  function renderControls(){
    const providers = providersApi ? providersApi.list() : [];
    const provider = activeProvider();
    dom.providers.innerHTML = '';
    providers.forEach(item => {
      dom.providers.appendChild(chip(item.label, provider && item.id === provider.id, () => {
        state.providerId = item.id;
        state.category = (item.categories[0] || {}).id || null;
        state.format = (item.formats[0] || {}).id || 'gltf';
        state.results = [];
        render();
        runSearch();
      }, item.licenseSummary));
    });

    dom.categories.innerHTML = '';
    (provider ? provider.categories : []).forEach(category => {
      dom.categories.appendChild(chip(category.label, state.category === category.id, () => {
        state.category = category.id;
        runSearch();
      }));
    });

    dom.options.innerHTML = '';
    const modelFormats = (provider ? provider.formats : []).filter(format => (format.kinds || ['model']).indexOf('model') >= 0);
    if(modelFormats.length > 1){
      const group = el('div', 'lk-scout-option');
      group.appendChild(el('label', null, tr('Model format', 'Formato modello')));
      const select = el('select');
      modelFormats.forEach(format => {
        const option = el('option', null, format.label);
        option.value = format.id;
        select.appendChild(option);
      });
      select.value = state.format;
      select.addEventListener('change', () => { state.format = select.value; });
      group.appendChild(select);
      dom.options.appendChild(group);
    }
    if(provider && provider.resolutions && provider.resolutions.length){
      const group = el('div', 'lk-scout-option');
      group.appendChild(el('label', null, tr('Resolution', 'Risoluzione')));
      const select = el('select');
      provider.resolutions.forEach(resolution => {
        const option = el('option', null, resolution.toUpperCase());
        option.value = resolution;
        select.appendChild(option);
      });
      select.value = state.resolution;
      select.addEventListener('change', () => { state.resolution = select.value; });
      group.appendChild(select);
      dom.options.appendChild(group);
    }

    dom.note.innerHTML = '';
    if(provider){
      const link = el('a', null, provider.label);
      link.href = provider.home;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      dom.note.appendChild(link);
      dom.note.appendChild(el('span', null, ' — ' + provider.licenseSummary));
    }
  }

  function renderCard(asset){
    const card = el('article', 'lk-scout-card');
    const license = asset.license || {};
    card.classList.toggle('restricted', !license.permissive);

    const preview = el('div', 'lk-scout-preview');
    if(asset.thumbnail){
      const image = el('img');
      image.src = asset.thumbnail;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      // A missing preview must not hide the asset: the card keeps the name,
      // the specs and the license so the entry is still identifiable.
      image.addEventListener('error', () => {
        preview.innerHTML = '';
        preview.appendChild(el('span', 'lk-scout-preview-fallback', tr('No preview', 'Nessuna anteprima')));
      });
      preview.appendChild(image);
    } else {
      preview.appendChild(el('span', 'lk-scout-preview-fallback', tr('No preview', 'Nessuna anteprima')));
    }
    card.appendChild(preview);

    const body = el('div', 'lk-scout-body');
    body.appendChild(el('h4', null, asset.name));
    if(asset.authors && asset.authors.length) body.appendChild(el('small', 'lk-scout-author', asset.authors.join(', ')));
    (asset.info || []).forEach(line => body.appendChild(el('small', 'lk-scout-info', line)));
    if(asset.tags && asset.tags.length){
      const tags = el('div', 'lk-scout-tags');
      asset.tags.slice(0, 5).forEach(tag => tags.appendChild(el('span', null, tag)));
      body.appendChild(tags);
    }

    const licenseRow = el('div', 'lk-scout-license' + (license.permissive ? ' free' : ' restricted'));
    licenseRow.appendChild(el('b', null, asset.licensePending ? tr('Checking license…', 'Verifica licenza…') : (license.label || '—')));
    if(license.summary) licenseRow.title = license.summary;
    body.appendChild(licenseRow);
    card.appendChild(body);

    const actions = el('div', 'lk-scout-actions');
    const importBtn = el('button', 'lk-scout-import', state.busy ? tr('Working…', 'In corso…') : tr('Import', 'Importa'));
    importBtn.type = 'button';
    importBtn.disabled = state.busy;
    importBtn.addEventListener('click', () => importAsset(asset));
    actions.appendChild(importBtn);
    if(asset.pageUrl){
      const source = el('a', 'lk-scout-source', tr('Source', 'Fonte'));
      source.href = asset.pageUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      actions.appendChild(source);
    }
    card.appendChild(actions);
    return card;
  }

  function render(){
    if(!buildDom()) return;
    panel.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    panel.classList.toggle('on', state.open);
    fab.classList.toggle('on', state.open);
    if(!state.open) return;

    renderControls();
    dom.results.innerHTML = '';
    state.results.forEach(asset => dom.results.appendChild(renderCard(asset)));

    if(state.busy) dom.state.textContent = tr('Searching…', 'Ricerca in corso…');
    else if(state.lastError) dom.state.textContent = tr('Search failed: ', 'Ricerca fallita: ') + state.lastError;
    else if(!state.results.length) dom.state.textContent = tr('No result. Try a different keyword or category.', 'Nessun risultato. Prova una parola chiave o una categoria diversa.');
    else dom.state.textContent = state.results.length + tr(' results', ' risultati');
    dom.state.classList.toggle('error', !!state.lastError && !state.busy);
  }

  // Coalesces repaints into one frame so a burst of resolved licenses rebuilds
  // the grid once instead of once per result.
  function scheduleRender(){
    if(renderScheduled || !state.open) return;
    renderScheduled = true;
    const run = () => { renderScheduled = false; render(); };
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  function setOpen(next){
    if(!buildDom()) return;
    state.open = next === true;
    if(state.open && !state.providerId){
      const first = providersApi ? providersApi.list()[0] : null;
      if(first){
        state.providerId = first.id;
        state.category = (first.categories[0] || {}).id || null;
        state.format = (first.formats[0] || {}).id || 'gltf';
      }
    }
    render();
    if(state.open){
      dom.query.focus();
      if(!state.results.length && !state.busy) runSearch();
    }
  }

  function setAvailable(available){
    if(!buildDom()) return;
    fab.hidden = !available;
    if(!available && state.open) setOpen(false);
  }

  // Wire the DOM up front. The button's own click listener lives in buildDom,
  // so leaving that until the first open meant the button could only be used
  // after the panel had already been opened some other way — clicking it did
  // nothing. The editor chrome is injected before modules are created, but a
  // deferred retry keeps this safe if that ever changes.
  if(!buildDom() && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => buildDom());

  return Object.freeze({
    open:() => setOpen(true),
    close:() => setOpen(false),
    toggle:() => setOpen(!state.open),
    isOpen:() => state.open,
    setAvailable,
    state,
  });
}

window.LK_EDITOR_ASSET_SCOUT = Object.freeze({create});
})();
