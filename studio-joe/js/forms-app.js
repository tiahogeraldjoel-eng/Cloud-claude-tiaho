/* Studio Joe — Formulaires Joe : créer des formulaires, les faire remplir et compiler les réponses
   (équivalent Google Forms / Microsoft Forms, mais sans serveur).
   Saisie sur l'appareil (enquête de terrain), formulaire HTML autonome à envoyer (la réponse revient en
   fichier ou en code à coller), PDF à remplir (Acrobat, navigateur) relu automatiquement, PDF à imprimer.
   Réponses : tableau, statistiques, export Excel / CSV, ouverture dans Tableur Joe. */
(function () {
  const { $, toast, download, pickFiles, modal, confirmBox, baseName } = Studio;
  const uid = (p = '') => p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const loaded = {};
  function loadScript(src) { if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('bibliothèque introuvable : ' + src)); }; document.head.appendChild(s); }); return loaded[src]; }

  const TYPES = {
    section: 'Titre de partie', text: 'Texte court', long: 'Paragraphe', number: 'Nombre', money: 'Montant (FCFA)', date: 'Date',
    radio: 'Choix unique', checks: 'Cases à cocher', select: 'Liste déroulante', yesno: 'Oui / Non', rating: 'Note de 1 à 5',
    email: 'E-mail', tel: 'Téléphone', signature: 'Signature',
  };
  const WITH_OPTIONS = new Set(['radio', 'checks', 'select']);

  /* ================= Moteur d'affichage (copié tel quel dans le formulaire HTML autonome) ================= */
  function formRuntime() {
    const CSS = `.fj{font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1d1f24;display:grid;gap:12px}
.fj-head{background:#fff;border:1px solid #dde0e6;border-top:8px solid #00796b;border-radius:12px;padding:16px}
.fj-head h1{margin:0 0 6px;font-size:22px}.fj-head p{margin:0;color:#555;white-space:pre-wrap}
.fj-q{background:#fff;border:1px solid #dde0e6;border-radius:12px;padding:14px;display:grid;gap:8px}
.fj-q.fj-bad{border-color:#c62828;box-shadow:0 0 0 1px #c62828}
.fj-sec{background:transparent;border:0;padding:8px 2px 0}.fj-sec h2{margin:0;font-size:18px;color:#00796b}.fj-sec p{margin:2px 0 0;color:#555}
.fj-l{font-weight:600}.fj-l .fj-req{color:#c62828}.fj-h{font-size:13px;color:#666;margin-top:-4px}
.fj input[type=text],.fj input[type=number],.fj input[type=date],.fj input[type=email],.fj input[type=tel],.fj textarea,.fj select{font:inherit;width:100%;box-sizing:border-box;padding:10px;border:1px solid #c9cdd6;border-radius:8px;background:#fff;color:#1d1f24}
.fj textarea{min-height:90px;resize:vertical}
.fj-opt{display:flex;gap:10px;align-items:center;padding:6px 2px;cursor:pointer}.fj-opt input{width:20px;height:20px;margin:0;accent-color:#00796b}
.fj-money{display:flex;gap:8px;align-items:center}.fj-money span{color:#666}
.fj-stars{display:flex;gap:6px}.fj-stars button{font-size:26px;line-height:1;background:none;border:0;cursor:pointer;color:#c9cdd6;padding:2px}.fj-stars button.on{color:#f5a623}
.fj-sig{border:1px dashed #9aa0aa;border-radius:8px;background:#fff;touch-action:none;width:100%;height:150px;display:block}
.fj-sigbar{display:flex;justify-content:space-between;font-size:13px;color:#666}.fj-sigbar button{font:inherit;background:none;border:0;color:#00796b;cursor:pointer}
.fj-err{color:#c62828;font-size:13px}`;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const opts = (f) => String(f.options || '').split('\n').map((x) => x.trim()).filter(Boolean);
    function render(root, form, values) {
      values = values || {};
      root.classList.add('fj');
      let h = `<div class="fj-head"><h1>${esc(form.title || 'Formulaire')}</h1>${form.desc ? `<p>${esc(form.desc)}</p>` : ''}</div>`;
      for (const f of form.fields) {
        const v = values[f.id]; const nm = 'fj_' + f.id;
        if (f.type === 'section') { h += `<div class="fj-q fj-sec" data-id="${f.id}"><h2>${esc(f.label)}</h2>${f.help ? `<p>${esc(f.help)}</p>` : ''}</div>`; continue; }
        h += `<div class="fj-q" data-id="${f.id}"><label class="fj-l" for="${nm}">${esc(f.label || 'Question')}${f.required ? ' <span class="fj-req">*</span>' : ''}</label>${f.help ? `<div class="fj-h">${esc(f.help)}</div>` : ''}`;
        const val = v == null ? '' : v;
        switch (f.type) {
          case 'long': h += `<textarea id="${nm}" name="${nm}">${esc(val)}</textarea>`; break;
          case 'number': h += `<input type="text" inputmode="decimal" id="${nm}" name="${nm}" value="${esc(val)}">`; break;
          case 'money': h += `<div class="fj-money"><input type="text" inputmode="numeric" id="${nm}" name="${nm}" value="${val === '' ? '' : esc(Number(val).toLocaleString('fr-FR'))}"><span>FCFA</span></div>`; break;
          case 'date': h += `<input type="date" id="${nm}" name="${nm}" value="${esc(val)}">`; break;
          case 'email': h += `<input type="email" id="${nm}" name="${nm}" value="${esc(val)}" autocomplete="email">`; break;
          case 'tel': h += `<input type="tel" id="${nm}" name="${nm}" value="${esc(val)}" autocomplete="tel">`; break;
          case 'radio': case 'yesno': h += (f.type === 'yesno' ? ['Oui', 'Non'] : opts(f)).map((o, i) => `<label class="fj-opt"><input type="radio" name="${nm}" value="${esc(o)}" ${val === o ? 'checked' : ''} ${i ? '' : `id="${nm}"`}> ${esc(o)}</label>`).join(''); break;
          case 'checks': h += opts(f).map((o, i) => `<label class="fj-opt"><input type="checkbox" name="${nm}" value="${esc(o)}" ${Array.isArray(val) && val.includes(o) ? 'checked' : ''} ${i ? '' : `id="${nm}"`}> ${esc(o)}</label>`).join(''); break;
          case 'select': h += `<select id="${nm}" name="${nm}"><option value="">— Choisir —</option>${opts(f).map((o) => `<option${val === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
          case 'rating': h += `<div class="fj-stars" data-v="${esc(val)}">${[1, 2, 3, 4, 5].map((k) => `<button type="button" data-k="${k}" aria-label="${k} sur 5" class="${val >= k ? 'on' : ''}">★</button>`).join('')}</div>`; break;
          case 'signature': h += `<canvas class="fj-sig" id="${nm}"></canvas><div class="fj-sigbar"><span>Signez avec le doigt ou la souris</span><button type="button" data-clear>Effacer</button></div>`; break;
          default: h += `<input type="text" id="${nm}" name="${nm}" value="${esc(val)}">`;
        }
        h += '<div class="fj-err" hidden></div></div>';
      }
      root.innerHTML = h;
      root.querySelectorAll('.fj-stars').forEach((s) => s.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const k = +b.dataset.k; s.dataset.v = s.dataset.v == k ? '' : k; s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', +x.dataset.k <= +s.dataset.v)); }));
      root.querySelectorAll('.fj-money input').forEach((i) => i.addEventListener('blur', () => { const n = parseNum(i.value); if (n !== null) i.value = n.toLocaleString('fr-FR'); }));
      root.querySelectorAll('canvas.fj-sig').forEach((c) => sigPad(c, values[c.id.slice(3)]));
    }
    function sigPad(c, init) {
      const fit = () => { const r = c.getBoundingClientRect(); if (!r.width) return; const old = c.dataset.drawn === '1' ? c.toDataURL() : null; c.width = Math.round(r.width * 2); c.height = Math.round(r.height * 2); const x = c.getContext('2d'); x.lineWidth = 4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#0d1b4c'; const src = old || init; if (src) { const im = new Image(); im.onload = () => x.drawImage(im, 0, 0, c.width, c.height); im.src = src; c.dataset.drawn = '1'; } };
      requestAnimationFrame(fit); let last = null;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
      c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); last = pos(e); c.dataset.drawn = '1'; });
      c.addEventListener('pointermove', (e) => { if (!last) return; const p = pos(e); const x = c.getContext('2d'); x.beginPath(); x.moveTo(last[0], last[1]); x.lineTo(p[0], p[1]); x.stroke(); last = p; });
      c.addEventListener('pointerup', () => { last = null; });
      c.parentElement.querySelector('[data-clear]').onclick = () => { c.getContext('2d').clearRect(0, 0, c.width, c.height); c.dataset.drawn = ''; };
    }
    function parseNum(s) { s = String(s).replace(/[\s  ]/g, '').replace(/fcfa|f$/i, '').replace(',', '.'); if (!s) return null; const n = Number(s); return isFinite(n) ? n : NaN; }
    function collect(root, form, quiet) {
      const values = {}; const errors = [];
      for (const f of form.fields) {
        if (f.type === 'section') continue;
        const q = root.querySelector(`.fj-q[data-id="${f.id}"]`); if (!q) continue; const nm = 'fj_' + f.id; let v = ''; let err = '';
        switch (f.type) {
          case 'radio': case 'yesno': { const c = q.querySelector(`input[name="${nm}"]:checked`); v = c ? c.value : ''; break; }
          case 'checks': v = [...q.querySelectorAll(`input[name="${nm}"]:checked`)].map((c) => c.value); break;
          case 'rating': v = q.querySelector('.fj-stars').dataset.v ? +q.querySelector('.fj-stars').dataset.v : ''; break;
          case 'signature': { const c = q.querySelector('canvas'); if (c.dataset.drawn === '1') { const s = document.createElement('canvas'); s.width = 360; s.height = Math.round(360 * c.height / c.width); s.getContext('2d').drawImage(c, 0, 0, s.width, s.height); v = s.toDataURL('image/png'); } break; }
          case 'number': case 'money': { const raw = q.querySelector('input').value; const n = parseNum(raw); if (n === null) v = ''; else if (isNaN(n)) { v = raw; err = 'Indiquez un nombre'; } else v = n; break; }
          default: v = (q.querySelector('input,textarea,select') || {}).value || ''; v = String(v).trim();
        }
        const empty = v === '' || (Array.isArray(v) && !v.length);
        if (!err && f.required && empty) err = 'Réponse obligatoire';
        if (!err && !empty && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) err = 'Adresse e-mail incorrecte';
        if (!err && !empty && f.type === 'tel' && !/^[+\d][\d\s().-]{5,}$/.test(v)) err = 'Numéro incorrect';
        if (quiet) { values[f.id] = v; continue; }
        const box = q.querySelector('.fj-err'); box.hidden = !err; box.textContent = err; q.classList.toggle('fj-bad', !!err);
        if (err) errors.push({ id: f.id, msg: err }); values[f.id] = v;
      }
      if (errors.length && !quiet) { const q = root.querySelector(`.fj-q[data-id="${errors[0].id}"]`); if (q) q.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return { values, errors };
    }
    return { CSS, render, collect, parseNum, opts };
  }
  const RT = formRuntime();
  { const st = document.createElement('style'); st.textContent = RT.CSS + '.fj-head,.fj-q{background:var(--panel)!important;border-color:var(--line)!important;color:var(--fg)}.fj{color:var(--fg)}.fj input,.fj textarea,.fj select{background:var(--bg,#fff)!important;color:var(--fg)!important}'; document.head.appendChild(st); }

  /* ================= Stockage ================= */
  const db = {
    h: null,
    open() { if (this.h) return Promise.resolve(this.h); return new Promise((res, rej) => { const r = indexedDB.open('forms-joe', 1); r.onupgradeneeded = () => { r.result.createObjectStore('forms', { keyPath: 'id' }); const s = r.result.createObjectStore('resp', { keyPath: 'id' }); s.createIndex('form', 'form'); }; r.onsuccess = () => { this.h = r.result; res(this.h); }; r.onerror = () => rej(r.error); }); },
    async all(st) { const h = await this.open(); return new Promise((res, rej) => { const q = h.transaction(st).objectStore(st).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async put(st, v) { const h = await this.open(); return new Promise((res, rej) => { const t = h.transaction(st, 'readwrite'); t.objectStore(st).put(v); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async del(st, id) { const h = await this.open(); return new Promise((res, rej) => { const t = h.transaction(st, 'readwrite'); t.objectStore(st).delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  };
  let forms = [], resps = [], form = null, tab = 'design';
  const myResps = () => resps.filter((r) => r.form === (form && form.id)).sort((a, b) => a.at - b.at);
  let saveT = null;
  const save = () => { if (!form) return; form.updated = Date.now(); clearTimeout(saveT); saveT = setTimeout(() => db.put('forms', form).catch((e) => toast('Enregistrement impossible : ' + e.message)), 400); };

  /* ================= Modèles ================= */
  const F = (type, label, extra = {}) => ({ id: uid('q'), type, label, required: false, help: '', options: '', ...extra });
  const TEMPLATES = {
    vide: { title: 'Formulaire sans titre', desc: '', name: 'Formulaire vide', hint: 'Partir de zéro', fields: () => [F('text', 'Nom et prénom', { required: true })] },
    recensement: { title: 'Recensement des contribuables', desc: 'Fiche de recensement des activités économiques de la commune. Les informations recueillies sont confidentielles.', name: 'Recensement des contribuables', hint: 'Activité, emplacement, taxes', fields: () => [
      F('section', 'Identification'), F('text', 'Nom ou raison sociale', { required: true }), F('text', 'Nom du responsable'), F('tel', 'Téléphone'), F('text', 'N° IFU', { help: 'Identifiant financier unique, s\'il existe' }),
      F('section', 'Activité'), F('select', 'Secteur d\'activité', { required: true, options: 'Commerce\nRestauration / maquis\nTransport\nArtisanat\nServices\nAgriculture / élevage\nAutre' }), F('text', 'Description de l\'activité'),
      F('radio', 'Type d\'installation', { options: 'Boutique\nKiosque\nÉtal au marché\nAmbulant\nAtelier\nAutre' }), F('text', 'Secteur / quartier / repère', { required: true }),
      F('section', 'Taxes'), F('checks', 'Taxes déjà payées cette année', { options: 'Patente\nTaxe de développement communal\nDroits de place\nTaxe sur la publicité\nAucune' }), F('money', 'Montant payé cette année'),
      F('date', 'Date du recensement', { required: true }), F('text', 'Agent recenseur', { required: true }), F('signature', 'Signature du contribuable') ] },
    presence: { title: 'Liste de présence', desc: 'Merci de renseigner votre présence.', name: 'Liste de présence / inscription', hint: 'Réunion, atelier, formation', fields: () => [F('text', 'Nom et prénom', { required: true }), F('text', 'Structure / service', { required: true }), F('text', 'Fonction'), F('tel', 'Téléphone'), F('email', 'E-mail'), F('signature', 'Signature', { required: true })] },
    satisfaction: { title: 'Enquête de satisfaction des usagers', desc: 'Aidez-nous à améliorer l\'accueil et le service. Réponses anonymes.', name: 'Enquête de satisfaction', hint: 'Accueil, délais, qualité', fields: () => [
      F('select', 'Service visité', { options: 'Recette municipale\nÉtat civil\nUrbanisme / domaines\nAccueil\nAutre' }), F('rating', 'Qualité de l\'accueil', { required: true }), F('rating', 'Rapidité du service', { required: true }),
      F('radio', 'Temps d\'attente', { options: 'Moins de 15 minutes\n15 à 30 minutes\n30 minutes à 1 heure\nPlus d\'1 heure' }), F('yesno', 'Votre demande a-t-elle été satisfaite ?', { required: true }), F('long', 'Vos suggestions')] },
    intervention: { title: 'Demande d\'intervention', desc: 'Signalez un problème (voirie, éclairage, propreté, bâtiment…).', name: 'Demande d\'intervention', hint: 'Signalement, maintenance', fields: () => [
      F('text', 'Nom du demandeur', { required: true }), F('tel', 'Téléphone', { required: true }), F('select', 'Nature du problème', { required: true, options: 'Voirie / route\nÉclairage public\nEau / assainissement\nPropreté / ordures\nBâtiment public\nAutre' }),
      F('text', 'Lieu exact', { required: true }), F('long', 'Description', { required: true }), F('radio', 'Urgence', { options: 'Faible\nMoyenne\nÉlevée' }), F('date', 'Date du constat')] },
    marche: { title: 'Collecte des droits de place au marché', desc: 'Fiche journalière de collecte.', name: 'Collecte au marché', hint: 'Droits de place, tickets', fields: () => [
      F('date', 'Date', { required: true }), F('text', 'Collecteur', { required: true }), F('select', 'Zone du marché', { required: true, options: 'Zone A\nZone B\nZone C\nParking\nAbattoir' }), F('number', 'Nombre de tickets vendus', { required: true }), F('money', 'Montant collecté', { required: true }), F('long', 'Observations')] },
  };
  async function newForm(key) {
    if (!key) {
      key = await modal({ title: 'Nouveau formulaire', wide: true, body: `<div class="tpl">${Object.entries(TEMPLATES).map(([k, t]) => `<button data-k="${k}"><b>${esc(t.name)}</b><span>${esc(t.hint)}</span></button>`).join('')}</div>`,
        onOpen: (b) => b.querySelectorAll('[data-k]').forEach((x) => { x.onclick = () => { b.closest('.modal-back').dataset.v = x.dataset.k; b.closest('.modal').querySelector('footer button.primary').click(); }; }),
        buttons: [{ label: 'Annuler', value: null }, { label: 'Formulaire vide', primary: true, value: (b) => b.closest('.modal-back').dataset.v || 'vide' }] });
      if (!key) return;
    }
    const t = TEMPLATES[key]; const f = { id: uid('f'), title: t.title, desc: t.desc, email: '', thanks: 'Merci, votre réponse a bien été enregistrée.', fields: t.fields(), created: Date.now(), updated: Date.now() };
    forms.push(f); await db.put('forms', f); form = f; renderSel(); setTab('design');
  }

  /* ================= En-tête : choix du formulaire, onglets ================= */
  function renderSel() {
    const s = $('#formSel');
    s.innerHTML = forms.slice().sort((a, b) => b.updated - a.updated).map((f) => `<option value="${f.id}"${form && f.id === form.id ? ' selected' : ''}>${esc(f.title || 'Sans titre')}</option>`).join('');
    $('#respCount').textContent = form ? `(${myResps().length})` : '';
  }
  $('#formSel').onchange = (e) => { form = forms.find((f) => f.id === e.target.value); try { localStorage.setItem('forms-last', form.id); } catch (er) { /* ignore */ } renderSel(); render(); };
  $('#newBtn').onclick = () => newForm();
  function setTab(t) { tab = t; document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); render(); }
  $('#tabs').onclick = (e) => { const b = e.target.closest('button[data-t]'); if (b) setTab(b.dataset.t); };
  function render() { renderSel(); if (!form) { $('#main').innerHTML = '<p>Aucun formulaire.</p>'; return; } ({ design: renderDesign, fill: renderFill, resp: renderResp, share: renderShare })[tab](); window.scrollTo(0, 0); }

  /* ================= Concevoir ================= */
  function renderDesign() {
    const m = $('#main');
    m.innerHTML = `<div class="head-card"><input id="fTitle" value="${esc(form.title)}" placeholder="Titre du formulaire" aria-label="Titre"><textarea id="fDesc" placeholder="Description, consignes (facultatif)" aria-label="Description">${esc(form.desc)}</textarea></div>
      <div id="qs" style="display:grid;gap:12px"></div>
      <div class="addbar">${['text', 'long', 'radio', 'checks', 'select', 'yesno', 'number', 'money', 'date', 'tel', 'email', 'rating', 'signature', 'section'].map((t) => `<button data-add="${t}">＋ ${TYPES[t]}</button>`).join('')}</div>
      <details class="q"><summary><b>Réglages</b></summary><div class="field"><label for="fEmail">E-mail de retour des réponses (facultatif)</label><input id="fEmail" type="email" value="${esc(form.email || '')}" placeholder="pour le bouton « Envoyer par e-mail » du formulaire HTML"></div><div class="field"><label for="fThanks">Message après l'envoi</label><input id="fThanks" value="${esc(form.thanks || '')}"></div>
      <div class="row"><button id="fDup">Dupliquer ce formulaire</button><button id="fExport">Exporter (.joeform)</button><button id="fImport">Importer un formulaire…</button><button id="fDel" class="danger">Supprimer ce formulaire</button></div></details>`;
    $('#fTitle').oninput = (e) => { form.title = e.target.value; save(); renderSel(); };
    $('#fDesc').oninput = (e) => { form.desc = e.target.value; save(); };
    $('#fEmail').oninput = (e) => { form.email = e.target.value.trim(); save(); };
    $('#fThanks').oninput = (e) => { form.thanks = e.target.value; save(); };
    m.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { const f = F(b.dataset.add, b.dataset.add === 'section' ? 'Nouvelle partie' : '', WITH_OPTIONS.has(b.dataset.add) ? { options: 'Option 1\nOption 2' } : {}); form.fields.push(f); save(); renderQs(); const el = $(`#qs [data-id="${f.id}"] input`); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } }; });
    $('#fDup').onclick = async () => { const c = JSON.parse(JSON.stringify(form)); c.id = uid('f'); c.title += ' (copie)'; c.created = c.updated = Date.now(); forms.push(c); await db.put('forms', c); form = c; render(); toast('Formulaire dupliqué (sans les réponses)'); };
    $('#fExport').onclick = () => download(new Blob([JSON.stringify({ app: 'formulaires-joe', type: 'formulaire', form }, null, 1)], { type: 'application/json' }), slug(form.title) + '.joeform');
    $('#fImport').onclick = () => importForm();
    $('#fDel').onclick = async () => { const n = myResps().length; if (!(await confirmBox(`Supprimer « ${form.title} »${n ? ` et ses ${n} réponse(s)` : ''} ?`, 'Supprimer'))) return; for (const r of myResps()) await db.del('resp', r.id); resps = resps.filter((r) => r.form !== form.id); await db.del('forms', form.id); forms = forms.filter((f) => f !== form); form = forms[0] || null; if (!form) await newForm('vide'); else render(); };
    renderQs();
  }
  function renderQs() {
    const box = $('#qs'); let n = 0;
    box.innerHTML = form.fields.map((f, i) => {
      if (f.type !== 'section') n++;
      return `<div class="q${f.type === 'section' ? ' sec' : ''}" data-id="${f.id}">
        <div class="row1"><input data-k="label" value="${esc(f.label)}" placeholder="${f.type === 'section' ? 'Titre de la partie' : 'Question'}" aria-label="Intitulé"><select data-k="type" aria-label="Type">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}"${k === f.type ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        ${WITH_OPTIONS.has(f.type) ? `<textarea data-k="options" placeholder="Une option par ligne" aria-label="Options">${esc(f.options)}</textarea>` : ''}
        <input data-k="help" value="${esc(f.help)}" placeholder="${f.type === 'section' ? 'Texte d\'introduction (facultatif)' : 'Aide ou précision (facultatif)'}" aria-label="Aide">
        <div class="row2">${f.type === 'section' ? '<span class="num">Partie</span>' : `<span class="num">Q${n}</span><label class="row"><input type="checkbox" data-k="required" ${f.required ? 'checked' : ''}> Obligatoire</label>`}<span class="sp"></span>
          <button data-m="-1" title="Monter" ${i ? '' : 'disabled'}>↑</button><button data-m="1" title="Descendre" ${i < form.fields.length - 1 ? '' : 'disabled'}>↓</button><button data-dup title="Dupliquer">⧉</button><button data-del title="Supprimer" class="danger">🗑</button></div></div>`;
    }).join('');
    box.querySelectorAll('.q').forEach((q) => {
      const f = form.fields.find((x) => x.id === q.dataset.id);
      q.querySelectorAll('[data-k]').forEach((el) => {
        el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
          const k = el.dataset.k; f[k] = el.type === 'checkbox' ? el.checked : el.value;
          if (k === 'type') { if (WITH_OPTIONS.has(f.type) && !f.options) f.options = 'Option 1\nOption 2'; renderQs(); }
          save();
        });
      });
      q.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { const i = form.fields.indexOf(f), j = i + +b.dataset.m; [form.fields[i], form.fields[j]] = [form.fields[j], form.fields[i]]; save(); renderQs(); }; });
      q.querySelector('[data-dup]').onclick = () => { const c = { ...f, id: uid('q') }; form.fields.splice(form.fields.indexOf(f) + 1, 0, c); save(); renderQs(); };
      q.querySelector('[data-del]').onclick = async () => { if (myResps().some((r) => r.values[f.id] !== undefined && r.values[f.id] !== '') && !(await confirmBox('Des réponses existent pour cette question : elles ne seront plus affichées. Supprimer ?', 'Supprimer'))) return; form.fields = form.fields.filter((x) => x !== f); save(); renderQs(); };
    });
  }
  async function importForm(given) {
    const file = given || (await pickFiles('.joeform,.json,application/json', false))[0]; if (!file) return;
    try { const o = JSON.parse(await file.text()); if (o.app !== 'formulaires-joe' || !o.form) throw new Error('fichier non reconnu'); const f = o.form; if (forms.some((x) => x.id === f.id)) f.id = uid('f'); f.updated = Date.now(); forms.push(f); await db.put('forms', f); form = f; render(); toast('Formulaire importé'); }
    catch (e) { toast('Import impossible : ' + e.message, 6000); }
  }

  /* ================= Remplir (sur cet appareil) ================= */
  function renderFill() {
    const m = $('#main'); const n = myResps().filter((r) => r.source === 'appareil').length;
    m.innerHTML = `<p class="hint" style="margin:0">Saisie sur cet appareil : idéal pour une enquête de terrain ou un guichet. Chaque réponse enregistrée s'ajoute à l'onglet Réponses. ${n ? `<b>${n}</b> réponse(s) déjà saisie(s) ici.` : ''}</p><div id="fillRoot"></div><div class="fillbar"><button class="primary" id="saveResp">✓ Enregistrer la réponse</button><button id="clearResp">Effacer</button></div>`;
    RT.render($('#fillRoot'), form, {});
    $('#saveResp').onclick = async () => {
      const r = RT.collect($('#fillRoot'), form); if (r.errors.length) return toast(`${r.errors.length} réponse(s) à corriger`, 3000);
      const rec = { id: uid('r'), form: form.id, at: Date.now(), source: 'appareil', values: r.values }; resps.push(rec); await db.put('resp', rec);
      toast(form.thanks || 'Réponse enregistrée', 2500); renderFill();
    };
    $('#clearResp').onclick = async () => { if (await confirmBox('Effacer les réponses saisies ?', 'Effacer')) renderFill(); };
  }

  /* ================= Réponses ================= */
  const fieldsQ = () => form.fields.filter((f) => f.type !== 'section');
  function cellText(f, v) {
    if (v === undefined || v === null || v === '') return '';
    if (f.type === 'signature') return v ? '✓ signée' : '';
    if (Array.isArray(v)) return v.join(', ');
    if (f.type === 'money' && typeof v === 'number') return v.toLocaleString('fr-FR') + ' F';
    if (f.type === 'date' && /^\d{4}-\d\d-\d\d$/.test(v)) return v.split('-').reverse().join('/');
    if (f.type === 'rating') return '★'.repeat(v) + ` (${v})`;
    return String(v);
  }
  function renderResp() {
    const m = $('#main'); const R = myResps(); const Q = fieldsQ();
    m.innerHTML = `<div class="row"><button class="primary" id="impResp">📥 Importer des réponses…</button><button id="xlsx" ${R.length ? '' : 'disabled'}>⬇ Excel (.xlsx)</button><button id="csv" ${R.length ? '' : 'disabled'}>CSV</button><button id="toTab" ${R.length ? '' : 'disabled'}>Ouvrir dans Tableur Joe</button><span class="spacer" style="flex:1"></span><button id="delAll" class="danger" ${R.length ? '' : 'disabled'}>Tout effacer</button></div>
      ${R.length ? '' : '<p class="muted">Aucune réponse pour l\'instant. Remplissez le formulaire sur cet appareil (onglet Remplir), ou diffusez-le puis importez ici les fichiers de réponse, les PDF remplis ou les codes reçus par WhatsApp.</p>'}
      <div class="stats" id="stats"></div>${R.length ? `<h3 style="margin:8px 0 0">Toutes les réponses (${R.length})</h3><div class="tablewrap"><table class="resp"><thead><tr><th>N°</th><th>Reçue le</th><th>Source</th>${Q.map((f) => `<th>${esc(f.label || 'Question')}</th>`).join('')}<th></th></tr></thead><tbody>${R.map((r, i) => `<tr data-id="${r.id}"><td>${i + 1}</td><td>${new Date(r.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc(r.source || '')}</td>${Q.map((f) => `<td>${f.type === 'signature' && r.values[f.id] ? `<img src="${r.values[f.id]}" alt="signature">` : esc(cellText(f, r.values[f.id]))}</td>`).join('')}<td><button data-del title="Supprimer">🗑</button></td></tr>`).join('')}</tbody></table></div>` : ''}`;
    $('#impResp').onclick = importResponses;
    $('#xlsx').onclick = () => exportXlsx().then((b) => download(b, slug(form.title) + '-reponses.xlsx'));
    $('#csv').onclick = exportCsv;
    $('#toTab').onclick = openInTableur;
    $('#delAll').onclick = async () => { if (!(await confirmBox(`Effacer les ${R.length} réponses de ce formulaire ?`, 'Effacer'))) return; for (const r of R) await db.del('resp', r.id); resps = resps.filter((r) => r.form !== form.id); renderResp(); renderSel(); };
    m.querySelectorAll('tr[data-id] [data-del]').forEach((b) => { b.onclick = async () => { const id = b.closest('tr').dataset.id; if (!(await confirmBox('Supprimer cette réponse ?', 'Supprimer'))) return; await db.del('resp', id); resps = resps.filter((r) => r.id !== id); renderResp(); renderSel(); }; });
    if (R.length) renderStats(R, Q);
  }
  function renderStats(R, Q) {
    const out = [];
    for (const f of Q) {
      const vals = R.map((r) => r.values[f.id]).filter((v) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length));
      let body = `<div class="muted" style="font-size:12px">${vals.length} réponse(s) sur ${R.length}</div>`;
      if (['radio', 'select', 'yesno', 'checks', 'rating'].includes(f.type)) {
        const opts = f.type === 'yesno' ? ['Oui', 'Non'] : f.type === 'rating' ? ['5', '4', '3', '2', '1'] : RT.opts(f);
        const cnt = {}; vals.forEach((v) => (Array.isArray(v) ? v : [String(v)]).forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; }));
        Object.keys(cnt).forEach((k) => { if (!opts.includes(k)) opts.push(k); });
        const max = Math.max(1, ...Object.values(cnt));
        body += opts.map((o) => { const c = cnt[o] || 0; return `<div class="bar"><span>${f.type === 'rating' ? '★'.repeat(+o) : esc(o)}</span><div class="b"><div style="width:${(c / max) * 100}%"></div></div><span>${c} · ${vals.length ? Math.round((c / vals.length) * 100) : 0} %</span></div>`; }).join('');
        if (f.type === 'rating' && vals.length) body += `<div class="kv" style="margin-top:6px"><span>Moyenne<b>${(vals.reduce((a, v) => a + +v, 0) / vals.length).toFixed(1).replace('.', ',')} / 5</b></span></div>`;
      } else if (f.type === 'number' || f.type === 'money') {
        const nums = vals.filter((v) => typeof v === 'number'); const sum = nums.reduce((a, v) => a + v, 0); const fmt = (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + (f.type === 'money' ? ' F' : '');
        if (nums.length) body += `<div class="kv"><span>Total<b>${fmt(sum)}</b></span><span>Moyenne<b>${fmt(sum / nums.length)}</b></span><span>Minimum<b>${fmt(Math.min(...nums))}</b></span><span>Maximum<b>${fmt(Math.max(...nums))}</b></span></div>`;
      } else if (f.type === 'date') {
        const ds = vals.filter((v) => /^\d{4}-\d\d-\d\d$/.test(v)).sort(); if (ds.length) body += `<div class="kv"><span>Du<b>${cellText(f, ds[0])}</b></span><span>Au<b>${cellText(f, ds[ds.length - 1])}</b></span></div>`;
      } else if (f.type === 'signature') {
        body += `<div class="kv"><span>Signées<b>${vals.length}</b></span></div>`;
      } else {
        body += vals.slice(-5).reverse().map((v) => `<div style="font-size:13px;border-top:1px solid var(--line);padding:4px 0">${esc(String(v).slice(0, 200))}</div>`).join('') + (vals.length > 5 ? `<div class="muted" style="font-size:12px">… et ${vals.length - 5} autre(s) dans le tableau</div>` : '');
      }
      out.push(`<div class="stat"><h4>${esc(f.label || 'Question')}</h4>${body}</div>`);
    }
    $('#stats').innerHTML = out.join('');
  }
  async function importResponses() {
    const v = await modal({ title: 'Importer des réponses', wide: true, body: `<p>Choisissez les <b>fichiers de réponse</b> (.json) envoyés depuis le formulaire HTML, ou les <b>PDF remplis</b>. Vous pouvez aussi coller ci-dessous les <b>codes de réponse</b> reçus par WhatsApp ou e-mail (ils commencent par <code>FJ1.</code>) : plusieurs codes à la suite sont acceptés.</p><textarea id="codes" style="min-height:120px" placeholder="FJ1.eyJ…"></textarea>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Choisir des fichiers…', value: 'files' }, { label: 'Importer les codes', primary: true, value: (b) => ({ codes: b.querySelector('#codes').value }) }] });
    if (!v) return;
    let added = 0, skipped = 0, other = 0;
    const addResp = async (o, source) => {
      if (!o || o.app !== 'formulaires-joe' || o.type !== 'reponse') throw new Error('réponse non reconnue');
      if (o.form !== form.id) { other++; return; }
      if (resps.some((r) => r.id === o.id)) { skipped++; return; }
      const rec = { id: o.id || uid('r'), form: form.id, at: o.at || Date.now(), source, values: o.values || {} }; resps.push(rec); await db.put('resp', rec); added++;
    };
    const errs = [];
    if (v === 'files') {
      const files = await pickFiles('.json,.pdf,application/json,application/pdf', true);
      for (const f of files) {
        try {
          if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') await addResp(await readFilledPdf(f), 'PDF');
          else { const t = await f.text(); const m = t.match(/FJ1\.[A-Za-z0-9_-]+/g); if (m) for (const c of m) await addResp(await decodeCode(c), 'code'); else await addResp(JSON.parse(t), 'fichier'); }
        } catch (e) { errs.push(`${f.name} : ${e.message}`); }
      }
    } else {
      const m = (v.codes || '').match(/FJ1\.[A-Za-z0-9_-]+/g) || [];
      if (!m.length) return toast('Aucun code « FJ1. » trouvé dans le texte collé');
      for (const c of m) { try { await addResp(await decodeCode(c), 'code'); } catch (e) { errs.push(e.message); } }
    }
    renderResp(); renderSel();
    toast(`${added} réponse(s) ajoutée(s)${skipped ? `, ${skipped} déjà présente(s)` : ''}${other ? `, ${other} d'un autre formulaire` : ''}${errs.length ? ` — ${errs.length} erreur(s) : ${errs[0]}` : ''}`, 7000);
  }
  // code de réponse : JSON compressé en base64 « url »
  async function gz(bytes, dir) { const s = new Blob([bytes]).stream().pipeThrough(dir === 'c' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
  function b64u(u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  async function decodeCode(c) { const raw = unb64u(c.slice(4)); let txt; try { txt = new TextDecoder().decode(await gz(raw, 'd')); } catch (e) { txt = new TextDecoder().decode(raw); } return JSON.parse(txt); }

  async function exportXlsx() {
    await loadScript('lib/exceljs.min.js');
    const R = myResps(), Q = fieldsQ();
    const wb = new window.ExcelJS.Workbook(); wb.creator = 'Formulaires Joe';
    const ws = wb.addWorksheet('Réponses', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(['N°', 'Reçue le', 'Source', ...Q.map((f) => f.label || 'Question')]);
    R.forEach((r, i) => ws.addRow([i + 1, new Date(r.at), r.source || '', ...Q.map((f) => { const v = r.values[f.id]; if (v === undefined || v === '') return null; if (f.type === 'date' && /^\d{4}-\d\d-\d\d$/.test(v)) { const [y, mo, d] = v.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, d)); } if (f.type === 'signature') return v ? 'signée' : null; if (Array.isArray(v)) return v.join(', '); return v; })]));
    const head = ws.getRow(1); head.font = { bold: true, color: { argb: 'FFFFFFFF' } }; head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00796B' } }; head.alignment = { vertical: 'middle', wrapText: true }; head.height = 30;
    ws.getColumn(2).numFmt = 'dd/mm/yyyy hh:mm'; ws.getColumn(1).width = 6; ws.getColumn(2).width = 17; ws.getColumn(3).width = 10;
    Q.forEach((f, j) => { const col = ws.getColumn(j + 4); col.width = Math.min(45, Math.max(12, (f.label || '').length * 0.9, ...R.map((r) => String(cellText(f, r.values[f.id])).length * 1.05))); if (f.type === 'money') col.numFmt = '#,##0 "F CFA"'; if (f.type === 'date') col.numFmt = 'dd/mm/yyyy'; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Q.length + 3 } };
    // totaux des montants et nombres
    const tot = ['Total', '', '']; let any = false;
    Q.forEach((f, j) => { if (f.type === 'money' || f.type === 'number') { const L = String.fromCharCode(68 + j); const col = j < 23 ? L : null; if (col && R.length) { tot.push({ formula: `SUBTOTAL(9,${col}2:${col}${R.length + 1})` }); any = true; return; } } tot.push(null); });
    if (any) { const tr = ws.addRow(tot); tr.font = { bold: true }; Q.forEach((f, j) => { if (f.type === 'money') tr.getCell(j + 4).numFmt = '#,##0 "F CFA"'; }); }
    // statistiques des choix
    const st = wb.addWorksheet('Statistiques'); st.columns = [{ width: 40 }, { width: 30 }, { width: 10 }, { width: 10 }];
    for (const f of Q.filter((x) => ['radio', 'select', 'yesno', 'checks', 'rating'].includes(x.type))) {
      const vals = R.map((r) => r.values[f.id]).filter((v) => v !== undefined && v !== '');
      const opts = f.type === 'yesno' ? ['Oui', 'Non'] : f.type === 'rating' ? ['1', '2', '3', '4', '5'] : RT.opts(f);
      const row = st.addRow([f.label]); row.font = { bold: true };
      opts.forEach((o) => { const c = vals.filter((v) => (Array.isArray(v) ? v.includes(o) : String(v) === o)).length; const rr = st.addRow(['', o, c, vals.length ? c / vals.length : 0]); rr.getCell(4).numFmt = '0%'; });
      st.addRow([]);
    }
    return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function exportCsv() {
    const R = myResps(), Q = fieldsQ(); const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [['N°', 'Reçue le', 'Source', ...Q.map((f) => f.label)].map(q).join(';')];
    R.forEach((r, i) => lines.push([i + 1, new Date(r.at).toLocaleString('fr-FR'), r.source || '', ...Q.map((f) => { const v = r.values[f.id]; if (typeof v === 'number') return String(v).replace('.', ','); return cellText(f, v).replace(/ F$/, ''); })].map(q).join(';')));
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), slug(form.title) + '-reponses.csv');
  }
  async function openInTableur() {
    const blob = await exportXlsx();
    await new Promise((res, rej) => { const r = indexedDB.open('studio-handoff', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => { const h = r.result; const tx = h.transaction('files', 'readwrite'); tx.objectStore('files').put({ name: slug(form.title) + '-reponses.xlsx', blob }, 'tableur'); tx.oncomplete = () => { h.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    location.href = 'tableur.html#import';
  }
  const slug = (s) => (s || 'formulaire').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50) || 'formulaire';

  /* ================= Diffuser ================= */
  function renderShare() {
    const m = $('#main');
    m.innerHTML = `<div class="cards3">
      <div class="c"><h3>📱 Formulaire à envoyer (.html)</h3><p>Un seul fichier à envoyer par WhatsApp ou e-mail. La personne l'ouvre sur son téléphone ou son ordinateur, remplit, puis vous renvoie sa réponse (un fichier, ou un code à coller). Fonctionne sans internet.</p><button class="primary" id="shHtml">Créer le formulaire HTML</button></div>
      <div class="c"><h3>📄 PDF à remplir</h3><p>Un PDF avec des champs à remplir dans Adobe Acrobat, le navigateur ou PDF Joe. Les PDF remplis qu'on vous renvoie sont lus automatiquement (onglet Réponses → Importer).</p><button class="primary" id="shPdf">Créer le PDF à remplir</button></div>
      <div class="c"><h3>🖨 Version papier</h3><p>Le formulaire mis en page pour l'impression, avec des cases à cocher et des lignes à remplir à la main.</p><button id="shPrint">Créer le PDF à imprimer</button></div>
    </div>
    <div class="q"><b>Comment récupérer les réponses ?</b><ol style="margin:4px 0 0;padding-left:20px;font-size:14px"><li>Envoyez le fichier HTML ou le PDF à remplir.</li><li>Les personnes vous renvoient leur réponse : fichier <code>.json</code>, PDF rempli, ou code <code>FJ1.…</code> dans un message.</li><li>Ici : onglet <b>Réponses → Importer des réponses</b>. Les doublons sont ignorés.</li><li>Statistiques et tableau se mettent à jour ; exportez vers Excel ou Tableur Joe.</li></ol></div>`;
    $('#shHtml').onclick = async () => { const b = new Blob([standaloneHtml(form)], { type: 'text/html' }); await shareOrDownload(b, slug(form.title) + '.html', form.title); };
    $('#shPdf').onclick = async () => { await shareOrDownload(await buildPdf(form, true), slug(form.title) + '-a-remplir.pdf', form.title); };
    $('#shPrint').onclick = async () => { download(await buildPdf(form, false), slug(form.title) + '-papier.pdf'); };
  }
  async function shareOrDownload(blob, name, title) {
    const file = new File([blob], name, { type: blob.type });
    const v = navigator.canShare && navigator.canShare({ files: [file] }) ? await modal({ title: 'Formulaire prêt', body: `<p>« ${esc(name)} » est prêt.</p>`, buttons: [{ label: 'Télécharger', value: 'dl' }, { label: 'Partager (WhatsApp, e-mail…)', primary: true, value: 'share' }] }) : 'dl';
    if (v === 'share') { try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    if (v) download(blob, name);
  }

  function standaloneHtml(f) {
    const data = JSON.stringify({ id: f.id, title: f.title, desc: f.desc, email: f.email || '', thanks: f.thanks || '', fields: f.fields }).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(f.title)}</title>
<style>[hidden]{display:none!important}body{margin:0;background:#eef3f2}main{max-width:720px;margin:0 auto;padding:16px 14px 60px}${RT.CSS}
.fj-act{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.fj-act button,.fj-act a{font:600 16px system-ui,sans-serif;padding:12px 18px;border-radius:10px;border:1px solid #00796b;background:#fff;color:#00796b;cursor:pointer;text-decoration:none;display:inline-block}.fj-act .p{background:#00796b;color:#fff}
#ok{background:#fff;border:1px solid #dde0e6;border-radius:12px;padding:16px;font:16px/1.45 system-ui,sans-serif}#ok textarea{width:100%;box-sizing:border-box;min-height:90px;font:12px monospace;margin:8px 0}
.foot{text-align:center;color:#888;font:12px system-ui,sans-serif;margin-top:20px}</style></head>
<body><main><div id="f"></div><div class="fj-act"><button class="p" id="send">Envoyer ma réponse</button></div>
<div id="ok" hidden><h2 style="margin-top:0">✓ Réponse prête</h2><p id="thx"></p><p><b>Dernière étape : renvoyez votre réponse</b> à la personne qui vous a envoyé ce formulaire, par l'un de ces moyens :</p>
<div class="fj-act"><button class="p" id="dl">⬇ Télécharger le fichier de réponse</button><button id="sh">↗ Partager</button><a id="wa" target="_blank" rel="noopener">WhatsApp</a><a id="ml">E-mail</a></div>
<p style="margin-top:14px">Ou copiez ce code et collez-le dans un message :</p><textarea id="code" readonly></textarea><div class="fj-act"><button id="cp">Copier le code</button><button id="again">Nouvelle réponse</button></div></div>
<p class="foot">Formulaire créé avec Formulaires Joe — vos réponses ne sont envoyées nulle part tant que vous ne les transmettez pas vous-même.</p></main>
<script>
const FORM=${data};
const RT=(${formRuntime.toString()})();
const root=document.getElementById('f');
let draft={};try{draft=JSON.parse(localStorage.getItem('fj-'+FORM.id)||'{}')}catch(e){}
RT.render(root,FORM,draft);
const keep=()=>{try{localStorage.setItem('fj-'+FORM.id,JSON.stringify(RT.collect(root,FORM,true).values))}catch(e){}};root.addEventListener('change',keep);root.addEventListener('pointerup',()=>setTimeout(keep,50));
function b64u(u8){let s='';for(let i=0;i<u8.length;i+=8192)s+=String.fromCharCode.apply(null,u8.subarray(i,i+8192));return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')}
async function pack(txt){const u=new TextEncoder().encode(txt);try{const s=new Blob([u]).stream().pipeThrough(new CompressionStream('deflate-raw'));return b64u(new Uint8Array(await new Response(s).arrayBuffer()))}catch(e){return b64u(u)}}
let resp=null,file=null;
document.getElementById('send').onclick=async()=>{
  const r=RT.collect(root,FORM);if(r.errors.length){alert(r.errors.length+' réponse(s) à compléter ou corriger.');return}
  resp={app:'formulaires-joe',type:'reponse',form:FORM.id,title:FORM.title,at:Date.now(),id:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),values:r.values};
  const json=JSON.stringify(resp);const code='FJ1.'+await pack(json);
  const nm=(FORM.title||'formulaire').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^\\w-]+/g,'-').slice(0,40)+'-reponse-'+new Date().toISOString().slice(0,10)+'.json';
  file=new File([json],nm,{type:'application/json'});
  document.getElementById('code').value=code;document.getElementById('thx').textContent=FORM.thanks||'';
  document.getElementById('wa').href='https://wa.me/?text='+encodeURIComponent('Réponse au formulaire « '+FORM.title+' » :\\n'+code);
  const ml=document.getElementById('ml');if(FORM.email){ml.href='mailto:'+FORM.email+'?subject='+encodeURIComponent('Réponse : '+FORM.title)+'&body='+encodeURIComponent(code)}else{ml.href='mailto:?subject='+encodeURIComponent('Réponse : '+FORM.title)+'&body='+encodeURIComponent(code)}
  document.getElementById('sh').hidden=!(navigator.canShare&&navigator.canShare({files:[file]}));
  root.hidden=true;document.getElementById('send').parentElement.hidden=true;document.getElementById('ok').hidden=false;scrollTo(0,0);
  try{localStorage.removeItem('fj-'+FORM.id)}catch(e){}
};
document.getElementById('dl').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)};
document.getElementById('sh').onclick=()=>navigator.share({files:[file],title:FORM.title}).catch(()=>{});
document.getElementById('cp').onclick=()=>{const t=document.getElementById('code');t.select();(navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).then(()=>alert('Code copié : collez-le dans un message.'),()=>{document.execCommand('copy');alert('Code copié.')})};
document.getElementById('again').onclick=()=>{RT.render(root,FORM,{});root.hidden=false;document.getElementById('send').parentElement.hidden=false;document.getElementById('ok').hidden=true;scrollTo(0,0)};
</script></body></html>`;
  }

  /* ================= PDF à remplir / à imprimer ================= */
  async function buildPdf(f, fillable) {
    await loadScript('lib/pdf-lib.min.js');
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    doc.setTitle(f.title || 'Formulaire'); doc.setSubject('formulaires-joe:' + f.id); doc.setCreator('Formulaires Joe'); doc.setKeywords(['formulaires-joe', f.id]);
    const form = doc.getForm(); const W = 595.28, H = 841.89, M = 50, CW = W - 2 * M;
    const ok = (s) => String(s || '').replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7e -ÿ\n€]/g, '');
    const wrap = (text, fnt, size, w) => { const out = []; for (const para of ok(text).split('\n')) { let line = ''; for (const word of para.split(/\s+/)) { const t = line ? line + ' ' + word : word; if (fnt.widthOfTextAtSize(t, size) > w && line) { out.push(line); line = word; } else line = t; } out.push(line); } return out; };
    let page, y; const pages = [];
    const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - M; };
    const need = (h) => { if (y - h < M + 20) newPage(); };
    const text = (s, x, size, fnt = font, color = rgb(0.1, 0.1, 0.12)) => page.drawText(s, { x, y, size, font: fnt, color });
    const teal = rgb(0, 0.47, 0.42), grey = rgb(0.45, 0.45, 0.5), line = rgb(0.55, 0.57, 0.62);
    newPage();
    page.drawRectangle({ x: M, y: H - M - 6, width: CW, height: 6, color: teal }); y -= 30;
    for (const l of wrap(f.title || 'Formulaire', bold, 18, CW)) { text(l, M, 18, bold); y -= 22; }
    if (f.desc) { for (const l of wrap(f.desc, font, 10, CW)) { need(14); text(l, M, 10, font, grey); y -= 13; } }
    y -= 10;
    let n = 0;
    const box = (x, yy, w, h) => page.drawRectangle({ x, y: yy, width: w, height: h, borderColor: line, borderWidth: 0.8 });
    for (const q of f.fields) {
      const fname = q.id;
      if (q.type === 'section') { need(40); y -= 6; text(ok(q.label), M, 13, bold, teal); y -= 5; page.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 0.8, color: teal }); y -= 14; if (q.help) for (const l of wrap(q.help, font, 9.5, CW)) { need(13); text(l, M, 9.5, font, grey); y -= 12; } continue; }
      n++;
      const lab = wrap(`${n}. ${q.label || 'Question'}${q.required ? ' *' : ''}`, bold, 10.5, CW);
      need(lab.length * 13 + 34);
      for (const l of lab) { text(l, M, 10.5, bold); y -= 13; }
      if (q.help) for (const l of wrap(q.help, font, 9, CW)) { text(l, M, 9, font, grey); y -= 11; }
      y -= 2;
      const opts = q.type === 'yesno' ? ['Oui', 'Non'] : RT.opts(q);
      const field = (h, w = CW, multi = false) => {
        need(h + 6); const yy = y - h;
        if (fillable) { const t = form.createTextField(fname); if (multi) t.enableMultiline(); t.addToPage(page, { x: M, y: yy, width: w, height: h, font, borderColor: line, borderWidth: 0.8 }); t.setFontSize(multi ? 10 : 11); }
        else if (multi) { for (let k = 1; k <= Math.floor(h / 20); k++) page.drawLine({ start: { x: M, y: y - k * 20 }, end: { x: M + w, y: y - k * 20 }, thickness: 0.5, color: line }); }
        else box(M, yy, w, h);
        y = yy - 12;
      };
      switch (q.type) {
        case 'long': field(fillable ? 70 : 80, CW, true); break;
        case 'money': field(20, 200); page.drawText('FCFA', { x: M + 206, y: y + 18, size: 10, font, color: grey }); break;
        case 'number': field(20, 160); break;
        case 'date': field(20, 140); page.drawText('jj/mm/aaaa', { x: M + 146, y: y + 18, size: 9, font, color: grey }); break;
        case 'signature': need(76); box(M, y - 64, 240, 64); if (fillable) { const t = form.createTextField(fname); t.addToPage(page, { x: M + 2, y: y - 62, width: 236, height: 14, font, borderWidth: 0 }); t.setFontSize(8); } page.drawText('Signature', { x: M + 4, y: y - 10, size: 8, font, color: grey }); y -= 76; break;
        case 'radio': case 'yesno': case 'select': case 'rating': {
          const list = q.type === 'rating' ? ['1', '2', '3', '4', '5'] : opts;
          const horiz = q.type === 'yesno' || q.type === 'rating';
          const grp = fillable ? form.createRadioGroup(fname) : null;
          if (horiz) { need(22); let x = M; list.forEach((o, i) => { if (grp) grp.addOptionToPage('o' + i, page, { x, y: y - 13, width: 12, height: 12, borderColor: line, borderWidth: 0.8 }); else page.drawCircle({ x: x + 6, y: y - 7, size: 6, borderColor: line, borderWidth: 0.8 }); page.drawText(ok(q.type === 'rating' ? o + (i === 0 ? ' (faible)' : i === 4 ? ' (excellent)' : '') : o), { x: x + 17, y: y - 10, size: 10, font }); x += 30 + font.widthOfTextAtSize(ok(o), 10) + (q.type === 'rating' && (i === 0 || i === 4) ? 55 : 20); }); y -= 26; }
          else list.forEach((o, i) => { need(18); if (grp) grp.addOptionToPage('o' + i, page, { x: M, y: y - 13, width: 12, height: 12, borderColor: line, borderWidth: 0.8 }); else page.drawCircle({ x: M + 6, y: y - 7, size: 6, borderColor: line, borderWidth: 0.8 }); page.drawText(ok(o), { x: M + 18, y: y - 10, size: 10, font }); y -= 17; });
          y -= 6; break;
        }
        case 'checks': opts.forEach((o, i) => { need(18); if (fillable) { const c = form.createCheckBox(`${fname}__${i}`); c.addToPage(page, { x: M, y: y - 13, width: 12, height: 12, borderColor: line, borderWidth: 0.8 }); } else box(M, y - 13, 12, 12); page.drawText(ok(o), { x: M + 18, y: y - 10, size: 10, font }); y -= 17; }); y -= 6; break;
        default: field(20);
      }
      y -= 4;
    }
    pages.forEach((p, i) => p.drawText(ok(`${f.title || 'Formulaire'} - page ${i + 1} / ${pages.length}`), { x: M, y: 24, size: 8, font, color: grey }));
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }
  async function readFilledPdf(file) {
    await loadScript('lib/pdf-lib.min.js');
    const doc = await window.PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const subj = doc.getSubject() || ''; const m = /formulaires-joe:(\S+)/.exec(subj);
    if (!m) throw new Error('ce PDF n\'a pas été créé par Formulaires Joe');
    const fid = m[1]; const f = forms.find((x) => x.id === fid); if (!f) throw new Error('formulaire inconnu sur cet appareil');
    const pf = doc.getForm(); const values = {};
    const get = (fn) => { try { return fn(); } catch (e) { return undefined; } };
    for (const q of f.fields) {
      if (q.type === 'section') continue;
      const opts = q.type === 'yesno' ? ['Oui', 'Non'] : q.type === 'rating' ? ['1', '2', '3', '4', '5'] : RT.opts(q);
      if (['radio', 'yesno', 'select', 'rating'].includes(q.type)) { const s = get(() => pf.getRadioGroup(q.id).getSelected()); const k = s ? +String(s).replace(/^o/, '') : -1; values[q.id] = k >= 0 && opts[k] !== undefined ? (q.type === 'rating' ? +opts[k] : opts[k]) : ''; }
      else if (q.type === 'checks') values[q.id] = opts.filter((o, i) => get(() => pf.getCheckBox(`${q.id}__${i}`).isChecked()));
      else { let t = get(() => pf.getTextField(q.id).getText()) || ''; t = t.trim();
        if (q.type === 'number' || q.type === 'money') { const v = RT.parseNum(t); values[q.id] = v === null ? '' : isNaN(v) ? t : v; }
        else if (q.type === 'date') { const d = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t); values[q.id] = d ? `${d[3].length === 2 ? '20' + d[3] : d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : t; }
        else if (q.type === 'signature') values[q.id] = '';
        else values[q.id] = t; }
    }
    // identifiant stable : même fichier importé deux fois → un seul enregistrement
    const key = JSON.stringify(values); let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return { app: 'formulaires-joe', type: 'reponse', form: fid, at: file.lastModified || Date.now(), id: 'p' + (h >>> 0).toString(36) + '-' + baseName(file.name).slice(0, 20), values };
  }

  /* ================= Démarrage ================= */
  (async () => {
    try { [forms, resps] = await Promise.all([db.all('forms'), db.all('resp')]); } catch (e) { toast('Stockage indisponible', 6000); }
    let last = null; try { last = localStorage.getItem('forms-last'); } catch (e) { /* ignore */ }
    form = forms.find((f) => f.id === last) || forms.slice().sort((a, b) => b.updated - a.updated)[0] || null;
    if (!form) { await newForm('recensement'); } else render();
    // fichiers reçus (Mes fichiers, partage) : formulaire à importer, ou réponses (fichier, PDF rempli)
    Studio.onImport('formulaires', async (fs) => {
      let added = 0;
      for (const f of fs) {
        try {
          if (/\.pdf$/i.test(f.name)) { const o = await readFilledPdf(f); const fm = forms.find((x) => x.id === o.form); if (fm && !resps.some((r) => r.id === o.id)) { const rec = { id: o.id, form: fm.id, at: o.at, source: 'PDF', values: o.values }; resps.push(rec); await db.put('resp', rec); form = fm; added++; } continue; }
          const o = JSON.parse(await f.text());
          if (o.type === 'formulaire') { await importForm(f); continue; }
          if (o.type === 'reponse') { const fm = forms.find((x) => x.id === o.form); if (!fm) throw new Error('formulaire inconnu sur cet appareil'); if (!resps.some((r) => r.id === o.id)) { const rec = { id: o.id, form: fm.id, at: o.at || Date.now(), source: 'fichier', values: o.values || {} }; resps.push(rec); await db.put('resp', rec); form = fm; added++; } }
        } catch (e) { toast(`${f.name} : ${e.message}`, 6000); }
      }
      if (added) { setTab('resp'); toast(`${added} réponse(s) ajoutée(s)`); }
    });
  })();
  window.FormsJoe = { get form() { return form; }, get resps() { return resps; }, standaloneHtml, buildPdf, readFilledPdf, exportXlsx, decodeCode, setTab, RT };
})();
