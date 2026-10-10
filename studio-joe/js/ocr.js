/* Studio Joe — reconnaissance de texte (OCR) hors ligne avec Tesseract (moteur LSTM, français et anglais).
   Le moteur et les données de langue sont chargés à la demande depuis lib/, sans réseau. */
(function () {

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => rej(new Error(`fichier manquant : ${src}`)); document.head.appendChild(s);
    });
  }
  // WebAssembly SIMD (plus rapide) si le navigateur le permet
  function simdSupported() {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch (e) { return false; }
  }
  async function gunzip(b64) {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (!window.DecompressionStream) throw new Error('navigateur trop ancien pour l\'OCR (DecompressionStream absent)');
    const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // un seul moteur WebAssembly ; on recharge seulement la ou les langues demandées (« fra », « eng », « fra+eng »)
  let corePromise = null, current = null;
  const written = new Set();
  function core() {
    if (!corePromise) {
      corePromise = (async () => {
        if (!window.TesseractCore) await loadScript('lib/' + (simdSupported() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'));
        const M = await window.TesseractCore({});
        return { M, api: new M.TessBaseAPI() };
      })();
      corePromise.catch(() => { corePromise = null; });
    }
    return corePromise;
  }
  async function load(lang = 'fra') {
    const e = await core();
    for (const l of lang.split('+')) {
      if (written.has(l)) continue;
      if (!(window.__TESSDATA && window.__TESSDATA[l])) await loadScript(`lib/tessdata-${l}.js`);
      e.M.FS.writeFile(`${l}.traineddata`, await gunzip(window.__TESSDATA[l]));
      delete window.__TESSDATA[l]; // libère la copie base64
      written.add(l);
    }
    if (current !== lang) {
      if (current) e.api.End();
      if (e.api.Init(null, lang) !== 0) throw new Error('initialisation de l\'OCR impossible');
      current = lang;
    }
    return e;
  }

  /* Reconnaît le texte d'un canvas. Renvoie { text, words: [{x, y, w, h, text, conf, line}] } en pixels du canvas. */
  async function recognize(canvas, lang = 'fra') {
    const { M, api } = await load(lang);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    M.FS.writeFile('/input', new Uint8Array(await blob.arrayBuffer()));
    await new Promise((r) => setTimeout(r, 30)); // laisse l'interface afficher la progression
    if (api.SetImageFile(1, 0) === 1) throw new Error('image illisible');
    api.SetPageSegMode(3); // mise en page automatique
    api.Recognize(null);
    const text = api.GetUTF8Text();
    const words = [];
    for (const row of api.GetTSVText(0).split('\n')) {
      const c = row.split('\t');
      if (c[0] !== '5' || !c[11] || !c[11].trim()) continue;
      words.push({ x: +c[6], y: +c[7], w: +c[8], h: +c[9], conf: +c[10], text: c[11], line: `${c[2]}-${c[3]}-${c[4]}` });
    }
    api.Clear();
    return { text: text.replace(/\n{3,}/g, '\n\n').trim(), words };
  }

  const LANGS = { fra: 'Français', eng: 'Anglais', 'fra+eng': 'Français + anglais (documents mixtes)' };
  const langOptions = (sel) => Object.entries(LANGS).map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${l}</option>`).join('');
  function savedLang() { try { return localStorage.getItem('studio-ocr-lang') || 'fra'; } catch (e) { return 'fra'; } }
  function saveLang(l) { try { localStorage.setItem('studio-ocr-lang', l); } catch (e) { /* ignore */ } }

  window.Studio = window.Studio || {};
  window.Studio.ocr = { load, recognize, LANGS, langOptions, savedLang, saveLang };
})();
