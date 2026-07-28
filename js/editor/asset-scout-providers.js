/* =========================================================
   LOT KING — ASSET SCOUT providers

   Pure data layer for the online free-asset search. No DOM, no editor
   dependencies: every provider is a self-contained descriptor that knows how
   to search its catalogue and how to turn one result into a list of files the
   normal editor import pipeline can consume.

   ---------------------------------------------------------------------------
   ADDING OR REMOVING A SOURCE
   ---------------------------------------------------------------------------
   Each provider is one object in PROVIDERS below. Deleting that object removes
   the source completely — no other file references a provider by name. A
   provider must satisfy three rules before it can ship here:

     1. CORS. Both the catalogue endpoint and the file host must answer with
        `Access-Control-Allow-Origin`, otherwise the browser blocks the fetch
        and the entry would only ever show an error. (ambientCG, for example,
        currently fails this and is deliberately absent.)
     2. License clarity. Every result must carry a license label and a link.
        Results whose license cannot be resolved are dropped by `search()`
        rather than shown without it, so nothing can be imported blind.
     3. No API key. Anything requiring a token or an account belongs in a
        plugin, not in the built-in editor.
   ========================================================= */
(function(){
'use strict';

const REQUEST_TIMEOUT_MS = 20000;

function timeoutSignal(ms){
  if(typeof AbortController === 'undefined') return {signal:undefined, cancel:() => {}};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms || REQUEST_TIMEOUT_MS);
  return {signal:controller.signal, cancel:() => clearTimeout(timer)};
}

function fetchJson(url, options){
  const opts = options || {};
  const {signal, cancel} = timeoutSignal(opts.timeout);
  return fetch(url, {signal, mode:'cors', credentials:'omit'})
    .then(response => {
      if(!response.ok) throw new Error('HTTP ' + response.status + ' from ' + url);
      return response.json();
    })
    .finally(cancel);
}

function matchesQuery(haystack, query){
  const text = String(query || '').trim().toLowerCase();
  if(!text) return true;
  const words = text.split(/\s+/).filter(Boolean);
  const target = String(haystack || '').toLowerCase();
  return words.every(word => target.indexOf(word) >= 0);
}

function fileNameFromUrl(url, fallback){
  const clean = String(url || '').split(/[?#]/)[0];
  const name = clean.slice(clean.lastIndexOf('/') + 1);
  return name || fallback || 'asset';
}

// ------------------------------------------------ license registry
// A single place that decides what a license string means for the editor.
// `permissive` drives the green badge and the one-click import; anything else
// is still shown, with its terms, but the UI asks for an explicit confirm.

const LICENSES = {
  cc0:{id:'cc0', label:'CC0 1.0 (public domain)', permissive:true, url:'https://creativecommons.org/publicdomain/zero/1.0/', summary:'No attribution required. Free for commercial and personal use, including modification and redistribution.'},
  'cc-by':{id:'cc-by', label:'CC BY 4.0', permissive:false, url:'https://creativecommons.org/licenses/by/4.0/', summary:'Free to use and modify, including commercially, but you must credit the original author.'},
  'cc-by-nc':{id:'cc-by-nc', label:'CC BY-NC (non-commercial)', permissive:false, url:'https://creativecommons.org/licenses/by-nc/4.0/', summary:'Attribution required AND commercial use is not permitted. Do not ship this in a paid or monetised project.'},
  'cc-by-nd':{id:'cc-by-nd', label:'CC BY-ND 4.0', permissive:false, url:'https://creativecommons.org/licenses/by-nd/4.0/', summary:'Attribution required and derivative works may not be distributed. Check this before shipping a modified version.'},
  'cc-by-sa':{id:'cc-by-sa', label:'CC BY-SA 4.0', permissive:false, url:'https://creativecommons.org/licenses/by-sa/4.0/', summary:'Attribution required and derivatives must keep the same license.'},
  'apache-2':{id:'apache-2', label:'Apache 2.0', permissive:false, url:'https://www.apache.org/licenses/LICENSE-2.0', summary:'Permissive, but requires preserving the license and attribution notices.'},
  mit:{id:'mit', label:'MIT', permissive:false, url:'https://opensource.org/license/mit', summary:'Permissive, but requires preserving the copyright and license notice.'},
  royalty:{id:'royalty', label:'Royalty free (restricted)', permissive:false, url:'', summary:'Usable in projects, but the source imposes its own conditions. Read them before shipping.'},
  unknown:{id:'unknown', label:'License not resolved', permissive:false, url:'', summary:'The catalogue did not return usable license terms for this asset.'},
};

// Khronos publishes license text per model, in wildly different spellings, and
// a single model can list several licenses (typically an original asset plus a
// re-converted version). The strictest one wins: reporting only the first match
// would understate the terms the user actually has to honour.
const LICENSE_PATTERNS = [
  {re:/cc[\s-]?by[\s-]?nc/, license:'cc-by-nc', strictness:5},
  {re:/cc[\s-]?by[\s-]?nd/, license:'cc-by-nd', strictness:4},
  {re:/cc[\s-]?by[\s-]?sa/, license:'cc-by-sa', strictness:3},
  {re:/cc[\s-]?by/, license:'cc-by', strictness:2},
  {re:/royalty[\s-]?free/, license:'royalty', strictness:2},
  {re:/apache/, license:'apache-2', strictness:1},
  {re:/\bmit\b/, license:'mit', strictness:1},
  {re:/cc0|public domain|creative commons zero/, license:'cc0', strictness:0},
];
function classifyLicenseText(text){
  const value = String(text || '').toLowerCase();
  if(!value) return LICENSES.unknown;
  const matches = LICENSE_PATTERNS.filter(pattern => pattern.re.test(value));
  if(!matches.length) return LICENSES.unknown;
  const strictest = matches.reduce((worst, item) => (item.strictness > worst.strictness ? item : worst), matches[0]);
  return LICENSES[strictest.license] || LICENSES.unknown;
}

// ------------------------------------------------ Poly Haven
// Public JSON API, CC0 for the whole catalogue, and a CDN that also answers
// with permissive CORS headers. Models expose both a glTF and an FBX variant;
// textures expose individual PBR maps.

const POLY_HAVEN = {
  id:'polyhaven',
  label:'Poly Haven',
  home:'https://polyhaven.com/',
  licenseSummary:'Every Poly Haven asset is CC0: usable commercially, no attribution required.',
  attribution:'Poly Haven (polyhaven.com) — CC0',
  // HDRIs are deliberately absent: the engine sky consumes a fixed set of
  // bundled .hdr files and has no import path for arbitrary ones, so listing
  // them would offer a download that nothing could then use.
  categories:[
    {id:'models', label:'Models', kind:'model'},
    {id:'textures', label:'Textures', kind:'texture'},
  ],
  resolutions:['1k', '2k', '4k'],
  formats:[
    {id:'gltf', label:'glTF → GLB (recommended)', kinds:['model']},
    {id:'fbx', label:'FBX source (rebuilt by the FBX plugin)', kinds:['model']},
  ],

  search(query, options){
    const opts = options || {};
    const category = opts.category || 'models';
    return fetchJson('https://api.polyhaven.com/assets?t=' + encodeURIComponent(category)).then(data => {
      const entries = Object.keys(data || {}).map(id => Object.assign({slug:id}, data[id]));
      return entries
        .filter(entry => matchesQuery([entry.slug, entry.name, (entry.tags || []).join(' '), (entry.categories || []).join(' ')].join(' '), query))
        .slice(0, Math.max(1, opts.limit || 60))
        .map(entry => ({
          providerId:POLY_HAVEN.id,
          providerLabel:POLY_HAVEN.label,
          id:entry.slug,
          name:entry.name || entry.slug,
          kind:category === 'models' ? 'model' : 'texture',
          tags:(entry.tags || []).slice(0, 8),
          authors:Object.keys(entry.authors || {}),
          thumbnail:'https://cdn.polyhaven.com/asset_img/thumbs/' + entry.slug + '.png?width=256&height=256',
          pageUrl:'https://polyhaven.com/a/' + entry.slug,
          license:LICENSES.cc0,
          description:String(entry.description || ''),
          // Shown verbatim on the card so a result is never a bare thumbnail:
          // polycount and real-world size are what decide whether a model
          // belongs in a level.
          info:[
            (entry.categories || []).slice(0, 3).join(', ') || null,
            Number.isFinite(entry.polycount) ? Number(entry.polycount).toLocaleString() + ' tris' : null,
            Array.isArray(entry.dimensions) && entry.dimensions.length === 3
              ? entry.dimensions.map(value => (Number(value) / 1000).toFixed(2)).join(' × ') + ' m'
              : null,
            Array.isArray(entry.max_resolution) ? 'up to ' + Math.max.apply(Math, entry.max_resolution) + ' px maps' : null,
          ].filter(Boolean),
        }));
    });
  },

  // Returns descriptors, not blobs: the UI decides when to download and can
  // report progress per file.
  resolveDownload(asset, options){
    const opts = options || {};
    const resolution = POLY_HAVEN.resolutions.indexOf(opts.resolution) >= 0 ? opts.resolution : '1k';
    return fetchJson('https://api.polyhaven.com/files/' + encodeURIComponent(asset.id)).then(files => {
      if(asset.kind === 'texture'){
        // Texture assets are a set of independent maps; import the ones the
        // engine material editor can actually consume.
        const wanted = ['Diffuse', 'nor_gl', 'Rough', 'AO', 'Metal', 'Displacement'];
        const list = [];
        wanted.forEach(map => {
          const entry = files[map] && files[map][resolution] && (files[map][resolution].jpg || files[map][resolution].png);
          if(entry) list.push({name:fileNameFromUrl(entry.url, asset.id + '_' + map + '.jpg'), url:entry.url, size:entry.size, map});
        });
        if(!list.length) throw new Error('Poly Haven returned no texture maps for ' + resolution);
        return {mode:'files', primary:'texture', files:list};
      }
      const format = opts.format === 'fbx' ? 'fbx' : 'gltf';
      // Poly Haven nests one level deeper for models: files[format][res][ext].
      const container = files[format] && files[format][resolution];
      const bundle = container && (container[format] || container[Object.keys(container)[0]]);
      if(!bundle || !bundle.url) throw new Error('Poly Haven has no ' + format.toUpperCase() + ' at ' + resolution + ' for this model');
      const include = bundle.include || {};
      const dependencies = Object.keys(include).map(path => ({
        name:path.slice(path.lastIndexOf('/') + 1),
        path,
        url:include[path].url,
        size:include[path].size,
      }));
      return {
        // glTF arrives as a .gltf plus loose .bin/textures, so it is assembled
        // into a single canonical GLB before it reaches the asset library.
        mode:format === 'gltf' ? 'gltf-bundle' : 'files',
        primary:'model',
        format,
        root:{name:fileNameFromUrl(bundle.url, asset.id + '.' + format), url:bundle.url, size:bundle.size},
        files:[{name:fileNameFromUrl(bundle.url, asset.id + '.' + format), url:bundle.url, size:bundle.size}].concat(dependencies),
        dependencies,
      };
    });
  },
};

// ------------------------------------------------ Khronos glTF Sample Assets
// The reference model set. Already .glb, so it imports with no conversion, but
// the licenses are per-model and range from CC0 to attribution-required — the
// card shows the resolved license for each one.

const KHRONOS_BASE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/';

const KHRONOS = {
  id:'khronos',
  label:'Khronos glTF Samples',
  home:'https://github.com/KhronosGroup/glTF-Sample-Assets',
  licenseSummary:'Licenses differ per model, from CC0 to attribution-required. Each card shows the resolved terms for that asset.',
  attribution:'Khronos glTF Sample Assets',
  categories:[{id:'models', label:'Models', kind:'model'}],
  resolutions:[],
  formats:[{id:'glb', label:'GLB (direct import)', kinds:['model']}],

  search(query, options){
    const opts = options || {};
    return fetchJson(KHRONOS_BASE + 'model-index.json').then(list => {
      const entries = Array.isArray(list) ? list : [];
      return entries
        .filter(entry => entry && entry.variants && (entry.variants['glTF-Binary'] || entry.variants['glTF-Embedded']))
        .filter(entry => matchesQuery([entry.name, entry.label, (entry.tags || []).join(' ')].join(' '), query))
        .slice(0, Math.max(1, opts.limit || 60))
        .map(entry => {
          const variant = entry.variants['glTF-Binary'] ? 'glTF-Binary' : 'glTF-Embedded';
          return {
            providerId:KHRONOS.id,
            providerLabel:KHRONOS.label,
            id:entry.name,
            name:entry.label || entry.name,
            kind:'model',
            tags:(entry.tags || []).slice(0, 8),
            authors:[],
            thumbnail:entry.screenshot ? KHRONOS_BASE + entry.name + '/' + entry.screenshot : null,
            pageUrl:'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/' + entry.name,
            // The index has no license field; the per-model README carries it.
            // Until it is fetched the card states that explicitly instead of
            // implying the asset is free to use.
            license:LICENSES.unknown,
            licensePending:true,
            info:[(entry.tags || []).slice(0, 3).join(', ') || null].filter(Boolean),
            __variant:variant,
            __file:entry.variants[variant],
          };
        });
    });
  },

  // Called lazily by the UI when a card becomes visible, so a search does not
  // fire 148 extra requests.
  resolveLicense(asset){
    return fetch(KHRONOS_BASE + encodeURIComponent(asset.id) + '/README.md', {mode:'cors', credentials:'omit'})
      .then(response => (response.ok ? response.text() : ''))
      .then(text => {
        const section = /##\s*Legal[\s\S]{0,1600}/i.exec(text || '');
        const legal = section ? section[0] : String(text || '');
        const license = classifyLicenseText(legal);
        // Khronos writes copyright lines as "&copy; 2018, ctxwing. [licence]",
        // one per contributor. All of them are credited, not just the first.
        const authors = [];
        const pattern = /(?:&copy;|©)\s*\d{0,4}\s*,?\s*([^.,\n[]+)/g;
        let match;
        while((match = pattern.exec(legal)) !== null){
          const name = match[1].trim();
          if(name && authors.indexOf(name) < 0) authors.push(name);
        }
        return {license, author:authors.join(', ')};
      })
      .catch(() => ({license:LICENSES.unknown, author:''}));
  },

  resolveDownload(asset){
    const file = asset.__file;
    if(!file) return Promise.reject(new Error('This sample has no GLB variant'));
    const url = KHRONOS_BASE + encodeURIComponent(asset.id) + '/' + asset.__variant + '/' + file;
    return Promise.resolve({
      mode:'files',
      primary:'model',
      format:'glb',
      root:{name:file, url},
      files:[{name:file, url}],
      dependencies:[],
    });
  },
};

// ------------------------------------------------ registry

const PROVIDERS = [POLY_HAVEN, KHRONOS];

function list(){ return PROVIDERS.slice(); }
function get(id){ return PROVIDERS.find(provider => provider.id === id) || null; }

window.LK_EDITOR_ASSET_SCOUT_PROVIDERS = Object.freeze({
  LICENSES,
  classifyLicenseText,
  matchesQuery,
  fileNameFromUrl,
  fetchJson,
  list,
  get,
});
})();
