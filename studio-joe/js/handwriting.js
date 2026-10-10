/* Studio Joe — lecture de l'écriture manuscrite avec Claude (en ligne, via js/ai.js).
   Contrairement à l'OCR Tesseract (hors ligne, texte imprimé), l'image est envoyée à l'API Claude
   avec la clé de l'utilisateur et après son accord explicite. */
(function () {
  const SCHEMA = {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: { text: { type: 'string' }, x0: { type: 'integer' }, y0: { type: 'integer' }, x1: { type: 'integer' }, y1: { type: 'integer' } },
          required: ['text', 'x0', 'y0', 'x1', 'y1'],
          additionalProperties: false,
        },
      },
    },
    required: ['lines'],
    additionalProperties: false,
  };
  const LANG_HINT = { fra: 'Le document est en français.', eng: 'The document is in English.', 'fra+eng': 'Le document mélange le français et l\'anglais.' };

  const ensureKey = () => Studio.ai.ensureKey({ title: 'Écriture manuscrite : lecture par l\'IA Claude', purpose: 'l\'image de chaque page à lire' });

  /* Transcrit l'image. Renvoie { text, words } au même format que Studio.ocr.recognize (pixels du canvas). */
  async function transcribe(canvas, key, lang = 'fra') {
    const data = await Studio.ai.callJson(key, {
      schema: SCHEMA,
      system: 'Tu transcris des documents scannés ou photographiés, notamment de l\'écriture manuscrite, pour un usage administratif et comptable. '
        + 'Recopie le texte exactement tel qu\'il est écrit, ligne par ligne, dans l\'ordre de lecture : ne corrige pas l\'orthographe, ne résume pas, ne traduis pas. '
        + 'Recopie les montants, dates, numéros et signatures lisibles chiffre par chiffre. Écris [illisible] pour un mot que tu ne peux pas lire et ne devine pas les chiffres. '
        + 'Pour chaque ligne, donne sa boîte englobante approximative en coordonnées entières de 0 à 1000 (x0, y0 en haut à gauche ; x1, y1 en bas à droite) relatives à la largeur et à la hauteur de l\'image.',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Studio.ai.jpegBase64(canvas) } },
        { type: 'text', text: `Transcris tout le texte de cette image, manuscrit et imprimé. ${LANG_HINT[lang] || ''}` },
      ],
    });
    const W = canvas.width, H = canvas.height;
    const words = (data.lines || []).filter((l) => l.text && l.text.trim()).map((l, i) => {
      const x0 = Math.max(0, Math.min(l.x0, l.x1)), x1 = Math.min(1000, Math.max(l.x0, l.x1));
      const y0 = Math.max(0, Math.min(l.y0, l.y1)), y1 = Math.min(1000, Math.max(l.y0, l.y1));
      return { x: x0 / 1000 * W, y: y0 / 1000 * H, w: Math.max(1, (x1 - x0) / 1000 * W), h: Math.max(1, (y1 - y0) / 1000 * H), text: l.text, conf: 90, line: String(i) };
    });
    return { text: words.map((w) => w.text).join('\n'), words };
  }

  window.Studio = window.Studio || {};
  window.Studio.handwriting = { ensureKey, transcribe };
})();
