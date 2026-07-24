---
name: brvm-tactique
description: >
  Compétences tactiques avancées pour l'analyse du marché BRVM (Bourse Régionale des Valeurs
  Mobilières). Regroupe 4 modules indissociables : (1) lecture des carnets d'ordres résiduels
  (ratios acheteur/vendeur, exits institutionnels, recoveries), (2) règle anti-aller-retour
  (calcul du seuil de réentrée après cession), (3) détection des signaux d'activité
  institutionnelle (méga-transactions, murs vendeurs, distorsion ETIT), (4) gestion du
  calendrier ex-dividendes (T+3, rendements brut/net, drops mécaniques, urgences).
  À déclencher dès qu'on analyse un BOC, qu'on mentionne un carnet d'ordres BRVM, une
  règle de réentrée, une méga-transaction, ETIT, un ex-dividende BRVM, ou qu'on demande
  si un titre cédé peut être racheté. Utiliser systématiquement en complément du skill
  boc-revu pour tout rapport BOC.
---

# BRVM Tactique — 4 modules d'analyse opérationnelle

Ce skill couvre les compétences analytiques de terrain qui transforment les données brutes
d'un BOC en décisions d'investissement précises. Chaque module est autonome mais
s'applique conjointement lors d'une analyse BOC complète.

---

## Module 1 — Lecture des carnets d'ordres résiduels

### Structure d'un carnet BRVM

Le carnet résiduel montre les ordres non exécutés à la clôture. C'est la radiographie des
intentions du marché — ce que le cours brut ne révèle pas.

| Qté Achat | Cours A | Cours V | Qté Vente | Cours Réf |
|-----------|---------|---------|-----------|-----------|
| 609       | 8 255   | 8 300   | 87        | 8 300     |

- **Qté Achat** : demande résiduelle non satisfaite
- **Qté Vente** : offre résiduelle non satisfaite
- **Cours Réf** : cours de clôture officiel

### Calcul du ratio

```
Ratio = max(Qté A, Qté V) / min(Qté A, Qté V)
Direction = ACHETEUR si Qté A > Qté V, VENDEUR sinon
```

### Grille de lecture

| Ratio | Signal |
|-------|--------|
| < 1.5:1 | Équilibré — pas de signal |
| 1.5–3:1 | Légère asymétrie — surveiller |
| 3–10:1 | Signal directionnel clair |
| 10–50:1 | Déséquilibre institutionnel probable |
| 50–200:1 | Accumulation ou distribution concentrée |
| > 500:1 | EXIT INSTITUTIONNEL ou DEMANDE EXPLOSIVE |

**Cas spécial "Marché" côté achat** : l'acheteur accepte tout prix disponible — urgence
liée à un catalyseur imminent (ex-div le lendemain, AG). Traiter comme signal de force maximum.

### 5 signaux à détecter

**1. Exit institutionnel → VENDRE**
Ratio vendeur > 500:1 OU mur vendeur > 5 000 titres avec peu ou pas d'acheteurs.
Un institutionnel qui sort échoue rarement en une seule séance. Il écoule sur plusieurs jours.
Le carnet résiduel trahit l'intention avant que le cours ne capitule.
*Exemple : SMBC BOC 138 — 18 470V / 3A = 6 157:1 → sortie totale recommandée.*

**2. Recovery signal → SURVEILLER (puis réévaluer)**
Carnet qui passe de vendeur dominant (>100:1) à acheteur dominant (>1.5:1) d'une séance à
l'autre, avec cours stable ou positif. Le mur vendeur a été retiré ou absorbé — la pression
a disparu. Attendre 2–3 séances de confirmation avant de réentrer.
*Exemple : STAC BOC 137 = 1 402:1 vendeur → BOC 138 = 1.7:1 acheteur.*

**3. Accumulation camouflée sur baisse → ACHETER**
Cours en baisse le jour même, mais carnet résiduel fortement acheteur (>10:1). Des
institutionnels absorbent discrètement à des prix qu'ils jugent attractifs. Le mouvement
vendeur visible en séance n'est que la surface — la réalité est à contre-courant.
*Exemple : SIBC BOC 138 — cours -1.70%, carnet 33:1 acheteur (accumulation pré-ex-div).*

**4. Distribution déguisée → ALLÉGER**
Cours en hausse, mais carnet résiduel fortement vendeur (>50:1). La hausse visible attire
des acheteurs retail qui sont utilisés pour écouler discrètement. La montée du cours est
orchestrée pour faciliter la sortie, pas pour durer.
*Exemple : ECOC BOC 138 — cours +1.18%, carnet 254:1 vendeur.*

**5. Mur vendeur persistant → SURVEILLER / ÉVITER**
Même bloc vendeur (même prix, quantité similaire) présent sur 3+ séances consécutives sans
absorption. Le vendeur teste le marché sans trouver preneur. Deux issues : absorption (signal
haussier fort) ou capitulation du vendeur à la baisse (correction imminente).
*Exemple : FSNLC.01 BOC 137 = mur 844V → BOC 138 = mur entièrement absorbé → signal haussier.*

### ETIT : exclusion systématique

ETIT génère une distorsion structurelle permanente (souvent 90–96% du volume en unités,
20% de la valeur). Son carnet résiduel (centaines de milliers de titres côté vente) n'est
pas un signal de marché — c'est une anomalie de liquidité propre à ce titre.
**TOUJOURS exclure ETIT de toutes les analyses de momentum, volume et carnet.**

---

## Module 2 — Règle anti-aller-retour

### Principe

Vendre puis racheter un titre à un prix plus élevé génère une perte nette après frais
BRVM même si le cours remonte légèrement. La règle anti-aller-retour quantifie le seuil
en dessous duquel un rachat est économiquement rationnel.

### Calcul du seuil de réentrée

```
Seuil_réentrée = Prix_vente × 0.9685
```

Le facteur 0.9685 intègre les frais de courtage et taxes BRVM (achat + vente cumulés,
environ 3.15% total selon la structure tarifaire de la place).

**Règle de décision :**
- Si **Cours_actuel < Seuil_réentrée** → rachat rationnel (on entre moins cher que le seuil de neutralité)
- Si **Cours_actuel ≥ Seuil_réentrée** → **NE PAS RE-ENTRER** (perte nette après frais garantie)

### Application systématique

À chaque BOC, pour chaque titre précédemment cédé mentionné dans le portefeuille ou dans
la conversation :

1. Retrouver le prix de vente historique
2. Calculer le seuil : `Prix_vente × 0.9685`
3. Comparer avec le cours du BOC en cours
4. Afficher le résultat explicitement dans l'analyse

**Format de présentation :**
```
[TITRE] — Anti-aller-retour
Prix de vente : X F → Seuil de réentrée : Y F (= X × 0.9685)
Cours actuel : Z F
→ [NE PAS RE-ENTRER — cours Z >> seuil Y] OU [RÉENTRÉE POSSIBLE — cours Z < seuil Y]
```

### Exemples de référence (à maintenir à jour)

| Titre | Symbole | Prix cession | Seuil réentrée | Statut |
|-------|---------|-------------|----------------|--------|
| AGL CI | SDSC | 2 510 F | 2 431 F | ÉVITER si cours > 2 431 F |
| SITAB CI | STBC | 22 235 F | 21 535 F | CONSERVER si cours > 21 535 F |

Ces seuils sont persistants tant que le titre n'a pas été racheté. Les mettre à jour si
l'utilisateur confirme une nouvelle cession ou un rachat.

### Distinction CONSERVER vs ÉVITER

- **CONSERVER** : le porteur actuel garde sa position (seuil ne s'applique qu'aux ex-porteurs)
- **ÉVITER** : pour les anciens porteurs qui veulent revenir — le seuil les bloque
- Un titre peut être ACHETER pour un nouveau porteur et ÉVITER pour un ex-porteur
  simultanément — toujours préciser pour qui s'applique la recommandation

---

## Module 3 — Signaux d'activité institutionnelle

### Méga-transactions obligataires

**Définition :** transaction unique sur une obligation supérieure à 100 000 000 FCFA
(100 millions) dans un BOC.

**Interprétation :** les institutionnels (banques, fonds, assurances, Trésors) concentrent
leurs positions obligataires en blocs pour minimiser l'impact de marché et les frais.
Une méga-transaction répétée sur le même émetteur sur 2–3 séances consécutives signale un
repositionnement de portefeuille stratégique, pas un achat opportuniste.

**Comment le détecter :** chercher dans le compartiment obligataire du BOC les lignes avec
des valeurs transigées anormalement élevées. Calculer : `Quantité × Cours unitaire`.

**Signaler :**
```
[OBLIGATION] — Méga-transaction : X titres × Y F = Z FCFA
→ Signal : repositionnement institutionnel [émetteur pays/entité]
→ Tendance : [isolée / 2e consécutive / série]
```

*Exemples : EOS.O28 BOC 137 (~1 milliard FCFA) → EOS.O27 BOC 138 (594M FCFA) —
tendance institutionnelle souveraine sénégalaise confirmée.*

### Murs vendeurs institutionnels

Un "mur vendeur" est un bloc d'ordres de vente résiduel important (>3 000 titres au même
prix) qui persiste plusieurs séances. Le distinguer d'un mur vendeur ordinaire par :
- Taille : >5 000 titres → probablement institutionnel
- Persistance : >3 séances au même prix → stratégie délibérée
- Impact prix : cours stagne ou décline malgré demande

**Deux évolutions possibles :**
- **Absorption** : le mur disparaît progressivement → haussier, signal d'acheteurs institutionnels
- **Capitulation** : le vendeur baisse son prix → baissier, cours va chuter

### Distorsion ETIT — protocole d'exclusion

ETIT crée systématiquement une distorsion du volume global de la place :
- Volume ETIT en unités : souvent 95–98% du total
- Volume ETIT en valeur : souvent 15–25% du total

**Protocole :**
1. Identifier le volume ETIT (titres × cours, ex : 3 805 473 × 75 = 285 MFCFA)
2. Soustraire du volume total pour obtenir le "volume qualitatif"
3. Toutes les analyses momentum, sectorielles et de ranking s'effectuent hors ETIT
4. Mentionner explicitement l'exclusion dans le rapport

**Format :**
```
Volume total : X titres / Y FCFA
ETIT (exclu — distorsion systémique) : A titres / B FCFA (C% unités / D% valeur)
Volume hors ETIT : (X-A) titres / (Y-B) FCFA
```

### Divergences cours/carnet — distribution déguisée

La combinaison cours haussier + carnet vendeur dominant est le signal le plus dangereux
à ne pas rater, car il est contre-intuitif. L'investisseur non averti voit la hausse et
achète. L'institutionnel profite de cette demande pour vendre.

**Déclencheurs d'alerte :**
- Cours en hausse > +0.5% ET ratio carnet vendeur > 50:1
- Volume de séance significatif ET carnet résiduel opposé à la direction du cours
- Titre ayant bénéficié d'un catalyseur la semaine précédente (AG, résultats, ex-div passé)

---

## Module 4 — Calendrier ex-dividendes BRVM

### Règle T+3 (date de règlement-livraison)

La BRVM applique un délai de règlement-livraison de 3 jours ouvrables (T+3).
Pour être actionnaire inscrit à la date de détachement et percevoir le dividende,
il faut acheter le titre **au plus tard 3 jours ouvrables avant la date d'ex-dividende**.

```
Date_dernier_achat_éligible = Date_ex_div - 3 jours ouvrables (hors week-ends et jours fériés)
```

**Attention aux jours fériés UEMOA :** les jours fériés des pays membres (Côte d'Ivoire,
Sénégal, Burkina Faso, etc.) peuvent allonger ce délai. Vérifier le calendrier.

### Rendement brut vs net

Les dividendes BRVM sont soumis à un prélèvement fiscal :
- **Personnes physiques** : abattement de **12%** sur le dividende brut
- **Personnes morales** : abattement de **10%** sur le dividende brut

```
Dividende_net_PP = Dividende_brut × (1 - 0.12) = Dividende_brut × 0.88
Dividende_net_PM = Dividende_brut × (1 - 0.10) = Dividende_brut × 0.90
```

**Rendement sur cours :**
```
Rdt_brut = (Dividende_brut / Cours_actuel) × 100
Rdt_net_PP = (Dividende_net_PP / Cours_actuel) × 100
```

Toujours préciser si le rendement cité est brut ou net, et pour qui (PP ou PM).

### Classification des urgences

Calculer l'écart entre la date du BOC et la date limite d'achat :

| Délai restant | Niveau d'urgence | Badge | Action |
|---------------|-----------------|-------|--------|
| Aujourd'hui = dernier jour | CRITIQUE | Rouge | ACHETER avant clôture |
| Demain = dernier jour | URGENT | Orange | ACHETER dès l'ouverture |
| 2–5 jours | Proche | Jaune | PLANIFIER l'achat |
| 6–15 jours | À planifier | Bleu | Surveiller |
| > 15 jours | Futur | Gris | Pas d'action immédiate |

### Anticipation du drop post-ex-div

Le lendemain de la date d'ex-dividende, le cours théorique s'ajuste à la baisse d'au moins
le montant du dividende net (souvent plus si le marché anticipe).

```
Cours_théorique_post_ex_div = Cours_veille - Dividende_net
```

**Stratégie selon le profil :**
- **Investisseur revenu** : acheter avant ex-div pour capter le dividende, accepter le drop
- **Investisseur cours** : attendre après le drop pour entrer à prix réduit
- **Porteur existant** : décision selon l'horizon — conserver si long terme, alléger avant ex-div
  si le dividende est déjà intégré dans le cours et que le drop risque d'effacer le gain

### Règle d'alerte ex-div ≤ 3 jours (critère ALLÉGER/VENDRE)

Si un titre a progressé significativement suite à l'annonce du dividende et que la date
d'ex-div est dans ≤ 3 jours, le catalyseur est considéré comme "épuisé" :

- Les acheteurs pré-ex-div ont déjà acheté → la demande va s'effondrer post-ex-div
- Le cours va baisser mécaniquement du montant du dividende à la date d'ex
- Les porteurs qui n'ont pas besoin du revenu peuvent ALLÉGER avant la date d'ex-div
  pour éviter le drop mécanique

**Exception :** si le dividende représente un rendement exceptionnel (>5% brut) et que le
titre est fondamentalement solide, conserver reste rationnel pour les porteurs long terme.

### Tableau de suivi ex-div à présenter

Pour chaque BOC, synthétiser les ex-div identifiés dans ce format :

| Émetteur | Symbole | Div. brut | Div. net PP | Rdt brut | Paiement | Dernier achat | Urgence |
|----------|---------|-----------|-------------|----------|----------|---------------|---------|
| CIE CI | CIEC | 234 F | 206 F | 4.34% | 28/07 | 23/07 | CRITIQUE |
| BIIC BN | BICB | ~289 F | 254.6 F | 3.59% | 31/07 | 24/07 | URGENT |
| SOGB CI | SOGC | 570 F | 502 F | 6.05% | 06/08 | 01/08 | À planifier |

---

## Application combinée lors d'un BOC

Quand on analyse un BOC complet, appliquer les 4 modules dans cet ordre :

1. **Dividendes** (Module 4) : identifier d'abord les urgences ex-div — ce sont les
   décisions les plus time-sensitive. Un dernier jour d'achat passé ou imminent change
   tout à la recommandation.

2. **Anti-aller-retour** (Module 2) : vérifier les titres du portefeuille déjà cédés
   avant de formuler toute recommandation de rachat. Bloquer les réentrées non rationnelles.

3. **Carnet d'ordres** (Module 1) : analyser les signaux carnet pour valider ou invalider
   les recommandations issues des fondamentaux (valorisation, momentum).

4. **Signaux institutionnels** (Module 3) : contextualiser l'ensemble — méga-transactions,
   distorsion ETIT, murs vendeurs — pour dégager la tendance de fond.

La recommandation finale pour chaque titre croise les 4 modules. Une action peut être
fondamentalement ACHETER (Module 2 : pas de seuil anti-AR) mais ÉVITER si le carnet
montre un exit institutionnel massif (Module 1) ou si l'ex-div est passé depuis 2 jours
(Module 4, drop en cours).
