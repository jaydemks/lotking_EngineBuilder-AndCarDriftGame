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

const library = api.create([
  {id:'default_1', url:'music/default.mp3', title:'Default', artist:'NUM0'},
  {id:'project_1', url:'data:audio/mp3;base64,AAAA', title:'Imported', artist:'USER', uploaded:true, persisted:true},
]);

assert(library.count() === 2, 'library starts with default and project track');
const removed = library.removeAt(1);
assert(removed && removed.id === 'project_1', 'removeAt returns the removed track');
assert(library.count() === 1, 'removeAt removes the track from the live library');
assert(library.storedTracks().length === 0, 'removed project tracks are not serialized back into the project');

console.log('music-library.test.js: all assertions passed');
