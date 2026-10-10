/* Studio Joe — reconnaissance vocale en direct au micro.
   Deux moteurs : la reconnaissance du navigateur (instantanée, en ligne via Chrome/Edge)
   et Whisper exécuté sur l'appareil (privé, phrase par phrase, voir js/transcribe.js). */
(function () {
  const WEB_LANGS = [['fr-FR', 'Français (France)'], ['fr-CA', 'Français (Canada)'], ['en-US', 'Anglais (États-Unis)'], ['en-GB', 'Anglais (Royaume-Uni)'],
    ['ar-SA', 'Arabe'], ['es-ES', 'Espagnol'], ['pt-PT', 'Portugais'], ['de-DE', 'Allemand'], ['it-IT', 'Italien'], ['sw-KE', 'Swahili'], ['zh-CN', 'Chinois']];
  // correspondance avec les langues Whisper
  const WHISPER_LANG = { fr: 'french', en: 'english', ar: 'arabic', es: 'spanish', pt: 'portuguese', de: 'german', it: 'italian', sw: 'swahili', zh: 'chinese' };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const webAvailable = () => !!SR;

  // commandes vocales de ponctuation et de mise en page (français et anglais)
  const cmd = (phrases, rep) => [new RegExp(`(?:^|\\s+)(?:${phrases})(?=\\s|$)`, 'giu'), rep];
  const COMMANDS = [
    cmd('nouveau paragraphe|new paragraph', '\n\n'), cmd('à la ligne|a la ligne|nouvelle ligne|new line', '\n'),
    cmd("point d'interrogation|question mark", ' ?'), cmd("point d'exclamation|exclamation mark", ' !'),
    cmd('points de suspension', '…'), cmd('deux points|colon', ' :'), cmd('point virgule|point-virgule|semicolon', ' ;'),
    cmd('virgule|comma', ','), cmd('point final|point|full stop|period', '.'),
    cmd('ouvrez les guillemets|ouvrir les guillemets', ' «'), cmd('fermez les guillemets|fermer les guillemets', ' »'),
  ];
  function applyCommands(t) {
    let s = String(t);
    for (const [re, rep] of COMMANDS) s = s.replace(re, rep);
    s = s.replace(/« */g, '« ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n').replace(/ {2,}/g, ' ').trim();
    // majuscule après un point ou en début de paragraphe
    return s.replace(/(^|[.?!…]\s+|\n)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
  }

  /* Reconnaissance du navigateur. Rappels : onInterim(texte provisoire), onFinal(texte), onState(état), onError(message). */
  function startWeb({ lang = 'fr-FR', onInterim, onFinal, onState, onError }) {
    if (!SR) throw new Error('la reconnaissance vocale du navigateur n\'est pas disponible ici (utilisez Chrome ou Edge, ou le moteur Whisper)');
    let active = true;
    const rec = new SR();
    rec.lang = lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinal && onFinal(applyCommands(r[0].transcript));
        else interim += r[0].transcript;
      }
      onInterim && onInterim(interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      active = false;
      const msg = { 'not-allowed': 'accès au micro refusé : autorisez le micro pour cette page', 'service-not-allowed': 'service vocal refusé par le navigateur', network: 'pas de connexion au service vocal du navigateur (essayez le moteur Whisper, hors ligne)', 'audio-capture': 'aucun micro détecté', 'language-not-supported': 'langue non prise en charge par le navigateur' }[e.error] || e.error;
      onError && onError(msg);
    };
    // Chrome arrête l'écoute après un silence : on relance tant que l'utilisateur n'a pas arrêté
    rec.onend = () => { if (active) { try { rec.start(); } catch (err) { /* déjà relancé */ } } else onState && onState('stopped'); };
    rec.start(); onState && onState('listening');
    return { stop() { active = false; try { rec.stop(); } catch (e) { /* ignore */ } } };
  }

  /* Whisper sur l'appareil : capte le micro, découpe aux pauses (ou toutes les 12 s) et transcrit chaque phrase. */
  async function startWhisper({ lang = 'fr-FR', model = 'base', onFinal, onInterim, onState, onError, onLevel }) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('micro indisponible dans ce navigateur');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }); }
    catch (e) { throw new Error('accès au micro refusé : autorisez le micro pour cette page'); }
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(stream);
    const gain = ac.createGain(); gain.gain.value = 0; // pas de retour dans les haut-parleurs
    // capture sur le fil audio (AudioWorklet) : les échantillons restent intacts même quand
    // Whisper occupe le fil principal ; repli sur ScriptProcessor pour les vieux navigateurs
    let proc;
    try {
      const code = `class Cap extends AudioWorkletProcessor { constructor(){ super(); this.b = new Float32Array(4096); this.n = 0; }
        process(inp){ const c = inp[0] && inp[0][0]; if (c) { for (let i = 0; i < c.length; i++) { this.b[this.n++] = c[i]; if (this.n === 4096) { this.port.postMessage(this.b.slice(0)); this.n = 0; } } } return true; } }
        registerProcessor('studio-capture', Cap);`;
      await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
      proc = new AudioWorkletNode(ac, 'studio-capture');
      proc.port.onmessage = (e) => onChunk(e.data);
    } catch (e) {
      proc = ac.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (ev) => onChunk(ev.inputBuffer.getChannelData(0));
    }
    src.connect(proc); proc.connect(gain); gain.connect(ac.destination);
    const ratio = ac.sampleRate / 16000;
    let buf = [], speech = false, silentFor = 0, active = true, queue = Promise.resolve(), pending = 0;
    const language = WHISPER_LANG[lang.slice(0, 2)] || '';
    onState && onState('loading');
    onInterim && onInterim('Préparation du modèle Whisper…');
    // charge le modèle avant de rendre la main
    try { await Studio.transcribe.transcribe(new Float32Array(16000), { model, language }); } catch (e) { stop(); throw e; }
    onInterim && onInterim(''); onState && onState('listening');
    const flush = () => {
      if (!buf.length) return;
      const total = buf.reduce((a, b) => a + b.length, 0), seg = new Float32Array(total);
      let o = 0; for (const b of buf) { seg.set(b, o); o += b.length; }
      buf = []; speech = false; silentFor = 0;
      if (total < 16000 * 0.4) return;
      const at = performance.now() - (total / 16000) * 1000; // moment où la phrase a commencé
      pending++; onInterim && onInterim('…');
      queue = queue.then(async () => {
        try {
          const segs = await Studio.transcribe.transcribe(seg, { model, language });
          const text = segs.map((s) => s.text).join(' ').trim();
          if (text) onFinal && onFinal(applyCommands(text), { at, duration: total / 16000 });
        } catch (e) { onError && onError(e.message || String(e)); }
        pending--; if (!pending) onInterim && onInterim('');
      });
    };
    function onChunk(inp) {
      if (!active) return;
      // ré-échantillonnage vers 16 kHz (moyenne sur chaque pas, filtre passe-bas simple)
      const n = Math.floor(inp.length / ratio), out = new Float32Array(n);
      let lvl = 0;
      for (let i = 0; i < n; i++) {
        const a = Math.floor(i * ratio), z = Math.max(a + 1, Math.floor((i + 1) * ratio)); let v = 0;
        for (let j = a; j < z && j < inp.length; j++) v += inp[j];
        v /= (z - a); out[i] = v; lvl += v * v;
      }
      lvl = Math.sqrt(lvl / n); onLevel && onLevel(lvl);
      const loud = lvl > 0.012;
      if (loud) { speech = true; silentFor = 0; } else if (speech) silentFor += n / 16000;
      if (speech) buf.push(out);
      const len = buf.reduce((a, b) => a + b.length, 0) / 16000;
      if ((speech && silentFor > 0.8) || len > 12) flush();
    }
    function stop() {
      active = false; try { flush(); } catch (e) { /* ignore */ }
      try { proc.disconnect(); src.disconnect(); } catch (e) { /* ignore */ } stream.getTracks().forEach((t) => t.stop()); ac.close();
      queue.then(() => onState && onState('stopped'));
    }
    return { stop };
  }

  /* Démarre le moteur demandé ('web' ou 'whisper'). */
  async function start(engine, opts) { return engine === 'whisper' ? startWhisper(opts) : startWeb(opts); }

  function savedEngine() { try { return localStorage.getItem('studio-speech-engine') || (SR ? 'web' : 'whisper'); } catch (e) { return SR ? 'web' : 'whisper'; } }
  function savedLang() { try { return localStorage.getItem('studio-speech-lang') || 'fr-FR'; } catch (e) { return 'fr-FR'; } }
  function save(engine, lang) { try { localStorage.setItem('studio-speech-engine', engine); localStorage.setItem('studio-speech-lang', lang); } catch (e) { /* ignore */ } }
  const langOptions = (sel = savedLang()) => WEB_LANGS.map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${l}</option>`).join('');
  const engineOptions = (sel = savedEngine()) => `<option value="web"${sel === 'web' ? ' selected' : ''}${SR ? '' : ' disabled'}>Navigateur — instantané (en ligne, Chrome/Edge)</option><option value="whisper"${sel === 'whisper' ? ' selected' : ''}>Whisper — privé, sur l'appareil (phrase par phrase)</option>`;

  /* Ajoute un bouton micro à côté d'un champ de texte : la dictée s'insère à la position du curseur. */
  function attachMic(field, { onChange } = {}) {
    if (!field || field.dataset.mic) return;
    field.dataset.mic = '1';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = '🎤 Dicter'; btn.title = 'Dicter au micro (« virgule », « point », « à la ligne » sont compris)';
    btn.style.cssText = 'justify-self:start;font-size:12px;padding:3px 8px';
    field.insertAdjacentElement('afterend', btn);
    let session = null;
    const insert = (txt) => {
      const s = field.selectionStart ?? field.value.length, e = field.selectionEnd ?? field.value.length;
      const before = field.value.slice(0, s), sep = before && !/[\s\n]$/.test(before) && !/^[.,;:?!…]/.test(txt) ? ' ' : '';
      field.value = before + sep + txt + field.value.slice(e);
      const pos = (before + sep + txt).length; field.setSelectionRange(pos, pos);
      field.dispatchEvent(new Event('input', { bubbles: true })); onChange && onChange();
    };
    btn.addEventListener('click', async () => {
      if (session) { session.stop(); session = null; btn.textContent = '🎤 Dicter'; btn.classList.remove('primary'); return; }
      try {
        btn.textContent = '■ Arrêter'; btn.classList.add('primary');
        session = await start(savedEngine(), { lang: savedLang(), onFinal: insert, onError: (m) => { Studio.toast('Dictée : ' + m, 6000); if (session) session.stop(); session = null; btn.textContent = '🎤 Dicter'; btn.classList.remove('primary'); } });
        field.focus();
      } catch (e) { session = null; btn.textContent = '🎤 Dicter'; btn.classList.remove('primary'); Studio.toast('Dictée impossible : ' + (e.message || e), 6000); }
    });
  }

  window.Studio = window.Studio || {};
  window.Studio.speech = { start, webAvailable, applyCommands, langOptions, engineOptions, savedEngine, savedLang, save, attachMic, WEB_LANGS };
})();
