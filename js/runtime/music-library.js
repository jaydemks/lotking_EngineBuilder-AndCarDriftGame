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
    title: track.title || meta.title,
    artist: track.artist || meta.artist,
    order: track.order == null ? meta.order : track.order,
    fileName: track.fileName || track.name || '',
    source: track.source || source || 'Default',
    uploaded: !!track.uploaded,
  };
}

function create(defaultTracks){
  const tracks = (defaultTracks || []).map(t => normalizeTrack(t, 'Default'));

  function at(index){
    if(!tracks.length) return null;
    return tracks[(index + tracks.length) % tracks.length];
  }

  function addFiles(files, source){
    const added = [];
    Array.from(files || []).forEach(file => {
      if(!file || !/^audio\//i.test(file.type || '') && !/\.(mp3|ogg|wav|m4a|aac|flac)$/i.test(file.name || '')) return;
      const meta = metaFromName(file.name);
      const track = normalizeTrack({
        url: URL.createObjectURL(file),
        title: meta.title,
        artist: meta.artist,
        order: meta.order,
        fileName: file.name,
        source: source || 'Session upload',
        uploaded: true,
      }, source || 'Session upload');
      tracks.push(track);
      added.push(track);
    });
    return added;
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
    list,
    count: () => tracks.length,
    raw: () => tracks,
  };
}

window.LK_RUNTIME_MUSIC_LIBRARY = Object.freeze({create, audioSrc, metaFromName});
})();
