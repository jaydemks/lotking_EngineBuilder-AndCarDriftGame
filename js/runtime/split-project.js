/* =========================================================
   LOT KING - split LKEP project bundles
   Keeps every repository file well below GitHub's per-file limit while the
   editor/runtime still receives one byte-identical JSON project snapshot.
   ========================================================= */
(function(){
'use strict';

const POINTER_FORMAT = 'LKEP_SPLIT_POINTER';
const MANIFEST_FORMAT = 'LKEP_SPLIT_MANIFEST';
const VERSION = 1;
const CHUNK_CHAR_LIMIT = 8 * 1000 * 1000;
const MAX_CHUNKS = 4096;
const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;

function safeBaseName(value){
  return String(value || 'lot-king-project')
    .toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'lot-king-project';
}

function isSafeRelativePath(value){
  const path = String(value || '').replace(/\\/g, '/');
  return !!path && !path.startsWith('/') && !path.includes('..') && !/^[a-z]+:/i.test(path);
}

function byteLength(text){
  if(encoder) return encoder.encode(text).byteLength;
  return new Blob([text]).size;
}

async function sha256(text){
  if(!(encoder && typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest)) return null;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

function splitText(text){
  const chunks = [];
  let offset = 0;
  while(offset < text.length){
    let end = Math.min(text.length, offset + CHUNK_CHAR_LIMIT);
    // Never cut an UTF-16 surrogate pair. Concatenating the fetched text then
    // reproduces the exact JSON string, including non-ASCII authored labels.
    if(end < text.length && end > offset){
      const previous = text.charCodeAt(end - 1);
      const next = text.charCodeAt(end);
      if(previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end--;
    }
    chunks.push(text.slice(offset, end));
    offset = end;
    if(chunks.length > MAX_CHUNKS) throw new Error('Split LKEP exceeds the supported chunk count');
  }
  if(!chunks.length) chunks.push('');
  return chunks;
}

async function createBundle(project, baseName){
  const base = safeBaseName(baseName);
  const projectText = typeof project === 'string' ? project : JSON.stringify(project || {});
  const texts = splitText(projectText);
  const chunks = [];
  for(let index = 0; index < texts.length; index++){
    const text = texts[index];
    const file = 'chunks/project-' + String(index + 1).padStart(4, '0') + '.lkep-part';
    chunks.push({file, text, chars:text.length, bytes:byteLength(text), sha256:await sha256(text)});
  }
  const manifest = {
    format:MANIFEST_FORMAT,
    version:VERSION,
    encoding:'utf-8-json-text-chunks',
    createdAt:new Date().toISOString(),
    project:{
      name:project && project.meta && (project.meta.projectName || project.meta.trackName) || base,
      savedAt:project && project.savedAt || null,
      format:project && project.format || 'LKEP',
    },
    totalChars:projectText.length,
    totalBytes:byteLength(projectText),
    chunkCharLimit:CHUNK_CHAR_LIMIT,
    chunks:chunks.map(entry => ({
      file:entry.file,
      chars:entry.chars,
      bytes:entry.bytes,
      sha256:entry.sha256,
    })),
  };
  const pointer = {
    format:POINTER_FORMAT,
    version:VERSION,
    manifest:base + '/manifest.json',
  };
  return {base, projectText, pointer, manifest, chunks};
}

function parseDescriptor(raw, expectedFormat){
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if(!value || value.format !== expectedFormat || Number(value.version) !== VERSION){
    throw new Error('Unsupported split LKEP descriptor');
  }
  return value;
}

async function verifyChunk(text, entry){
  if(entry.chars != null && text.length !== Number(entry.chars)) throw new Error('Split LKEP chunk length mismatch: ' + entry.file);
  if(entry.bytes != null && byteLength(text) !== Number(entry.bytes)) throw new Error('Split LKEP chunk byte mismatch: ' + entry.file);
  if(entry.sha256){
    const digest = await sha256(text);
    if(digest && digest !== entry.sha256) throw new Error('Split LKEP chunk checksum mismatch: ' + entry.file);
  }
  return text;
}

async function assemble(manifest, readText, onProgress){
  const descriptor = parseDescriptor(manifest, MANIFEST_FORMAT);
  const entries = Array.isArray(descriptor.chunks) ? descriptor.chunks : [];
  if(!entries.length || entries.length > MAX_CHUNKS) throw new Error('Split LKEP manifest has an invalid chunk list');
  const texts = new Array(entries.length);
  // A bounded queue avoids opening hundreds of requests while still allowing
  // static hosts to download several independent pieces efficiently.
  let cursor = 0;
  let completed = 0;
  const workers = Array.from({length:Math.min(4, entries.length)}, async () => {
    while(cursor < entries.length){
      const index = cursor++;
      const entry = entries[index];
      if(!entry || !isSafeRelativePath(entry.file)) throw new Error('Unsafe split LKEP chunk path');
      texts[index] = await verifyChunk(await readText(entry.file), entry);
      completed++;
      if(onProgress) onProgress(completed / entries.length, entry.file);
    }
  });
  await Promise.all(workers);
  const text = texts.join('');
  if(descriptor.totalChars != null && text.length !== Number(descriptor.totalChars)) throw new Error('Split LKEP total length mismatch');
  if(descriptor.totalBytes != null && byteLength(text) !== Number(descriptor.totalBytes)) throw new Error('Split LKEP total byte mismatch');
  return text;
}

async function resolveText(rawText, sourceUrl, onProgress){
  let descriptor;
  try { descriptor = JSON.parse(rawText); }
  catch(_err){ return rawText; }
  if(!descriptor || descriptor.format !== POINTER_FORMAT) return rawText;
  const pointer = parseDescriptor(descriptor, POINTER_FORMAT);
  if(!isSafeRelativePath(pointer.manifest)) throw new Error('Unsafe split LKEP manifest path');
  const manifestUrl = new URL(pointer.manifest, sourceUrl || location.href);
  const response = await fetch(manifestUrl.href, {cache:'reload'});
  if(!response.ok) throw new Error('Split LKEP manifest HTTP ' + response.status);
  const manifest = parseDescriptor(await response.text(), MANIFEST_FORMAT);
  return assemble(manifest, async file => {
    const url = new URL(file, manifestUrl.href);
    const chunkResponse = await fetch(url.href, {cache:'reload'});
    if(!chunkResponse.ok) throw new Error('Split LKEP chunk HTTP ' + chunkResponse.status + ': ' + file);
    return chunkResponse.text();
  }, onProgress);
}

async function writeFile(directory, name, contents){
  const handle = await directory.getFileHandle(name, {create:true});
  const writable = await handle.createWritable();
  try { await writable.write(contents); }
  finally { await writable.close(); }
}

async function writeBundle(parentDirectory, bundle, onProgress){
  if(!parentDirectory || !parentDirectory.getDirectoryHandle) throw new Error('Writable directory access is unavailable');
  const projectDirectory = await parentDirectory.getDirectoryHandle(bundle.base, {create:true});
  const chunksDirectory = await projectDirectory.getDirectoryHandle('chunks', {create:true});
  for(let index = 0; index < bundle.chunks.length; index++){
    const entry = bundle.chunks[index];
    await writeFile(chunksDirectory, entry.file.split('/').pop(), entry.text);
    if(onProgress) onProgress((index + 1) / bundle.chunks.length, entry.file);
  }
  // Publish metadata last. An interrupted export therefore cannot leave a new
  // pointer claiming that a partially written chunk set is complete.
  await writeFile(projectDirectory, 'manifest.json', JSON.stringify(bundle.manifest, null, 2));
  await writeFile(parentDirectory, bundle.base + '.lkep.json', JSON.stringify(bundle.pointer, null, 2));
  return {
    pointerFile:bundle.base + '.lkep.json',
    folder:bundle.base,
    chunks:bundle.chunks.length,
    totalBytes:bundle.manifest.totalBytes,
  };
}

async function loadDirectory(projectDirectory, onProgress){
  if(!projectDirectory || !projectDirectory.getFileHandle) throw new Error('Readable directory access is unavailable');
  const manifestFile = await (await projectDirectory.getFileHandle('manifest.json')).getFile();
  const manifest = parseDescriptor(await manifestFile.text(), MANIFEST_FORMAT);
  return assemble(manifest, async path => {
    const parts = path.split('/').filter(Boolean);
    let directory = projectDirectory;
    for(let index = 0; index < parts.length - 1; index++) directory = await directory.getDirectoryHandle(parts[index]);
    const file = await (await directory.getFileHandle(parts[parts.length - 1])).getFile();
    return file.text();
  }, onProgress);
}

window.LK_RUNTIME_SPLIT_PROJECT = Object.freeze({
  POINTER_FORMAT,
  MANIFEST_FORMAT,
  VERSION,
  CHUNK_CHAR_LIMIT,
  safeBaseName,
  createBundle,
  resolveText,
  writeBundle,
  loadDirectory,
});
})();
