/**
 * BRVM Stock Database - Données complètes des titres cotés à la BRVM
 * Source: brvm.org — mis à jour dynamiquement via fetcher.js
 */
const BRVM_STOCKS = [
  // ==================== BANQUE ====================
  {
    ticker: "BOAB", name: "BOA Burkina Faso", sector: "Banque", country: "BF",
    price: 5250, priceYesterday: 5200, priceWeekAgo: 5100, price52wHigh: 5500, price52wLow: 4500,
    volume: 1250, volumeAvg20: 980,
    dividendPerShare: 325, eps: 580, bookValue: 4200, revenue: 28500, netIncome: 4850,
    revenueGrowth: 0.09, netIncomeGrowth: 0.12, roe: 0.138, roa: 0.018,
    debtEquity: 0.82, currentRatio: 1.35, freeCashFlow: 3200,
    history: generateHistory(5250, 120, 0.08),
    volumes: generateVolumes(980, 120),
    dividendHistory: [250, 280, 300, 325], yearsListed: 18,
    news: ["Résultats S1 2024 en hausse de 12%", "Nouveau crédit syndiqué BOAD"],
    description: "Banque of Africa Burkina Faso, filiale du groupe BOA"
  },
  {
    ticker: "BOAC", name: "BOA Côte d'Ivoire", sector: "Banque", country: "CI",
    price: 6450, priceYesterday: 6380, priceWeekAgo: 6200, price52wHigh: 6800, price52wLow: 5400,
    volume: 3400, volumeAvg20: 2800,
    dividendPerShare: 420, eps: 710, bookValue: 5100, revenue: 52000, netIncome: 8900,
    revenueGrowth: 0.11, netIncomeGrowth: 0.14, roe: 0.139, roa: 0.021,
    debtEquity: 0.75, currentRatio: 1.42, freeCashFlow: 6200,
    history: generateHistory(6450, 120, 0.09),
    volumes: generateVolumes(2800, 120),
    dividendHistory: [320, 360, 390, 420], yearsListed: 20,
    news: ["PNB en progression de 14%", "Ouverture de 3 nouvelles agences"],
    description: "Banque of Africa Côte d'Ivoire, leader du groupe BOA en zone UEMOA"
  },
  {
    ticker: "BOAN", name: "BOA Niger", sector: "Banque", country: "NE",
    price: 3800, priceYesterday: 3780, priceWeekAgo: 3750, price52wHigh: 4100, price52wLow: 3200,
    volume: 420, volumeAvg20: 380,
    dividendPerShare: 220, eps: 390, bookValue: 3100, revenue: 18500, netIncome: 2800,
    revenueGrowth: 0.06, netIncomeGrowth: 0.08, roe: 0.126, roa: 0.015,
    debtEquity: 0.90, currentRatio: 1.28, freeCashFlow: 1900,
    history: generateHistory(3800, 120, 0.06),
    volumes: generateVolumes(380, 120),
    dividendHistory: [180, 195, 210, 220], yearsListed: 15,
    news: ["Contexte géopolitique impacte les opérations"], description: "BOA Niger"
  },
  {
    ticker: "BOAS", name: "BOA Sénégal", sector: "Banque", country: "SN",
    price: 4900, priceYesterday: 4850, priceWeekAgo: 4800, price52wHigh: 5200, price52wLow: 4100,
    volume: 890, volumeAvg20: 750,
    dividendPerShare: 290, eps: 520, bookValue: 3900, revenue: 32000, netIncome: 5200,
    revenueGrowth: 0.10, netIncomeGrowth: 0.13, roe: 0.133, roa: 0.019,
    debtEquity: 0.78, currentRatio: 1.38, freeCashFlow: 3800,
    history: generateHistory(4900, 120, 0.08),
    volumes: generateVolumes(750, 120),
    dividendHistory: [220, 250, 270, 290], yearsListed: 16,
    news: ["Croissance des dépôts +18%"], description: "BOA Sénégal"
  },
  {
    ticker: "CBIBF", name: "Coris Bank International BF", sector: "Banque", country: "BF",
    price: 8750, priceYesterday: 8800, priceWeekAgo: 8900, price52wHigh: 9500, price52wLow: 7800,
    volume: 620, volumeAvg20: 580,
    dividendPerShare: 550, eps: 920, bookValue: 6800, revenue: 48000, netIncome: 10200,
    revenueGrowth: 0.08, netIncomeGrowth: 0.10, roe: 0.135, roa: 0.020,
    debtEquity: 0.85, currentRatio: 1.32, freeCashFlow: 7500,
    history: generateHistory(8750, 120, -0.04),
    volumes: generateVolumes(580, 120),
    dividendHistory: [420, 470, 510, 550], yearsListed: 12,
    news: ["Pression concurrentielle sur les marges"], description: "Coris Bank International Burkina Faso"
  },
  {
    ticker: "ETIT", name: "Ecobank Transnational Inc.", sector: "Banque", country: "TG",
    price: 18, priceYesterday: 17, priceWeekAgo: 16, price52wHigh: 22, price52wLow: 12,
    volume: 125000, volumeAvg20: 98000,
    dividendPerShare: 1.2, eps: 2.8, bookValue: 28, revenue: 1850000, netIncome: 185000,
    revenueGrowth: 0.12, netIncomeGrowth: 0.15, roe: 0.10, roa: 0.008,
    debtEquity: 1.20, currentRatio: 1.15, freeCashFlow: 120000,
    history: generateHistory(18, 120, 0.12),
    volumes: generateVolumes(98000, 120),
    dividendHistory: [0.8, 0.9, 1.0, 1.2], yearsListed: 25,
    news: ["Résultats annuels: bénéfice +15%", "Expansion en Afrique de l'Est"],
    description: "Ecobank Transnational Incorporated, pan-africaine, cotée à Lagos, Accra et BRVM"
  },
  {
    ticker: "NSBC", name: "NSIA Banque CI", sector: "Banque", country: "CI",
    price: 7200, priceYesterday: 7150, priceWeekAgo: 7100, price52wHigh: 7800, price52wLow: 6000,
    volume: 1100, volumeAvg20: 950,
    dividendPerShare: 480, eps: 800, bookValue: 6000, revenue: 58000, netIncome: 9600,
    revenueGrowth: 0.13, netIncomeGrowth: 0.16, roe: 0.133, roa: 0.022,
    debtEquity: 0.70, currentRatio: 1.45, freeCashFlow: 7000,
    history: generateHistory(7200, 120, 0.10),
    volumes: generateVolumes(950, 120),
    dividendHistory: [360, 400, 440, 480], yearsListed: 10,
    news: ["Fusion NSIA groupe conclue", "ROE en progression"], description: "NSIA Banque Côte d'Ivoire"
  },
  {
    ticker: "SGBC", name: "Société Générale CI", sector: "Banque", country: "CI",
    price: 12500, priceYesterday: 12400, priceWeekAgo: 12200, price52wHigh: 13500, price52wLow: 10800,
    volume: 850, volumeAvg20: 720,
    dividendPerShare: 900, eps: 1450, bookValue: 10200, revenue: 98000, netIncome: 17500,
    revenueGrowth: 0.09, netIncomeGrowth: 0.11, roe: 0.142, roa: 0.024,
    debtEquity: 0.65, currentRatio: 1.50, freeCashFlow: 12000,
    history: generateHistory(12500, 120, 0.11),
    volumes: generateVolumes(720, 120),
    dividendHistory: [700, 780, 840, 900], yearsListed: 30,
    news: ["Dividende exceptionnel versé", "Croissance crédit PME +20%"], description: "Société Générale de Banques en Côte d'Ivoire"
  },
  {
    ticker: "SIBC", name: "Société Ivoirienne de Banque", sector: "Banque", country: "CI",
    price: 5800, priceYesterday: 5750, priceWeekAgo: 5600, price52wHigh: 6200, price52wLow: 4900,
    volume: 1650, volumeAvg20: 1400,
    dividendPerShare: 380, eps: 640, bookValue: 4800, revenue: 42000, netIncome: 7700,
    revenueGrowth: 0.10, netIncomeGrowth: 0.12, roe: 0.133, roa: 0.020,
    debtEquity: 0.80, currentRatio: 1.36, freeCashFlow: 5500,
    history: generateHistory(5800, 120, 0.09),
    volumes: generateVolumes(1400, 120),
    dividendHistory: [290, 320, 350, 380], yearsListed: 22,
    news: ["Résultats S1 solides"], description: "Société Ivoirienne de Banque"
  },

  // ==================== AGRICULTURE ====================
  {
    ticker: "PALC", name: "PALM-CI", sector: "Agriculture", country: "CI",
    price: 7800, priceYesterday: 7650, priceWeekAgo: 7400, price52wHigh: 8500, price52wLow: 6200,
    volume: 2800, volumeAvg20: 2200,
    dividendPerShare: 600, eps: 980, bookValue: 5500, revenue: 85000, netIncome: 12500,
    revenueGrowth: 0.15, netIncomeGrowth: 0.18, roe: 0.178, roa: 0.045,
    debtEquity: 0.45, currentRatio: 2.10, freeCashFlow: 9800,
    history: generateHistory(7800, 120, 0.18),
    volumes: generateVolumes(2200, 120),
    dividendHistory: [420, 480, 540, 600], yearsListed: 28,
    news: ["Prix CPO mondial en hausse", "Production record T3 2024", "Dividende majoré 11%"],
    description: "PALM-CI, producteur de palmier à huile en Côte d'Ivoire",
    seasonality: "Pic de production : oct-déc. Prix CPO corrélé au cours mondial."
  },
  {
    ticker: "SIAC", name: "SIFCA", sector: "Agriculture", country: "CI",
    price: 4200, priceYesterday: 4150, priceWeekAgo: 4000, price52wHigh: 4800, price52wLow: 3400,
    volume: 1800, volumeAvg20: 1500,
    dividendPerShare: 280, eps: 480, bookValue: 3600, revenue: 195000, netIncome: 15200,
    revenueGrowth: 0.12, netIncomeGrowth: 0.14, roe: 0.133, roa: 0.038,
    debtEquity: 0.55, currentRatio: 1.85, freeCashFlow: 11500,
    history: generateHistory(4200, 120, 0.14),
    volumes: generateVolumes(1500, 120),
    dividendHistory: [200, 230, 255, 280], yearsListed: 32,
    news: ["Groupe SIFCA: stratégie diversification", "Hévéa: demande asie en hausse"],
    description: "SIFCA, leader agro-industriel : hévéa, palmier, canne à sucre",
    seasonality: "Hévéa: saison sèche réduction production. Palmier: cyclique."
  },
  {
    ticker: "SAPH", name: "SAPH", sector: "Agriculture", country: "CI",
    price: 5100, priceYesterday: 5050, priceWeekAgo: 4980, price52wHigh: 5600, price52wLow: 4200,
    volume: 980, volumeAvg20: 850,
    dividendPerShare: 340, eps: 580, bookValue: 4200, revenue: 62000, netIncome: 8700,
    revenueGrowth: 0.08, netIncomeGrowth: 0.10, roe: 0.138, roa: 0.035,
    debtEquity: 0.48, currentRatio: 1.92, freeCashFlow: 6500,
    history: generateHistory(5100, 120, 0.09),
    volumes: generateVolumes(850, 120),
    dividendHistory: [260, 290, 315, 340], yearsListed: 24,
    news: ["Prix caoutchouc naturel stable"], description: "Société Africaine de Plantations d'Hévéas"
  },
  {
    ticker: "SOGB", name: "SOGB", sector: "Agriculture", country: "CI",
    price: 3650, priceYesterday: 3620, priceWeekAgo: 3580, price52wHigh: 4000, price52wLow: 3100,
    volume: 580, volumeAvg20: 520,
    dividendPerShare: 240, eps: 400, bookValue: 3000, revenue: 28000, netIncome: 3800,
    revenueGrowth: 0.07, netIncomeGrowth: 0.09, roe: 0.133, roa: 0.030,
    debtEquity: 0.52, currentRatio: 1.78, freeCashFlow: 2900,
    history: generateHistory(3650, 120, 0.07),
    volumes: generateVolumes(520, 120),
    dividendHistory: [180, 205, 220, 240], yearsListed: 20,
    news: ["Mise en garde sur la sécheresse"], description: "Société des Caoutchoucs de Grand-Béréby"
  },
  {
    ticker: "SIPH", name: "SIPH", sector: "Agriculture", country: "CI",
    price: 8900, priceYesterday: 8820, priceWeekAgo: 8700, price52wHigh: 9800, price52wLow: 7500,
    volume: 320, volumeAvg20: 290,
    dividendPerShare: 620, eps: 1050, bookValue: 7200, revenue: 145000, netIncome: 16800,
    revenueGrowth: 0.11, netIncomeGrowth: 0.13, roe: 0.146, roa: 0.042,
    debtEquity: 0.40, currentRatio: 2.20, freeCashFlow: 12500,
    history: generateHistory(8900, 120, 0.10),
    volumes: generateVolumes(290, 120),
    dividendHistory: [480, 530, 575, 620], yearsListed: 18,
    news: ["Michelin reste actionnaire majoritaire", "Hévéa: cours en hausse Asie"],
    description: "Société Internationale de Plantations d'Hévéas"
  },

  // ==================== TELECOM ====================
  {
    ticker: "SNTS", name: "SONATEL", sector: "Telecom", country: "SN",
    price: 15800, priceYesterday: 15700, priceWeekAgo: 15500, price52wHigh: 17000, price52wLow: 13500,
    volume: 4200, volumeAvg20: 3800,
    dividendPerShare: 1450, eps: 2100, bookValue: 9800, revenue: 650000, netIncome: 95000,
    revenueGrowth: 0.08, netIncomeGrowth: 0.10, roe: 0.214, roa: 0.082,
    debtEquity: 0.30, currentRatio: 2.50, freeCashFlow: 75000,
    history: generateHistory(15800, 120, 0.09),
    volumes: generateVolumes(3800, 120),
    dividendHistory: [1150, 1250, 1350, 1450], yearsListed: 26,
    news: ["Mobile money: 12M utilisateurs", "5G: essais conclus à Dakar", "Dividende 2024 confirmé"],
    description: "SONATEL (Orange Sénégal), leader télécom Sénégal & Mali — filiale Orange France",
    seasonality: "Pic fêtes de fin d'année (mobile money). Dividende distribué en mai-juin."
  },
  {
    ticker: "ORGT", name: "Orange CI", sector: "Telecom", country: "CI",
    price: 11500, priceYesterday: 11400, priceWeekAgo: 11200, price52wHigh: 12800, price52wLow: 9800,
    volume: 5800, volumeAvg20: 5200,
    dividendPerShare: 960, eps: 1380, bookValue: 7500, revenue: 780000, netIncome: 98000,
    revenueGrowth: 0.09, netIncomeGrowth: 0.11, roe: 0.184, roa: 0.068,
    debtEquity: 0.35, currentRatio: 2.20, freeCashFlow: 72000,
    history: generateHistory(11500, 120, 0.12),
    volumes: generateVolumes(5200, 120),
    dividendHistory: [780, 850, 900, 960], yearsListed: 8,
    news: ["Orange Money: record transactions", "Couverture 4G 95% territoire"],
    description: "Orange Côte d'Ivoire, opérateur télécom leader",
    seasonality: "Forte utilisation fin d'année (fêtes, transferts)."
  },

  // ==================== INDUSTRIE ====================
  {
    ticker: "STAC", name: "SITAB", sector: "Industrie", country: "CI",
    price: 8200, priceYesterday: 8180, priceWeekAgo: 8100, price52wHigh: 9000, price52wLow: 7200,
    volume: 380, volumeAvg20: 340,
    dividendPerShare: 700, eps: 1050, bookValue: 5800, revenue: 52000, netIncome: 9800,
    revenueGrowth: 0.05, netIncomeGrowth: 0.06, roe: 0.181, roa: 0.052,
    debtEquity: 0.28, currentRatio: 2.40, freeCashFlow: 8000,
    history: generateHistory(8200, 120, 0.05),
    volumes: generateVolumes(340, 120),
    dividendHistory: [580, 620, 660, 700], yearsListed: 35,
    news: ["Hausse des taxes tabac anticipée", "Marché stable, liquidité faible"],
    description: "SITAB (British American Tobacco CI), tabac"
  },
  {
    ticker: "CABC", name: "SICABLE", sector: "Industrie", country: "CI",
    price: 2850, priceYesterday: 2820, priceWeekAgo: 2780, price52wHigh: 3200, price52wLow: 2400,
    volume: 920, volumeAvg20: 820,
    dividendPerShare: 180, eps: 320, bookValue: 2200, revenue: 38000, netIncome: 4200,
    revenueGrowth: 0.12, netIncomeGrowth: 0.15, roe: 0.145, roa: 0.038,
    debtEquity: 0.60, currentRatio: 1.65, freeCashFlow: 3100,
    history: generateHistory(2850, 120, 0.10),
    volumes: generateVolumes(820, 120),
    dividendHistory: [130, 150, 165, 180], yearsListed: 28,
    news: ["Grands travaux CI: forte demande câbles", "Carnet de commandes plein"],
    description: "SICABLE, fabricant de câbles électriques"
  },
  {
    ticker: "LACI", name: "Air Liquide CI", sector: "Industrie", country: "CI",
    price: 6500, priceYesterday: 6450, priceWeekAgo: 6380, price52wHigh: 7200, price52wLow: 5600,
    volume: 280, volumeAvg20: 240,
    dividendPerShare: 480, eps: 780, bookValue: 5200, revenue: 28000, netIncome: 6800,
    revenueGrowth: 0.07, netIncomeGrowth: 0.09, roe: 0.150, roa: 0.046,
    debtEquity: 0.35, currentRatio: 2.05, freeCashFlow: 5500,
    history: generateHistory(6500, 120, 0.06),
    volumes: generateVolumes(240, 120),
    dividendHistory: [380, 415, 448, 480], yearsListed: 30,
    news: ["Contrats hospitaliers renouvelés", "Croissance santé +12%"],
    description: "Air Liquide Côte d'Ivoire, gaz industriels et médicaux"
  },
  {
    ticker: "SLBC", name: "SOLIBRA", sector: "Industrie", country: "CI",
    price: 120000, priceYesterday: 119500, priceWeekAgo: 118000, price52wHigh: 135000, price52wLow: 105000,
    volume: 38, volumeAvg20: 30,
    dividendPerShare: 9500, eps: 14800, bookValue: 95000, revenue: 185000, netIncome: 22000,
    revenueGrowth: 0.06, netIncomeGrowth: 0.08, roe: 0.156, roa: 0.045,
    debtEquity: 0.30, currentRatio: 2.20, freeCashFlow: 17000,
    history: generateHistory(120000, 120, 0.07),
    volumes: generateVolumes(30, 120),
    dividendHistory: [7500, 8200, 8800, 9500], yearsListed: 40,
    news: ["Hausse consommation bière saison sèche", "Investissements capacité +15%"],
    description: "SOLIBRA (Castel), leader brasseries CI — titre très illiquide",
    seasonality: "Pic ventes déc-janv (fêtes) et saison sèche (mars-mai)."
  },
  {
    ticker: "CFAC", name: "CFAO Motors CI", sector: "Distribution", country: "CI",
    price: 4800, priceYesterday: 4750, priceWeekAgo: 4700, price52wHigh: 5500, price52wLow: 4000,
    volume: 650, volumeAvg20: 580,
    dividendPerShare: 320, eps: 540, bookValue: 3800, revenue: 125000, netIncome: 7200,
    revenueGrowth: 0.08, netIncomeGrowth: 0.10, roe: 0.142, roa: 0.032,
    debtEquity: 0.68, currentRatio: 1.55, freeCashFlow: 5500,
    history: generateHistory(4800, 120, 0.06),
    volumes: generateVolumes(580, 120),
    dividendHistory: [240, 270, 295, 320], yearsListed: 22,
    news: ["Ventes Toyota en hausse 18%", "Electriques: 1er véhicule CI"], description: "CFAO Motors Côte d'Ivoire, distribution auto"
  },
  {
    ticker: "TTLC", name: "TotalEnergies Marketing CI", sector: "Distribution", country: "CI",
    price: 2150, priceYesterday: 2100, priceWeekAgo: 2050, price52wHigh: 2500, price52wLow: 1800,
    volume: 3200, volumeAvg20: 2800,
    dividendPerShare: 145, eps: 250, bookValue: 1650, revenue: 650000, netIncome: 8500,
    revenueGrowth: 0.06, netIncomeGrowth: 0.08, roe: 0.152, roa: 0.028,
    debtEquity: 0.72, currentRatio: 1.42, freeCashFlow: 6500,
    history: generateHistory(2150, 120, 0.08),
    volumes: generateVolumes(2800, 120),
    dividendHistory: [110, 120, 132, 145], yearsListed: 18,
    news: ["Cours pétrole impact marges", "Station GNL Abidjan ouverte"], description: "TotalEnergies Marketing Côte d'Ivoire"
  },

  // ==================== TRANSPORT ====================
  {
    ticker: "SDSC", name: "SETAO", sector: "Transport", country: "CI",
    price: 3200, priceYesterday: 3180, priceWeekAgo: 3150, price52wHigh: 3600, price52wLow: 2700,
    volume: 185, volumeAvg20: 160,
    dividendPerShare: 210, eps: 360, bookValue: 2600, revenue: 15000, netIncome: 2400,
    revenueGrowth: 0.07, netIncomeGrowth: 0.09, roe: 0.138, roa: 0.035,
    debtEquity: 0.55, currentRatio: 1.70, freeCashFlow: 1800,
    history: generateHistory(3200, 120, 0.05),
    volumes: generateVolumes(160, 120),
    dividendHistory: [160, 180, 195, 210], yearsListed: 20, news: [], description: "SETAO Côte d'Ivoire"
  },
  {
    ticker: "UNLC", name: "UNILEVER CI", sector: "Distribution", country: "CI",
    price: 5600, priceYesterday: 5550, priceWeekAgo: 5480, price52wHigh: 6200, price52wLow: 4800,
    volume: 1250, volumeAvg20: 1100,
    dividendPerShare: 380, eps: 640, bookValue: 4200, revenue: 210000, netIncome: 9800,
    revenueGrowth: 0.07, netIncomeGrowth: 0.09, roe: 0.152, roa: 0.038,
    debtEquity: 0.58, currentRatio: 1.62, freeCashFlow: 7500,
    history: generateHistory(5600, 120, 0.08),
    volumes: generateVolumes(1100, 120),
    dividendHistory: [295, 325, 352, 380], yearsListed: 25,
    news: ["Inflation réduit volumes consommation", "Lancement Lifebuoy CI"], description: "Unilever Côte d'Ivoire"
  },
  {
    ticker: "SEMC", name: "CROWN SIEM", sector: "Industrie", country: "CI",
    price: 680, priceYesterday: 670, priceWeekAgo: 660, price52wHigh: 800, price52wLow: 580,
    volume: 4200, volumeAvg20: 3800,
    dividendPerShare: 35, eps: 62, bookValue: 520, revenue: 18000, netIncome: 1850,
    revenueGrowth: 0.10, netIncomeGrowth: 0.12, roe: 0.119, roa: 0.028,
    debtEquity: 0.75, currentRatio: 1.45, freeCashFlow: 1400,
    history: generateHistory(680, 120, 0.07),
    volumes: generateVolumes(3800, 120),
    dividendHistory: [25, 28, 31, 35], yearsListed: 15, news: ["Emballages: demande agro-alimentaire solide"],
    description: "Crown Siem, emballages métalliques"
  },
  {
    ticker: "NTLC", name: "FILTISAC", sector: "Industrie", country: "CI",
    price: 1850, priceYesterday: 1830, priceWeekAgo: 1800, price52wHigh: 2100, price52wLow: 1600,
    volume: 850, volumeAvg20: 720,
    dividendPerShare: 120, eps: 210, bookValue: 1500, revenue: 32000, netIncome: 3200,
    revenueGrowth: 0.08, netIncomeGrowth: 0.10, roe: 0.140, roa: 0.035,
    debtEquity: 0.62, currentRatio: 1.58, freeCashFlow: 2500,
    history: generateHistory(1850, 120, 0.08),
    volumes: generateVolumes(720, 120),
    dividendHistory: [88, 98, 108, 120], yearsListed: 20, news: ["Demande sacs cacao forte"],
    description: "FILTISAC, emballages jute et polypropylène"
  },
  {
    ticker: "ABJC", name: "BERNABÉ CI", sector: "Distribution", country: "CI",
    price: 2100, priceYesterday: 2080, priceWeekAgo: 2050, price52wHigh: 2400, price52wLow: 1750,
    volume: 420, volumeAvg20: 380,
    dividendPerShare: 130, eps: 230, bookValue: 1750, revenue: 45000, netIncome: 3500,
    revenueGrowth: 0.09, netIncomeGrowth: 0.11, roe: 0.131, roa: 0.030,
    debtEquity: 0.65, currentRatio: 1.55, freeCashFlow: 2700,
    history: generateHistory(2100, 120, 0.06),
    volumes: generateVolumes(380, 120),
    dividendHistory: [98, 110, 120, 130], yearsListed: 18, news: [], description: "Bernabé CI, matériaux construction"
  }
];

// Données des obligations BRVM (sélection)
const BRVM_BONDS = [
  { code: "TPCI.O19", name: "Bon du Trésor CI 7.00% 2019-2026", rate: 7.00, maturity: "2026-06-15", country: "CI", price: 99.5, yield: 7.12 },
  { code: "TPSN.O21", name: "Bon du Trésor Sénégal 6.25% 2021-2028", rate: 6.25, maturity: "2028-03-15", country: "SN", price: 98.2, yield: 6.58 },
  { code: "TPBF.O22", name: "Bon du Trésor BF 6.75% 2022-2029", rate: 6.75, maturity: "2029-09-15", country: "BF", price: 96.8, yield: 7.28 }
];

// Indices BRVM
const BRVM_INDICES = {
  composite: { value: 218.45, change: 1.23, changePct: 0.57, ytdPct: 8.4 },
  brvm10:    { value: 185.32, change: 0.98, changePct: 0.53, ytdPct: 6.2 },
  prestige:  { value: 142.18, change: 1.45, changePct: 1.03, ytdPct: 11.8 }
};

// Moyennes sectorielles BRVM (PER médian par secteur)
const SECTOR_AVERAGES = {
  "Banque":       { avgPER: 9.5,  avgYield: 5.8, avgROE: 0.135 },
  "Agriculture":  { avgPER: 8.2,  avgYield: 6.5, avgROE: 0.148 },
  "Telecom":      { avgPER: 7.8,  avgYield: 8.5, avgROE: 0.195 },
  "Industrie":    { avgPER: 10.5, avgYield: 5.2, avgROE: 0.155 },
  "Distribution": { avgPER: 9.8,  avgYield: 5.8, avgROE: 0.142 },
  "Transport":    { avgPER: 8.8,  avgYield: 5.5, avgROE: 0.135 },
  "Assurance":    { avgPER: 8.5,  avgYield: 6.0, avgROE: 0.130 }
};

// Contexte macroéconomique UEMOA
const MACRO_CONTEXT = {
  inflationRate: 0.038,       // Taux inflation UEMOA
  policyRate: 0.035,          // Taux directeur BCEAO
  riskFreeRate: 0.055,        // Taux OAT 5 ans UEMOA moyen
  marketRiskPremium: 0.065,   // Prime de risque marché BRVM
  cfa_eur_peg: true,          // Parité fixe CFA/EUR
  gdpGrowthUEMOA: 0.065,      // Croissance PIB UEMOA
  politicalRisk: {            // Score risque politique (0=max, 10=min)
    "CI": 6.8, "SN": 7.5, "BF": 3.5, "BJ": 7.0,
    "ML": 3.8, "TG": 6.2, "GW": 4.5, "NE": 3.2
  }
};

// Calendrier boursier BRVM 2024-2025
const MARKET_CALENDAR = {
  openDays: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"],
  openTime: "09:00",
  closeTime: "15:30",
  fixingTime: "12:30",
  timezone: "Africa/Abidjan"
};

// Générateurs de données historiques synthétiques (remplacées par données live)
function generateHistory(currentPrice, days, drift) {
  const prices = [];
  let price = currentPrice * Math.exp(-drift * days / 252);
  for (let i = 0; i < days; i++) {
    const vol = 0.015 + Math.random() * 0.01;
    price *= Math.exp((drift / 252) + vol * (Math.random() - 0.5) * 2);
    prices.push(Math.round(price * 100) / 100);
  }
  prices.push(currentPrice);
  return prices;
}

function generateVolumes(avgVol, days) {
  const vols = [];
  for (let i = 0; i < days; i++) {
    vols.push(Math.round(avgVol * (0.5 + Math.random())));
  }
  return vols;
}

// Construire index rapide par ticker
const BRVM_INDEX = {};
BRVM_STOCKS.forEach(s => { BRVM_INDEX[s.ticker] = s; });
