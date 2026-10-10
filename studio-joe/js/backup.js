/* Studio Joe — sauvegarde et transfert entre appareils.
   Rassemble toutes les données locales (bases IndexedDB des applications, réglages et classeur de
   Tableur Joe dans localStorage) dans un seul fichier .joebak (zip), chiffré si un mot de passe est
   donné (AES-256-GCM, clé dérivée par PBKDF2). La restauration fusionne ou remplace les données. */
(function () {
  const { $, toast, download, pickFiles, modal } = Studio;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KNOWN = {
    'texte-joe': 'Texte Joe — documents', 'presentation-joe': 'Présentation Joe — présentations', 'notes-joe': 'Notes Joe — carnets et notes',
    'forms-joe': 'Formulaires Joe — formulaires et réponses', 'scan-joe': 'Scan Joe — pages scannées', 'audio-joe': 'Audio Joe — son en cours', 'base-joe': 'Base Joe — bases de données', 'agenda-joe': 'Agenda Joe — rendez-vous et tâches', 'schema-joe': 'Diagrammes Joe — schémas',
  };
  const SKIP_DB = new Set(['studio-handoff']);
  const SECRET_LS = new Set(['studio-anthropic-key']);
  const LS_ID = '__localStorage';
  const LAST = 'studio-last-backup';
  const MAGIC = 'studio-joe-sauvegarde';

  /* ================= Lecture des données ================= */
  async function dbNames() {
    let names = [];
    try { if (indexedDB.databases) names = (await indexedDB.databases()).map((d) => d.name); } catch (e) { /* navigateur ancien */ }
    if (!names.length) names = Object.keys(KNOWN);
    return names.filter((n) => n && !SKIP_DB.has(n));
  }
  function openExisting(name) {
    return new Promise((res, rej) => {
      let created = false; const r = indexedDB.open(name);
      r.onupgradeneeded = () => { created = true; };
      r.onsuccess = () => { const db = r.result; if (created) { db.close(); indexedDB.deleteDatabase(name); res(null); } else res(db); };
      r.onerror = () => rej(r.error);
    });
  }
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function dumpDb(name) {
    const db = await openExisting(name); if (!db) return null;
    const out = { name, version: db.version, stores: [] };
    for (const sn of db.objectStoreNames) {
      const tx = db.transaction(sn); const st = tx.objectStore(sn);
      const indexes = [...st.indexNames].map((n) => { const ix = st.index(n); return { name: n, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry }; });
      const [keys, vals] = await Promise.all([req(st.getAllKeys()), req(st.getAll())]);
      out.stores.push({ name: sn, keyPath: st.keyPath, autoIncrement: st.autoIncrement, indexes, records: keys.map((k, i) => [k, vals[i]]) });
    }
    db.close(); return out;
  }
  function dumpLs(withSecrets) {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === LAST) continue; if (SECRET_LS.has(k) && !withSecrets) continue; o[k] = localStorage.getItem(k); }
    return o;
  }

  /* ================= Sérialisation (Blob, tableaux typés, dates…) ================= */
  function ser(v, bins) {
    if (v === undefined) return { __t: 'u' };
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Date) return { __t: 'date', v: v.getTime() };
    if (v instanceof Blob) { bins.push(v); return { __t: 'blob', i: bins.length - 1, type: v.type, name: v instanceof File ? v.name : undefined, lm: v instanceof File ? v.lastModified : undefined }; }
    if (ArrayBuffer.isView(v)) { bins.push(new Blob([v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)])); return { __t: 'ta', k: v.constructor.name, i: bins.length - 1 }; }
    if (v instanceof ArrayBuffer) { bins.push(new Blob([v.slice(0)])); return { __t: 'ab', i: bins.length - 1 }; }
    if (v instanceof Map) return { __t: 'map', v: [...v].map(([k, x]) => [ser(k, bins), ser(x, bins)]) };
    if (v instanceof Set) return { __t: 'set', v: [...v].map((x) => ser(x, bins)) };
    if (Array.isArray(v)) return v.map((x) => ser(x, bins));
    const o = {}; for (const k of Object.keys(v)) { if (v[k] !== undefined) o[k] = ser(v[k], bins); }
    return '__t' in v ? { __t: 'obj', v: o } : o;
  }
  function deser(v, bins) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => deser(x, bins));
    switch (v.__t) {
      case 'u': return undefined;
      case 'date': return new Date(v.v);
      case 'blob': { const b = new Blob([bins[v.i]], { type: v.type || '' }); return v.name != null ? new File([b], v.name, { type: v.type || '', lastModified: v.lm || Date.now() }) : b; }
      case 'ta': { const C = window[v.k] || Uint8Array; const ab = bins[v.i]; return new C(ab.slice(0), 0, ab.byteLength / (C.BYTES_PER_ELEMENT || 1)); }
      case 'ab': return bins[v.i].slice(0);
      case 'map': return new Map(v.v.map(([k, x]) => [deser(k, bins), deser(x, bins)]));
      case 'set': return new Set(v.v.map((x) => deser(x, bins)));
      case 'obj': { const o = {}; for (const k of Object.keys(v.v)) o[k] = deser(v.v[k], bins); return o; }
      default: { const o = {}; for (const k of Object.keys(v)) o[k] = deser(v[k], bins); return o; }
    }
  }

  /* ================= Chiffrement ================= */
  const ITER = 200000;
  async function keyFrom(pw, salt) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
  const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
  const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

  /* ================= Inventaire affiché ================= */
  let inventory = [];
  const sizeOf = (d) => { let n = 0; const walk = (v) => { if (v == null) return; if (v instanceof Blob) n += v.size; else if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) n += v.byteLength; else if (typeof v === 'string') n += v.length; else if (typeof v === 'object') for (const k in v) walk(v[k]); else n += 8; }; walk(d); return n; };
  const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko');
  async function scan() {
    inventory = [];
    for (const name of await dbNames()) {
      try { const d = await dumpDb(name); if (!d) continue; const count = d.stores.reduce((a, s) => a + s.records.length, 0); if (!count) continue; inventory.push({ id: name, label: KNOWN[name] || name, count, size: sizeOf(d.stores.map((s) => s.records)) }); }
      catch (e) { console.warn(name, e); }
    }
    const ls = dumpLs(false); const nls = Object.keys(ls).length;
    if (nls) inventory.push({ id: LS_ID, label: 'Tableur Joe (classeur en cours) et réglages', count: nls, size: sizeOf(ls) });
    $('#apps').innerHTML = inventory.length ? inventory.map((it) => `<label><input type="checkbox" data-id="${esc(it.id)}" checked><span>${esc(it.label)}</span><span class="s">${it.count} élément(s) · ${fmtSize(it.size)}</span></label>`).join('') : '<p class="hint">Aucune donnée enregistrée sur cet appareil pour le moment.</p>';
    $('#saveBtn').disabled = $('#shareBtn').disabled = !inventory.length;
  }
  function showLast() {
    let t = null; try { t = +localStorage.getItem(LAST) || null; } catch (e) { /* ignore */ }
    const el = $('#last');
    if (!t) { el.textContent = 'Aucune sauvegarde faite depuis cet appareil. Pensez-y : si le téléphone est perdu ou le navigateur vidé, les données locales disparaissent.'; el.classList.add('old'); return; }
    const days = Math.floor((Date.now() - t) / 864e5);
    el.textContent = `Dernière sauvegarde : ${new Date(t).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}${days ? ` (il y a ${days} jour${days > 1 ? 's' : ''})` : ' (aujourd\'hui)'}.`;
    el.classList.toggle('old', days > 14);
  }
  const setProg = (u) => { const p = $('#prog'); p.hidden = u == null; if (u != null) p.firstElementChild.style.width = Math.round(u * 100) + '%'; };

  /* ================= Créer la sauvegarde ================= */
  async function createBackup() {
    const ids = [...document.querySelectorAll('#apps input:checked')].map((i) => i.dataset.id);
    if (!ids.length) { toast('Cochez au moins une application'); return null; }
    const pw = $('#pw').value;
    if (pw && !(window.crypto && crypto.subtle)) { toast('Chiffrement indisponible ici : ouvrez Studio Joe par son adresse https'); return null; }
    setProg(0.02);
    const bins = []; const man = { app: MAGIC, v: 1, created: Date.now(), from: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 120), dbs: [], ls: null };
    let k = 0;
    for (const id of ids) {
      if (id === LS_ID) man.ls = dumpLs($('#withKey').checked);
      else { const d = await dumpDb(id); if (d) { d.stores.forEach((s) => { s.records = s.records.map(([key, val]) => [ser(key, bins), ser(val, bins)]); }); man.dbs.push(d); } }
      setProg(0.05 + (++k / ids.length) * 0.45);
    }
    const zip = new JSZip(); zip.file('manifest.json', JSON.stringify(man));
    bins.forEach((b, i) => zip.file(`bin/${i}`, b));
    let blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (m) => setProg(0.5 + (m.percent / 100) * (pw ? 0.35 : 0.5)));
    if (pw) {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pw, salt), await blob.arrayBuffer());
      const outer = new JSZip(); outer.file('chiffre.json', JSON.stringify({ app: MAGIC, v: 1, enc: 'AES-256-GCM/PBKDF2-SHA256', iter: ITER, salt: hex(salt), iv: hex(iv), created: man.created }));
      outer.file('donnees.bin', enc, { compression: 'STORE' });
      blob = await outer.generateAsync({ type: 'blob' });
    }
    setProg(1); setTimeout(() => setProg(null), 800);
    try { localStorage.setItem(LAST, String(Date.now())); } catch (e) { /* ignore */ }
    showLast();
    const d = new Date(); const name = `studio-joe-sauvegarde-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.joebak`;
    return new File([blob], name, { type: 'application/octet-stream' });
  }
  $('#saveBtn').onclick = async () => { try { const f = await createBackup(); if (f) { download(f, f.name); toast(`Sauvegarde créée : ${f.name} (${fmtSize(f.size)})`, 5000); } } catch (e) { console.error(e); setProg(null); toast('Sauvegarde impossible : ' + e.message, 7000); } };
  $('#shareBtn').onclick = async () => {
    try {
      const f = await createBackup(); if (!f) return;
      if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: 'Sauvegarde Studio Joe' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      download(f, f.name); toast('Ce navigateur ne permet pas de partager ce type de fichier : il a été téléchargé. Envoyez-le depuis le dossier Téléchargements (Fichiers → Partager).', 8000);
    } catch (e) { console.error(e); setProg(null); toast('Sauvegarde impossible : ' + e.message, 7000); }
  };

  /* ================= Restaurer ================= */
  async function readBackup(file) {
    let zip = await JSZip.loadAsync(file);
    const encInfo = zip.file('chiffre.json');
    if (encInfo) {
      const info = JSON.parse(await encInfo.async('string'));
      const pw = await modal({ title: 'Sauvegarde protégée', body: '<div class="field"><label for="rpw">Mot de passe de la sauvegarde</label><input id="rpw" type="password" autocomplete="current-password"></div>', onOpen: (b) => b.querySelector('#rpw').focus(), buttons: [{ label: 'Annuler', value: null }, { label: 'Ouvrir', primary: true, value: (b) => b.querySelector('#rpw').value }] });
      if (!pw) return null;
      let plain;
      try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(info.iv) }, await keyFrom(pw, unhex(info.salt)), await zip.file('donnees.bin').async('arraybuffer')); }
      catch (e) { throw new Error('mot de passe incorrect'); }
      zip = await JSZip.loadAsync(plain);
    }
    const mf = zip.file('manifest.json'); if (!mf) throw new Error('ce fichier n\'est pas une sauvegarde Studio Joe');
    const man = JSON.parse(await mf.async('string')); if (man.app !== MAGIC) throw new Error('ce fichier n\'est pas une sauvegarde Studio Joe');
    return { man, zip };
  }
  async function restore(file) {
    let bk;
    try { bk = await readBackup(file); } catch (e) { toast('Restauration impossible : ' + e.message, 7000); return; }
    if (!bk) return;
    const { man, zip } = bk;
    const items = man.dbs.map((d) => ({ id: d.name, label: KNOWN[d.name] || d.name, count: d.stores.reduce((a, s) => a + s.records.length, 0) }));
    if (man.ls) items.push({ id: LS_ID, label: 'Tableur Joe (classeur en cours) et réglages', count: Object.keys(man.ls).length });
    const v = await modal({ title: 'Restaurer la sauvegarde', wide: true,
      body: `<p>Sauvegarde du <b>${new Date(man.created).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</b>.</p><div class="apps">${items.map((it) => `<label><input type="checkbox" data-id="${esc(it.id)}" checked><span>${esc(it.label)}</span><span class="s">${it.count} élément(s)</span></label>`).join('')}</div>
        <div class="field"><label for="rmode">Mode</label><select id="rmode"><option value="merge">Fusionner : ajouter aux données de cet appareil (les éléments identiques sont mis à jour)</option><option value="replace">Remplacer : effacer les données de ces applications sur cet appareil, puis restaurer</option></select></div>
        <p class="hint">Fermez les autres onglets de Studio Joe avant de restaurer.</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Restaurer', primary: true, value: (b) => ({ ids: [...b.querySelectorAll('input:checked')].map((i) => i.dataset.id), mode: b.querySelector('#rmode').value }) }] });
    if (!v || !v.ids.length) return;
    try {
      setProg(0.02);
      const bins = {}; const files = Object.keys(zip.files).filter((n) => /^bin\/\d+$/.test(n));
      let k = 0; for (const n of files) { bins[+n.slice(4)] = await zip.file(n).async('arraybuffer'); if (++k % 20 === 0) setProg(0.02 + (k / files.length) * 0.4); }
      const sel = new Set(v.ids); let done = 0;
      for (const d of man.dbs) {
        if (!sel.has(d.name)) continue;
        await restoreDb(d, bins, v.mode); setProg(0.45 + (++done / sel.size) * 0.5);
      }
      if (sel.has(LS_ID) && man.ls) {
        if (v.mode === 'replace') { for (const k2 of Object.keys(dumpLs(true))) if (!SECRET_LS.has(k2)) localStorage.removeItem(k2); }
        for (const [k2, val] of Object.entries(man.ls)) { try { localStorage.setItem(k2, val); } catch (e) { console.warn(k2, e); } }
      }
      setProg(1); setTimeout(() => setProg(null), 800);
      await scan();
      toast('Sauvegarde restaurée : ouvrez vos applications depuis l\'accueil', 7000);
    } catch (e) { console.error(e); setProg(null); toast('Restauration interrompue : ' + e.message, 8000); }
  }
  async function restoreDb(d, bins, mode) {
    const records = d.stores.map((s) => ({ ...s, records: s.records.map(([key, val]) => [deser(key, bins), deser(val, bins)]) }));
    let db = await openExisting(d.name); let keep = null;
    const missing = db ? records.some((s) => !db.objectStoreNames.contains(s.name) || s.indexes.some((ix) => !db.transaction(s.name).objectStore(s.name).indexNames.contains(ix.name))) : true;
    if (db && (missing || db.version !== d.version)) {
      // structure différente : on recrée la base à la version de la sauvegarde, en gardant l'existant si « fusionner »
      if (mode === 'merge') { db.close(); keep = await dumpDb(d.name); } else db.close();
      await new Promise((res, rej) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = res; r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('base utilisée dans un autre onglet : fermez-le')); });
      db = null;
    }
    if (!db) {
      db = await new Promise((res, rej) => {
        const r = indexedDB.open(d.name, d.version);
        r.onupgradeneeded = () => { const h = r.result; for (const s of records) { const st = h.objectStoreNames.contains(s.name) ? r.transaction.objectStore(s.name) : h.createObjectStore(s.name, s.keyPath != null ? { keyPath: s.keyPath, autoIncrement: s.autoIncrement } : { autoIncrement: s.autoIncrement }); for (const ix of s.indexes) if (!st.indexNames.contains(ix.name)) st.createIndex(ix.name, ix.keyPath, { unique: ix.unique, multiEntry: ix.multiEntry }); } };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('base utilisée dans un autre onglet : fermez-le'));
      });
    }
    const write = (s, list) => new Promise((res, rej) => {
      const tx = db.transaction(s.name, 'readwrite'); const st = tx.objectStore(s.name);
      for (const [key, val] of list) { if (st.keyPath != null) st.put(val); else st.put(val, key); }
      tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('écriture annulée (espace insuffisant ?)'));
    });
    for (const s of records) {
      if (mode === 'replace') await new Promise((res, rej) => { const tx = db.transaction(s.name, 'readwrite'); tx.objectStore(s.name).clear(); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      if (keep) { const ks = keep.stores.find((x) => x.name === s.name); if (ks) await write(s, ks.records); }
      await write(s, s.records);
    }
    db.close();
  }
  $('#restoreBtn').onclick = async () => { const [f] = await pickFiles('.joebak,.zip,application/zip,application/octet-stream', false); if (f) restore(f); };
  Studio.onDropFiles(document.body, (files) => files[0] && restore(files[0]));
  Studio.onImport('sauvegarde', (fs) => restore(fs[0]));

  showLast(); scan();
  window.BackupJoe = { createBackup, restore, scan, ser, deser };
})();
