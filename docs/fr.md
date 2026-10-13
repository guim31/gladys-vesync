# VeSync (Levoit)

Cette intégration pilote depuis Gladys les appareils de l'application **VeSync** : les
**purificateurs d'air** et les **humidificateurs Levoit**, et les **prises connectées Etekcity**.
Elle passe par le cloud VeSync, comme l'application et comme l'intégration Home Assistant.

> **Développée sans le matériel** ni compte VeSync : le code reprend fidèlement la bibliothèque
> pyvesync (utilisée par Home Assistant) et ses réponses enregistrées, mais n'a pas encore été
> essayé sur un vrai appareil. Vos retours sont les bienvenus sur
> [GitHub](https://github.com/guim31/gladys-vesync/issues).

Sans lien avec VeSync, Levoit ou Etekcity : les marques appartiennent à leurs propriétaires.

## Présentation

- Chaque purificateur, humidificateur ou prise de votre compte VeSync apparaît dans l'onglet
  **Découverte** ; vous ajoutez à Gladys ceux que vous voulez.
- Les états se mettent à jour toutes les minutes (réglable) ; une commande depuis Gladys est
  appliquée tout de suite.
- Deux **déclencheurs de scène** : « Filtre de purificateur à changer » et « Réservoir
  d'humidificateur vide ».
- Un **widget** de tableau de bord : qualité de l'air et appareils principaux.

## Prérequis

- Gladys **5.1.0** ou plus récent.
- Un compte VeSync (e-mail et mot de passe) où vos appareils sont déjà installés avec
  l'application VeSync. Un compte créé avec Google ou Apple n'a pas de mot de passe : ajoutez-en
  un dans l'application (Profil, Compte) avant de configurer l'intégration.
- Gladys doit pouvoir joindre Internet : l'intégration parle au cloud VeSync
  (`smartapi.vesync.eu` en Europe, `smartapi.vesync.com` aux États-Unis), jamais aux appareils
  eux-mêmes.

## Installation

1. Dans Gladys, ouvrez **Intégrations**, puis **Installer depuis GitHub**.
2. Collez l'adresse `https://github.com/guim31/gladys-vesync` et validez.
3. Ouvrez l'intégration une fois installée : l'onglet **Configuration** s'affiche.

## Configuration

| Champ                              | Rôle                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| E-mail VeSync                      | l'e-mail de votre compte VeSync                                                                                        |
| Mot de passe VeSync                | son mot de passe ; il reste dans la configuration de Gladys, jamais dans les journaux                                  |
| Région du compte                   | Europe (par défaut) ou États-Unis ; un mauvais choix est corrigé à la connexion et signalé par « Tester la connexion » |
| Intervalle de rafraîchissement (s) | secondes entre deux lectures de chaque appareil ajouté, 60 au minimum (par défaut)                                     |
| Seuil d'alerte du filtre (%)       | le déclencheur « filtre à changer » part quand un filtre descend à cette valeur (10 % par défaut)                      |
| Langue des noms de fonctionnalités | langue des noms donnés aux fonctionnalités d'un appareil à son ajout, et des listes de modes (français par défaut)     |

Enregistrez, puis cliquez sur **Tester la connexion** : le message donne le nombre d'appareils du
compte, ceux qui sont pris en charge, les modèles qui ne le sont pas, et la région du compte si
elle diffère de celle choisie. En cas d'échec, la raison s'affiche en rouge.

Ouvrez ensuite l'onglet **Découverte** et ajoutez les appareils voulus. Le jeton de session VeSync
est gardé dans le volume `/data` de l'intégration : un redémarrage ne refait pas de connexion.

## Appareils

Les noms sont ceux de l'application VeSync. Les fonctionnalités dépendent du modèle.

### Purificateurs d'air

Modèles : Core 200S, Core 300S, Core 400S, Core 600S, Vital 100S, Vital 200S, EverestAir,
Sprout Air.

| Fonctionnalité         | Type                 | Détail                                                                                 |
| ---------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| Marche/arrêt           | interrupteur         |                                                                                        |
| Mode                   | liste                | Auto, Manuel, Nuit ; Animaux (Vital), Turbo (EverestAir) ; le Core 200S n'a pas d'Auto |
| Vitesse du ventilateur | niveau de 1 à 3 ou 4 | choisir une vitesse passe le purificateur en mode Manuel                               |
| PM2,5                  | capteur, µg/m³       | sauf Core 200S, qui n'a pas de capteur                                                 |
| Durée de vie du filtre | %                    | sauf Sprout Air, qui ne la donne pas                                                   |
| Verrouillage enfant    | interrupteur         |                                                                                        |
| Écran                  | interrupteur         | le réglage de l'écran (il peut s'éteindre seul dans le noir sur certains modèles)      |

La qualité de l'air (excellente, bonne, moyenne, mauvaise) est affichée par le widget.

### Humidificateurs

Modèles : Classic 200S, Classic 300S, Dual 200S, LV600S, OasisMist 450S, OasisMist 1000S,
Superior 6000S, Sprout.

| Fonctionnalité  | Type                 | Détail                                                   |
| --------------- | -------------------- | -------------------------------------------------------- |
| Marche/arrêt    | interrupteur         |                                                          |
| Humidité        | capteur, %           | l'humidité mesurée par l'appareil                        |
| Humidité cible  | liste de 30 % à 80 % | l'humidité visée en mode Auto                            |
| Mode            | liste                | Auto, Manuel ; Nuit et Humidité selon le modèle          |
| Niveau de brume | niveau de 1 à 2 ou 9 | Dual 200S et Sprout : 2 niveaux, les autres : 9          |
| Réservoir d'eau | état du niveau       | « Faible » quand le réservoir est vide, « Normal » sinon |

### Prises

| Modèle                                       | Fonctionnalités                                                     |
| -------------------------------------------- | ------------------------------------------------------------------- |
| Etekcity 10 A (ESW01, ESW03, EU et US), 15 A | Marche/arrêt, Puissance (W), Tension (V), Énergie aujourd'hui (kWh) |
| Etekcity ESW10                               | Marche/arrêt                                                        |

« Énergie aujourd'hui » est l'énergie du jour donnée par VeSync : elle repart de zéro chaque jour.

Quand un appareil n'est plus connecté au cloud VeSync (débranché, Wi-Fi perdu), son badge passe à
« injoignable » ; il revient à « cloud » dès qu'il répond.

## Widget

Le widget **Qualité de l'air VeSync** se place sur un tableau de bord (modifier le tableau de bord,
ajouter un widget). Il montre :

- une tuile par purificateur (PM2,5) et par humidificateur (humidité), six au plus, mises à jour en
  direct ;
- une ligne par appareil (dix au plus) : la qualité de l'air et le mode d'un purificateur, avec
  « filtre 8 % » quand le filtre arrive au seuil ; l'humidité et le mode d'un humidificateur, ou
  « Réservoir vide » en rouge ; l'état et la puissance d'une prise ; « Hors ligne » pour un appareil
  injoignable.

Le réglage **Seulement cet appareil** limite le widget à un appareil (un widget par pièce, par
exemple). Le widget est affiché dans la langue de l'utilisateur.

## Déclencheurs de scène

| Déclencheur                      | Quand                                                                     | Variables                                       |
| -------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Filtre de purificateur à changer | le filtre d'un purificateur descend au seuil d'alerte de la configuration | nom du purificateur, durée de vie du filtre (%) |
| Réservoir d'humidificateur vide  | un humidificateur signale son réservoir vide                              | nom de l'humidificateur                         |

Chaque déclencheur peut être limité à un appareil, ou laissé vide pour tous. Il part **une seule
fois** par passage : une fois par filtre (un filtre neuf, de nouveau au-dessus du seuil, le
réarme), une fois par réservoir vide (le remplir le réarme). L'intégration compare deux lectures
successives : un filtre déjà bas ou un réservoir déjà vide au démarrage de l'intégration ne
déclenche rien.

## Action de configuration

**Tester la connexion** (onglet Configuration) se connecte à VeSync avec les identifiants
enregistrés et relit la liste des appareils. Le message dit combien d'appareils compte le compte,
combien sont pris en charge, quels modèles ne le sont pas, et si le compte est sur l'autre région.
En cas d'échec, l'erreur s'affiche en rouge : identifiants refusés, VeSync injoignable, trop de
requêtes.

## Exemples de scènes

- **Prévenir quand le filtre est usé** : déclencheur « Filtre de purificateur à changer », action
  « Envoyer un message » : `Filtre du purificateur {{triggerEvent.data.device_name}} à changer
({{triggerEvent.data.filter_life}} %).`
- **Réservoir vide** : déclencheur « Réservoir d'humidificateur vide », action « Envoyer un
  message » : `Le réservoir de {{triggerEvent.data.device_name}} est vide.`
- **Air pollué** : déclencheur « Changement d'état d'un appareil » sur la fonctionnalité PM2,5 du
  purificateur, au-dessus de 35 µg/m³ ; actions : régler le Mode sur Auto et allumer le
  purificateur.
- **Nuit calme** : à 22 h 30, régler le Mode du purificateur de la chambre sur Nuit et éteindre son
  écran.

## Rafraîchissement et quotas

- L'intégration lit elle-même, par son propre minuteur, les appareils **ajoutés à Gladys** : un
  appareil seulement découvert n'est jamais lu. La planification du cœur de Gladys (« poll ») n'est
  qu'un secours, ignoré quand l'appareil vient d'être lu.
- Une lecture par appareil et par intervalle (60 s par défaut), les appareils l'un après l'autre,
  plus la liste des appareils toutes les 30 minutes. VeSync ne publie pas de quota : une lecture par
  minute est le rythme de l'intégration Home Assistant. Une connexion n'est refaite que quand le
  jeton expire.
- Seules les valeurs qui changent sont envoyées à Gladys, plus chaque valeur une fois toutes les
  12 heures pour qu'elle reste « récente ».
- Un mot de passe refusé arrête toute requête jusqu'à une nouvelle configuration : réessayer chaque
  minute pourrait faire bloquer le compte.

## Dépannage

- **« VeSync a refusé l'e-mail ou le mot de passe »** : vérifiez-les dans l'application VeSync
  (déconnexion, reconnexion). Un compte créé avec Google ou Apple doit d'abord recevoir un mot de
  passe.
- **« VeSync est injoignable »** : Gladys n'a pas accès à Internet, ou le cloud VeSync est en
  panne. L'intégration réessaie toute seule à chaque intervalle.
- **Un appareil manque dans la Découverte** : « Tester la connexion » liste les modèles non pris en
  charge. Un appareil retiré de l'application VeSync disparaît de la Découverte.
- **Un appareil reste « injoignable »** : il n'est plus connecté au cloud VeSync ; vérifiez-le dans
  l'application VeSync.
- **Le compte est sur l'autre région** : choisissez la région indiquée par « Tester la
  connexion ».
- **Journaux** : en temps normal, l'intégration n'écrit que le démarrage, les pertes et retours de
  connexion, et une ligne par commande. Pour tout voir, ajoutez la variable d'environnement
  `LOG_LEVEL=debug`. Ni le mot de passe ni le jeton n'y apparaissent jamais.

## Limites

- **Développée sans le matériel** : les modèles sont pris en charge d'après pyvesync et ses
  réponses enregistrées. Signalez sur GitHub tout appareil qui se comporte mal.
- Ne sont pas pris en charge : ventilateurs (colonnes, sur pied), ampoules, interrupteurs muraux,
  friteuses, thermostats, purificateurs LV-PUR131S et LV-RH131S, prises 7 A, extérieures et de
  marques partenaires. Ils sont listés par « Tester la connexion ».
- Pas de minuterie, de programmation, de veilleuse, de brume chaude, de séchage ni de réinitialisation
  du filtre : utilisez l'application VeSync pour cela.
- L'humidité cible est une liste (30 % à 80 %), Gladys n'ayant pas de consigne d'humidité.
- Tout passe par le cloud VeSync : sans Internet, ni lecture ni commande.
- Les noms de fonctionnalités sont fixés à l'ajout de l'appareil : changer la langue ensuite ne
  renomme que les listes de modes.

## Crédits

- [pyvesync](https://github.com/webdjoe/pyvesync) (MIT, Mark Perdue et contributeurs) : le
  protocole du cloud VeSync et les réponses enregistrées des tests, portés en JavaScript.
- L'intégration [Home Assistant VeSync](https://www.home-assistant.io/integrations/vesync)
  (Apache 2.0) : le comportement de référence et des réponses de test.
