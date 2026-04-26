/**
 * Analyse Psychologique BRVM
 * Spécificités comportementales du marché BRVM:
 * - Réaction aux dividendes (J-1, J0, J+1)
 * - Réaction aux résultats
 * - Effet de liquidité
 * - Risque pays UEMOA
 * - Saisonnalité agricole et festive
 * - Comportement moutonnier (herding)
 */
const PsychologicalAnalysis = (() => {

  // ─── Calendrier dividendes et résultats ───────────────────────────────────
  const DIVIDEND_EVENTS = {
    "SNTS": { divDate: "2025-06-15", resultsDate: "2025-02-20", expectedDiv: 1450 },
    "PALC": { divDate: "2025-05-20", resultsDate: "2025-02-15", expectedDiv: 600 },
    "SIAC": { divDate: "2025-05-25", resultsDate: "2025-02-25", expectedDiv: 280 },
    "BOAC": { divDate: "2025-06-10", resultsDate: "2025-03-10", expectedDiv: 420 },
    "SGBC": { divDate: "2025-06-20", resultsDate: "2025-03-05", expectedDiv: 900 },
    "ETIT": { divDate: "2025-05-30", resultsDate: "2025-02-28", expectedDiv: 1.2 },
    "ORGT": { divDate: "2025-07-01", resultsDate: "2025-03-15", expectedDiv: 960 },
    "NSBC": { divDate: "2025-06-05", resultsDate: "2025-03-08", expectedDiv: 480 }
  };

  // ─── Patterns comportementaux BRVM documentés ─────────────────────────────
  const BRVM_BEHAVIORAL_PATTERNS = {
    dividendAnnouncementEffect: {
      label: "Effet annonce dividende",
      description: "À la BRVM, les titres réagissent fortement à l'annonce des dividendes. Un dividende supérieur aux attentes entraîne une hausse de +2% à +8% dans les 2 séances suivantes.",
      magnitude: 0.05,
      window: 2 // séances
    },
    resultsEffect: {
      label: "Effet résultats",
      description: "Les résultats annuels positifs déclenchent généralement une hausse le lendemain (+1% à +5%). Les résultats décevants sanctionnent le titre (-2% à -6%).",
      magnitude: 0.03,
      window: 1
    },
    lowLiquidityEffect: {
      label: "Prime d'illiquidité",
      description: "Les titres peu liquides (< 200 titres/jour) subissent une prime de risque supplémentaire de 1-3% de rendement exigé. Un acheteur important peut faire monter le cours fortement.",
      threshold: 200 // titres/jour
    },
    herdingEffect: {
      label: "Comportement moutonnier",
      description: "Le marché BRVM est petit (< 50 titres). Les investisseurs institutionnels (CGRAE, CNPS, fonds) ont un impact disproportionné. Quand un gestionnaire achète, les particuliers suivent.",
    },
    seasonalAgriculture: {
      label: "Saisonnalité agricole",
      sectors: ["Agriculture"],
      description: "PALC, SAPH, SIFCA: pic de production oct-déc. Prix des matières premières mondiales (caoutchouc, huile de palme) corrèle directement.",
    },
    endOfYearEffect: {
      label: "Effet fin d'année",
      description: "Décembre: les fonds clôturent leurs positions. Janvier: réinvestissements. Secteurs Telecom et Banque bénéficient des transactions de fin d'année.",
      months: [11, 0]
    },
    dividendStrip: {
      label: "Détachement dividende",
      description: "La veille du détachement, le cours monte (anticipation). Le jour J, baisse mécanique du montant du dividende. J+3 à J+10: souvent rebond si dividende supérieur aux attentes.",
    },
    ipoEffect: {
      label: "Effet introduction en bourse",
      description: "Les nouvelles introductions attirent les particuliers et montent fortement les premières séances, avant consolidation.",
    },
    countryCrisisEffect: {
      label: "Risque géopolitique UEMOA",
      description: "Les coups d'État (Mali, Burkina, Niger, Guinée) impactent les titres cotés de ces pays et créent de la nervosité sur l'ensemble du marché.",
    }
  };

  // ─── Évaluation du risque pays ─────────────────────────────────────────────
  function assessCountryRisk(country) {
    const riskScore = MACRO_CONTEXT.politicalRisk[country] || 5.0;
    const riskPremium = Math.max(0, (8 - riskScore) * 0.005);
    let riskLevel, color;
    if (riskScore >= 7)      { riskLevel = '✅ Risque faible';    color = 'green'; }
    else if (riskScore >= 5) { riskLevel = '🟡 Risque modéré';   color = 'gold'; }
    else if (riskScore >= 4) { riskLevel = '🟠 Risque élevé';    color = 'orange'; }
    else                     { riskLevel = '🔴 Risque très élevé'; color = 'red'; }
    return { riskScore, riskPremium, riskLevel, color,
      description: `Pays: ${getCountryName(country)} — Score politique ${riskScore}/10` };
  }

  function getCountryName(code) {
    const names = { CI:'Côte d\'Ivoire', SN:'Sénégal', BF:'Burkina Faso',
                    BJ:'Bénin', ML:'Mali', TG:'Togo', GW:'Guinée-Bissau', NE:'Niger', GN:'Guinée' };
    return names[code] || code;
  }

  // ─── Analyse liquidité ─────────────────────────────────────────────────────
  function assessLiquidity(stock) {
    const avgVol = stock.volumeAvg20 || stock.volume || 0;
    const marketCap = stock.price * (stock.netIncome / (stock.eps || 1));
    let level, score, comment, risk;

    if (avgVol >= 5000)      { level = '✅ Très liquide';  score = 90; risk = 'faible';  comment = `${avgVol.toLocaleString('fr-FR')} titres/j — facile à négocier`; }
    else if (avgVol >= 2000) { level = '✅ Liquide';       score = 75; risk = 'faible';  comment = `${avgVol.toLocaleString('fr-FR')} titres/j — liquidité correcte`; }
    else if (avgVol >= 500)  { level = '🟡 Peu liquide';  score = 55; risk = 'modéré'; comment = `${avgVol.toLocaleString('fr-FR')} titres/j — spreads possibles`; }
    else if (avgVol >= 100)  { level = '🟠 Illiquide';    score = 35; risk = 'élevé';  comment = `${avgVol.toLocaleString('fr-FR')} titres/j — exécution difficile`; }
    else                     { level = '🔴 Très illiquide'; score = 15; risk = 'très élevé'; comment = `${avgVol.toLocaleString('fr-FR')} titres/j — position difficile`; }

    return { level, score, risk, comment, avgVol };
  }

  // ─── Sentiment de marché global ────────────────────────────────────────────
  function computeMarketSentiment() {
    const stocks = BRVM_STOCKS;
    const gainers = stocks.filter(s => (s.price - s.priceYesterday) > 0).length;
    const losers  = stocks.filter(s => (s.price - s.priceYesterday) < 0).length;
    const total   = stocks.length;
    const breadth = (gainers - losers) / total; // -1 à +1

    // Market momentum: 5j vs 20j
    const avgChange5j = stocks.reduce((sum, s) => {
      if (!s.history || s.history.length < 5) return sum;
      const c = (s.price - s.history[s.history.length - 5]) / s.history[s.history.length - 5];
      return sum + c;
    }, 0) / total;

    const sentimentScore = Math.round((breadth + 1) / 2 * 100); // 0-100
    const label = sentimentScore >= 70 ? '🟢 Marché haussier' :
                  sentimentScore >= 55 ? '🟡 Sentiment positif' :
                  sentimentScore >= 45 ? '⚪ Sentiment neutre' :
                  sentimentScore >= 30 ? '🟠 Sentiment négatif' : '🔴 Marché baissier';

    return {
      sentimentScore, label, breadth, gainers, losers,
      momentum5j: Math.round(avgChange5j * 1000) / 10,
      description: `${gainers} hausses · ${losers} baisses · Momentum 5j: ${avgChange5j > 0 ? '+' : ''}${(avgChange5j * 100).toFixed(1)}%`
    };
  }

  // ─── Événements à court terme ──────────────────────────────────────────────
  function detectUpcomingEvents(stock) {
    const events = [];
    const today  = new Date();
    const event  = DIVIDEND_EVENTS[stock.ticker];

    if (event) {
      const divDate = new Date(event.divDate);
      const resDate = new Date(event.resultsDate);
      const daysToDiv = Math.round((divDate - today) / (1000 * 60 * 60 * 24));
      const daysToRes = Math.round((resDate - today) / (1000 * 60 * 60 * 24));

      if (daysToDiv >= -5 && daysToDiv <= 30) {
        events.push({
          type: 'dividende', icon: '💰', bull: true,
          title: daysToDiv > 0 ? `Dividende dans ${daysToDiv}j` : daysToDiv >= -2 ? 'Détachement récent' : 'Ex-dividende passé',
          desc: `Dividende attendu: ${event.expectedDiv.toLocaleString('fr-FR')} FCFA/action`,
          impact: '+2% à +6% anticipé à J-5, baisse mécanique J0'
        });
      }
      if (daysToRes >= -3 && daysToRes <= 45) {
        events.push({
          type: 'résultats', icon: '📊', bull: null,
          title: daysToRes > 0 ? `Résultats dans ${daysToRes}j` : 'Résultats publiés',
          desc: 'Publication résultats annuels — impact fort potentiel',
          impact: '+2% à +8% si résultats > attentes, -3% à -8% si déception'
        });
      }
    }

    // Saisonnalité
    const month = today.getMonth();
    if (stock.sector === 'Agriculture') {
      if (month >= 9 && month <= 11) events.push({
        type: 'saisonnalité', icon: '🌿', bull: true,
        title: 'Pic de production (oct-déc)',
        desc: stock.seasonality || 'Haute saison agricole — résultats généralement positifs',
        impact: 'Effet positif historique +3% à +8%'
      });
      if (month >= 2 && month <= 4) events.push({
        type: 'saisonnalité', icon: '☀️', bull: null,
        title: 'Saison sèche (mars-mai)',
        desc: 'Réduction production possible selon les cultures',
        impact: 'Neutre à légèrement négatif'
      });
    }
    if (stock.sector === 'Telecom' && (month === 11 || month === 0)) {
      events.push({
        type: 'saisonnalité', icon: '📱', bull: true,
        title: 'Pic transactions fin d\'année',
        desc: 'Mobile money, appels internationaux en hausse festive',
        impact: 'Positif pour CA T4 +5% à +12%'
      });
    }

    // Risque politique
    const risk = MACRO_CONTEXT.politicalRisk[stock.country] || 5;
    if (risk < 4.5) {
      events.push({
        type: 'risque', icon: '⚠️', bull: false,
        title: `Risque géopolitique ${getCountryName(stock.country)}`,
        desc: 'Instabilité politique — facteur de décote',
        impact: 'Décote risque pays -5% à -20% sur valorisation'
      });
    }

    return events;
  }

  // ─── Scoring psychologique (0-100) ────────────────────────────────────────
  function score(stock, marketSentiment) {
    let pts = 50; // Neutre
    const factors = [];

    // Liquidité (±15 pts)
    const liq = assessLiquidity(stock);
    const liqAdj = (liq.score - 50) * 0.30;
    pts += liqAdj;
    factors.push({ name: 'Liquidité', value: liq.level, adj: Math.round(liqAdj) });

    // Risque pays (±20 pts)
    const cr  = assessCountryRisk(stock.country);
    const crAdj = (cr.riskScore - 5) * 3;
    pts += crAdj;
    factors.push({ name: 'Risque pays', value: cr.riskLevel, adj: Math.round(crAdj) });

    // Sentiment marché (±15 pts)
    const sentAdj = (marketSentiment.sentimentScore - 50) * 0.30;
    pts += sentAdj;
    factors.push({ name: 'Sentiment', value: marketSentiment.label, adj: Math.round(sentAdj) });

    // Événements à venir (±20 pts)
    const events = detectUpcomingEvents(stock);
    let eventAdj = 0;
    events.forEach(ev => {
      if (ev.bull === true)  eventAdj += 8;
      if (ev.bull === false) eventAdj -= 10;
    });
    eventAdj = Math.max(-20, Math.min(20, eventAdj));
    pts += eventAdj;
    if (events.length > 0) factors.push({ name: 'Événements', value: `${events.length} événement(s)`, adj: Math.round(eventAdj) });

    // Momentum relatif (±10 pts)
    const change = stock.price && stock.priceYesterday
      ? (stock.price - stock.priceYesterday) / stock.priceYesterday * 100 : 0;
    const momAdj = Math.max(-10, Math.min(10, change * 2));
    pts += momAdj;

    const finalScore = Math.max(0, Math.min(100, Math.round(pts)));

    return {
      score: finalScore,
      factors, events,
      liquidity: liq,
      countryRisk: cr,
      marketSentiment,
      label: finalScore >= 65 ? '🟢 Contexte favorable' :
             finalScore >= 50 ? '🟡 Contexte neutre' :
             finalScore >= 35 ? '🟠 Contexte prudent' : '🔴 Contexte défavorable'
    };
  }

  // ─── Analyse complète ──────────────────────────────────────────────────────
  function analyze(stock) {
    const sentiment = computeMarketSentiment();
    const result    = score(stock, sentiment);
    const events    = result.events;
    const liq       = result.liquidity;
    const cr        = result.countryRisk;

    const metrics = [
      { label: 'Liquidité marché',        value: liq.level,         signal: liq.score > 60 ? '✅' : liq.score > 40 ? '🟡' : '🔴', detail: liq.comment },
      { label: 'Risque pays',             value: cr.riskLevel,      signal: cr.riskScore >= 6 ? '✅' : cr.riskScore >= 4 ? '🟡' : '🔴', detail: cr.description },
      { label: 'Sentiment marché',        value: sentiment.label,   signal: sentiment.sentimentScore >= 55 ? '✅' : '🟡', detail: sentiment.description },
      { label: 'Momentum journalier',     value: ((stock.price - stock.priceYesterday) / stock.priceYesterday * 100).toFixed(2) + '%',
        signal: stock.price > stock.priceYesterday ? '✅' : '🔴', detail: 'Variation journée' },
      { label: 'Parité CFA/EUR',          value: 'Fixe (655.957)',   signal: '✅ Stabilitaire', detail: 'Garantie par la France — aucun risque change intra-UEMOA' },
      { label: 'Taux directeur BCEAO',    value: (MACRO_CONTEXT.policyRate*100).toFixed(2)+'%', signal: '🟡', detail: 'Impact sur coût du crédit' },
      { label: 'Croissance PIB UEMOA',    value: (MACRO_CONTEXT.gdpGrowthUEMOA*100).toFixed(1)+'%', signal: '✅', detail: 'Contexte macro porteur' }
    ];

    // Ajouter événements dans metrics
    events.forEach(ev => {
      metrics.push({ label: ev.title, value: ev.type.toUpperCase(), signal: ev.bull === true ? '✅' : ev.bull === false ? '🔴' : '🟡', detail: ev.impact });
    });

    // Patterns comportementaux applicables
    const applicablePatterns = [];
    if (liq.avgVol < 200) applicablePatterns.push(BRVM_BEHAVIORAL_PATTERNS.lowLiquidityEffect);
    if (events.some(e => e.type === 'dividende')) applicablePatterns.push(BRVM_BEHAVIORAL_PATTERNS.dividendStrip);
    if (cr.riskScore < 5) applicablePatterns.push(BRVM_BEHAVIORAL_PATTERNS.countryCrisisEffect);
    if (stock.sector === 'Agriculture') applicablePatterns.push(BRVM_BEHAVIORAL_PATTERNS.seasonalAgriculture);
    applicablePatterns.push(BRVM_BEHAVIORAL_PATTERNS.herdingEffect);

    return { ...result, metrics, applicablePatterns };
  }

  return { analyze, computeMarketSentiment, assessLiquidity, assessCountryRisk, detectUpcomingEvents };
})();
