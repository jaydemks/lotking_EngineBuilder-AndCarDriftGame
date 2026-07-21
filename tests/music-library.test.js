const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'music-library.js'), 'utf8');
const sandbox = {
  window:{},
  console,
  URL:{revokeObjectURL(){}},
};
vm.runInNewContext(source, sandbox, {filename:'music-library.js'});
const api = sandbox.window.LK_RUNTIME_MUSIC_LIBRARY;

assert(api, 'music library API is registered');

async function main(){
  const parsed = api.metaFromName('01 - Artist - Opening Theme.mp3');
  assert(parsed.title === 'Opening Theme', 'numeric file prefixes are not shown in the title');
  assert(parsed.artist === 'Artist', 'artist metadata is preserved after stripping the prefix');

  const library = api.create([
    {id:'default_1', url:'music/default.mp3', title:'Default', artist:'NUM0'},
    {id:'project_1', url:'data:audio/mp3;base64,AAAA', title:'Imported', artist:'USER', uploaded:true, persisted:true},
  ]);

  assert(library.count() === 2, 'library starts with default and project track');
  const moved = library.moveAt(1, -1);
  assert(moved && moved.index === 0, 'moveAt changes the manual playback order');
  assert(library.at(0).id === 'project_1', 'manual order controls the first track');
  const renamed = library.updateAt(0, {title:'Opening Theme'});
  assert(renamed && library.at(0).title === 'Opening Theme', 'display title can be renamed without changing the file');
  assert(library.at(0).url === 'data:audio/mp3;base64,AAAA', 'renaming preserves the audio source');
  const manifest = library.storedTracks();
  assert(manifest.length === 2 && manifest[0].libraryManifestVersion === 2, 'the complete ordered library is serialized as a manifest');

  const reloaded = api.create([
    {id:'new_default_id', url:'music/default.mp3', title:'Default', artist:'NUM0'},
  ]);
  await reloaded.restoreTracks(manifest);
  assert(reloaded.count() === 2, 'the complete manifest restores default and project tracks');
  assert(reloaded.at(0).title === 'Opening Theme', 'custom first track and renamed title survive reload');
  assert(reloaded.at(0).url === 'data:audio/mp3;base64,AAAA', 'restored rename still points to the original audio');

  const removed = library.removeAt(0);
  assert(removed && removed.id === 'project_1', 'removeAt returns the removed track');
  assert(library.count() === 1, 'removeAt removes the track from the live library');
  assert(library.storedTracks().length === 1, 'remaining default tracks stay in the ordered project manifest');

  console.log('music-library.test.js: all assertions passed');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
