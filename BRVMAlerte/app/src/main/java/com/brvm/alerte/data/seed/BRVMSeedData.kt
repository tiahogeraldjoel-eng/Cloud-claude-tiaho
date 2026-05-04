package com.brvm.alerte.data.seed

import com.brvm.alerte.data.db.entity.PriceHistoryEntity
import com.brvm.alerte.data.db.entity.StockEntity
import com.brvm.alerte.domain.model.EarningsEvent
import java.time.LocalDate

/**
 * 47 titres officiels BRVM — tickers, noms et prix au 30 avril 2026.
 * Source : https://www.brvm.org/fr/cours-actions/0
 * Utilisé comme seed initial et fallback quand toutes les sources réseau échouent.
 */
object BRVMSeedData {

    val stocks: List<StockEntity> = listOf(

        // ─── BANQUES ──────────────────────────────────────────────────────────
        stock("BICB",  "Banque Internationale pour l'Industrie et le Commerce du Bénin", "Banques", "BJ",
            5_300.0,  5_310.0,  568,   26_550_000_000.0),
        stock("BICC",  "BICI Côte d'Ivoire", "Banques", "CI",
            24_850.0, 24_850.0, 0,     99_400_000_000.0),
        stock("BOAB",  "Bank of Africa Bénin", "Banques", "BJ",
            8_850.0,  8_850.0,  490,   88_500_000_000.0),
        stock("BOABF", "Bank of Africa Burkina Faso", "Banques", "BF",
            5_650.0,  5_650.0,  0,     56_500_000_000.0),
        stock("BOAC",  "Bank of Africa Côte d'Ivoire", "Banques", "CI",
            9_195.0,  9_190.0,  681,   91_950_000_000.0),
        stock("BOAM",  "Bank of Africa Mali", "Banques", "ML",
            4_670.0,  4_670.0,  1_731, 46_700_000_000.0),
        stock("BOAN",  "Bank of Africa Niger", "Banques", "NE",
            3_660.0,  3_660.0,  1_542, 18_300_000_000.0),
        stock("BOAS",  "Bank of Africa Sénégal", "Banques", "SN",
            7_045.0,  7_045.0,  399,   42_270_000_000.0),
        stock("CBIBF", "Coris Bank International Burkina Faso", "Banques", "BF",
            16_100.0, 16_100.0, 237,   161_000_000_000.0,
            per=null, divYield=null, eps=null, pbr=null, roe=null),
        stock("ECOC",  "Ecobank Côte d'Ivoire", "Banques", "CI",
            16_300.0, 16_300.0, 59,    130_400_000_000.0),
        stock("ETIT",  "Ecobank Transnational Incorporated Togo", "Banques", "TG",
            29.0,     29.0,     197_493, 353_000_000_000.0,
            per=7.2, divYield=3.8, eps=4.03, pbr=0.85, roe=11.8),
        stock("NSBC",  "NSIA Banque Côte d'Ivoire", "Banques", "CI",
            13_900.0, 13_900.0, 0,     139_000_000_000.0),
        stock("ORGT",  "Oragroup Togo", "Banques", "TG",
            3_295.0,  3_250.0,  4_734, 131_800_000_000.0),
        stock("SGBC",  "Société Générale Côte d'Ivoire", "Banques", "CI",
            34_095.0, 34_095.0, 0,     852_375_000_000.0),
        stock("SIBC",  "Société Ivoirienne de Banque Côte d'Ivoire", "Banques", "CI",
            7_080.0,  7_080.0,  503,   70_800_000_000.0),

        // ─── TÉLÉCOMMUNICATIONS ───────────────────────────────────────────────
        stock("ONTBF", "Onatel Burkina Faso", "Télécommunications", "BF",
            2_795.0,  2_795.0,  510,   139_750_000_000.0),
        stock("ORAC",  "Orange Côte d'Ivoire", "Télécommunications", "CI",
            15_200.0, 15_200.0, 105,   760_000_000_000.0),
        stock("SNTS",  "Sonatel Sénégal", "Télécommunications", "SN",
            28_700.0, 28_700.0, 274,   861_000_000_000.0),

        // ─── ÉNERGIE ──────────────────────────────────────────────────────────
        stock("CIEC",  "CIE Côte d'Ivoire", "Énergie", "CI",
            3_185.0,  3_250.0,  2_850, 159_250_000_000.0),
        stock("SHEC",  "Vivo Energy Côte d'Ivoire", "Énergie", "CI",
            2_000.0,  1_970.0,  354,   100_000_000_000.0),
        stock("TTLC",  "TotalEnergies Marketing Côte d'Ivoire", "Énergie", "CI",
            2_740.0,  2_740.0,  3_625, 136_000_000_000.0),
        stock("TTLS",  "TotalEnergies Marketing Sénégal", "Énergie", "SN",
            3_250.0,  3_250.0,  1_133, 48_750_000_000.0),

        // ─── AGRO-INDUSTRIE ───────────────────────────────────────────────────
        stock("NTLC",  "Nestlé Côte d'Ivoire", "Agro-industrie", "CI",
            12_340.0, 12_340.0, 683,   24_680_000_000.0),
        stock("PALC",  "Palm Côte d'Ivoire", "Agro-industrie", "CI",
            7_310.0,  7_310.0,  0,     365_500_000_000.0),
        stock("SAFC",  "SAFCA Côte d'Ivoire", "Agro-industrie", "CI",
            3_610.0,  3_610.0,  0,     36_100_000_000.0),
        stock("SCRC",  "Sucrivoire Côte d'Ivoire", "Agro-industrie", "CI",
            1_990.0,  1_990.0,  0,     59_700_000_000.0),
        stock("SICC",  "SICOR Côte d'Ivoire", "Agro-industrie", "CI",
            4_290.0,  4_290.0,  0,     42_900_000_000.0),
        stock("SLBC",  "Solibra Côte d'Ivoire", "Agro-industrie", "CI",
            36_000.0, 35_540.0, 5,     72_000_000_000.0),
        stock("SOGC",  "SOGB Côte d'Ivoire", "Agro-industrie", "CI",
            7_100.0,  7_100.0,  977,   71_000_000_000.0),
        stock("SPHC",  "SAPH Côte d'Ivoire", "Agro-industrie", "CI",
            6_800.0,  6_800.0,  0,     204_000_000_000.0),
        stock("STBC",  "SITAB Côte d'Ivoire", "Agro-industrie", "CI",
            20_000.0, 19_705.0, 300,   20_000_000_000.0),

        // ─── DISTRIBUTION ─────────────────────────────────────────────────────
        stock("CFAC",  "CFAO Motors Côte d'Ivoire", "Distribution", "CI",
            1_430.0,  1_430.0,  475,   14_300_000_000.0),
        stock("PRSC",  "Tractafric Motors Côte d'Ivoire", "Distribution", "CI",
            4_600.0,  4_600.0,  0,     23_000_000_000.0),
        stock("SDSC",  "Africa Global Logistics Côte d'Ivoire", "Distribution", "CI",
            1_775.0,  1_775.0,  3_457, 17_750_000_000.0),
        stock("UNLC",  "Unilever Côte d'Ivoire", "Distribution", "CI",
            60_500.0, 60_500.0, 0,     181_500_000_000.0),

        // ─── INDUSTRIE ────────────────────────────────────────────────────────
        stock("CABC",  "Sicable Côte d'Ivoire", "Industrie", "CI",
            3_600.0,  3_600.0,  1_144, 18_000_000_000.0),
        stock("FTSC",  "Filtisac Côte d'Ivoire", "Industrie", "CI",
            2_195.0,  2_195.0,  363,   21_950_000_000.0),
        stock("SEMC",  "Eviosys Packaging Siem Côte d'Ivoire", "Industrie", "CI",
            1_595.0,  1_600.0,  1_851, 15_950_000_000.0),
        stock("SIVC",  "Erium Côte d'Ivoire", "Industrie", "CI",
            2_785.0,  2_785.0,  636,   27_850_000_000.0),
        stock("SMBC",  "SMB Côte d'Ivoire", "Industrie", "CI",
            11_500.0, 11_700.0, 184,   23_000_000_000.0),
        stock("UNXC",  "Uniwax Côte d'Ivoire", "Industrie", "CI",
            1_895.0,  1_900.0,  560,   18_950_000_000.0),

        // ─── SERVICES ─────────────────────────────────────────────────────────
        stock("ABJC",  "Servair Abidjan Côte d'Ivoire", "Services", "CI",
            3_215.0,  3_215.0,  0,     32_150_000_000.0),
        stock("LNBB",  "Loterie Nationale du Bénin", "Services", "BJ",
            3_900.0,  3_850.0,  1_989, 39_000_000_000.0),
        stock("NEIC",  "NEI-CEDA Côte d'Ivoire", "Services", "CI",
            1_900.0,  1_900.0,  975,   9_500_000_000.0),
        stock("SDCC",  "SODE Côte d'Ivoire", "Services", "CI",
            8_995.0,  8_995.0,  0,     89_950_000_000.0),

        // ─── BTP ──────────────────────────────────────────────────────────────
        stock("BNBC",  "Bernabé Côte d'Ivoire", "BTP", "CI",
            1_565.0,  1_565.0,  0,     15_650_000_000.0),
        stock("STAC",  "SETAO Côte d'Ivoire", "BTP", "CI",
            3_030.0,  3_050.0,  49,    30_300_000_000.0)
    )

    private fun stock(
        ticker: String, name: String, sector: String, country: String,
        lastPrice: Double, prevClose: Double, vol: Long, marketCap: Double,
        per: Double? = null, divYield: Double? = null,
        eps: Double? = null, pbr: Double? = null, roe: Double? = null
    ) = StockEntity(
        ticker = ticker, name = name, sector = sector, country = country,
        lastPrice = lastPrice, previousClose = prevClose,
        openPrice = prevClose + (lastPrice - prevClose) * 0.3,
        highPrice = maxOf(lastPrice, prevClose) * 1.005,
        lowPrice = minOf(lastPrice, prevClose) * 0.995,
        volume = vol, averageVolume20d = (vol * 0.9).toLong(),
        marketCap = marketCap, peRatio = per, dividendYield = divYield,
        eps = eps, bookValue = if (pbr != null && pbr > 0) lastPrice / pbr else null,
        priceToBook = pbr, roe = roe, debtToEquity = null,
        revenueGrowth = null, netIncomeGrowth = null,
        lastUpdated = System.currentTimeMillis()
    )

    /** Événements BRVM 2026 — AGO, dividendes, résultats — pour peupler le calendrier. */
    fun seedEarningsEvents(): List<EarningsEvent> {
        fun date(y: Int, m: Int, d: Int) = LocalDate.of(y, m, d).toEpochDay() * 86400L
        return listOf(
            // ── AGO mai-juin 2026 ──
            EarningsEvent(0, "ETIT",  "Ecobank Transnational Incorporated Togo",
                EarningsEvent.EventType.AGO,               date(2026,5,15), "2025",
                null,null,null,null, null,null,null, "AGO — exercice 2025"),
            EarningsEvent(0, "SGBC",  "Société Générale Côte d'Ivoire",
                EarningsEvent.EventType.AGO,               date(2026,5,20), "2025",
                null,null,null,null, null,null,null, "AGO — exercice 2025"),
            EarningsEvent(0, "ONTBF", "Onatel Burkina Faso",
                EarningsEvent.EventType.AGO,               date(2026,5,27), "2025",
                null,null,null,null, null,null,null, "AGO — exercice 2025"),
            EarningsEvent(0, "CBIBF", "Coris Bank International Burkina Faso",
                EarningsEvent.EventType.AGO,               date(2026,6,4),  "2025",
                null,null,null,null, null,null,null, "AGO — exercice 2025"),
            EarningsEvent(0, "BICC",  "BICI Côte d'Ivoire",
                EarningsEvent.EventType.AGO,               date(2026,6,10), "2025",
                null,null,null,null, null,null,null, "AGO — exercice 2025"),
            EarningsEvent(0, "BOABF", "Bank of Africa Burkina Faso",
                EarningsEvent.EventType.AGO,               date(2026,6,12), "2025",
                null,null,null,null, null,null,null, "AGO — exercice 2025"),
            EarningsEvent(0, "ORGT",  "Oragroup Togo",
                EarningsEvent.EventType.AGO,               date(2026,6,18), "2025",
                null,null,null,null, null,null,null, "AGO — exercice 2025"),
            EarningsEvent(0, "NSBC",  "NSIA Banque Côte d'Ivoire",
                EarningsEvent.EventType.AGO,               date(2026,6,25), "2025",
                null,null,null,null, null,null,null, "AGO — exercice 2025"),
            EarningsEvent(0, "PALC",  "Palm Côte d'Ivoire",
                EarningsEvent.EventType.AGO,               date(2026,6,30), "2025",
                null,null,null,null, null,null,null, "AGO — exercice 2025"),
            // ── Dividendes juin-août 2026 ──
            EarningsEvent(0, "SGBC",  "Société Générale Côte d'Ivoire",
                EarningsEvent.EventType.DIVIDEND_ANNOUNCEMENT, date(2026,6,5), "2025",
                null,null,null,null, 370.0, date(2026,6,5), date(2026,6,30),
                "Dividende 370 FCFA/action — exercice 2025"),
            EarningsEvent(0, "ONTBF", "Onatel Burkina Faso",
                EarningsEvent.EventType.DIVIDEND_ANNOUNCEMENT, date(2026,6,15), "2025",
                null,null,null,null, 870.0, date(2026,6,15), date(2026,7,10),
                "Dividende 870 FCFA/action — exercice 2025"),
            EarningsEvent(0, "ETIT",  "Ecobank Transnational Incorporated Togo",
                EarningsEvent.EventType.DIVIDEND_ANNOUNCEMENT, date(2026,6,20), "2025",
                null,null,null,null, 1.1, date(2026,6,20), date(2026,7,15),
                "Dividende 1,1 FCFA/action — exercice 2025"),
            EarningsEvent(0, "PALC",  "Palm Côte d'Ivoire",
                EarningsEvent.EventType.DIVIDEND_ANNOUNCEMENT, date(2026,7,10), "2025",
                null,null,null,null, 550.0, date(2026,7,10), date(2026,8,1),
                "Dividende 550 FCFA/action — exercice 2025"),
            EarningsEvent(0, "SPHC",  "SAPH Côte d'Ivoire",
                EarningsEvent.EventType.DIVIDEND_ANNOUNCEMENT, date(2026,7,20), "2025",
                null,null,null,null, 800.0, date(2026,7,20), date(2026,8,10),
                "Dividende 800 FCFA/action — exercice 2025"),
            EarningsEvent(0, "CBIBF", "Coris Bank International Burkina Faso",
                EarningsEvent.EventType.DIVIDEND_ANNOUNCEMENT, date(2026,7,5), "2025",
                null,null,null,null, 400.0, date(2026,7,5), date(2026,7,25),
                "Dividende 400 FCFA/action — exercice 2025"),
            // ── Résultats S1 2026 ──
            EarningsEvent(0, "SGBC",  "Société Générale Côte d'Ivoire",
                EarningsEvent.EventType.SEMI_ANNUAL_RESULTS, date(2026,8,28), "S1-2026",
                null,null,null,null, null,null,null, "Publication résultats S1 2026"),
            EarningsEvent(0, "ONTBF", "Onatel Burkina Faso",
                EarningsEvent.EventType.SEMI_ANNUAL_RESULTS, date(2026,8,20), "S1-2026",
                null,null,null,null, null,null,null, "Publication résultats S1 2026"),
            EarningsEvent(0, "ETIT",  "Ecobank Transnational Incorporated Togo",
                EarningsEvent.EventType.SEMI_ANNUAL_RESULTS, date(2026,9,5),  "S1-2026",
                null,null,null,null, null,null,null, "Publication résultats S1 2026"),
            EarningsEvent(0, "BICC",  "BICI Côte d'Ivoire",
                EarningsEvent.EventType.SEMI_ANNUAL_RESULTS, date(2026,9,10), "S1-2026",
                null,null,null,null, null,null,null, "Publication résultats S1 2026"),
            EarningsEvent(0, "CBIBF", "Coris Bank International Burkina Faso",
                EarningsEvent.EventType.SEMI_ANNUAL_RESULTS, date(2026,9,15), "S1-2026",
                null,null,null,null, null,null,null, "Publication résultats S1 2026"),
            // ── Conseils d'administration ──
            EarningsEvent(0, "SGBC",  "Société Générale Côte d'Ivoire",
                EarningsEvent.EventType.BOARD_MEETING,     date(2026,11,12), "Q3-2026",
                null,null,null,null, null,null,null, "Conseil d'administration — résultats Q3 2026"),
            EarningsEvent(0, "ETIT",  "Ecobank Transnational Incorporated Togo",
                EarningsEvent.EventType.BOARD_MEETING,     date(2026,11,19), "Q3-2026",
                null,null,null,null, null,null,null, "Conseil d'administration — résultats Q3 2026")
        )
    }

    /** Génère 365 jours d'historique de prix simulé (mouvement Brownien géométrique). */
    fun generateHistory(ticker: String, basePrice: Double, volatility: Double = 0.015): List<PriceHistoryEntity> {
        val history = mutableListOf<PriceHistoryEntity>()
        var price = basePrice * 0.75
        val random = java.util.Random(ticker.hashCode().toLong())
        val nowDays = System.currentTimeMillis() / 86400_000L

        for (i in 365 downTo 0) {
            val drift = 0.0003
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
                    open = open, high = high, low = low, close = price, volume = vol
                )
            )
        }
        return history
    }
}
