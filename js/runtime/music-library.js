/* =========================================================
   LOT KING - shared music library runtime module
   Session uploads, sortable metadata and safe audio URLs.
   ========================================================= */
(function(){
'use strict';

let uid = 1;

function audioSrc(url){
  if(!url) return '';
  return /^(blob:|data:|https?:)/i.test(url) ? url : encodeURI(url);
}

function cleanName(name){
  return String(name || 'Untitled track')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaFromName(name){
  const clean = cleanName(name);
  const orderMatch = clean.match(/^\s*(\d{1,4})\s*[-_. ]+\s*(.+)$/);
  const order = orderMatch ? parseInt(orderMatch[1], 10) : null;
  const rest = orderMatch ? orderMatch[2] : clean;
  const parts = rest.split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
  if(parts.length >= 2) return {order, artist: parts[0], title: parts.slice(1).join(' - ')};
  return {order, artist: 'USER', title: rest || clean};
}

function normalizeTrack(track, source){
  const meta = metaFromName(track.fileName || track.name || track.title || track.url);
  return {
    id: track.id || ('trk_' + (uid++)),
    url: track.url,
    dbKey: track.dbKey || null,
    title: track.title || meta.title,
    artist: track.artist || meta.artist,
    order: track.order == null ? meta.order : track.order,
    fileName: track.fileName || track.name || '',
    source: track.source || source || 'Default',
    uploaded: !!track.uploaded,
    persisted: !!track.persisted || !!track.dbKey,
  };
}

function cleanDisplayText(value, fallback){
  const text = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function finiteOrder(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function storedTrackId(){
  return 'trk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function storedTrackKey(file){
  const ext = /\.[a-z0-9]+$/i.exec(file && file.name || '');
  return 'music:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 10) + (ext ? ext[0].toLowerCase() : '.audio');
}

function create(defaultTracks){
  const tracks = (defaultTracks || []).map(t => normalizeTrack(t, 'Default'));
  tracks.forEach((track, index) => { track.order = index + 1; });

  function at(index){
    if(!tracks.length) return null;
    return tracks[(index + tracks.length) % tracks.length];
  }

  async function addFiles(files, source){
    const added = [];
    let lastError = null;
    for(const file of Array.from(files || [])){
      if(!file || (!/^audio\//i.test(file.type || '') && !/\.(mp3|ogg|wav|m4a|aac|flac)$/i.test(file.name || ''))) continue;
      if(!window.LK_ASSET_BLOBS || !window.LK_ASSET_BLOBS.put) throw new Error('Persistent audio storage unavailable');
      const meta = metaFromName(file.name);
      const dbKey = storedTrackKey(file);
      try {
        await window.LK_ASSET_BLOBS.put(dbKey, file);
        const track = normalizeTrack({
          id: storedTrackId(),
          url: URL.createObjectURL(file),
          dbKey,
          title: meta.title,
          artist: meta.artist,
          order: meta.order,
          fileName: file.name,
          source: source || 'Project audio',
          uploaded: true,
          persisted: true,
        }, source || 'Project audio');
        tracks.push(track);
        added.push(track);
      } catch(err){
        lastError = err;
        console.warn('LotKing music: file audio non archiviato', file.name, err);
      }
    }
    renumber();
    if(!added.length && lastError) throw lastError;
    return added;
  }

  async function restoreTracks(stored){
    const restored = [];
    const manifest = Array.from(stored || []);
    const exactManifest = manifest.some(item => item && Number(item.libraryManifestVersion) >= 2);
    const ordered = [];
    for(const item of manifest){
      if(!item) continue;
      const existing = tracks.find(track =>
        (item.id && track.id === item.id) ||
        (item.dbKey && track.dbKey === item.dbKey) ||
        (item.url && track.url === item.url) ||
        (item.fileName && track.fileName === item.fileName)
      );
      if(existing){
        existing.title = cleanDisplayText(item.title, existing.title);
        existing.artist = cleanDisplayText(item.artist, existing.artist);
        existing.order = finiteOrder(item.order, ordered.length + 1);
        ordered.push(existing);
        continue;
      }
      let url = item.url || '';
      if(item.dbKey){
        if(!window.LK_ASSET_BLOBS || !window.LK_ASSET_BLOBS.getUrl) continue;
        try { url = await window.LK_ASSET_BLOBS.getUrl(item.dbKey); }
        catch(err){ console.warn('LotKing music: traccia persistente non disponibile', item.fileName || item.title || item.dbKey, err); continue; }
      }
      if(!url) continue;
      const track = normalizeTrack(Object.assign({}, item, {
        url,
        uploaded:item.uploaded !== false,
        persisted:!!item.dbKey || /^data:/i.test(url),
      }), item.source || 'Project audio');
      tracks.push(track);
      ordered.push(track);
      restored.push(track);
    }
    if(exactManifest){
      tracks.splice(0, tracks.length, ...ordered);
    }
    renumber();
    return restored;
  }

  function storedTracks(){
    return tracks.map(track => ({
      libraryManifestVersion:2,
      id:track.id,
      url:track.uploaded && !/^data:/i.test(track.url || '') ? null : track.url,
      dbKey:track.dbKey || null,
      title:track.title,
      artist:track.artist,
      order:track.order,
      fileName:track.fileName,
      source:track.source,
      uploaded:!!track.uploaded,
      persisted:!!track.persisted,
    }));
  }

  function removeAt(index){
    if(!tracks.length) return null;
    const i = Math.max(0, Math.min(tracks.length - 1, Number(index) || 0));
    const removed = tracks.splice(i, 1)[0] || null;
    if(!removed) return null;
    if(/^blob:/i.test(removed.url || '') && typeof URL !== 'undefined' && URL.revokeObjectURL){
      try { URL.revokeObjectURL(removed.url); } catch(err){}
    }
    if(removed.dbKey && window.LK_ASSET_BLOBS && window.LK_ASSET_BLOBS.remove){
      window.LK_ASSET_BLOBS.remove(removed.dbKey).catch(err => {
        console.warn('LotKing music: traccia rimossa dalla lista ma non dal blob store', removed.fileName || removed.title || removed.dbKey, err);
      });
    }
    renumber();
    return Object.assign({index:i}, removed);
  }

  function renumber(){
    tracks.forEach((track, index) => { track.order = index + 1; });
  }

  function moveAt(index, direction){
    const from = Math.max(0, Math.min(tracks.length - 1, Number(index) || 0));
    const to = Math.max(0, Math.min(tracks.length - 1, from + (Number(direction) < 0 ? -1 : 1)));
    if(!tracks.length || from === to) return null;
    const track = tracks.splice(from, 1)[0];
    tracks.splice(to, 0, track);
    renumber();
    return {track,fromIndex:from,index:to};
  }

  function updateAt(index, patch){
    const i = Math.max(0, Math.min(tracks.length - 1, Number(index) || 0));
    const track = tracks[i];
    if(!track) return null;
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'title')) track.title = cleanDisplayText(patch.title, metaFromName(track.fileName || track.url).title);
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'artist')) track.artist = cleanDisplayText(patch.artist, 'USER');
    return Object.assign({index:i}, track);
  }

  function list(options){
    const opts = options || {};
    const q = String(opts.filter || '').trim().toLowerCase();
    const sort = opts.sort || 'order';
    const dir = opts.dir === 'desc' ? -1 : 1;
    let rows = tracks.map((t, index) => Object.assign({index}, t));
    if(q){
      rows = rows.filter(t => [t.title, t.artist, t.fileName, t.source, String(t.order == null ? '' : t.order)]
        .join(' ')
        .toLowerCase()
        .includes(q));
    }
    rows.sort((a, b) => {
      const av = sort === 'order' ? (a.order == null ? 9999 : a.order) : String(a[sort] || '').toLowerCase();
      const bv = sort === 'order' ? (b.order == null ? 9999 : b.order) : String(b[sort] || '').toLowerCase();
      if(av < bv) return -1 * dir;
      if(av > bv) return 1 * dir;
      return (a.index - b.index) * dir;
    });
    return rows;
  }

  return {
    at,
    addFiles,
    restoreTracks,
    removeAt,
    moveAt,
    updateAt,
    storedTracks,
    list,
    count: () => tracks.length,
    raw: () => tracks,
  };
}

window.LK_RUNTIME_MUSIC_LIBRARY = Object.freeze({create, audioSrc, metaFromName});
})();
