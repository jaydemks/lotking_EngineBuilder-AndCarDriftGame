'use strict';

// Offline test: `fetch` is stubbed with recorded catalogue shapes, so the suite
// never depends on a live network or on a third-party service staying up. The
// fixtures mirror the real payloads, including Poly Haven's extra nesting level
// for model files and Khronos' multi-license README format.

const assert = require('node:assert/strict');

global.window = global;

const responses = new Map();
const requested = [];
function respond(url, body, options){
  responses.set(url, {body, options:options || {}});
}
global.fetch = function(url){
  requested.push(String(url));
  const entry = responses.get(String(url));
  if(!entry) return Promise.resolve({ok:false, status:404, json:() => Promise.reject(new Error('404')), text:() => Promise.resolve('')});
  return Promise.resolve({
    ok:entry.options.ok !== false,
    status:entry.options.status || 200,
    json:() => Promise.resolve(entry.body),
    text:() => Promise.resolve(typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body)),
  });
};

require('../js/editor/asset-scout-providers.js');
const API = global.LK_EDITOR_ASSET_SCOUT_PROVIDERS;

// Tests are chained rather than fired in parallel so output stays in order and
// a rejected async test fails the process instead of becoming an unhandled
// rejection that still exits 0.
let chain = Promise.resolve();
function test(name, run){
  chain = chain
    .then(run)
    .then(() => console.log('ok - ' + name), error => { console.error('not ok - ' + name); throw error; });
}
process.on('exit', code => { if(!code && !finished) { console.error('not ok - suite did not finish'); process.exitCode = 1; } });
let finished = false;

// ------------------------------------------------ fixtures

const PH_MODELS = {
  CheeseBox_01:{
    name:'Cheese Box 01',
    categories:['props', 'containers'],
    tags:['box', 'crate', 'wood'],
    authors:{'Jane Doe':'All'},
    polycount:884,
    dimensions:[240, 140, 90],
    max_resolution:[4096, 4096],
    description:'A small wooden cheese box.',
  },
  Rusty_Barrel:{
    name:'Rusty Barrel',
    categories:['props'],
    tags:['barrel', 'metal', 'rust'],
    authors:{'John Roe':'All'},
    polycount:2100,
    dimensions:[600, 600, 900],
    max_resolution:[2048, 2048],
  },
};
const PH_TEXTURES = {
  brick_wall_02:{name:'Brick Wall 02', categories:['brick'], tags:['brick', 'wall'], authors:{'Jane Doe':'All'}, max_resolution:[4096, 4096]},
};
// Models nest one level deeper than textures: files[format][resolution][ext].
const PH_MODEL_FILES = {
  gltf:{'1k':{gltf:{
    url:'https://dl.polyhaven.org/CheeseBox_01_1k.gltf',
    size:2600,
    include:{
      'CheeseBox_01.bin':{url:'https://dl.polyhaven.org/CheeseBox_01.bin', size:7000},
      'textures/CheeseBox_01_diff_1k.jpg':{url:'https://dl.polyhaven.org/diff.jpg', size:170000},
    },
  }}},
  fbx:{'1k':{fbx:{url:'https://dl.polyhaven.org/CheeseBox_01_1k.fbx', size:31000, include:{
    'textures/CheeseBox_01_diff_1k.jpg':{url:'https://dl.polyhaven.org/diff.jpg', size:170000},
  }}}},
};
const PH_TEXTURE_FILES = {
  Diffuse:{'1k':{jpg:{url:'https://dl.polyhaven.org/brick_diff_1k.jpg', size:1000}}},
  nor_gl:{'1k':{jpg:{url:'https://dl.polyhaven.org/brick_nor_1k.jpg', size:1000}}},
  Rough:{'1k':{jpg:{url:'https://dl.polyhaven.org/brick_rough_1k.jpg', size:1000}}},
  AO:{'1k':{jpg:{url:'https://dl.polyhaven.org/brick_ao_1k.jpg', size:1000}}},
};
const KHRONOS_INDEX = [
  {label:'Boom Box', name:'BoomBox', screenshot:'screenshot/screenshot.jpg', tags:['showcase'], variants:{'glTF-Binary':'BoomBox.glb'}},
  {label:'Damaged Helmet', name:'DamagedHelmet', screenshot:'screenshot/screenshot.png', tags:['showcase'], variants:{'glTF-Binary':'DamagedHelmet.glb'}},
  {label:'Triangle', name:'Triangle', tags:['minimal'], variants:{'glTF':'Triangle.gltf'}},
];
const KHRONOS_BASE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/';

respond('https://api.polyhaven.com/assets?t=models', PH_MODELS);
respond('https://api.polyhaven.com/assets?t=textures', PH_TEXTURES);
respond('https://api.polyhaven.com/files/CheeseBox_01', PH_MODEL_FILES);
respond('https://api.polyhaven.com/files/brick_wall_02', PH_TEXTURE_FILES);
respond(KHRONOS_BASE + 'model-index.json', KHRONOS_INDEX);
respond(KHRONOS_BASE + 'BoomBox/README.md', '## Legal\n\n&copy; 2017, Microsoft. [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode)\n');
respond(KHRONOS_BASE + 'DamagedHelmet/README.md',
  '## Legal\n\n&copy; 2018, ctxwing. [CC BY 4.0 International](https://x)\n\n&copy; 2016, theblueturtle_. [CC BY-NC 4.0 International](https://y)\n');

// ------------------------------------------------ registry

test('the registry exposes exactly the vetted providers', () => {
  const ids = API.list().map(provider => provider.id);
  assert.deepEqual(ids, ['polyhaven', 'khronos']);
  assert.equal(API.get('polyhaven').id, 'polyhaven');
  assert.equal(API.get('nope'), null, 'unknown ids resolve to null, not to a default');
});

test('every provider satisfies the descriptor contract', () => {
  API.list().forEach(provider => {
    ['id', 'label', 'home', 'licenseSummary'].forEach(field => {
      assert.ok(provider[field], provider.id + ' is missing ' + field);
    });
    assert.ok(Array.isArray(provider.categories) && provider.categories.length, provider.id + ' declares no category');
    assert.equal(typeof provider.search, 'function', provider.id + ' cannot search');
    assert.equal(typeof provider.resolveDownload, 'function', provider.id + ' cannot resolve a download');
    assert.match(provider.home, /^https:\/\//, provider.id + ' must link its source over https');
  });
});

test('no provider offers HDRIs, which the engine cannot import', () => {
  API.list().forEach(provider => {
    provider.categories.forEach(category => {
      assert.notEqual(category.kind, 'hdri', provider.id + ' offers an HDRI the project could not use');
    });
  });
});

// ------------------------------------------------ license handling

test('license classification recognises the common forms', () => {
  const L = API.LICENSES;
  assert.equal(API.classifyLicenseText('CC0 1.0 Universal').id, L.cc0.id);
  assert.equal(API.classifyLicenseText('Public Domain').id, L.cc0.id);
  assert.equal(API.classifyLicenseText('CC BY 4.0 International').id, L['cc-by'].id);
  assert.equal(API.classifyLicenseText('CC BY-SA 4.0').id, L['cc-by-sa'].id);
  assert.equal(API.classifyLicenseText('CC BY-ND 4.0').id, L['cc-by-nd'].id);
  assert.equal(API.classifyLicenseText('Apache License 2.0').id, L['apache-2'].id);
  assert.equal(API.classifyLicenseText('').id, L.unknown.id, 'empty text is never assumed to be free');
  assert.equal(API.classifyLicenseText('something unreadable').id, L.unknown.id);
});

test('a mixed-license asset reports the strictest terms, not the first match', () => {
  const mixed = API.classifyLicenseText('CC BY 4.0 International ... CC BY-NC 4.0 International');
  assert.equal(mixed.id, 'cc-by-nc', 'a non-commercial clause must win over plain attribution');
  assert.equal(mixed.permissive, false);
  const cc0AndBy = API.classifyLicenseText('CC0 1.0 Universal ... CC BY 4.0 International');
  assert.equal(cc0AndBy.id, 'cc-by', 'attribution wins over the public-domain part');
});

test('only public domain is marked permissive', () => {
  Object.keys(API.LICENSES).forEach(key => {
    const license = API.LICENSES[key];
    assert.ok(license.label, key + ' has no label');
    assert.ok(license.summary, key + ' has no plain-language summary');
    if(license.permissive) assert.equal(key, 'cc0', key + ' must not be treated as one-click free');
  });
  assert.equal(API.LICENSES.unknown.permissive, false, 'an unresolved license is never permissive');
});

// ------------------------------------------------ Poly Haven

test('Poly Haven search maps names, license and the specs shown on the card', () => {
  return API.get('polyhaven').search('crate', {category:'models'}).then(results => {
    assert.equal(results.length, 1, 'the query filters the catalogue');
    const asset = results[0];
    assert.equal(asset.id, 'CheeseBox_01');
    assert.equal(asset.name, 'Cheese Box 01');
    assert.equal(asset.kind, 'model');
    assert.equal(asset.license.id, 'cc0', 'the whole Poly Haven catalogue is CC0');
    assert.equal(asset.license.permissive, true);
    assert.deepEqual(asset.authors, ['Jane Doe']);
    assert.match(asset.pageUrl, /^https:\/\/polyhaven\.com\/a\//);
    assert.ok(asset.thumbnail, 'a preview is offered');
    const info = asset.info.join(' | ');
    assert.match(info, /884 tris/, 'polycount is surfaced');
    assert.match(info, /0\.24 × 0\.14 × 0\.09 m/, 'real-world size is surfaced in metres');
    assert.match(info, /4096 px maps/, 'maximum texture resolution is surfaced');
  });
});

test('Poly Haven search matches every word of a multi-word query', () => {
  const provider = API.get('polyhaven');
  return provider.search('rusty barrel', {category:'models'}).then(results => {
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'Rusty_Barrel');
    return provider.search('rusty crate', {category:'models'});
  }).then(results => {
    assert.equal(results.length, 0, 'words from different assets must not match either');
    return provider.search('', {category:'models'});
  }).then(results => {
    assert.equal(results.length, 2, 'an empty query lists the catalogue');
  });
});

test('Poly Haven glTF resolves as a bundle with every dependency', () => {
  return API.get('polyhaven').search('crate', {category:'models'})
    .then(results => API.get('polyhaven').resolveDownload(results[0], {resolution:'1k', format:'gltf'}))
    .then(download => {
      assert.equal(download.mode, 'gltf-bundle', 'loose glTF must be assembled into one GLB');
      assert.equal(download.root.name, 'CheeseBox_01_1k.gltf');
      assert.equal(download.dependencies.length, 2, 'the .bin and the texture travel with it');
      assert.equal(download.files.length, 3, 'the root plus its dependencies');
      const paths = download.dependencies.map(item => item.path);
      assert.ok(paths.includes('textures/CheeseBox_01_diff_1k.jpg'), 'the original relative path is kept for re-linking');
      download.files.forEach(file => assert.match(file.url, /^https:/, 'every file is fetched over https'));
    });
});

test('Poly Haven FBX resolves as plain files for the FBX plugin', () => {
  return API.get('polyhaven').search('crate', {category:'models'})
    .then(results => API.get('polyhaven').resolveDownload(results[0], {resolution:'1k', format:'fbx'}))
    .then(download => {
      assert.equal(download.mode, 'files', 'FBX keeps its source and is rebuilt by the plugin');
      assert.equal(download.format, 'fbx');
      assert.match(download.root.name, /\.fbx$/);
    });
});

test('Poly Haven textures resolve the PBR maps the engine can consume', () => {
  return API.get('polyhaven').search('brick', {category:'textures'})
    .then(results => {
      assert.equal(results[0].kind, 'texture');
      return API.get('polyhaven').resolveDownload(results[0], {resolution:'1k'});
    })
    .then(download => {
      assert.equal(download.primary, 'texture');
      const maps = download.files.map(file => file.map);
      assert.deepEqual(maps, ['Diffuse', 'nor_gl', 'Rough', 'AO'], 'maps come back in a predictable order');
      download.files.forEach(file => assert.match(file.name, /\.(jpg|png)$/, 'only importable image formats'));
    });
});

test('a missing resolution fails loudly instead of importing the wrong thing', () => {
  return API.get('polyhaven').search('crate', {category:'models'})
    .then(results => API.get('polyhaven').resolveDownload(results[0], {resolution:'4k', format:'gltf'}))
    .then(() => { throw new Error('should have rejected'); }, error => {
      assert.match(String(error.message), /no GLTF at 4k/i);
    });
});

// ------------------------------------------------ Khronos

test('Khronos search only lists models with a usable binary variant', () => {
  return API.get('khronos').search('', {}).then(results => {
    const ids = results.map(asset => asset.id);
    assert.ok(ids.includes('BoomBox'));
    assert.ok(!ids.includes('Triangle'), 'a glTF-only sample has no GLB to import');
    results.forEach(asset => {
      assert.equal(asset.licensePending, true, 'the index carries no license, so it must be resolved separately');
      assert.equal(asset.license.id, 'unknown', 'until then it is never shown as free');
    });
  });
});

test('Khronos licenses resolve per model, with all contributors credited', () => {
  const provider = API.get('khronos');
  return provider.search('', {}).then(results => {
    const boombox = results.find(asset => asset.id === 'BoomBox');
    const helmet = results.find(asset => asset.id === 'DamagedHelmet');
    return Promise.all([provider.resolveLicense(boombox), provider.resolveLicense(helmet)]);
  }).then(([boombox, helmet]) => {
    assert.equal(boombox.license.id, 'cc0');
    assert.equal(boombox.license.permissive, true);
    assert.equal(boombox.author, 'Microsoft');
    assert.equal(helmet.license.id, 'cc-by-nc', 'the non-commercial contribution decides the terms');
    assert.equal(helmet.license.permissive, false);
    assert.equal(helmet.author, 'ctxwing, theblueturtle_', 'every copyright holder is credited');
  });
});

test('an unreachable README leaves the license unresolved rather than free', () => {
  const provider = API.get('khronos');
  return provider.resolveLicense({id:'NotPublished'}).then(resolved => {
    assert.equal(resolved.license.id, 'unknown');
    assert.equal(resolved.license.permissive, false);
  });
});

test('Khronos downloads point at the binary variant and need no conversion', () => {
  const provider = API.get('khronos');
  return provider.search('boom', {}).then(results => provider.resolveDownload(results[0])).then(download => {
    assert.equal(download.mode, 'files');
    assert.equal(download.format, 'glb');
    assert.equal(download.dependencies.length, 0, 'a GLB is self-contained');
    assert.match(download.root.url, /^https:\/\/raw\.githubusercontent\.com\/.*BoomBox\.glb$/);
  });
});

// ------------------------------------------------ helpers

test('query matching and filename helpers behave', () => {
  assert.equal(API.matchesQuery('Wooden Crate', 'crate'), true);
  assert.equal(API.matchesQuery('Wooden Crate', 'CRATE wooden'), true, 'matching is order-insensitive and case-insensitive');
  assert.equal(API.matchesQuery('Wooden Crate', 'barrel'), false);
  assert.equal(API.matchesQuery('anything', ''), true, 'an empty query matches everything');
  assert.equal(API.fileNameFromUrl('https://host/dir/model_1k.gltf?x=1#y'), 'model_1k.gltf', 'query strings and fragments are stripped');
  assert.equal(API.fileNameFromUrl('', 'fallback.glb'), 'fallback.glb');
});

test('all catalogue requests went to the two vetted hosts', () => {
  const hosts = new Set(requested.map(url => new URL(url).host));
  hosts.forEach(host => {
    assert.ok(
      ['api.polyhaven.com', 'raw.githubusercontent.com'].includes(host),
      'unexpected host contacted: ' + host,
    );
  });
});

chain.then(() => {
  finished = true;
  console.log('\nasset scout tests passed');
}, error => {
  finished = true;
  console.error(error);
  process.exitCode = 1;
});
