/* Studio Joe — utilitaires partagés (toast, téléchargement, menus, fenêtres, thème). */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function toast(msg, ms = 2600) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    // noms sans accents : certains navigateurs ignorent sinon le nom proposé
    a.href = url; a.download = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const readAsArrayBuffer = (file) => file.arrayBuffer();
  function readAsDataURL(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  }
  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  function pickFiles(accept, multiple = true) {
    return new Promise((res) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
      inp.onchange = () => res(Array.from(inp.files || []));
      inp.click();
    });
  }
  function baseName(name) { return (name || 'document').replace(/\.[^.]+$/, ''); }

  /* Menus déroulants : <div class="menu"><button data-menu>…</button><div class="menu-list" hidden>…</div></div> */
  function initMenus(root = document) {
    $$('.menu', root).forEach((m) => {
      const btn = m.querySelector('[data-menu]'); const list = m.querySelector('.menu-list');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = list.hidden;
        $$('.menu-list').forEach((l) => { l.hidden = true; });
        list.hidden = !open;
      });
      list.addEventListener('click', () => { list.hidden = true; });
    });
    document.addEventListener('click', () => $$('.menu-list').forEach((l) => { l.hidden = true; }));
  }

  /* Fenêtre modale. buttons: [{label, primary, value}] ; renvoie la value du bouton cliqué (null si fermé). */
  function modal({ title, body, buttons = [{ label: 'Fermer', value: null }], wide = false, onOpen }) {
    return new Promise((resolve) => {
      const back = document.createElement('div'); back.className = 'modal-back';
      const box = document.createElement('div'); box.className = 'modal' + (wide ? ' wide' : '');
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      const h = document.createElement('header'); h.textContent = title;
      const x = document.createElement('button'); x.className = 'ghost'; x.textContent = '✕'; x.setAttribute('aria-label', 'Fermer');
      h.appendChild(x);
      const b = document.createElement('div'); b.className = 'body';
      if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
      const f = document.createElement('footer');
      const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      buttons.forEach((bt) => {
        const el = document.createElement('button'); el.textContent = bt.label;
        if (bt.primary) el.className = 'primary';
        if (bt.danger) el.className = 'danger';
        el.onclick = () => {
          if (bt.validate && !bt.validate(b)) return;
          close(typeof bt.value === 'function' ? bt.value(b) : bt.value);
        };
        f.appendChild(el);
      });
      x.onclick = () => close(null);
      back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey);
      box.append(h, b, f); back.appendChild(box); document.body.appendChild(back);
      if (onOpen) onOpen(b);
      const first = b.querySelector('input, select, textarea'); if (first) first.focus();
    });
  }

  function confirmBox(message, okLabel = 'Confirmer') {
    return modal({ title: 'Confirmation', body: `<p style="margin:0">${message}</p>`, buttons: [{ label: 'Annuler', value: false }, { label: okLabel, primary: true, value: true }] }).then(Boolean);
  }

  /* Thème clair/sombre mémorisé localement. */
  function initTheme() {
    try { const t = localStorage.getItem('studio-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* stockage indisponible */ }
    const btn = document.getElementById('themeBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme
        || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('studio-theme', next); } catch (e) { /* ignore */ }
    });
  }

  function store(key, value) {
    try {
      if (value === undefined) { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { return null; }
    return value;
  }

  /* Glisser-déposer de fichiers sur un élément. */
  function onDropFiles(el, cb) {
    ['dragenter', 'dragover'].forEach((ev) => el.addEventListener(ev, (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault(); el.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach((ev) => el.addEventListener(ev, () => el.classList.remove('over')));
    el.addEventListener('drop', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); cb(Array.from(e.dataTransfer.files));
    });
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* Passage de fichiers d'une application à l'autre (Mes fichiers, partage depuis une autre appli, conversions) :
     les fichiers sont déposés dans IndexedDB puis l'application cible est ouverte avec « #import ». */
  const handoff = {
    db() { return new Promise((res, rej) => { const r = indexedDB.open('studio-handoff', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async put(key, files) { const h = await this.db(); const list = [...files].map((f) => ({ name: f.name, type: f.type, blob: f })); await new Promise((res, rej) => { const t = h.transaction('files', 'readwrite'); t.objectStore('files').put(list, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); h.close(); },
    async peek(key) { const h = await this.db(); const v = await new Promise((res, rej) => { const q = h.transaction('files').objectStore('files').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); h.close(); return norm(v); },
    async take(key) { const h = await this.db(); const v = await new Promise((res, rej) => { const t = h.transaction('files', 'readwrite'); const st = t.objectStore('files'); const g = st.get(key); g.onsuccess = () => st.delete(key); t.oncomplete = () => res(g.result); t.onerror = () => rej(t.error); }); h.close(); return norm(v); },
  };
  const norm = (v) => (v ? (Array.isArray(v) ? v : [v]) : []).filter((x) => x && x.blob).map((x) => (x.blob instanceof File && x.blob.name === x.name ? x.blob : new File([x.blob], x.name || 'fichier', { type: x.type || x.blob.type || '' })));
  function onImport(key, fn) {
    if (location.hash !== '#import') return;
    history.replaceState(null, '', location.pathname + location.search);
    const go = async () => { try { const fs = await handoff.take(key); if (fs.length) await fn(fs); } catch (e) { console.error(e); toast('Ouverture impossible : ' + (e.message || e), 7000); } };
    if (document.readyState === 'complete') setTimeout(go, 300); else window.addEventListener('load', () => setTimeout(go, 300));
  }
  async function openIn(app, files) { await handoff.put(app, files); location.href = `${app}.html#import`; }

  window.Studio = { $, $$, toast, download, readAsArrayBuffer, readAsDataURL, loadImage, pickFiles, baseName, initMenus, modal, confirmBox, initTheme, store, onDropFiles, clamp, handoff, onImport, openIn };
  document.addEventListener('DOMContentLoaded', initTheme);

  // Application installable (Chrome, Edge, Android) et utilisable hors connexion, quand le site est servi en https
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('hors connexion indisponible', e)));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const b = document.getElementById('installBtn'); if (!b) return;
    b.hidden = false;
    b.onclick = async () => { e.prompt(); const r = await e.userChoice; if (r.outcome === 'accepted') b.hidden = true; };
  });
  window.addEventListener('appinstalled', () => { const b = document.getElementById('installBtn'); if (b) b.hidden = true; toast('Studio Joe est installé'); });
})();
