/* BRVM Tracker Joe — référentiel des valeurs cotées à la BRVM.
   Les cours et dividendes ci-dessous sont des valeurs de référence INDICATIVES servant
   uniquement de point de départ : ils sont remplacés par les cours récupérés en ligne
   (bouton « Actualiser ») ou saisis à la main, et chaque dividende est modifiable. */
window.BT = window.BT || {};

BT.COUNTRIES = {
  CI: "Côte d'Ivoire", SN: 'Sénégal', BF: 'Burkina Faso', ML: 'Mali',
  NE: 'Niger', BJ: 'Bénin', TG: 'Togo', GW: 'Guinée-Bissau',
};

// Taux d'IRVM retenus à la source sur les dividendes (par pays de l'émetteur).
// Valeurs par défaut modifiables dans Paramètres : à vérifier auprès de votre SGI.
BT.IRVM_DEFAULT = { CI: 10, SN: 10, BF: 12.5, ML: 10, NE: 10, BJ: 10, TG: 13, GW: 10 };

// Classification sectorielle BRVM (depuis 2023)
BT.SECTORS = [
  'Services financiers', 'Télécommunications', 'Consommation de base',
  'Consommation discrétionnaire', 'Industriels', 'Énergie', 'Services publics',
];

// t: ticker, n: nom, s: secteur, c: pays, p: cours de référence, d: dividende brut par action (dernier connu, indicatif)
BT.STOCKS_REF = [
  { t: 'ABJC', n: 'Servair Abidjan CI', s: 'Consommation discrétionnaire', c: 'CI', p: 2000, d: 120 },
  { t: 'BICB', n: 'BIIC Bénin', s: 'Services financiers', c: 'BJ', p: 4900, d: 270 },
  { t: 'BICC', n: 'BICI Côte d\'Ivoire', s: 'Services financiers', c: 'CI', p: 17000, d: 880 },
  { t: 'BNBC', n: 'Bernabé CI', s: 'Consommation discrétionnaire', c: 'CI', p: 1500, d: 0 },
  { t: 'BOAB', n: 'Bank of Africa Bénin', s: 'Services financiers', c: 'BJ', p: 5600, d: 470 },
  { t: 'BOABF', n: 'Bank of Africa Burkina Faso', s: 'Services financiers', c: 'BF', p: 4000, d: 330 },
  { t: 'BOAC', n: 'Bank of Africa Côte d\'Ivoire', s: 'Services financiers', c: 'CI', p: 7000, d: 450 },
  { t: 'BOAM', n: 'Bank of Africa Mali', s: 'Services financiers', c: 'ML', p: 3900, d: 230 },
  { t: 'BOAN', n: 'Bank of Africa Niger', s: 'Services financiers', c: 'NE', p: 2700, d: 230 },
  { t: 'BOAS', n: 'Bank of Africa Sénégal', s: 'Services financiers', c: 'SN', p: 5000, d: 360 },
  { t: 'CABC', n: 'Sicable CI', s: 'Industriels', c: 'CI', p: 2000, d: 100 },
  { t: 'CBIBF', n: 'Coris Bank International BF', s: 'Services financiers', c: 'BF', p: 10000, d: 650 },
  { t: 'CFAC', n: 'CFAO Motors CI', s: 'Consommation discrétionnaire', c: 'CI', p: 1500, d: 50 },
  { t: 'CIEC', n: 'CIE Côte d\'Ivoire', s: 'Services publics', c: 'CI', p: 2500, d: 160 },
  { t: 'ECOC', n: 'Ecobank Côte d\'Ivoire', s: 'Services financiers', c: 'CI', p: 15000, d: 900 },
  { t: 'ETIT', n: 'Ecobank Transnational Inc.', s: 'Services financiers', c: 'TG', p: 25, d: 0 },
  { t: 'FTSC', n: 'Filtisac CI', s: 'Industriels', c: 'CI', p: 2000, d: 0 },
  { t: 'LNBB', n: 'Loterie Nationale du Bénin', s: 'Consommation discrétionnaire', c: 'BJ', p: 4000, d: 300 },
  { t: 'NEIC', n: 'NEI-CEDA CI', s: 'Consommation discrétionnaire', c: 'CI', p: 800, d: 0 },
  { t: 'NSBC', n: 'NSIA Banque CI', s: 'Services financiers', c: 'CI', p: 10000, d: 700 },
  { t: 'NTLC', n: 'Nestlé CI', s: 'Consommation de base', c: 'CI', p: 9000, d: 600 },
  { t: 'ONTBF', n: 'Onatel BF', s: 'Télécommunications', c: 'BF', p: 2500, d: 230 },
  { t: 'ORAC', n: 'Orange Côte d\'Ivoire', s: 'Télécommunications', c: 'CI', p: 15000, d: 900 },
  { t: 'ORGT', n: 'Oragroup Togo', s: 'Services financiers', c: 'TG', p: 2500, d: 0 },
  { t: 'PALC', n: 'Palm CI', s: 'Consommation de base', c: 'CI', p: 7000, d: 400 },
  { t: 'PRSC', n: 'Tractafric Motors CI', s: 'Consommation discrétionnaire', c: 'CI', p: 3000, d: 150 },
  { t: 'SAFC', n: 'Safca CI', s: 'Services financiers', c: 'CI', p: 3000, d: 0 },
  { t: 'SCRC', n: 'Sucrivoire CI', s: 'Consommation de base', c: 'CI', p: 1000, d: 0 },
  { t: 'SDCC', n: 'Sodeci CI', s: 'Services publics', c: 'CI', p: 6000, d: 400 },
  { t: 'SDSC', n: 'Africa Global Logistics CI', s: 'Industriels', c: 'CI', p: 1700, d: 100 },
  { t: 'SEMC', n: 'Eviosys Packaging Siem CI', s: 'Industriels', c: 'CI', p: 700, d: 0 },
  { t: 'SGBC', n: 'Société Générale Côte d\'Ivoire', s: 'Services financiers', c: 'CI', p: 28000, d: 1700 },
  { t: 'SHEC', n: 'Vivo Energy CI', s: 'Énergie', c: 'CI', p: 2500, d: 130 },
  { t: 'SIBC', n: 'Société Ivoirienne de Banque', s: 'Services financiers', c: 'CI', p: 6500, d: 450 },
  { t: 'SICC', n: 'Sicor CI', s: 'Consommation de base', c: 'CI', p: 4000, d: 0 },
  { t: 'SIVC', n: 'Erium CI', s: 'Industriels', c: 'CI', p: 1500, d: 0 },
  { t: 'SLBC', n: 'Solibra CI', s: 'Consommation de base', c: 'CI', p: 30000, d: 1800 },
  { t: 'SMBC', n: 'SMB Côte d\'Ivoire', s: 'Énergie', c: 'CI', p: 11000, d: 800 },
  { t: 'SNTS', n: 'Sonatel', s: 'Télécommunications', c: 'SN', p: 25000, d: 1800 },
  { t: 'SOGC', n: 'SOGB Côte d\'Ivoire', s: 'Consommation de base', c: 'CI', p: 6500, d: 450 },
  { t: 'SPHC', n: 'SAPH Côte d\'Ivoire', s: 'Consommation de base', c: 'CI', p: 5500, d: 250 },
  { t: 'STAC', n: 'Setao CI', s: 'Industriels', c: 'CI', p: 15000, d: 0 },
  { t: 'STBC', n: 'Sitab CI', s: 'Consommation de base', c: 'CI', p: 20000, d: 1400 },
  { t: 'TTLC', n: 'TotalEnergies Marketing CI', s: 'Énergie', c: 'CI', p: 2400, d: 160 },
  { t: 'TTLS', n: 'TotalEnergies Marketing Sénégal', s: 'Énergie', c: 'SN', p: 2300, d: 150 },
  { t: 'UNLC', n: 'Unilever Côte d\'Ivoire', s: 'Consommation de base', c: 'CI', p: 30000, d: 0 },
  { t: 'UNXC', n: 'Uniwax CI', s: 'Consommation discrétionnaire', c: 'CI', p: 1500, d: 0 },
];

// Anciens codes / alias rencontrés dans les relevés SGI et sur d'autres sources
BT.TICKER_ALIASES = {
  BOACI: 'BOAC', CBBF: 'CBIBF', ONAT: 'ONTBF', ORANGE: 'ORAC', SONATEL: 'SNTS',
  TOTAL: 'TTLC', SOLIBRA: 'SLBC', SGB: 'SGBC', SIB: 'SIBC', ECOBANK: 'ETIT',
};

BT.TX_TYPES = {
  achat: { label: 'Achat', sign: -1, stock: true },
  vente: { label: 'Vente', sign: 1, stock: true },
  dividende: { label: 'Dividende', sign: 1, stock: true, optionalQty: true },
  depot: { label: 'Dépôt', sign: 1 },
  retrait: { label: 'Retrait', sign: -1 },
  frais: { label: 'Frais / droits de garde', sign: -1 },
  interet: { label: 'Intérêts / coupon', sign: 1 },
  split: { label: 'Fractionnement (split)', stock: true },
};

// Séance BRVM : pré-ouverture 9h00, cotation continue 10h00–15h00, clôture 15h30 (heure GMT = Abidjan).
BT.marketStatus = function (d) {
  d = d || new Date();
  const day = d.getUTCDay();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (day === 0 || day === 6) return { open: false, label: 'Marché fermé (week-end)' };
  if (m < 540) return { open: false, label: 'Marché fermé — pré-ouverture à 9h00 GMT' };
  if (m < 600) return { open: false, pre: true, label: 'Pré-ouverture (9h00–10h00 GMT)' };
  if (m <= 900) return { open: true, label: 'Séance en cours (10h00–15h00 GMT)' };
  if (m <= 930) return { open: false, pre: true, label: 'Clôture (15h00–15h30 GMT)' };
  return { open: false, label: 'Marché fermé — reprise demain 9h00 GMT' };
};

BT.MAX_DAILY_MOVE = 7.5; // variation maximale journalière autorisée (%)
