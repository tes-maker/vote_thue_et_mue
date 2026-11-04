# Votes du conseil municipal – Thue et Mue

Application web pour préparer les séances du conseil municipal, saisir les présences, procurations et votes, consulter l'historique et exporter les résultats. Elle est conçue pour une seule commune : tous les comptes partagent le même registre.

**Documentation**

- [Lancer l'application en local](#lancer-lapplication-en-local)
- [Utilisation](#utilisation) et [règles de calcul](#règles-de-calcul)
- [Configuration](#configuration)
- [Architecture](#architecture) et [développement](#développement)
- [Sécurité et limites](#sécurité-et-limites)
- [Déploiement en production](docs/deploiement.md) : serveur, HTTPS, sauvegardes, restauration
- [API HTTP](endpoints.md) : routes, formats d'échange, codes d'erreur

## Aperçu des onglets

### Séance & présences — mode clair

![Gestion de la séance et des présences en mode clair](images/clair.png)

### Séance & présences — mode sombre

![Gestion de la séance et des présences en mode sombre](images/sombre.png)

### Liste des élus

![Gestion de la liste des élus](images/list.png)

## Lancer l'application en local

Cette procédure est prévue pour Ubuntu ou Debian. Elle lance l'application uniquement sur votre ordinateur ; elle ne crée pas de service systemd et ne nécessite pas Nginx. Il faut Node.js 20 ou plus récent et PostgreSQL.

Vérifiez que Node.js est installé, puis installez PostgreSQL s'il ne l'est pas déjà :

```bash
node --version
npm --version
sudo apt update
sudo apt install postgresql
```

Créez un rôle et une base réservés à l'application :

```bash
sudo -u postgres psql
```

Dans l'invite PostgreSQL, saisissez :

```sql
CREATE ROLE vote_app LOGIN;
CREATE DATABASE vote_app OWNER vote_app;
\password vote_app
\q
```

`\password` demande le mot de passe sans l'inscrire dans l'historique SQL. Pour éviter les caractères à encoder dans l'URL de connexion, vous pouvez générer un mot de passe hexadécimal avec `openssl rand -hex 16` avant d'ouvrir `psql`, puis le coller à la demande de `\password`. Si le rôle et la base existent déjà, ne relancez pas les deux commandes `CREATE` ; changez simplement le mot de passe avec `\password vote_app`.

Depuis le dossier du projet, copiez le modèle de configuration local et protégez-le :

```bash
cd /opt/vote_thue_et_mue
cp -n .env.example .env
chmod 600 .env
nano .env
```

Dans `.env`, configurez les valeurs suivantes. Gardez `NODE_ENV=development` : en local, l'application est servie en HTTP et `production` empêcherait la connexion. Remplacez le mot de passe par celui défini pour PostgreSQL et générez un secret de session neuf avec `openssl rand -hex 32` dans un autre terminal :

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
DATABASE_URL=postgresql://vote_app:MOT_DE_PASSE_POSTGRES@127.0.0.1:5432/vote_app
SESSION_SECRET=COLLER_ICI_UN_SECRET_GENERE_AVEC_OPENSSL
# Facultatif pour les intégrations serveur-à-serveur : openssl rand -hex 32
API_BEARER_TOKEN=COLLER_ICI_UN_JETON_ALEATOIRE
TRUST_PROXY=0
```

Supprimez la ligne `API_BEARER_TOKEN` si aucune intégration externe n'est nécessaire. Si vous la gardez, générez un jeton différent du secret de session avec `openssl rand -hex 32`. Enregistrez le fichier dans `nano` avec **Ctrl+O**, puis **Entrée** ; quittez avec **Ctrl+X**. Le fichier `.env` est ignoré par Git : ne le partagez pas et n'y inscrivez pas des secrets déjà divulgués.

Installez les dépendances, créez les tables et le compte administrateur :

```bash
npm ci
npm run db:migrate
npm run admin:create -- administrateur@exemple.fr
```

La commande de création du compte demande un mot de passe administrateur. Exécutez-la une seule fois pour créer ce compte. Si l'adresse existe déjà, ne relancez pas la commande : connectez-vous avec le compte existant. Pour démarrer l'application :

```bash
npm start
```

Ouvrez [http://127.0.0.1:3000](http://127.0.0.1:3000) dans votre navigateur et connectez-vous avec le compte créé. Le serveur reste actif dans le terminal ; **Ctrl+C** l'arrête. Les données sont stockées dans la base PostgreSQL locale.

L'interface est toujours servie par ce serveur Node.js : elle ne fonctionne pas en ouvrant directement `index.html` ni via `python -m http.server`.

## Utilisation

1. **Connexion.** Connectez-vous avec le compte créé par l'administrateur du serveur. Chaque onglet a sa propre adresse, que l'on peut ouvrir directement ou partager : `/presence`, `/votes`, `/confidential`, `/elus` et `/history`.
2. **Liste des élus.** **Modifier** puis **Valider** corrigent un nom ou une fonction. Le statut **En exercice / Démissionnaire** retire un membre des présences et des nouveaux votes sans supprimer ses votes déjà enregistrés.
3. **Séance & présences.** Renseignez l'intitulé, la date, le président, puis les présences et procurations. Un élu présent peut porter plusieurs procurations.
4. **Votes.** Créez chaque délibération, puis saisissez les votes. Les votants sont figés à la création de la délibération et votent « Pour » par défaut. Modifier ensuite les présences ne change donc pas un vote existant.
5. **Votes confidentiels.** Créez un scrutin, nommez autant d'options que nécessaire, puis ajoutez chaque suffrage à une option, à **Abstention** ou à **Ne prend pas part au vote**. Seuls des compteurs anonymes sont enregistrés.
6. **Archivage.** **Archiver cette séance**, en haut de l'onglet séance, crée une copie consultable dans **Historique**. Le serveur archive aussi la séance avant d'en démarrer une nouvelle. Pour corriger une séance archivée, reprenez-la depuis **Historique**, modifiez-la, puis archivez-la à nouveau : l'archive précédente est remplacée.
7. **Exports.** Ils concernent la séance en cours et ne servent pas de sauvegarde (voir [les sauvegardes](docs/deploiement.md#5-activer-les-sauvegardes-automatiques)) :
   - **Exporter les résultats (CSV)** : tableau plat séparé par des points-virgules, encodé en UTF-8 avec BOM pour Excel. Une ligne par suffrage nominatif (`ballot_type` = `nominal`) et, pour les votes confidentiels, une ligne anonyme par compteur (`confidential`). Pour un vote nominal, la colonne `result` contient un code stable, non traduit, comme `res_adopted`.
   - **Exporter en JSON** : données détaillées de la séance.

Les données sont enregistrées automatiquement sur le serveur à chaque action. Si un autre poste a modifié la séance entre-temps, l'enregistrement est refusé et un message demande de recharger la page, pour éviter d'écraser son travail.

### Règles de calcul

| Règle | Fonctionnement |
| --- | --- |
| Résultat d'un vote nominal | Adopté si les « pour » dépassent les « contre » ; abstentions et non-participations ne comptent pas. Sans aucun « pour » ni « contre », le vote n'a pas de résultat. |
| Égalité | La voix du président de séance est prépondérante. S'il s'est abstenu ou n'a pas participé, le vote est rejeté. |
| Votants | « Pour », « contre » et abstentions ; la non-participation n'en fait pas partie. |
| Quorum | Plus de la moitié des élus en exercice doivent être **présents** ; les procurations ne comptent pas. |
| Procuration | Elle ne peut être portée que par un élu présent et en exercice. Si le porteur devient absent, elle est annulée. |
| Vote confidentiel | La somme des options, abstentions et non-participations est plafonnée au nombre d'élus en exercice à la création du scrutin. |

Ces règles sont codées dans [js/votes.js](js/votes.js) et [js/state.js](js/state.js) côté navigateur, et les contraintes de cohérence sont vérifiées à nouveau par [server/schemas.js](server/schemas.js).

## Configuration

Le serveur lit le fichier `.env`, ou celui désigné par `APP_ENV_FILE`. Il refuse de démarrer si une valeur obligatoire manque ou est invalide.

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | oui | URL de connexion PostgreSQL. |
| `SESSION_SECRET` | oui | Secret de signature des sessions, 32 caractères minimum. |
| `NODE_ENV` | non | `production` rend le cookie de session `Secure` : HTTPS devient obligatoire. |
| `HOST` | non | Adresse d'écoute, `127.0.0.1` par défaut. |
| `PORT` | non | Port d'écoute, `3000` par défaut. |
| `TRUST_PROXY` | non | `1` derrière un reverse proxy de confiance, indispensable avec `NODE_ENV=production` derrière Nginx. |
| `API_BEARER_TOKEN` | non | Jeton des intégrations serveur-à-serveur, 32 caractères minimum. Sans lui, seule la connexion par session est possible. |

## Architecture

L'application se compose d'un serveur Express, d'une base PostgreSQL et d'une interface en JavaScript sans framework ni étape de compilation.

```text
navigateur (index.html, js/, style.css)
    │  JSON, cookie de session
    ▼
server.js ── server/schemas.js (validation)
    │
    ▼
PostgreSQL (server/schema.sql)
```

```text
server.js              API, protections, fichiers publics
server/schemas.js      format d'une séance et règles de cohérence
server/schema.sql      tables, rejoué à chaque démarrage
js/                    interface, chargée dans l'ordre fixé par index.html :
  i18n.js                traductions, langue, thème
  data.js                liste initiale des élus, choix de vote
  utils.js               petits utilitaires
  api.js                 requêtes vers le serveur
  state.js               séance en cours, chargement, enregistrement, archives
  votes.js               calcul du résultat d'un vote
  render.js              affichage des onglets
  actions.js             réaction aux clics, saisies et formulaires
  export.js              exports CSV et JSON
  auth.js                connexion et déconnexion
  main.js                démarrage
scripts/               migration, création de compte, sauvegarde
deploy/                services et minuteur systemd
test/                  tests automatisés
```

### Cycle d'une action

1. Un élément porte l'attribut `data-act`, `data-change` ou `data-submit`. Un écouteur unique appelle le gestionnaire du même nom dans [js/actions.js](js/actions.js).
2. Le gestionnaire modifie l'objet global `S` (la séance), puis appelle `commit()`.
3. `commit()` rétablit la cohérence avec `sanitize()`, redessine l'onglet, puis envoie la séance entière au serveur. Les envois partent l'un après l'autre, car chacun utilise la révision renvoyée par le précédent.
4. Le serveur valide la séance et ne l'enregistre que si la révision reçue est toujours la bonne. Sinon il répond `409` : le navigateur bloque alors les écritures jusqu'au rechargement de la page ou à une nouvelle connexion.

### Données

La séance en cours est un unique document JSON, stocké dans `app_state`. Sa structure est décrite dans [endpoints.md](endpoints.md#put-apistate-et-put-apiv1state).

| Table | Contenu |
| --- | --- |
| `app_state` | Séance en cours (une seule ligne) et sa révision. |
| `session_archives` | Copie complète de chaque séance archivée. |
| `mandate_periods` | Mandats successifs, dont un seul est courant. |
| `app_users` | Comptes de connexion. |
| `audit_log` | Journal des écritures (`state.updated`, `state.imported`, `session.archived`, `mandate.created`, `mandate.updated`), sans leur contenu. |
| `user_sessions` | Sessions, créée automatiquement au premier démarrage. |

### Compatibilité avec les anciennes données

Le serveur valide tout ce qu'il lit et écrit ; le navigateur reçoit donc toujours des données au format actuel. Les seuls vestiges des anciens formats se trouvent dans [server/schemas.js](server/schemas.js) :

- `actif`, absent des plus anciens élus, vaut `true` par défaut ;
- `votesConfidentiels`, absent des anciennes séances, vaut une liste vide ;
- `structures` est l'ancien nom de `options` dans les votes confidentiels.

Les données d'avant le stockage serveur, restées dans le navigateur sous les clés `vote-cm-v1` et `vote-cm-history-v1`, ne sont plus importées ni supprimées. Pour en récupérer, reprenez le code de migration dans l'historique Git, ou passez par [`PUT /api/state/import`](endpoints.md#put-apistateimport-et-put-apiv1stateimport).

## Développement

```bash
npm test          # tests automatisés, sans base de données
npm start         # démarre le serveur, avec la configuration de .env
npm run db:migrate
npm run admin:create -- adresse@exemple.fr
```

Quelques repères pour modifier le code :

- **Ajouter un texte** : ajoutez la clé dans les deux langues de [js/i18n.js](js/i18n.js).
- **Ajouter une action** : ajoutez un gestionnaire dans [js/actions.js](js/actions.js) et l'attribut `data-*` correspondant dans [js/render.js](js/render.js).
- **Faire évoluer le format d'une séance** : modifiez [server/schemas.js](server/schemas.js). Les archives existantes doivent rester lisibles, car elles sont revalidées à chaque lecture : donnez une valeur par défaut à tout nouveau champ.
- **Modifier la base** : modifiez [server/schema.sql](server/schema.sql), qui doit pouvoir être rejoué sans erreur sur une base existante.
- **Ajouter un champ de saisie** : donnez-lui la même limite (`maxlength`) que dans [server/schemas.js](server/schemas.js), car un enregistrement refusé bloque les suivants jusqu'au rechargement.
- **Afficher une donnée saisie** : passez-la toujours par `esc()`, car les onglets sont construits en HTML.
- **Servir un nouveau fichier à la racine** : ajoutez-le à `PUBLIC_FILES` dans [server.js](server.js).

## Sécurité et limites

- Le site doit être utilisé en HTTPS. La connexion utilise un cookie de session `HttpOnly`, `Secure` en production et `SameSite=Strict`. Le navigateur déconnecte après 15 minutes d'inactivité ; la session serveur expire après 8 heures sans requête.
- Les mots de passe sont stockés sous forme de hash bcrypt ; les tentatives de connexion sont limitées à 10 par période de 15 minutes.
- Le jeton `API_BEARER_TOKEN` donne un accès complet au registre : protégez-le comme un secret administrateur et ne l'exposez jamais au navigateur.
- Les comptes se créent depuis le serveur avec `npm run admin:create`. Il n'existe pas d'écran de gestion des comptes, et tous les comptes ont les mêmes droits.
- Testez périodiquement les sauvegardes PostgreSQL en effectuant une restauration de contrôle.
