/* Studio Joe — transcription audio et vidéo avec Whisper, exécuté dans le navigateur (transformers.js).
   Le son n'est jamais envoyé : seuls le moteur et le modèle sont téléchargés (Hugging Face, jsDelivr)
   lors de la première utilisation. */
(function () {
  const MODELS = {
    base: { id: 'Xenova/whisper-base', label: 'Rapide — modèle « base » (≈ 80 Mo à télécharger)' },
    small: { id: 'Xenova/whisper-small', label: 'Précis — modèle « small » (≈ 250 Mo à télécharger)' },
  };
  const LANGS = [['', 'Détection automatique'], ['french', 'Français'], ['english', 'Anglais'], ['arabic', 'Arabe'], ['spanish', 'Espagnol'],
    ['portuguese', 'Portugais'], ['german', 'Allemand'], ['italian', 'Italien'], ['chinese', 'Chinois'], ['russian', 'Russe'], ['hausa', 'Haoussa'],
    ['swahili', 'Swahili'], ['yoruba', 'Yoruba'], ['lingala', 'Lingala'], ['wolof', 'Wolof (expérimental)']];
  const pipes = {};

  function loadPipe(model, onProgress) {
    if (!window.HFTransformers) throw new Error('moteur de transcription absent (lib/transformers.js)');
    if (!pipes[model]) {
      const { pipeline, env } = window.HFTransformers;
      env.allowLocalModels = false;
      const cfg = window.__TRANSCRIBE_CFG; // réglages de test (serveur local)
      if (cfg) { env.remoteHost = cfg.remoteHost; env.remotePathTemplate = '{model}/'; env.backends.onnx.wasm.wasmPaths = cfg.wasmPaths; }
      const files = {};
      pipes[model] = pipeline('automatic-speech-recognition', MODELS[model].id, {
        dtype: 'q8', device: 'wasm',
        progress_callback: (p) => {
          if (p.status !== 'progress' || !p.total) return;
          files[p.file] = [p.loaded, p.total];
          const v = Object.values(files); const loaded = v.reduce((a, x) => a + x[0], 0), total = v.reduce((a, x) => a + x[1], 0);
          onProgress && onProgress(loaded / total, `Téléchargement du modèle : ${Math.round(loaded / 1048576)} / ${Math.round(total / 1048576)} Mo`);
        },
      });
      pipes[model].catch(() => { delete pipes[model]; });
    }
    return pipes[model];
  }

  /* Décode le son d'un fichier audio ou vidéo en mono 16 kHz (format attendu par Whisper). */
  async function decodeAudio(file) {
    const buf = await file.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 16000, 16000);
    let audio;
    try { audio = await ctx.decodeAudioData(buf); } catch (e) { throw new Error('son illisible : ce fichier n\'a pas de piste audio ou son format n\'est pas pris en charge par le navigateur'); }
    if (audio.numberOfChannels === 1) return audio.getChannelData(0);
    const out = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < d.length; i++) out[i] += d[i] / audio.numberOfChannels; }
    return out;
  }

  /* Transcrit `samples` (Float32 16 kHz) entre `from` et `to` secondes, par fenêtres de 30 s pour garder l'interface réactive.
     Renvoie [{start, end, text}] en secondes depuis le début du fichier. */
  async function transcribe(samples, { model = 'base', language = '', task = 'transcribe', from = 0, to = Infinity, onProgress } = {}) {
    const asr = await loadPipe(model, onProgress);
    const SR = 16000, WIN = 30;
    const t0 = Math.max(0, from), t1 = Math.min(samples.length / SR, to);
    const segs = [];
    for (let t = t0; t < t1; t += WIN) {
      onProgress && onProgress((t - t0) / Math.max(1, t1 - t0), `Transcription : ${fmt(t)} / ${fmt(t1)}`);
      await new Promise((r) => setTimeout(r, 20));
      const slice = samples.subarray(Math.floor(t * SR), Math.floor(Math.min(t1, t + WIN) * SR));
      if (slice.length < SR * 0.3 || rms(slice) < 0.002) continue; // silence
      const opts = { task, return_timestamps: true };
      if (language) opts.language = language;
      const out = await asr(slice, opts);
      const winEnd = Math.min(t1, t + WIN) - t;
      for (const c of out.chunks || [{ timestamp: [0, winEnd], text: out.text }]) {
        const txt = String(c.text || '').trim();
        if (!txt || /^\[.*\]$|^\(.*\)$/.test(txt)) continue; // [Musique], (applaudissements)…
        const s = c.timestamp[0] ?? 0, e = c.timestamp[1] ?? winEnd;
        segs.push({ start: t + s, end: t + Math.max(s + 0.3, Math.min(e, winEnd)), text: txt });
      }
    }
    onProgress && onProgress(1, 'Transcription terminée');
    return segs;
  }
  function rms(a) { let s = 0; for (let i = 0; i < a.length; i += 8) s += a[i] * a[i]; return Math.sqrt(s / (a.length / 8)); }
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  function fmt(t) { t = Math.max(0, t); return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(Math.floor(t) % 60)}`; }
  function stamp(t, sep) { t = Math.max(0, t); return `${fmt(t)}${sep}${pad(Math.round((t % 1) * 1000), 3)}`; }
  const toSRT = (segs) => segs.map((s, i) => `${i + 1}\n${stamp(s.start, ',')} --> ${stamp(s.end, ',')}\n${s.text}\n`).join('\n');
  const toVTT = (segs) => 'WEBVTT\n\n' + segs.map((s) => `${stamp(s.start, '.')} --> ${stamp(s.end, '.')}\n${s.text}\n`).join('\n');
  const toTXT = (segs, withTime = true) => segs.map((s) => (withTime ? `[${fmt(s.start)}] ` : '') + s.text).join('\n');

  const modelOptions = () => Object.entries(MODELS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('');
  const langOptions = () => LANGS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');

  window.Studio = window.Studio || {};
  window.Studio.transcribe = { decodeAudio, transcribe, toSRT, toVTT, toTXT, modelOptions, langOptions, fmt };
})();
