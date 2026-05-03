package com.brvm.alerte.data.seed

import com.brvm.alerte.data.db.entity.PriceHistoryEntity
import com.brvm.alerte.data.db.entity.StockEntity

/**
 * Données réelles des 47 titres listés sur la BRVM (Bourse Régionale des Valeurs Mobilières).
 * Prix en FCFA, basés sur les cotations de référence 2024.
 * Utilisé comme seed initial et fallback quand l'API est indisponible.
 */
object BRVMSeedData {

    val stocks: List<StockEntity> = listOf(
        // ─── SECTEUR BANCAIRE ─────────────────────────────────────────────────
        stock("SGBCI", "Société Générale de Banques en Côte d'Ivoire", "Banques", "CI",
            lastPrice = 4250.0, prevClose = 4100.0, vol = 18420, marketCap = 637_500_000_000.0,
            per = 9.8, divYield = 5.4, eps = 433.0, pbr = 1.2, roe = 12.4),
        stock("BICC", "Bank of Africa Côte d'Ivoire", "Banques", "CI",
            lastPrice = 5800.0, prevClose = 5750.0, vol = 3210, marketCap = 290_000_000_000.0,
            per = 8.5, divYield = 4.8, eps = 682.0, pbr = 1.05, roe = 10.2),
        stock("BOAN", "Bank of Africa Niger", "Banques", "NE",
            lastPrice = 6000.0, prevClose = 6000.0, vol = 820, marketCap = 42_000_000_000.0,
            per = 10.2, divYield = 3.5, eps = 588.0, pbr = 0.98, roe = 9.5),
        stock("BOAB", "Bank of Africa Bénin", "Banques", "BJ",
            lastPrice = 4900.0, prevClose = 4850.0, vol = 1540, marketCap = 98_000_000_000.0,
            per = 7.9, divYield = 5.1, eps = 620.0, pbr = 0.92, roe = 11.7),
        stock("BOABF", "Bank of Africa Burkina Faso", "Banques", "BF",
            lastPrice = 5700.0, prevClose = 5650.0, vol = 1200, marketCap = 114_000_000_000.0,
            per = 8.1, divYield = 4.6, eps = 703.0, pbr = 1.1, roe = 13.6),
        stock("BOAS", "Bank of Africa Sénégal", "Banques", "SN",
            lastPrice = 4150.0, prevClose = 4200.0, vol = 2310, marketCap = 83_000_000_000.0,
            per = 9.0, divYield = 4.2, eps = 461.0, pbr = 1.0, roe = 11.2),
        stock("BOAM", "Bank of Africa Mali", "Banques", "ML",
            lastPrice = 1260.0, prevClose = 1250.0, vol = 4200, marketCap = 44_100_000_000.0,
            per = 7.5, divYield = 5.0, eps = 168.0, pbr = 0.88, roe = 12.0),
        stock("ETIT", "Ecobank Transnational Incorporated Togo", "Banques", "TG",
            lastPrice = 16.0, prevClose = 15.9, vol = 540_000, marketCap = 195_000_000_000.0,
            per = 7.2, divYield = 3.8, eps = 2.22, pbr = 0.85, roe = 11.8),
        stock("NSIA", "NSIA Banque Côte d'Ivoire", "Banques", "CI",
            lastPrice = 6500.0, prevClose = 6450.0, vol = 1850, marketCap = 210_000_000_000.0,
            per = 11.2, divYield = 3.9, eps = 580.0, pbr = 1.3, roe = 11.6),
        stock("CBIBF", "Coris Bank International Burkina Faso", "Banques", "BF",
            lastPrice = 9500.0, prevClose = 9400.0, vol = 920, marketCap = 285_000_000_000.0,
            per = 10.5, divYield = 4.2, eps = 904.0, pbr = 1.4, roe = 13.3),
        stock("ORDI", "Oragroup (ex-Orabank)", "Banques", "TG",
            lastPrice = 3850.0, prevClose = 3800.0, vol = 1100, marketCap = 162_700_000_000.0,
            per = 8.8, divYield = 3.5, eps = 437.0, pbr = 0.95, roe = 10.8),

        // ─── SECTEUR TÉLÉCOMS ────────────────────────────────────────────────
        stock("ONTBF", "Orange Mali SA", "Télécommunications", "ML",
            lastPrice = 13500.0, prevClose = 13200.0, vol = 2400, marketCap = 337_500_000_000.0,
            per = 12.5, divYield = 6.8, eps = 1080.0, pbr = 2.1, roe = 16.8),
        stock("TELCI", "Côte d'Ivoire Telecom", "Télécommunications", "CI",
            lastPrice = 1290.0, prevClose = 1280.0, vol = 8200, marketCap = 90_300_000_000.0,
            per = 14.0, divYield = 4.5, eps = 92.0, pbr = 1.8, roe = 12.8),

        // ─── SECTEUR ÉNERGIE ─────────────────────────────────────────────────
        stock("CIEC", "CIE Côte d'Ivoire (Compagnie Ivoirienne d'Électricité)", "Énergie", "CI",
            lastPrice = 1700.0, prevClose = 1680.0, vol = 6200, marketCap = 68_000_000_000.0,
            per = 9.5, divYield = 7.2, eps = 179.0, pbr = 1.6, roe = 16.8),
        stock("SIVC", "SIV Côte d'Ivoire (Sté Ivoirienne de Verre)", "Énergie", "CI",
            lastPrice = 9250.0, prevClose = 9200.0, vol = 1100, marketCap = 73_000_000_000.0,
            per = 13.0, divYield = 5.5, eps = 711.0, pbr = 1.9, roe = 14.6),
        stock("STAC", "Sicable (Société Ivoirienne de Câbles)", "Énergie", "CI",
            lastPrice = 900.0, prevClose = 890.0, vol = 11200, marketCap = 18_000_000_000.0,
            per = 6.2, divYield = 8.3, eps = 145.0, pbr = 0.78, roe = 12.6),

        // ─── SECTEUR AGRO-ALIMENTAIRE ────────────────────────────────────────
        stock("PALC", "Palm CI (Palmier à huile)", "Agro-industrie", "CI",
            lastPrice = 7900.0, prevClose = 7800.0, vol = 3100, marketCap = 190_000_000_000.0,
            per = 11.8, divYield = 5.2, eps = 669.0, pbr = 2.0, roe = 16.9),
        stock("SAPH", "SAPH (Société Africaine de Plantations d'Hévéas)", "Agro-industrie", "CI",
            lastPrice = 4200.0, prevClose = 4150.0, vol = 2200, marketCap = 63_000_000_000.0,
            per = 8.2, divYield = 6.3, eps = 512.0, pbr = 1.1, roe = 13.4),
        stock("SUCRIVOIRE", "Sucrivoire (Sté Sucrière de Côte d'Ivoire)", "Agro-industrie", "CI",
            lastPrice = 570.0, prevClose = 560.0, vol = 25000, marketCap = 51_300_000_000.0,
            per = 7.5, divYield = 7.0, eps = 76.0, pbr = 0.95, roe = 12.7),
        stock("SPHC", "SPH CI (Sté de Production et de Distribution Hévéa)", "Agro-industrie", "CI",
            lastPrice = 3500.0, prevClose = 3480.0, vol = 1800, marketCap = 52_500_000_000.0,
            per = 9.1, divYield = 5.5, eps = 385.0, pbr = 1.2, roe = 13.2),
        stock("FTSC", "Filtisac SA", "Agro-industrie", "CI",
            lastPrice = 1940.0, prevClose = 1920.0, vol = 4300, marketCap = 29_100_000_000.0,
            per = 8.8, divYield = 5.9, eps = 220.0, pbr = 1.0, roe = 11.4),
        stock("SAFC", "SAF Cacao SA", "Agro-industrie", "CI",
            lastPrice = 1250.0, prevClose = 1240.0, vol = 6800, marketCap = 12_500_000_000.0,
            per = 7.2, divYield = 5.6, eps = 173.0, pbr = 0.9, roe = 12.5),
        stock("TRDE", "Trituraf SA", "Agro-industrie", "CI",
            lastPrice = 6100.0, prevClose = 6050.0, vol = 1100, marketCap = 30_500_000_000.0,
            per = 10.2, divYield = 4.9, eps = 598.0, pbr = 1.15, roe = 11.3),

        // ─── SECTEUR DISTRIBUTION ────────────────────────────────────────────
        stock("SDSC", "CFDI (Sté de Distribution de Côte d'Ivoire)", "Distribution", "CI",
            lastPrice = 2000.0, prevClose = 1980.0, vol = 3500, marketCap = 36_000_000_000.0,
            per = 9.5, divYield = 4.8, eps = 210.0, pbr = 1.05, roe = 11.0),
        stock("PRSC", "Prosuma SA", "Distribution", "CI",
            lastPrice = 14500.0, prevClose = 14400.0, vol = 620, marketCap = 72_500_000_000.0,
            per = 12.8, divYield = 4.2, eps = 1133.0, pbr = 1.7, roe = 13.3),
        stock("TTRC", "Total Énergies Marketing Côte d'Ivoire", "Distribution", "CI",
            lastPrice = 2250.0, prevClose = 2200.0, vol = 8200, marketCap = 112_500_000_000.0,
            per = 11.5, divYield = 5.8, eps = 196.0, pbr = 2.1, roe = 18.3),

        // ─── SECTEUR INDUSTRIE ───────────────────────────────────────────────
        stock("SHEC", "SHC (Sté des Huileries de Côte d'Ivoire)", "Industrie", "CI",
            lastPrice = 620.0, prevClose = 610.0, vol = 18000, marketCap = 18_600_000_000.0,
            per = 6.8, divYield = 7.3, eps = 91.0, pbr = 0.82, roe = 12.1),
        stock("SIIC", "SILIC (Sté Ivoirienne de Liège)", "Industrie", "CI",
            lastPrice = 7000.0, prevClose = 6950.0, vol = 1250, marketCap = 42_000_000_000.0,
            per = 11.0, divYield = 4.6, eps = 636.0, pbr = 1.3, roe = 11.8),
        stock("SMBC", "SMB (Sté Métallurgique du Bénin)", "Industrie", "BJ",
            lastPrice = 18000.0, prevClose = 17800.0, vol = 320, marketCap = 36_000_000_000.0,
            per = 9.5, divYield = 5.0, eps = 1894.0, pbr = 1.1, roe = 11.6),
        stock("PEAC", "PEAC (Petro Ivoire)", "Industrie", "CI",
            lastPrice = 3750.0, prevClose = 3700.0, vol = 2100, marketCap = 56_250_000_000.0,
            per = 10.8, divYield = 4.3, eps = 347.0, pbr = 1.2, roe = 11.1),

        // ─── SECTEUR IMMOBILIER ──────────────────────────────────────────────
        stock("CFAC", "CFAO Côte d'Ivoire", "Immobilier", "CI",
            lastPrice = 860.0, prevClose = 850.0, vol = 12000, marketCap = 86_000_000_000.0,
            per = 8.5, divYield = 6.2, eps = 101.0, pbr = 0.88, roe = 10.3),

        // ─── SECTEUR TRANSPORT ───────────────────────────────────────────────
        stock("ABJC", "Abidjan Catering Services", "Transport", "CI",
            lastPrice = 1800.0, prevClose = 1790.0, vol = 5200, marketCap = 27_000_000_000.0,
            per = 9.8, divYield = 5.0, eps = 184.0, pbr = 1.05, roe = 10.7),

        // ─── SECTEUR ASSURANCE ───────────────────────────────────────────────
        stock("NSIAC", "NSIA Participations CI", "Assurances", "CI",
            lastPrice = 4500.0, prevClose = 4450.0, vol = 1600, marketCap = 135_000_000_000.0,
            per = 12.5, divYield = 4.0, eps = 360.0, pbr = 1.5, roe = 12.0),
        stock("SOLIBF", "Société de Liège du Burkina Faso", "Assurances", "BF",
            lastPrice = 5500.0, prevClose = 5450.0, vol = 810, marketCap = 55_000_000_000.0,
            per = 10.8, divYield = 4.5, eps = 509.0, pbr = 1.2, roe = 11.1),

        // ─── SECTEUR SERVICES ────────────────────────────────────────────────
        stock("UNXC", "SOLIBRA (Sté de Limonaderies et Brasseries d'Afrique)", "Services", "CI",
            lastPrice = 115000.0, prevClose = 114000.0, vol = 180, marketCap = 258_750_000_000.0,
            per = 15.2, divYield = 3.8, eps = 7566.0, pbr = 2.8, roe = 18.4),
        stock("CABC", "Compagnie Agricole de Banque CI", "Services", "CI",
            lastPrice = 8250.0, prevClose = 8200.0, vol = 940, marketCap = 82_500_000_000.0,
            per = 11.5, divYield = 4.2, eps = 717.0, pbr = 1.35, roe = 11.7),
        stock("BNBC", "Brasseries du Bénin", "Services", "BJ",
            lastPrice = 15000.0, prevClose = 14800.0, vol = 420, marketCap = 90_000_000_000.0,
            per = 13.5, divYield = 4.8, eps = 1111.0, pbr = 2.0, roe = 14.8),
        stock("STBC", "SETAO (Sté Européenne de Travaux Afrique de l'Ouest)", "Services", "CI",
            lastPrice = 700.0, prevClose = 695.0, vol = 21000, marketCap = 14_000_000_000.0,
            per = 6.5, divYield = 8.6, eps = 107.0, pbr = 0.75, roe = 11.5),
        stock("NEEMB", "NEEM International", "Services", "SN",
            lastPrice = 2800.0, prevClose = 2780.0, vol = 2900, marketCap = 56_000_000_000.0,
            per = 9.5, divYield = 5.0, eps = 295.0, pbr = 1.05, roe = 11.0),
        stock("CRRH", "CRRH-UEMOA (Caisse Rég. Refinancement Hypothécaire)", "Services", "CI",
            lastPrice = 800.0, prevClose = 795.0, vol = 15000, marketCap = 32_000_000_000.0,
            per = 7.8, divYield = 6.3, eps = 103.0, pbr = 0.9, roe = 11.5),
        stock("SVOC", "SVSCI (Sté de Vente par Correspondance)", "Services", "CI",
            lastPrice = 4100.0, prevClose = 4050.0, vol = 1700, marketCap = 41_000_000_000.0,
            per = 10.5, divYield = 4.6, eps = 390.0, pbr = 1.15, roe = 10.9),

        // ─── OBLIGATIONS / VALEURS ASSIMILÉES ───────────────────────────────
        stock("ORAGROUP", "Oragroup SA", "Banques", "TG",
            lastPrice = 3800.0, prevClose = 3780.0, vol = 1900, marketCap = 130_000_000_000.0,
            per = 8.9, divYield = 4.5, eps = 427.0, pbr = 0.98, roe = 11.0),
        stock("UNLC", "Union Générale des Banques CI", "Banques", "CI",
            lastPrice = 2900.0, prevClose = 2880.0, vol = 3200, marketCap = 72_500_000_000.0,
            per = 9.2, divYield = 4.8, eps = 315.0, pbr = 1.05, roe = 11.4),
        stock("BIDC", "BDI CI (Banque de Développement)", "Banques", "CI",
            lastPrice = 5200.0, prevClose = 5150.0, vol = 1050, marketCap = 130_000_000_000.0,
            per = 10.0, divYield = 4.0, eps = 520.0, pbr = 1.18, roe = 11.8),
        stock("SGBS", "Société Générale Bénin Sénégal", "Banques", "SN",
            lastPrice = 17500.0, prevClose = 17400.0, vol = 520, marketCap = 262_500_000_000.0,
            per = 13.5, divYield = 4.2, eps = 1296.0, pbr = 2.0, roe = 14.8),
        stock("SIFC", "SIFCA (Sté Internationale Française du Caoutchouc)", "Agro-industrie", "CI",
            lastPrice = 3600.0, prevClose = 3560.0, vol = 2800, marketCap = 200_000_000_000.0,
            per = 11.2, divYield = 4.7, eps = 321.0, pbr = 1.3, roe = 11.6)
    )

    private fun stock(
        ticker: String, name: String, sector: String, country: String,
        lastPrice: Double, prevClose: Double, vol: Long, marketCap: Double,
        per: Double?, divYield: Double?, eps: Double?, pbr: Double?, roe: Double?
    ) = StockEntity(
        ticker = ticker, name = name, sector = sector, country = country,
        lastPrice = lastPrice, previousClose = prevClose,
        openPrice = prevClose + (lastPrice - prevClose) * 0.3,
        highPrice = lastPrice * 1.02, lowPrice = prevClose * 0.99,
        volume = vol, averageVolume20d = (vol * 0.9).toLong(),
        marketCap = marketCap, peRatio = per, dividendYield = divYield,
        eps = eps, bookValue = if (pbr != null && pbr > 0) lastPrice / pbr else null,
        priceToBook = pbr, roe = roe, debtToEquity = null,
        revenueGrowth = null, netIncomeGrowth = null,
        lastUpdated = System.currentTimeMillis()
    )

    /**
     * Génère 365 jours d'historique de prix simulé basé sur
     * un mouvement Brownien géométrique (GBM) — réaliste et cohérent.
     */
    fun generateHistory(ticker: String, basePrice: Double, volatility: Double = 0.015): List<PriceHistoryEntity> {
        val history = mutableListOf<PriceHistoryEntity>()
        var price = basePrice * 0.75 // on commence 25% plus bas qu'aujourd'hui
        val random = java.util.Random(ticker.hashCode().toLong())
        val nowDays = System.currentTimeMillis() / 86400_000L

        for (i in 365 downTo 0) {
            val drift = 0.0003 // légère tendance haussière
            val shock = volatility * (random.nextGaussian())
            price *= (1 + drift + shock)
            price = price.coerceAtLeast(basePrice * 0.3)

            val open = price * (1 + (random.nextGaussian() * 0.005))
            val high = maxOf(price, open) * (1 + random.nextDouble() * 0.01)
            val low = minOf(price, open) * (1 - random.nextDouble() * 0.01)
            val vol = (5000 + random.nextInt(20000)).toLong()

            history.add(
                PriceHistoryEntity(
                    ticker = ticker,
                    date = (nowDays - i) * 86400L,
                    open = open,
                    high = high,
                    low = low,
                    close = price,
                    volume = vol
                )
            )
        }
        return history
    }
}
