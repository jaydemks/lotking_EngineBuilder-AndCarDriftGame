/* =========================================================
   LOT KING — BROWSER STORAGE MANAGER
   Inspects and selectively removes only Lot King data owned by
   the current origin. Browser HTTP cache is intentionally outside
   this module because web pages cannot enumerate it safely.
   ========================================================= */
(function(){
'use strict';

const OWNED_KEY = /^(?:lotking|lk)[.:]/i;
const KNOWN_DATABASES = ['lotking-assets', 'lotking-project-workspace'];
const ASSET_DATABASE = 'lotking-assets';
const ASSET_STORE = 'blobs';

function create(deps){
  deps = deps || {};
  const root = deps.root || document;
  const host = root.querySelector('#lkStorageManager');
  const status = deps.status || function(){};
  const getLang = deps.lang || function(){ return 'en'; };
  if(!host) return null;

  let rows = [];
  let diagnostics = [];
  let estimate = null;
  let persisted = null;
  let busy = false;
  let viewFilter = 'all';
  const selected = new Set();

  function isIt(){ return getLang() === 'it'; }
  function tr(en, it){ return isIt() ? it : en; }
  function owned(key){ return OWNED_KEY.test(String(key || '')); }
  function textBytes(value){ return String(value == null ? '' : value).length * 2; }
  function fmtBytes(value){
    const bytes = Math.max(0, Number(value) || 0);
    if(bytes < 1024) return bytes + ' B';
    if(bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
    if(bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(bytes < 10485760 ? 1 : 0) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  function safeJson(raw, fallback){
    try { return JSON.parse(raw); } catch(err){ return fallback; }
  }
  function slug(value){
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function validDate(value){
    if(!value) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }
  function storedDate(parsed, fallback){
    if(!parsed || typeof parsed !== 'object') return validDate(fallback);
    const direct = validDate(parsed.savedAt)
      || validDate(parsed.updatedAt)
      || validDate(parsed.createdAt)
      || validDate(parsed.modifiedAt)
      || validDate(parsed.meta && (parsed.meta.savedAt || parsed.meta.updatedAt || parsed.meta.createdAt))
      || validDate(fallback);
    if(direct) return direct;
    let newest = 0;
    const seen = new Set();
    function visit(value, depth){
      if(!value || typeof value !== 'object' || depth > 3 || seen.has(value)) return;
      seen.add(value);
      Object.keys(value).forEach(key => {
        const child = value[key];
        if(/^(?:savedAt|updatedAt|createdAt|modifiedAt)$/i.test(key)){
          const time = Date.parse(child);
          if(Number.isFinite(time)) newest = Math.max(newest, time);
        } else if(child && typeof child === 'object') visit(child, depth + 1);
      });
    }
    visit(parsed, 0);
    return newest ? new Date(newest).toISOString() : null;
  }
  function fmtDate(value){
    if(!value) return tr('Date unavailable', 'Data non disponibile');
    try {
      return new Intl.DateTimeFormat(isIt() ? 'it-IT' : 'en-GB', {
        year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit',
      }).format(new Date(value));
    } catch(err){ return value; }
  }
  function readStorageContext(){
    const projectIndex = safeJson(localStorage.getItem('lk.editor.projects.v1') || '{}', {});
    const projectMarker = safeJson(localStorage.getItem('lk.editor.browserProject.v1') || '{}', {});
    const levelIndex = safeJson(localStorage.getItem('lotking.levels.v1') || '{}', {});
    const projects = Array.isArray(projectIndex.projects) ? projectIndex.projects : [];
    const levels = Array.isArray(levelIndex.levels) ? levelIndex.levels : [];
    const projectRecords = new Map();
    const levelRecords = new Map();
    projects.forEach(record => {
      if(record && record.id) projectRecords.set(slug(record.id), record);
    });
    levels.forEach(record => {
      if(record && record.id) levelRecords.set(String(record.id), record);
    });
    return {
      projectRecords,
      levelRecords,
      activeProjectIds:new Set([projectIndex.activeId, projectMarker.id].map(slug).filter(Boolean)),
      activeLevelId:String(levelIndex.activeId || ''),
    };
  }
  function localRowState(key, value, backend, context){
    const parsed = safeJson(value, null);
    const base = {
      state:'system',
      recommendation:'keep',
      stateLabel:tr('IN USE', 'IN USO'),
      why:tr('Current Lot King data. Keep unless resetting this feature intentionally.', 'Dato Lot King corrente. Mantienilo, salvo reset intenzionale della funzione.'),
      storedAt:storedDate(parsed),
    };
    if(backend === 'sessionStorage'){
      return Object.assign(base, {
        state:'rebuildable',
        recommendation:'safe',
        stateLabel:tr('REBUILDABLE', 'RIGENERABILE'),
        why:tr('Temporary tab/session data. Lot King can recreate it when needed.', 'Dato temporaneo della scheda/sessione. Lot King può ricrearlo quando serve.'),
      });
    }
    if(/^lk\.editor\.project\./i.test(key)){
      const id = slug(key.slice('lk.editor.project.'.length));
      const record = context.projectRecords.get(id);
      const active = context.activeProjectIds.has(id);
      return Object.assign(base, active ? {
        state:'active',
        stateLabel:tr('ACTIVE PROJECT', 'PROGETTO ATTIVO'),
        why:tr('Currently selected project. Do not delete it while working.', 'È il progetto attualmente selezionato. Non eliminarlo mentre ci stai lavorando.'),
        storedAt:storedDate(parsed, record && record.savedAt),
      } : record ? {
        state:'saved',
        stateLabel:tr('SAVED PROJECT', 'PROGETTO SALVATO'),
        why:tr('Listed in Projects and available to open later.', 'È presente in Progetti e può essere riaperto in seguito.'),
        storedAt:storedDate(parsed, record.savedAt),
      } : {
        state:'review',
        recommendation:'review',
        stateLabel:tr('NOT IN PROJECT LIST', 'FUORI DALLA LISTA PROGETTI'),
        why:tr('No project-catalog entry points to this saved project. Export or inspect it before deleting.', 'Nessuna voce del catalogo punta a questo progetto salvato. Esportalo o controllalo prima di eliminarlo.'),
      });
    }
    if(/^lotking\.level\./i.test(key)){
      const id = key.slice('lotking.level.'.length);
      const record = context.levelRecords.get(id);
      const active = id === context.activeLevelId;
      return Object.assign(base, active ? {
        state:'active',
        stateLabel:tr('ACTIVE LEVEL', 'LIVELLO ATTIVO'),
        why:tr('Currently loaded level snapshot.', 'Snapshot del livello attualmente caricato.'),
        storedAt:storedDate(parsed, record && record.savedAt),
      } : record ? {
        state:'saved',
        stateLabel:tr('SAVED LEVEL', 'LIVELLO SALVATO'),
        why:tr('Listed in the current level library.', 'È presente nella libreria livelli corrente.'),
        storedAt:storedDate(parsed, record.savedAt),
      } : {
        state:'review',
        recommendation:'review',
        stateLabel:tr('NOT IN LEVEL LIST', 'FUORI DALLA LISTA LIVELLI'),
        why:tr('No level-catalog entry points to this snapshot. Review it before deleting.', 'Nessuna voce del catalogo punta a questo snapshot. Controllalo prima di eliminarlo.'),
      });
    }
    if(key === 'lotking.scene.v1'){
      return Object.assign(base, {
        state:'active',
        stateLabel:tr('ACTIVE SCENE', 'SCENA ATTIVA'),
        why:tr('Working scene snapshot used by the editor/runtime.', 'Snapshot di lavoro usato dall’editor e dal runtime.'),
      });
    }
    if(key === 'lk.editor.projects.v1' || key === 'lotking.levels.v1' || key === 'lk.editor.browserProject.v1'){
      return Object.assign(base, {
        state:'active',
        stateLabel:tr('ACTIVE INDEX', 'INDICE ATTIVO'),
        why:tr('Defines which saved projects or levels are valid and currently selected.', 'Definisce quali progetti o livelli sono validi e attualmente selezionati.'),
      });
    }
    if(key === 'lk.projectWorkspace.v1'){
      return Object.assign(base, {
        state:'active',
        stateLabel:tr('ACTIVE WORKSPACE', 'WORKSPACE ATTIVO'),
        why:tr('Defines the current browser/folder workspace and must normally be kept.', 'Definisce il workspace browser/cartella corrente e normalmente va mantenuto.'),
      });
    }
    if(/prefs|setting|lang|theme|window|folder|inspector|benchmark|backend|difficulty|input|gamepad|welcome/i.test(key)){
      return Object.assign(base, {
        state:'preference',
        stateLabel:tr('PREFERENCE', 'PREFERENZA'),
        why:tr('A current preference, not an old version. Delete only to reset it to default.', 'È una preferenza corrente, non una vecchia versione. Eliminala solo per ripristinare il valore predefinito.'),
      });
    }
    return base;
  }
  function friendlyStorageLabel(key, value){
    const parsed = safeJson(value, null);
    if(/^lk\.editor\.project\./i.test(key)){
      const name = parsed && parsed.meta && (parsed.meta.projectName || parsed.meta.trackName || parsed.meta.levelName);
      return tr('Project: ', 'Progetto: ') + (name || key.slice('lk.editor.project.'.length));
    }
    if(/^lotking\.level\./i.test(key)){
      const name = parsed && parsed.meta && (parsed.meta.trackName || parsed.meta.levelName);
      return tr('Level: ', 'Livello: ') + (name || key.slice('lotking.level.'.length));
    }
    if(key === 'lk.editor.projects.v1') return tr('Project catalog', 'Catalogo progetti');
    if(key === 'lotking.levels.v1') return tr('Level catalog', 'Catalogo livelli');
    if(key === 'lotking.scene.v1') return tr('Active scene snapshot', 'Snapshot scena attiva');
    if(key === 'lk.projectWorkspace.v1') return tr('Current workspace state', 'Stato workspace corrente');
    return key;
  }
  function download(name, value, mime){
    const blob = value instanceof Blob ? value : new Blob([value], {type:mime || 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function riskForKey(key){
    if(key === 'lotking.scene.v1' || /^lotking\.level(?:s\.|\.|$)/i.test(key) || /^lk\.editor\.project(?:s\.|\.|$)/i.test(key)){
      return {level:'critical', category:tr('Projects & levels', 'Progetti e livelli')};
    }
    if(/asset|soundset|music|radiohud|playerblueprint|logicElement/i.test(key)){
      return {level:'critical', category:tr('Assets & media', 'Asset e media')};
    }
    if(/workspace|handle/i.test(key)){
      return {level:'important', category:tr('Workspace', 'Area di lavoro')};
    }
    if(/prefs|setting|lang|theme|window|folder|inspector|benchmark|backend|difficulty|input|gamepad|welcome/i.test(key)){
      return {level:'low', category:tr('Preferences', 'Preferenze')};
    }
    if(/p2p|session|peer|network/i.test(key)){
      return {level:'low', category:tr('Sessions & network', 'Sessioni e rete')};
    }
    return {level:'important', category:tr('Other Lot King data', 'Altri dati Lot King')};
  }
  function addStorageRows(storage, backend, context){
    if(!storage) return [];
    const result = [];
    const keys = [];
    try {
      for(let i = 0; i < storage.length; i++){
        const key = storage.key(i);
        if(owned(key)) keys.push(key);
      }
    } catch(err){ return result; }
    keys.sort();
    keys.forEach(key => {
      let value = '';
      try { value = storage.getItem(key) || ''; } catch(err){}
      const meta = riskForKey(key);
      const rowState = localRowState(key, value, backend, context);
      result.push({
        id:backend + ':' + key,
        backend,
        category:meta.category,
        label:key,
        displayLabel:friendlyStorageLabel(key, value),
        detail:backend === 'localStorage'
          ? tr('Persistent data for this browser origin', 'Dato persistente per questa origine browser')
          : tr('Temporary data for this browser tab', 'Dato temporaneo per questa scheda'),
        bytes:textBytes(key) + textBytes(value),
        count:1,
        risk:meta.level,
        state:rowState.state,
        stateLabel:rowState.stateLabel,
        recommendation:rowState.recommendation,
        why:rowState.why,
        storedAt:rowState.storedAt,
        remove:async function(){ storage.removeItem(key); },
      });
    });
    return result;
  }
  function openExistingDb(name){
    return new Promise(resolve => {
      if(!window.indexedDB){ resolve(null); return; }
      let created = false;
      const req = indexedDB.open(name);
      req.onupgradeneeded = function(){ created = true; };
      req.onerror = function(){ resolve(null); };
      req.onsuccess = function(){
        const db = req.result;
        if(created){
          db.close();
          indexedDB.deleteDatabase(name);
          resolve(null);
          return;
        }
        resolve(db);
      };
    });
  }
  function scanStore(db, storeName){
    return new Promise(resolve => {
      const result = {count:0, bytes:0, keys:[]};
      let tx;
      try { tx = db.transaction(storeName, 'readonly'); }
      catch(err){ resolve(result); return; }
      const req = tx.objectStore(storeName).openCursor();
      req.onerror = function(){ resolve(result); };
      req.onsuccess = function(){
        const cursor = req.result;
        if(!cursor){ resolve(result); return; }
        const value = cursor.value;
        result.count++;
        result.keys.push(cursor.key);
        if(value instanceof Blob) result.bytes += value.size;
        else if(value instanceof ArrayBuffer) result.bytes += value.byteLength;
        else if(ArrayBuffer.isView(value)) result.bytes += value.byteLength;
        else {
          try { result.bytes += textBytes(JSON.stringify(value)); } catch(err){}
        }
        cursor.continue();
      };
    });
  }
  async function clearStore(dbName, storeName, keys){
    const db = await openExistingDb(dbName);
    if(!db) return;
    await new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(storeName, 'readwrite'); }
      catch(err){ reject(err); return; }
      const store = tx.objectStore(storeName);
      if(Array.isArray(keys)) keys.forEach(key => store.delete(key));
      else store.clear();
      tx.oncomplete = resolve;
      tx.onerror = function(){ reject(tx.error || new Error('IndexedDB cleanup failed')); };
      tx.onabort = function(){ reject(tx.error || new Error('IndexedDB cleanup aborted')); };
    });
    db.close();
  }
  function referencedBlobKeys(localRows){
    const refs = new Set();
    localRows.forEach(row => {
      let raw = '';
      try { raw = localStorage.getItem(row.label) || ''; } catch(err){}
      const pattern = /"(?:dbKey|assetDbKey|blobDbKey)"\s*:\s*"((?:\\.|[^"])*)"/gi;
      let match;
      while((match = pattern.exec(raw))){
        try { refs.add(JSON.parse('"' + match[1] + '"')); } catch(err){}
      }
    });
    return refs;
  }
  async function databaseRows(localRows){
    const result = [];
    const available = [];
    let databaseListAvailable = false;
    if(window.indexedDB && typeof indexedDB.databases === 'function'){
      try {
        const listed = await indexedDB.databases();
        databaseListAvailable = true;
        listed.forEach(info => {
          if(info && KNOWN_DATABASES.includes(info.name) && !available.includes(info.name)) available.push(info.name);
        });
      } catch(err){}
    }
    if(!databaseListAvailable) KNOWN_DATABASES.forEach(name => { if(!available.includes(name)) available.push(name); });
    const refs = referencedBlobKeys(localRows);
    for(const dbName of available){
      const db = await openExistingDb(dbName);
      if(!db) continue;
      const stores = Array.from(db.objectStoreNames);
      for(const storeName of stores){
        const info = await scanStore(db, storeName);
        const isAssets = dbName === ASSET_DATABASE && storeName === ASSET_STORE;
        result.push({
          id:'indexedDB:' + dbName + '/' + storeName,
          backend:'IndexedDB',
          category:isAssets ? tr('Assets & media', 'Asset e media') : tr('Workspace', 'Area di lavoro'),
          label:dbName + ' / ' + storeName,
          detail:isAssets
            ? tr('Imported asset binary data', 'Dati binari degli asset importati')
            : tr('Local folder permissions and workspace handles', 'Permessi cartella locale e riferimenti workspace'),
          bytes:info.bytes,
          count:info.count,
          risk:isAssets ? 'critical' : 'important',
          state:'active',
          stateLabel:isAssets ? tr('REFERENCED ASSET STORE', 'ARCHIVIO ASSET REFERENZIATO') : tr('ACTIVE WORKSPACE DATA', 'DATI WORKSPACE ATTIVI'),
          recommendation:'keep',
          why:isAssets
            ? tr('Contains binary files referenced by saved projects and asset libraries. Clear only for a complete asset reset.', 'Contiene file binari referenziati da progetti e librerie asset. Svuotalo solo per un reset completo degli asset.')
            : tr('Contains authorized local-file or folder handles used by the workspace.', 'Contiene riferimenti autorizzati a file o cartelle locali usati dal workspace.'),
          storedAt:null,
          remove:async function(){ await clearStore(dbName, storeName); },
        });
        if(isAssets){
          const stored = new Set(info.keys.map(String));
          const missing = Array.from(refs).filter(key => !stored.has(String(key)));
          const orphan = info.keys.filter(key => !refs.has(String(key)));
          if(missing.length){
            diagnostics.push({
              level:'critical',
              title:tr('Missing imported asset data', 'Dati asset importati mancanti'),
              detail:tr(
                missing.length + ' asset reference(s) point to blobs no longer present in IndexedDB.',
                missing.length + ' riferimenti asset puntano a blob non più presenti in IndexedDB.'
              ),
            });
          }
          if(orphan.length){
            diagnostics.push({
              level:'warning',
              title:tr('Possibly unreferenced asset blobs', 'Blob asset forse non referenziati'),
              detail:tr(
                orphan.length + ' blob(s) are not referenced by the currently stored Lot King JSON. Plugins or unopened exports may still need them.',
                orphan.length + ' blob non sono referenziati dai JSON Lot King attualmente salvati. Plugin o export non aperti potrebbero comunque usarli.'
              ),
            });
            result.push({
              id:'indexedDB:unreferenced-assets',
              backend:'IndexedDB',
              category:tr('Diagnostics', 'Diagnostica'),
              label:tr('Possibly unreferenced asset blobs', 'Blob asset forse non referenziati'),
              detail:tr('Heuristic cleanup; review carefully before deleting', 'Pulizia euristica: controllare con attenzione prima di eliminare'),
              bytes:0,
              count:orphan.length,
              risk:'critical',
              state:'review',
              stateLabel:tr('REVIEW CANDIDATE', 'DA CONTROLLARE'),
              recommendation:'review',
              why:tr('No currently stored Lot King JSON references these blobs. This is heuristic, so export first.', 'Nessun JSON Lot King attualmente salvato referenzia questi blob. È un controllo euristico: esporta prima.'),
              storedAt:null,
              remove:async function(){ await clearStore(dbName, storeName, orphan); },
            });
          }
        }
      }
      db.close();
    }
    return result;
  }
  function catalogDiagnostics(){
    function analyze(indexKey, itemPrefix, collectionName, singular){
      const list = safeJson(localStorage.getItem(indexKey) || '{}', {});
      const entries = Array.isArray(list)
        ? list
        : (Array.isArray(list && list[collectionName]) ? list[collectionName] : []);
      const storedKeys = [];
      for(let i = 0; i < localStorage.length; i++){
        const key = localStorage.key(i);
        if(key && key.indexOf(itemPrefix) === 0) storedKeys.push(key);
      }
      const expected = new Set();
      const missing = entries.filter(item => {
        const id = item && (item.id || item.key);
        if(!id) return false;
        const normalized = String(id).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || String(id);
        expected.add(itemPrefix + String(id));
        expected.add(itemPrefix + normalized);
        return !storedKeys.some(key => key === itemPrefix + id || key === itemPrefix + normalized);
      });
      const orphan = storedKeys.filter(key => !expected.has(key));
      if(missing.length){
        diagnostics.push({
          level:'critical',
          title:tr('Incomplete ' + singular + ' index', 'Indice ' + singular + ' incompleto'),
          detail:tr(
            missing.length + ' catalog entry/entries have no matching saved data.',
            missing.length + ' voci del catalogo non hanno dati salvati corrispondenti.'
          ),
        });
      }
      if(orphan.length){
        diagnostics.push({
          level:'warning',
          title:tr('Unlisted local ' + singular, singular + ' locali non indicizzati'),
          detail:tr(
            orphan.length + ' saved entry/entries are not present in the current catalog. They remain selectable individually below.',
            orphan.length + ' elementi salvati non sono presenti nel catalogo corrente. Restano selezionabili singolarmente qui sotto.'
          ),
        });
      }
      if(entries.length > 1){
        diagnostics.push({
          level:'info',
          title:tr('Multiple local ' + singular + ' entries', 'Più elementi locali: ' + singular),
          detail:tr(
            entries.length + ' entries are intentionally stored in this browser. Delete only the ones you no longer need.',
            entries.length + ' elementi sono salvati intenzionalmente in questo browser. Elimina solo quelli che non servono più.'
          ),
        });
      }
    }
    try {
      analyze('lk.editor.projects.v1', 'lk.editor.project.', 'projects', 'projects');
      analyze('lotking.levels.v1', 'lotking.level.', 'levels', 'levels');
    } catch(err){}
  }
  async function cacheRows(){
    const result = [];
    if(!window.caches) return result;
    let names = [];
    try { names = await caches.keys(); } catch(err){ return result; }
    for(const name of names.filter(name => /^(?:lot.?king|lk[-_.])/i.test(name))){
      let count = 0;
      try { count = (await (await caches.open(name)).keys()).length; } catch(err){}
      result.push({
        id:'cacheStorage:' + name,
        backend:'Cache Storage',
        category:tr('Offline cache', 'Cache offline'),
        label:name,
        detail:tr('Files explicitly cached by Lot King or its service worker', 'File salvati esplicitamente da Lot King o dal suo service worker'),
        bytes:0,
        count,
        risk:'important',
        state:'rebuildable',
        stateLabel:tr('REBUILDABLE CACHE', 'CACHE RIGENERABILE'),
        recommendation:'safe',
        why:tr('Explicit offline cache. It can be downloaded/rebuilt again, although the next load may be slower.', 'Cache offline esplicita. Può essere riscaricata/rigenerata, anche se il prossimo avvio può essere più lento.'),
        storedAt:null,
        remove:async function(){ await caches.delete(name); },
      });
    }
    return result;
  }
  async function serviceWorkerRows(){
    const result = [];
    if(!navigator.serviceWorker || !navigator.serviceWorker.getRegistrations) return result;
    let regs = [];
    try { regs = await navigator.serviceWorker.getRegistrations(); } catch(err){ return result; }
    regs.filter(reg => {
      try {
        if(new URL(reg.scope).origin !== location.origin) return false;
        const worker = reg.active || reg.waiting || reg.installing;
        return !!(worker && /(?:lot.?king|\/lk[-_.])/i.test(new URL(worker.scriptURL).pathname));
      } catch(err){ return false; }
    }).forEach((reg, index) => {
      result.push({
        id:'serviceWorker:' + index + ':' + reg.scope,
        backend:'Service worker',
        category:tr('Offline runtime', 'Runtime offline'),
        label:reg.scope,
        detail:tr('Controls cached/offline behavior for this origin', 'Controlla il comportamento cache/offline per questa origine'),
        bytes:0,
        count:1,
        risk:'important',
        state:'system',
        stateLabel:tr('ACTIVE RUNTIME', 'RUNTIME ATTIVO'),
        recommendation:'keep',
        why:tr('Controls offline/runtime behavior. Remove only while diagnosing a stale deployment.', 'Controlla il comportamento offline/runtime. Rimuovilo solo per diagnosticare un deployment non aggiornato.'),
        storedAt:null,
        remove:async function(){ await reg.unregister(); },
      });
    });
    return result;
  }
  function make(tag, cls, text){
    const node = document.createElement(tag);
    if(cls) node.className = cls;
    if(text != null) node.textContent = text;
    return node;
  }
  function button(text, action, cls){
    const node = make('button', cls || 'lk-storage-btn', text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function summaryCard(label, value, detail){
    const card = make('div', 'lk-storage-summary-card');
    card.append(make('span', '', label), make('b', '', value), make('i', '', detail || ''));
    return card;
  }
  function rowMatchesFilter(row){
    if(viewFilter === 'keep') return row.recommendation === 'keep';
    if(viewFilter === 'review') return row.recommendation === 'review';
    if(viewFilter === 'safe') return row.recommendation === 'safe';
    return true;
  }
  function setFilter(filter){
    viewFilter = ['all','keep','review','safe'].includes(filter) ? filter : 'all';
    render();
  }
  function stateRank(row){
    return ({active:0, saved:1, system:2, preference:3, review:4, rebuildable:5})[row.state] ?? 6;
  }
  function render(){
    host.replaceChildren();
    const hero = make('div', 'lk-storage-hero');
    const title = make('div', 'lk-storage-title', tr('Browser Storage Manager', 'Gestione archiviazione browser'));
    const intro = make('p', '', tr(
      'See what Lot King is actively using, what is still a valid saved item and what may be cleaned after review.',
      'Scopri cosa Lot King sta usando, cosa è ancora un elemento salvato valido e cosa può essere pulito dopo un controllo.'
    ));
    const warning = make('div', 'lk-storage-warning', tr(
      'Before deleting projects, levels or imported assets, export the current project as an LKEP file. LocalStorage backup does not contain IndexedDB asset blobs.',
      'Prima di eliminare progetti, livelli o asset importati, esporta il progetto corrente come file LKEP. Il backup LocalStorage non contiene i blob degli asset in IndexedDB.'
    ));
    hero.append(title, intro, warning);

    const tools = make('div', 'lk-storage-tools');
    tools.append(
      button(tr('↻ Refresh inventory', '↻ Aggiorna inventario'), refresh),
      button(tr('⇩ Export current project', '⇩ Esporta progetto corrente'), exportCurrent, 'lk-storage-btn primary'),
      button(tr('⇩ Backup LocalStorage', '⇩ Backup LocalStorage'), backupLocal),
      button(tr('⇧ Restore backup', '⇧ Ripristina backup'), chooseRestore),
      button(tr('⇩ Inventory report', '⇩ Report inventario'), downloadReport),
      button(tr('Protect browser storage', 'Proteggi storage browser'), requestPersistence)
    );
    const restoreInput = document.createElement('input');
    restoreInput.type = 'file';
    restoreInput.accept = '.json,application/json';
    restoreInput.hidden = true;
    restoreInput.addEventListener('change', restoreBackup);
    tools.appendChild(restoreInput);
    restoreInput.id = 'lkStorageRestoreInput';

    const summary = make('div', 'lk-storage-summary');
    const local = rows.filter(row => row.backend === 'localStorage');
    const assets = rows.find(row => row.id === 'indexedDB:' + ASSET_DATABASE + '/' + ASSET_STORE);
    summary.append(
      summaryCard(tr('Origin usage', 'Uso origine'), estimate && estimate.usage != null ? fmtBytes(estimate.usage) : '—', estimate && estimate.quota ? tr('of ', 'su ') + fmtBytes(estimate.quota) : ''),
      summaryCard('LocalStorage', String(local.length), fmtBytes(local.reduce((sum, row) => sum + row.bytes, 0))),
      summaryCard(tr('Asset blobs', 'Blob asset'), assets ? String(assets.count) : '0', assets ? fmtBytes(assets.bytes) : '0 B'),
      summaryCard(tr('Persistent storage', 'Archiviazione persistente'), persisted == null ? '—' : (persisted ? tr('Granted', 'Concessa') : tr('Not granted', 'Non concessa')), location.origin)
    );

    const assistant = make('div', 'lk-storage-assistant');
    const assistantCopy = make('div', 'lk-storage-assistant-copy');
    assistantCopy.append(
      make('b', '', tr('Cleanup Assistant', 'Assistente pulizia')),
      make('span', '', tr(
        'Names ending in .v1, .v2 and similar are data-schema identifiers, not chronological copies. Never delete an entry only because its name contains an older schema number.',
        'I nomi che terminano in .v1, .v2 e simili indicano lo schema dei dati, non copie cronologiche. Non eliminare mai una voce soltanto perché contiene un numero di schema più vecchio.'
      )),
      make('span', '', tr(
        '“Date unavailable” means that browser storage did not record a reliable modification date; it does not mean the item is old.',
        '“Data non disponibile” significa che lo storage browser non ha registrato una data di modifica affidabile; non significa che la voce sia vecchia.'
      ))
    );
    const filterBar = make('div', 'lk-storage-filters');
    [
      ['all', tr('All', 'Tutto'), rows.length],
      ['keep', tr('Active / valid', 'Attivi / validi'), rows.filter(row => row.recommendation === 'keep').length],
      ['review', tr('Review candidates', 'Da controllare'), rows.filter(row => row.recommendation === 'review').length],
      ['safe', tr('Rebuildable', 'Rigenerabili'), rows.filter(row => row.recommendation === 'safe').length],
    ].forEach(item => {
      const filterButton = button(item[1] + ' · ' + item[2], function(){ setFilter(item[0]); }, 'lk-storage-filter');
      filterButton.classList.toggle('on', viewFilter === item[0]);
      filterButton.dataset.storageFilter = item[0];
      filterBar.appendChild(filterButton);
    });
    assistant.append(assistantCopy, filterBar);

    const diag = make('div', 'lk-storage-diagnostics');
    if(!diagnostics.length){
      diag.append(make('div', 'lk-storage-diagnostic ok', tr('No known storage discrepancy detected.', 'Nessuna discrepanza nota rilevata nello storage.')));
    } else {
      diagnostics.forEach(item => {
        const box = make('div', 'lk-storage-diagnostic ' + item.level);
        box.append(make('b', '', item.title), make('span', '', item.detail));
        diag.appendChild(box);
      });
    }

    const selection = make('div', 'lk-storage-selection');
    selection.append(
      button(tr('Select rebuildable only', 'Seleziona solo rigenerabili'), function(){
        rows.filter(row => row.recommendation === 'safe').forEach(row => selected.add(row.id));
        render();
      }),
      button(tr('Select review candidates', 'Seleziona elementi da controllare'), function(){
        rows.filter(row => row.recommendation === 'review').forEach(row => selected.add(row.id));
        viewFilter = 'review';
        render();
      }),
      button(tr('Clear selection', 'Azzera selezione'), function(){ selected.clear(); render(); }),
      make('span', '', tr(selected.size + ' selected', selected.size + ' selezionati')),
      button(tr('Review selected cleanup', 'Rivedi pulizia selezionata'), reviewSelection, 'lk-storage-btn danger')
    );
    selection.lastChild.disabled = selected.size === 0;

    const list = make('div', 'lk-storage-list');
    const visibleRows = rows.filter(rowMatchesFilter);
    if(!visibleRows.length) list.append(make('div', 'lk-storage-empty', rows.length
      ? tr('No entries match this cleanup filter.', 'Nessuna voce corrisponde a questo filtro di pulizia.')
      : tr('No Lot King browser data found for this origin.', 'Nessun dato browser Lot King trovato per questa origine.')));
    const grouped = new Map();
    visibleRows.forEach(row => {
      if(!grouped.has(row.category)) grouped.set(row.category, []);
      grouped.get(row.category).push(row);
    });
    grouped.forEach((items, category) => {
      list.append(make('div', 'lk-storage-group-title', category));
      items.sort((a, b) => stateRank(a) - stateRank(b) || String(b.storedAt || '').localeCompare(String(a.storedAt || ''))).forEach(row => {
        const label = make('label', 'lk-storage-row risk-' + row.risk + ' state-' + (row.state || 'system'));
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = selected.has(row.id);
        check.dataset.storageId = row.id;
        check.addEventListener('change', function(){
          if(check.checked) selected.add(row.id); else selected.delete(row.id);
          render();
        });
        const body = make('span', 'lk-storage-row-body');
        body.append(
          make('b', '', row.displayLabel || row.label),
          make('i', '', row.why || row.detail),
          make('code', '', row.displayLabel && row.displayLabel !== row.label ? row.label : '')
        );
        const meta = make('span', 'lk-storage-row-meta');
        meta.append(
          make('strong', 'state ' + (row.state || 'system'), row.stateLabel || tr('IN USE', 'IN USO')),
          make('em', 'risk ' + row.risk, row.risk === 'critical' ? tr('HIGH IMPACT', 'IMPATTO ALTO') : row.risk === 'important' ? tr('CAUTION', 'ATTENZIONE') : tr('LOW RISK', 'BASSO RISCHIO')),
          make('small', '', row.backend + ' · ' + row.count + tr(' item(s)', ' elementi') + (row.bytes ? ' · ' + fmtBytes(row.bytes) : '')),
          make('time', '', fmtDate(row.storedAt))
        );
        label.append(check, body, meta);
        list.appendChild(label);
      });
    });

    const note = make('div', 'lk-storage-browser-note');
    note.append(make('b', '', tr('Normal browser HTTP cache', 'Cache HTTP normale del browser')), make('span', '', tr(
      'Browsers do not let a page inspect or selectively delete their regular HTTP cache. Use a hard reload or the browser site-data controls for that cache. The entries above are storage explicitly owned by Lot King.',
      'I browser non permettono a una pagina di ispezionare o cancellare selettivamente la normale cache HTTP. Usa un hard reload o i controlli dati del sito del browser. Le voci sopra sono storage esplicitamente gestiti da Lot King.'
    )));
    host.append(hero, tools, summary, assistant, diag, selection, list, note);
  }
  async function refresh(){
    if(busy) return;
    busy = true;
    host.classList.add('busy');
    diagnostics = [];
    try {
      estimate = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
      const context = readStorageContext();
      const localRows = addStorageRows(window.localStorage, 'localStorage', context);
      const sessionRows = addStorageRows(window.sessionStorage, 'sessionStorage', context);
      catalogDiagnostics();
      rows = localRows.concat(sessionRows);
      rows = rows.concat(await databaseRows(localRows));
      rows = rows.concat(await cacheRows());
      rows = rows.concat(await serviceWorkerRows());
      selected.forEach(id => { if(!rows.some(row => row.id === id)) selected.delete(id); });
    } catch(err){
      diagnostics.push({level:'critical', title:tr('Inventory failed', 'Inventario fallito'), detail:String(err && err.message || err)});
    } finally {
      busy = false;
      host.classList.remove('busy');
      render();
    }
  }
  function exportCurrent(){
    const io = window.LK_EDITOR_PROJECT_IO_INSTANCE;
    if(io && typeof io.exportProject === 'function'){
      io.exportProject();
      return;
    }
    status(tr('Project export is not ready yet.', 'L’esportazione del progetto non è ancora pronta.'));
  }
  function backupLocal(){
    const entries = {};
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(owned(key)) entries[key] = localStorage.getItem(key);
    }
    const backup = {
      format:'LOT_KING_LOCALSTORAGE_BACKUP',
      version:1,
      createdAt:new Date().toISOString(),
      origin:location.origin,
      warning:'This backup contains Lot King LocalStorage only. Imported IndexedDB asset blobs are included only in a portable LKEP project export.',
      entries,
    };
    download('lot-king-localstorage-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(backup, null, 2));
  }
  function chooseRestore(){
    const input = host.querySelector('#lkStorageRestoreInput');
    if(input){ input.value = ''; input.click(); }
  }
  async function restoreBackup(event){
    const file = event.target.files && event.target.files[0];
    if(!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if(!parsed || parsed.format !== 'LOT_KING_LOCALSTORAGE_BACKUP' || !parsed.entries || typeof parsed.entries !== 'object'){
        throw new Error(tr('This is not a valid Lot King LocalStorage backup.', 'Questo non è un backup LocalStorage Lot King valido.'));
      }
      const entries = Object.entries(parsed.entries).filter(pair => owned(pair[0]) && typeof pair[1] === 'string');
      const ok = await confirmAction({
        title:tr('Restore LocalStorage backup?', 'Ripristinare il backup LocalStorage?'),
        message:tr(
          entries.length + ' Lot King entries will be merged into this origin. Existing entries with the same name will be replaced. IndexedDB assets are not restored.',
          entries.length + ' voci Lot King verranno unite a questa origine. Le voci esistenti con lo stesso nome saranno sostituite. Gli asset IndexedDB non vengono ripristinati.'
        ),
        okText:tr('Restore', 'Ripristina'),
        danger:true,
      });
      if(!ok) return;
      entries.forEach(pair => localStorage.setItem(pair[0], pair[1]));
      status(tr('LocalStorage backup restored. Reload the editor.', 'Backup LocalStorage ripristinato. Ricarica l’editor.'));
      await refresh();
      showReload();
    } catch(err){
      status(tr('Backup restore failed: ', 'Ripristino backup fallito: ') + String(err && err.message || err));
    }
  }
  function downloadReport(){
    const report = {
      format:'LOT_KING_STORAGE_INVENTORY',
      version:1,
      createdAt:new Date().toISOString(),
      origin:location.origin,
      estimate,
      persisted,
      diagnostics,
      entries:rows.map(row => ({
        backend:row.backend, category:row.category, key:row.label,
        count:row.count, approximateBytes:row.bytes, risk:row.risk,
        state:row.state, recommendation:row.recommendation, storedAt:row.storedAt || null,
        reason:row.why || row.detail || '',
      })),
    };
    download('lot-king-storage-inventory-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(report, null, 2));
  }
  async function requestPersistence(){
    if(!(navigator.storage && navigator.storage.persist)){
      status(tr('Persistent storage is not supported by this browser.', 'Lo storage persistente non è supportato da questo browser.'));
      return;
    }
    try {
      persisted = await navigator.storage.persist();
      status(persisted
        ? tr('Browser storage protection granted.', 'Protezione dello storage browser concessa.')
        : tr('The browser did not grant persistent storage. Keep portable project backups.', 'Il browser non ha concesso lo storage persistente. Conserva backup portatili del progetto.'));
      render();
    } catch(err){
      status(tr('Persistent storage request failed.', 'Richiesta storage persistente fallita.'));
    }
  }
  function confirmAction(options){
    if(typeof window.LK_EDITOR_CONFIRM === 'function') return window.LK_EDITOR_CONFIRM(options);
    return Promise.resolve(window.confirm(options.message || options.title));
  }
  function reviewSelection(){
    const chosen = rows.filter(row => selected.has(row.id));
    if(!chosen.length) return;
    const highImpact = chosen.some(row => row.risk === 'critical');
    const box = make('div', 'lk-storage-confirm');
    box.append(make('b', '', tr('Final cleanup review', 'Revisione finale pulizia')));
    box.append(make('p', '', tr(
      chosen.length + ' selected storage entries will be permanently deleted from this browser origin.',
      chosen.length + ' voci selezionate verranno eliminate definitivamente da questa origine del browser.'
    )));
    const names = make('ul', '');
    chosen.forEach(row => names.append(make('li', '', (row.stateLabel || tr('IN USE', 'IN USO')) + ' · ' + row.backend + ': ' + (row.displayLabel || row.label) + (row.displayLabel && row.displayLabel !== row.label ? ' [' + row.label + ']' : ''))));
    box.appendChild(names);
    let safety = null;
    let typed = null;
    if(highImpact){
      const safetyLabel = make('label', 'lk-storage-safety');
      safety = document.createElement('input');
      safety.type = 'checkbox';
      safetyLabel.append(safety, document.createTextNode(tr(
        ' I exported the project/assets I need.',
        ' Ho esportato il progetto/gli asset che mi servono.'
      )));
      typed = document.createElement('input');
      typed.type = 'text';
      typed.placeholder = tr('Type DELETE', 'Scrivi DELETE');
      typed.className = 'lk-storage-delete-word';
      box.append(safetyLabel, typed);
    }
    const actions = make('div', 'lk-storage-confirm-actions');
    const cancel = button(tr('Cancel', 'Annulla'), render);
    const execute = button(tr('Delete selected data', 'Elimina i dati selezionati'), async function(){
      if(highImpact && (!safety.checked || typed.value.trim() !== 'DELETE')){
        typed.classList.add('invalid');
        return;
      }
      execute.disabled = true;
      let failed = 0;
      for(const row of chosen){
        try { await row.remove(); } catch(err){ failed++; }
      }
      selected.clear();
      status(failed
        ? tr('Cleanup completed with ', 'Pulizia completata con ') + failed + tr(' error(s).', ' errori.')
        : tr('Selected Lot King browser data deleted.', 'Dati browser Lot King selezionati eliminati.'));
      await refresh();
      showReload();
    }, 'lk-storage-btn danger');
    actions.append(cancel, execute);
    box.appendChild(actions);
    host.replaceChildren(box);
  }
  function showReload(){
    const banner = make('div', 'lk-storage-reload');
    banner.append(make('span', '', tr(
      'Reload now so the running editor cannot write an old in-memory copy back into storage.',
      'Ricarica ora per evitare che l’editor in esecuzione riscriva nello storage una vecchia copia rimasta in memoria.'
    )), button(tr('Reload editor', 'Ricarica editor'), function(){ location.reload(); }, 'lk-storage-btn primary'));
    host.prepend(banner);
  }
  function setLanguage(){ render(); }

  render();
  return Object.freeze({refresh, setLanguage});
}

window.LK_EDITOR_STORAGE_MANAGER = Object.freeze({create});
})();
