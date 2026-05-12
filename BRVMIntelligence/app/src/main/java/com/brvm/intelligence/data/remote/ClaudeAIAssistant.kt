package com.brvm.intelligence.data.remote

import com.brvm.intelligence.BuildConfig
import com.brvm.intelligence.data.local.BRVMKnowledgeBase
import com.brvm.intelligence.domain.model.ChatMessage
import com.brvm.intelligence.domain.model.MessageRole
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ClaudeAIAssistant @Inject constructor(
    private val knowledgeBase: BRVMKnowledgeBase,
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val apiKey: String get() = BuildConfig.ANTHROPIC_API_KEY
    private val hasApiKey: Boolean get() = apiKey.isNotBlank() && apiKey != "NONE"

    suspend fun ask(
        question: String,
        history: List<ChatMessage>,
        marketContext: String = "",
    ): String = withContext(Dispatchers.IO) {
        if (hasApiKey) {
            try {
                return@withContext callClaudeApi(question, history, marketContext)
            } catch (e: Exception) {
                Timber.w(e, "Claude API error — fallback heuristic")
            }
        }
        return@withContext enhancedHeuristicResponse(question, history)
    }

    // ── Claude API ────────────────────────────────────────────────────────────────────────

    private fun callClaudeApi(
        question: String,
        history: List<ChatMessage>,
        marketContext: String,
    ): String {
        val messages = JSONArray()
        history.takeLast(8).forEach { msg ->
            messages.put(JSONObject().apply {
                put("role", if (msg.role == MessageRole.USER) "user" else "assistant")
                put("content", msg.content)
            })
        }
        messages.put(JSONObject().apply {
            put("role", "user")
            put("content", question)
        })

        val body = JSONObject().apply {
            put("model", "claude-haiku-4-5-20251001")
            put("max_tokens", 1024)
            put("system", buildSystemPrompt(marketContext))
            put("messages", messages)
        }

        val request = Request.Builder()
            .url("https://api.anthropic.com/v1/messages")
            .addHeader("x-api-key", apiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .addHeader("content-type", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            throw Exception("HTTP ${response.code}")
        }
        val json = JSONObject(response.body!!.string())
        return json.getJSONArray("content").getJSONObject(0).getString("text")
    }

    private fun buildSystemPrompt(marketContext: String): String {
        val knowledgeSummary = buildKnowledgeSummary()
        return """Tu es BRVM Intelligence, assistant financier expert de la Bourse Régionale des Valeurs Mobilières (BRVM) d'Afrique de l'Ouest (UEMOA).

MARCHÉ ACTUEL:
$marketContext

DONNÉES FONDAMENTALES CONNUES (PER estimés, source: rapports annuels 2022-2024):
$knowledgeSummary

EXPERTISE:
- Analyse technique: RSI (survendu<30, suracheté>70), MACD (croisements haussiers/baissiers), Bandes de Bollinger, moyennes mobiles 20/50/200j
- Valorisation: PER relatif au secteur BRVM, Gordon Growth Model pour dividendes, position range 52 semaines
- Spécificités BRVM: faible liquidité (~40% des titres échangent <100 titres/jour), saisonnalité dividendes (jan-mars après AG), corrélation matières premières (cacao, caoutchouc, palme, pétrole)
- UEMOA: risque politique, taux BCEAO (~3.5%), taux de change CFA/EUR stable
- Secteurs: Finance (40% capitalisation), Télécoms (SNTS, ONTBF, ORAC), Agriculture (PALC, SOGC, SPHC, SAFC), Distribution (CFAC, TTLC, UNLC), Services Publics (CIEC, SDCC), Industrie

RÈGLES:
1. Réponds en français, sois précis et concis
2. Pour une action: structure = Signal technique → Valorisation fondamentale → Risques spécifiques → Recommandation
3. Si RSI ou MACD mentionné: explique le signal en termes simples
4. Distingue toujours trading court terme vs investissement long terme
5. Pour les titres illiquides (ABJC, FTSC, NEIC…): avertis sur le risque de revente
6. Inclus toujours: *⚠️ Non-conseil financier. Consulter un conseiller AMF-UMOA.*
7. Si tu ne sais pas, dis-le clairement. Ne fabrique pas de données."""
    }

    private fun buildKnowledgeSummary(): String {
        val withPer = knowledgeBase.getAllProfiles().values
            .filter { it.estimatedPer != null || it.estimatedDividendYield != null }
            .joinToString("\n") { p ->
                val per = p.estimatedPer?.let { "PER~${it}x" } ?: ""
                val div = p.estimatedDividendYield?.let { "div~${it}%" } ?: ""
                "${p.symbol} (${p.fullName}): $per $div [${p.perAsOf ?: "~"}]"
            }
        return withPer.ifBlank { "Données fondamentales limitées — utiliser PER sectoriels moyens." }
    }

    // ── Heuristique enrichie (fallback sans API) ──────────────────────────────────

    private fun enhancedHeuristicResponse(question: String, history: List<ChatMessage>): String {
        val q = question.lowercase()

        val mentionedSymbol = knowledgeBase.getAllProfiles().keys
            .firstOrNull { q.contains(it.lowercase()) }

        if (mentionedSymbol != null) {
            return respondAboutStock(mentionedSymbol, q)
        }

        return when {
            q.contains("rsi") -> answerRsi()
            q.contains("macd") -> answerMacd()
            q.contains("bollinger") -> answerBollinger()
            q.contains("per") || q.contains("p/e") || q.contains("valoris") -> answerValuation()
            q.contains("dividende") || q.contains("dividends") -> answerDividend()
            q.contains("acheter") || q.contains("achat") || q.contains("investir") -> answerBuy()
            q.contains("vendre") || q.contains("vente") || q.contains("sortir") -> answerSell()
            q.contains("risque") || q.contains("risk") -> answerRisk()
            q.contains("liqui") -> answerLiquidity()
            q.contains("brvm") && (q.contains("indice") || q.contains("composite") || q.contains("marché")) -> answerIndex()
            q.contains("portef") -> answerPortfolio()
            q.contains("sector") || q.contains("secteur") -> answerSectors()
            q.contains("stop") || q.contains("loss") -> answerStopLoss()
            q.contains("diversi") -> answerDiversification()
            else -> answerDefault()
        }
    }

    private fun respondAboutStock(symbol: String, question: String): String {
        val profile = knowledgeBase.getProfile(symbol) ?: return answerDefault()
        val per = profile.estimatedPer?.let { "**PER estimé : ${it}x** (${profile.perAsOf ?: "~"})" } ?: "PER : données non disponibles"
        val div = profile.estimatedDividendYield?.let { "**Dividende estimé : ${it}%**" } ?: "Dividende : non renseigné"
        val notesText = profile.notes?.let { "\n\n📌 $it" } ?: ""

        return """**${profile.fullName} (${profile.symbol})**

🏢 **Activité** : ${profile.activity}
🌍 **Pays** : ${profile.country} — Secteur : ${profile.sector}

📊 **Valorisation fondamentale**
$per
$div$notesText

${getFundamentalCommentary(profile)}

*⚠️ Ces données sont des estimations basées sur les rapports annuels publiés. Vérifiez les derniers résultats sur brvm.org. Non-conseil financier AMF-UMOA.*"""
    }

    private fun getFundamentalCommentary(profile: com.brvm.intelligence.data.local.CompanyProfile): String {
        val per = profile.estimatedPer
        val div = profile.estimatedDividendYield
        return when {
            per != null && div != null && div >= 5.0 -> """✅ **Profil : Valeur de rendement**
Combine valorisation raisonnable (PER ${per}x) et dividende attractif (${div}%). Convient à un portefeuille orienté revenus."""
            per != null && per < 9.0 -> """💡 **Profil : Valeur potentiellement décotée**
PER inférieur à la moyenne sectorielle. À surveiller si les fondamentaux sont solides."""
            per != null && per > 15.0 -> """⚡ **Profil : Valeur de croissance**
PER élevé — le marché anticipe une forte croissance. Risque de déception si les bénéfices déçoivent."""
            else -> """ℹ️ Données fondamentales insuffisantes pour un jugement de valorisation fiable. Consultez les rapports annuels sur AMF-UMOA."""
        }
    }

    private fun answerRsi() = """**RSI (Relative Strength Index) — Explication**

Le RSI mesure la vitesse et l'amplitude des variations de cours sur 14 séances.

📊 **Lecture :**
- **RSI < 30** → Survendu 🟢 : potentiel rebond, signal d'achat possible
- **RSI 30-70** → Zone neutre : pas de signal fort
- **RSI > 70** → Suracheté 🔴 : risque de correction, attention à l'achat

⚠️ **Attention sur la BRVM** : la faible liquidité de nombreux titres peut fausser le RSI. Un RSI bas sur un titre illiquide ne signifie pas forcément une opportunité d'achat.

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerMacd() = """**MACD (Moving Average Convergence Divergence) — Explication**

Le MACD compare deux moyennes mobiles exponentielles (12 et 26 jours) et génère des signaux via une ligne de signal (9 jours).

📊 **Signaux clés :**
- **Croisement haussier** (MACD passe au-dessus de la signal) → Signal d'achat 🟢
- **Croisement baissier** (MACD passe en dessous) → Signal de vente 🔴
- **Histogramme positif et croissant** → Momentum haussier fort
- **Divergence** (cours monte mais MACD baisse) → Signe d'essoufflement

💡 Sur la BRVM, le MACD est plus fiable sur les titres liquides comme ETIT, SNTS, SGBC, ORAC.

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerBollinger() = """**Bandes de Bollinger — Explication**

Les bandes de Bollinger encadrent le cours par ±2 écarts-types autour d'une moyenne mobile 20 jours.

📊 **Interprétation :**
- **Cours proche de la bande inférieure** → Zone survendue potentielle 🟢
- **Cours proche de la bande supérieure** → Zone suracheté potentielle 🔴
- **Rétrécissement des bandes (squeeze)** → Faible volatilité, une explosion de cours est probable
- **Élargissement des bandes** → Forte volatilité en cours

💡 Sur la BRVM, le squeeze est fréquent sur les titres peu liquides. Attendre la confirmation directionnelle avant d'agir.

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerValuation() = """**Valorisation fondamentale sur la BRVM**

📊 **PER (Price Earnings Ratio) — Référentiels sectoriels BRVM :**
| Secteur | PER moyen |
|---------|-----------|
| Finance (banques) | 8-11x |
| Télécommunications | 11-15x |
| Agriculture | 9-13x |
| Distribution | 12-16x |
| Services Publics | 8-11x |
| Industrie | 9-13x |

💡 **Interprétation :**
- **PER < moyenne secteur** → Potentiellement sous-valorisé (ou problème de bénéfices)
- **PER > 1.3x moyenne secteur** → Prime de valorisation ou euphorie
- **PER négatif** → L'entreprise est en perte

⚠️ Limitation : le PER n'est pas publié par la BRVM pour tous les titres. Consultez les rapports annuels sur le site de l'AMF-UMOA.

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerDividend() = """**Dividendes sur la BRVM**

📅 **Calendrier typique :**
- Les AG (Assemblées Générales) se tiennent généralement **janvier à avril**
- Les dividendes sont détachés **dans les semaines suivant l'AG**
- La période **janvier-mars** est historiquement favorable (afflux d'acheteurs)

💰 **Meilleurs rendements dividende estimés :**
- **SNTS (Sonatel)** : ~6-7%
- **CIEC (CIE)** : ~6%
- **SDCC (SODECI)** : ~5.5%
- **ONTBF (Onatel BF)** : ~5.5%
- **SOGC (SOGB)** : ~5%
- **SGBC** : ~4.5%

📌 **À savoir** : Sur la BRVM, certains titres n'ont pas versé de dividende depuis plusieurs années. Vérifiez l'historique sur brvm.org.

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerBuy() = """**Critères pour investir sur la BRVM**

Avant tout achat, vérifiez ces 4 piliers :

1. **Signal technique** 📊
   - RSI < 40 (non suracheté)
   - MACD haussier ou en train de croiser
   - Cours au-dessus de la MA20

2. **Valorisation fondamentale** 💰
   - PER < ou = moyenne sectorielle
   - Dividende attractif si horizon long terme
   - Position dans le bas de la range 52 semaines

3. **Liquidité** 💧
   - Volume quotidien > 100 titres (sinon risque de blocage)
   - Écart bid/ask raisonnable

4. **Contexte macro** 🌍
   - Saison des dividendes (jan-mars) favorable
   - Pas de crise politique dans le pays d'origine
   - Matières premières favorables (cacao, caoutchouc, palme, pétrole)

*⚠️ Non-conseil financier AMF-UMOA. Consultez un conseiller agréé.*"""

    private fun answerSell() = """**Signaux de vente sur la BRVM**

🔴 **Signaux techniques de sortie :**
- RSI > 70 (suracheté)
- Croisement MACD baissier
- Rupture d'un support important
- Cours sous la MA200 (tendance baissière)

📉 **Signaux fondamentaux :**
- Chute des bénéfices / perte annoncée
- Suppression ou réduction du dividende
- Changement négatif de la direction

⚠️ **Attention spécifique BRVM :**
- Sur les titres illiquides, la vente peut prendre plusieurs jours ou semaines
- Évitez de vendre dans la panique sur un titre peu liquide
- Définissez un stop-loss AVANT d'entrer en position

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerRisk() = """**Risques spécifiques de la BRVM**

⚠️ **Risques de marché :**
- **Faible liquidité** : ~60% des titres échangent moins de 500 titres/jour. Sortie difficile
- **Concentration sectorielle** : Finance représente ~40% de la capitalisation
- **Matières premières** : Agriculture et industrie très corrélées (cacao, caoutchouc, palme, pétrole)

🌍 **Risques politiques :**
- Pays exposés : Mali, Burkina Faso, Niger (instabilité politique récente)
- Impact sur les filiales bancaires (BOAM, BOABF, BOAN, LNBB)

💱 **Risques de change :**
- Le CFA (XOF) est arrimé à l'Euro → stabilité vs USD variable
- Rapatriement de dividendes en devises peut être restreint

📊 **Risques de valorisation :**
- Données fondamentales peu disponibles (PER publié rarement)
- Rapports financiers parfois tardifs

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerLiquidity() = """**Liquidité sur la BRVM**

La liquidité mesure la facilité à acheter/vendre un titre sans impacter son cours.

📊 **Classification indicative :**
| Niveau | Volume quotidien | Exemples |
|--------|-----------------|-------|
| 🟢 Élevée | > 5 000 titres/j | ETIT, SNTS, SGBC, ORAC |
| 🟡 Normale | 500-5 000 | ONTBF, PALC, BICC, BOAB |
| 🟠 Faible | 100-500 | SOGC, STAC, TTLC |
| 🔴 Très faible | < 100 | ABJC, FTSC, NEIC, SICC |

💡 **Règle pratique** : N'investissez jamais plus de 10% de votre portefeuille dans un titre à faible liquidité.

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerIndex() = """**Indices BRVM**

📈 **BRVM Composite** :
- Suit l'ensemble des actions cotées, pondérées par la capitalisation boursière
- Calculé quotidiennement par la BRVM à Abidjan
- Base 100 = 1998 (création de la BRVM)

📈 **BRVM 10** :
- Les 10 plus grandes capitalisations (ETIT, SNTS, SGBC, ORAC, ONTBF…)
- Plus représentatif des titres liquides
- Bon baromètre de la santé du marché

🕐 **Séances** : Lundi-vendredi, 9h00-15h30 WAT (UTC+1)

📊 **Composition typique BRVM 10** : ~40% Finance, ~30% Télécoms, ~15% Agriculture, ~15% autres

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerPortfolio() = """**Gestion de portefeuille sur la BRVM**

📊 **Allocation sectorielle recommandée :**
| Secteur | Allocation cible |
|---------|----------------|
| Finance | 30-35% |
| Télécommunications | 20-25% |
| Agriculture | 15-20% |
| Distribution | 10-15% |
| Services Publics | 5-10% |
| Industrie | 5-10% |

💡 **Règles d'or BRVM :**
1. Pas plus de 25% sur un seul titre
2. Minimum 5 titres différents, idéalement 8-12
3. Prioriser les titres liquides (> 500 titres/j)
4. Mélanger valeurs de rendement (dividende) et croissance
5. Garder 10-20% de liquidités pour saisir les opportunités

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerSectors() = """**Secteurs de la BRVM**

🏦 **Finance (~40% de la capi)** : Banques BOA, BICI, SIB, SG, Ecobank, NSIA. PER moyen : 8-11x. Dividendes réguliers.

📡 **Télécommunications** : SNTS (Sonatel), ONTBF (Onatel), ORAC (Orange CI), ORGT (Orange Togo). PER : 11-15x. Forte croissance Mobile Money.

🌿 **Agriculture** : PALC (palme), SOGC/SPHC (hévéa), SAFC (cacao). PER : 9-13x. Corrélés aux matières premières.

🛒 **Distribution** : CFAC (auto/conso), TTLC/TTLS (Total), UNLC (Unilever). PER : 12-18x.

⚡ **Services Publics** : CIEC (électricité CI), SDCC (eau CI). Revenus réglementés, dividendes stables. PER : 8-11x.

🏻 **Industrie** : SIVC (raffinage), STAC (tabac), SEMC (emballages). PER variable.

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerStopLoss() = """**Stop-Loss sur la BRVM**

Le stop-loss limite vos pertes en définissant un prix de sortie automatique.

📐 **Méthodes de calcul :**
1. **Technique** : juste en dessous du dernier support identifié (-2 à -3%)
2. **Pourcentage fixe** : -7% à -10% du prix d'achat (tolérance BRVM recommandée)
3. **ATR** : 1.5x l'Average True Range sur 14j

⚠️ **Spécificité BRVM** :
- Sur les titres peu liquides, le stop peut ne pas s'exécuter au prix voulu
- Évitez les stop trop serrés (<5%) sur les titres à faible volume

💡 **Règle pratique** : Ne risquez jamais plus de **2% de votre capital total** sur une seule position.

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerDiversification() = """**Diversification sur la BRVM**

Sur un marché de 47 titres avec une faible liquidité, la diversification est essentielle.

✅ **Bonne diversification :**
- **Géographique** : Côte d'Ivoire, Sénégal, Burkina Faso, Bénin, Togo
- **Sectorielle** : Finance + Télécoms + Agriculture minimum
- **Liquidité** : Mix titres liquides (ETIT, SNTS) + moins liquides
- **Horizon** : Mix rendement (dividende) + croissance

❌ **À éviter :**
- > 30% sur un seul secteur (surtout Finance)
- > 25% sur un seul titre
- Concentration sur pays politiquement instables (Mali, BF, Niger)

💡 **Portefeuille de départ recommandé (5 titres minimum) :**
ETIT + SNTS + PALC + CIEC + SGBC couvre Finance/Télécoms/Agro/Utilitaires.

*⚠️ Non-conseil financier AMF-UMOA.*"""

    private fun answerDefault() = """**BRVM Intelligence — Assistant Financier BRVM**

Je suis spécialisé dans la Bourse Régionale des Valeurs Mobilières (BRVM) d'Afrique de l'Ouest.

📌 **Je peux vous aider sur :**
- L'analyse d'une action spécifique (tapez son symbole : SNTS, ETIT, PALC…)
- L'explication d'un indicateur technique (RSI, MACD, Bollinger)
- La valorisation fondamentale (PER, dividendes)
- La stratégie de portefeuille BRVM
- Les risques spécifiques au marché UEMOA
- Les secteurs et les indices BRVM

\ud83d� **Exemples de questions :**
- "Analyse SGBC pour moi"
- "Comment lire le RSI ?"
- "Quels titres ont le meilleur dividende ?"
- "Comment gérer les risques sur la BRVM ?"

*⚠️ Informations à titre indicatif. Non-conseil financier réglementé AMF-UMOA.*"""
}
