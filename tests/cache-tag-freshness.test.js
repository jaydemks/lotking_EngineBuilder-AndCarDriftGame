'use strict';

/* =========================================================
   A file you changed must not be served from cache.

   The shells key the browser cache on a `?v=` tag. Change a file and leave its tag
   alone and every browser that has already visited keeps running the OLD copy -
   silently, with no warning anywhere, and the symptom is "I fixed that already".
   It is the one failure mode that survives a green test suite, because node reads
   the file from disk and never sees the cache.

   This had happened to eight files at once, several of them heavily reworked
   (`p2p-session.js` +489/-139, `penalty-flow.js` +436/-45), plus one referenced
   with no tag at all. So the rule is checked instead of remembered.

   HOW IT WORKS
   Compares the WORKING TREE against HEAD: for every changed or new `js/` file, the
   tag in every shell/loader manifest that references it must be present and, where a
   previous published URL exists, changed too. It is a
   before-you-commit hygiene check, so it is quiet when the tree is clean, and it
   needs no manifest to keep up to date.

   HOW THIS FILE IS ORGANISED
     01 helpers   reading a tag out of a shell
     02 tagged    every referenced script carries a tag at all
     03 fresh     a changed file has a changed tag
   ========================================================= */

const assert = require('node:assert/strict');
const {execSync, execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELLS = ['engine_editor.html', 'gameplay.html', 'index.html', 'test-editor.html'];
const LOAD_MANIFESTS = SHELLS.concat(['js/editor/loader.js', 'scripts.list']);

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// ================================================================= 01 helpers

function readShell(file){
  const full = path.join(ROOT, file);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}
function readShellAtHead(file){
  try {
    return execFileSync('git', ['show', 'HEAD:' + file], {
      cwd:ROOT,
      encoding:'utf8',
      maxBuffer:1e8,
      stdio:['ignore', 'pipe', 'ignore']
    });
  }
  catch(error){ return null; }
}
/** The tag a shell uses for a file: the value, '(no tag)', or null if unreferenced. */
function tagOf(html, file){
  if(!html) return null;
  const at = html.indexOf(file + '?v=');
  if(at < 0) return html.indexOf(file) >= 0 ? '(no tag)' : null;
  const from = at + file.length + 3;
  const rest = html.slice(from);
  const end = rest.search(/["']/);
  return end < 0 ? rest : rest.slice(0, end);
}
function changedJsFiles(){
  const modified = execSync('git diff HEAD --name-only', {cwd:ROOT, encoding:'utf8'});
  const untracked = execSync('git ls-files --others --exclude-standard', {cwd:ROOT, encoding:'utf8'});
  return Array.from(new Set((modified+'\n'+untracked).trim().split('\n')
    .filter(file => /^js\/.*\.js$/.test(file))));
}

// ================================================================== 02 tagged
//
// An UNTAGGED script is not the dangerous case, and is deliberately not a failure
// here: with no query string the local server answers `If-Modified-Since` and the
// browser picks up a newer file on its own. The dangerous case is an explicit tag
// that does not move, because that pins the URL and a returning browser can serve
// it from cache without asking. So this only reports the count, and section 03 is
// the rule that fails.

test('EVERY script carries a cache tag, so none of them can be served stale', () => {
  // This used to only REPORT the split, and 68 scripts across the three shells had no
  // tag at all. On the local servers that is hidden, because both send
  // `Cache-Control: no-store` on every response - but the published site has no such
  // header, so an untagged file stays in a visitor's cache indefinitely and a fix
  // simply never reaches them. A tag is the only thing that changes the URL, and a
  // changed URL is the only thing that guarantees a fetch.
  const counts = [];
  SHELLS.forEach(shell => {
    const html = readShell(shell);
    if(!html) return;
    const pattern = /<script src="((?:js|three|vendor)\/[^"]+?\.js)(\?v=[^"]*)?"/g;
    let match, total = 0;
    const untagged = [];
    while((match = pattern.exec(html))){ total++; if(!match[2]) untagged.push(match[1]); }
    counts.push({shell, total, untagged});
  });
  assert.ok(counts.length >= 3, 'the shells were found');
  counts.forEach(row => {
    console.log('   ' + row.shell.padEnd(20) + ' scripts=' + row.total + '  untagged=' + row.untagged.length);
    assert.ok(row.total > 0, row.shell + ' loads scripts');
    assert.deepEqual(row.untagged, [],
      row.shell + ' has scripts with no ?v= tag, which can be served from a stale cache: '
      + row.untagged.slice(0, 6).join(', '));
  });
});

test('dynamic loader and export manifest references carry cache tags too', () => {
  ['js/editor/loader.js','scripts.list'].forEach(manifest => {
    const source=readShell(manifest),untagged=[];
    const pattern=/((?:js|three|vendor)\/[^'"\s,]+?\.js)(\?v=[^'"\s,]+)?/g;
    let match,total=0;
    while(source&&(match=pattern.exec(source))){total++;if(!match[2])untagged.push(match[1]);}
    assert.ok(total>0,manifest+' references runtime scripts');
    assert.deepEqual(untagged,[],manifest+' has untagged runtime references: '+untagged.slice(0,6).join(', '));
  });
});

// =================================================================== 03 fresh

test('a changed js file also has a changed cache tag', () => {
  const changed = changedJsFiles();
  if(!changed.length){ console.log('   (working tree clean - nothing to check)'); return; }
  const heads = {}, currents = {};
  LOAD_MANIFESTS.forEach(shell => { currents[shell] = readShell(shell); heads[shell] = readShellAtHead(shell); });

  // Checked PER SHELL. A bump in one shell does not help another: the browser caches
  // per URL, so `engine_editor.html` still serves the old copy while
  // `gameplay.html` serves the new one - and that asymmetry is worse than a plain
  // miss, because the editor and the game then disagree about the same code.
  const stale = [];
  changed.forEach(file => {
    LOAD_MANIFESTS.forEach(shell => {
      const now = tagOf(currents[shell], file), before = tagOf(heads[shell], file);
      // Unreferenced then and now: loaded another way (loader.js, a build entry).
      // Newly referenced: nothing was cached under that URL.
      if(before === null || before === '(no tag)') return;
      if(now === before) stale.push(shell + ' -> ' + file + ' (still ' + now + ')');
    });
  });

  assert.deepEqual(stale, [],
    'these changed files kept their ?v= tag, so a returning browser runs the old copy:\n  ' +
    stale.join('\n  ') + '\nBump the tag in each shell listed.');
});

console.log('\ncache tag freshness tests passed');
