/* Studio Joe — synthèse vocale.
   1) Lecture immédiate avec les voix installées sur l'appareil (speechSynthesis du navigateur).
   2) Fichier audio : voix neuronale MMS exécutée dans le navigateur (transformers.js), modèle téléchargé
      à la première utilisation ; seul ce moteur permet d'enregistrer un fichier (voix off, WAV). */
(function () {
  const synth = window.speechSynthesis;
  const available = () => !!synth;

  // découpe en phrases courtes : Chrome coupe les énoncés trop longs
  function sentences(text) {
    const out = []; const re = /[^.!?…;:\n]+[.!?…;:]*[\s\n]*|\n+/g; let m;
    while ((m = re.exec(text))) {
      const piece = m[0]; if (!piece.trim()) continue;
      if (piece.length <= 220) { out.push({ text: piece, start: m.index }); continue; }
      let off = 0; // phrase trop longue : coupe aux virgules ou aux espaces
      while (off < piece.length) {
        let end = Math.min(piece.length, off + 220);
        if (end < piece.length) { const c = piece.lastIndexOf(',', end); const sp = piece.lastIndexOf(' ', end); end = c > off + 60 ? c + 1 : sp > off + 60 ? sp + 1 : end; }
        out.push({ text: piece.slice(off, end), start: m.index + off }); off = end;
      }
    }
    return out;
  }

  let voicesCache = [];
  function loadVoices() {
    return new Promise((res) => {
      if (!synth) return res([]);
      const v = synth.getVoices(); if (v.length) { voicesCache = v; return res(v); }
      const done = () => { voicesCache = synth.getVoices(); res(voicesCache); };
      synth.addEventListener('voiceschanged', done, { once: true }); setTimeout(done, 1500);
    });
  }
  async function voiceOptions(langPrefix = '', selected = '') {
    const vs = (await loadVoices()).filter((v) => !langPrefix || v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()));
    vs.sort((a, b) => (b.localService - a.localService) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
    if (!vs.length) return '<option value="">Voix par défaut du navigateur</option>';
    return vs.map((v) => `<option value="${v.voiceURI.replace(/"/g, '&quot;')}"${v.voiceURI === selected ? ' selected' : ''}>${v.name} — ${v.lang}${v.localService ? ' (sur l\'appareil)' : ' (en ligne)'}</option>`).join('');
  }

  /* Lecture à voix haute. Renvoie un contrôleur { pause, resume, stop }. onSentence(i, start, length) permet de surligner. */
  let current = null;
  function speak(text, { voiceURI = '', lang = 'fr-FR', rate = 1, pitch = 1, volume = 1, onSentence, onEnd, onError } = {}) {
    if (!synth) throw new Error('la synthèse vocale n\'est pas disponible dans ce navigateur');
    stop();
    const parts = sentences(text); let i = 0, stopped = false;
    const voice = voicesCache.find((v) => v.voiceURI === voiceURI);
    const next = () => {
      if (stopped) return;
      if (i >= parts.length) { current = null; onEnd && onEnd(); return; }
      const p = parts[i]; const u = new SpeechSynthesisUtterance(p.text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = lang;
      u.rate = rate; u.pitch = pitch; u.volume = volume;
      u.onstart = () => onSentence && onSentence(i, p.start, p.text.length);
      u.onend = () => { i++; next(); };
      u.onerror = (e) => { if (e.error === 'interrupted' || e.error === 'canceled') return; stopped = true; current = null; onError && onError(e.error || 'erreur de lecture'); };
      synth.speak(u);
    };
    current = {
      pause() { synth.pause(); }, resume() { synth.resume(); },
      stop() { stopped = true; synth.cancel(); current = null; },
      skip(d) { i = Math.max(0, Math.min(parts.length - 1, i + d)); synth.cancel(); setTimeout(next, 50); },
      get paused() { return synth.paused; },
    };
    next();
    return current;
  }
  function stop() { if (current) current.stop(); else if (synth) synth.cancel(); }

  /* ---------- Voix neuronale (fichier audio) ---------- */
  const NEURAL = { fr: { id: 'Xenova/mms-tts-fra', label: 'Français' }, en: { id: 'Xenova/mms-tts-eng', label: 'Anglais' } };
  const ttsPipes = {};
  function neuralPipe(lang, onProgress) {
    if (!window.HFTransformers) throw new Error('moteur de voix absent (lib/transformers.js)');
    const m = NEURAL[lang]; if (!m) throw new Error('langue non disponible pour la voix neuronale (français ou anglais)');
    if (!ttsPipes[lang]) {
      const { pipeline, env } = window.HFTransformers;
      env.allowLocalModels = false;
      const cfg = window.__TRANSCRIBE_CFG; // réglages de test (serveur local)
      if (cfg) { env.remoteHost = cfg.remoteHost; env.remotePathTemplate = '{model}/'; env.backends.onnx.wasm.wasmPaths = cfg.wasmPaths; }
      const files = {};
      const opts = (dtype) => ({ dtype, device: 'wasm', progress_callback: prog });
      const prog = (p) => {
          if (p.status !== 'progress' || !p.total) return;
          files[p.file] = [p.loaded, p.total];
          const v = Object.values(files); const l = v.reduce((a, x) => a + x[0], 0), t = v.reduce((a, x) => a + x[1], 0);
          onProgress && onProgress(l / t * 0.3, `Téléchargement de la voix : ${Math.round(l / 1048576)} / ${Math.round(t / 1048576)} Mo`);
      };
      // version compressée (plus légère) si elle existe, sinon le modèle complet
      ttsPipes[lang] = pipeline('text-to-speech', m.id, opts('q8')).catch(() => pipeline('text-to-speech', m.id, opts('fp32')));
      ttsPipes[lang].catch(() => { delete ttsPipes[lang]; });
    }
    return ttsPipes[lang];
  }
  /* Synthétise tout le texte en audio. Renvoie { samples: Float32Array, rate }. */
  async function synthesize(text, { lang = 'fr', onProgress } = {}) {
    const tts = await neuralPipe(lang, onProgress);
    const parts = sentences(text).map((p) => p.text.trim()).filter(Boolean);
    const chunks = []; let rate = 16000;
    for (let i = 0; i < parts.length; i++) {
      onProgress && onProgress(0.3 + 0.7 * i / parts.length, `Voix : phrase ${i + 1} / ${parts.length}`);
      await new Promise((r) => setTimeout(r, 10));
      const out = await tts(parts[i]);
      rate = out.sampling_rate; chunks.push(out.audio, new Float32Array(Math.round(rate * (/[.!?…]\s*$/.test(parts[i]) ? 0.35 : 0.15))));
    }
    const len = chunks.reduce((a, c) => a + c.length, 0), samples = new Float32Array(len);
    let o = 0; for (const c of chunks) { samples.set(c, o); o += c.length; }
    onProgress && onProgress(1, 'Voix terminée');
    return { samples, rate };
  }
  function toWav(samples, rate) {
    const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
    let peak = 0; for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const g = peak > 0 ? Math.min(4, 0.95 / peak) : 1; // normalisation du volume
    for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] * g)) * 32767, true);
    return new Blob([b], { type: 'audio/wav' });
  }
  const neuralLangOptions = (sel = 'fr') => Object.entries(NEURAL).map(([k, m]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${m.label}</option>`).join('');

  window.Studio = window.Studio || {};
  window.Studio.tts = { available, loadVoices, voiceOptions, speak, stop, sentences, synthesize, toWav, neuralLangOptions };
})();
