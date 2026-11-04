# API HTTP

L'API est servie par le même serveur que l'interface, sous le préfixe `/api`. Les réponses sont en JSON, sauf la déconnexion qui renvoie `204 No Content`. Les routes `/api/v1/...` sont les routes versionnées destinées aux intégrations ; les routes historiques restent disponibles pour le site actuel. Tous les clients d'une instance partagent le même registre et les mêmes données.

## Vue d'ensemble

| Méthode et route | Rôle | Authentification | `If-Match` |
| --- | --- | --- | --- |
| `GET /health` | État du serveur et de la base | aucune | non |
| `POST /auth/login` | Ouvrir une session | aucune | non |
| `GET /auth/me` | Session courante | aucune | non |
| `POST /auth/logout` | Fermer la session | session + CSRF | non |
| `GET /mandate` | Lire le mandat courant | session ou bearer | non |
| `PUT /mandate` | Créer ou modifier le mandat | session + CSRF, ou bearer | oui |
| `GET /state` | Lire la séance et les archives | session ou bearer | non |
| `PUT /state` | Remplacer la séance | session + CSRF, ou bearer | oui |
| `POST /archive` | Archiver la séance | session + CSRF, ou bearer | oui |
| `PUT /state/import` | Importer une séance et des archives | session + CSRF, ou bearer | oui |

Toutes ces routes sont préfixées par `/api`. Celles qui ne commencent pas par `/auth` existent aussi sous `/api/v1`.

## Authentification et protections

- La connexion crée une session serveur stockée dans PostgreSQL et renvoie un cookie de session `HttpOnly`, `SameSite=Strict`. En production, le cookie est également `Secure`.
- Avec une session, les requêtes mutantes doivent fournir le jeton CSRF reçu dans la réponse de connexion ou de `/api/auth/me`, dans l'en-tête `X-CSRF-Token`.
- Les intégrations serveur-à-serveur peuvent utiliser `Authorization: Bearer <jeton>` si `API_BEARER_TOKEN` est défini sur le serveur. Configurez un jeton aléatoire d'au moins 32 caractères, par exemple avec `openssl rand -hex 32`. Ce jeton donne le même accès en lecture et écriture que le compte administrateur ; ne l'intégrez jamais dans le code JavaScript d'un site public. Les requêtes bearer n'ont pas besoin de session ni de jeton CSRF.
- Les routes qui modifient l'état demandent également la révision actuelle dans l'en-tête `If-Match` : la dernière valeur renvoyée par l'API. Si quelqu'un a écrit entre-temps, la requête échoue en `409` sans rien modifier ; il faut alors relire les données avant de réessayer. La séance et le mandat ont chacun leur propre révision.
- Le client web envoie les cookies en same-origin. Une session serveur expire après huit heures sans requête. Le navigateur, lui, déconnecte l'utilisateur après quinze minutes d'inactivité.
- L'API est destinée à une intégration côté serveur et n'active pas CORS pour les navigateurs tiers.

Exemple de lecture depuis le serveur d'un site tiers :

```sh
curl -H "Authorization: Bearer $VOTE_API_TOKEN" \
  https://votes.exemple.fr/api/v1/state
```

## Routes

### `GET /api/health` et `GET /api/v1/health`

Vérifie la connexion à PostgreSQL. Cette route ne demande pas de session.

Réponse `200` :

```json
{ "status": "ok" }
```

Réponse `500` si la vérification de la base échoue.

### `POST /api/auth/login`

Ouvre une session. Limite : 10 tentatives par fenêtre de 15 minutes.

Requête :

```json
{
  "email": "administrateur@exemple.fr",
  "password": "mot-de-passe"
}
```

Réponse `200` (le cookie de session est posé par le serveur) :

```json
{
  "user": { "email": "administrateur@exemple.fr" },
  "csrfToken": "jeton-csrf"
}
```

Réponses d'erreur : `400 invalid_data` pour un corps invalide ; `400 invalid_credentials` si le mot de passe dépasse 72 octets ; `401 invalid_credentials` si l'adresse ou le mot de passe est incorrect ; `429` si la limite de tentatives est atteinte. Les connexions réussies comptent aussi dans la limite.

### `GET /api/auth/me`

Retourne l'utilisateur de la session courante. Ne demande pas de session.

Réponse `200` si connecté :

```json
{
  "user": { "email": "administrateur@exemple.fr" },
  "csrfToken": "jeton-csrf"
}
```

Réponse `200` si non connecté :

```json
{ "user": null }
```

### `POST /api/auth/logout`

Ferme la session. Requiert une session valide et `X-CSRF-Token`.

Réponse : `204 No Content`.

Erreurs possibles : `401 unauthorized`, `403 csrf_invalid`.

### `GET /api/mandate` et `GET /api/v1/mandate`

Récupère le mandat courant. Requiert une session valide ou le jeton bearer. Le mandat initial est 2026–2032 ; les mandats remplacés sont conservés dans l'historique.

Réponse `200` :

```json
{
  "mandate": { "id": "1", "startYear": 2026, "endYear": 2032 },
  "revision": 1
}
```

### `PUT /api/mandate` et `PUT /api/v1/mandate`

Crée un nouveau mandat courant ou modifie le mandat courant. Requiert `If-Match` et soit une session avec `X-CSRF-Token`, soit le jeton bearer. L'année de fin doit être postérieure à l'année de début.

Corps :

```json
{ "mode": "create", "startYear": 2026, "endYear": 2032 }
```

Utilisez `"mode": "edit"` pour modifier le mandat actuel. Une création conserve l'ancien mandat dans l'historique.

Réponse `200` :

```json
{
  "mandate": { "id": "2", "startYear": 2026, "endYear": 2032 },
  "revision": 2
}
```

Erreurs possibles : `400 invalid_data`, `400 invalid_revision` si la révision est trop grande, `401 unauthorized`, `403 csrf_invalid`, `409 mandate_conflict` si `If-Match` est périmé, `428 revision_required` si la révision manque ou n'est pas un entier positif.

### `GET /api/state` et `GET /api/v1/state`

Récupère l'état actif, les archives et la révision. Requiert une session valide ou le jeton bearer.

Réponse `200` :

```json
{
  "active": {
    "elus": [],
    "seance": {},
    "presence": {},
    "votes": [],
    "votesConfidentiels": []
  },
  "history": [],
  "revision": 12
}
```

`active` vaut `null` avant la première initialisation. `history` contient des objets `{ "id", "archivedAt", "snapshot" }`.

### `PUT /api/state` et `PUT /api/v1/state`

Remplace l'état actif complet. Requiert `If-Match` et soit une session avec `X-CSRF-Token`, soit le jeton bearer.

Exemple d'en-têtes :

```http
If-Match: 12
X-CSRF-Token: jeton-csrf
Content-Type: application/json
```

Corps :

```json
{
  "active": {
    "elus": [
      { "id": "elu1", "nom": "Prénom NOM", "fonction": "Maire", "actif": true }
    ],
    "seance": {
      "id": "seance1",
      "titre": "Conseil municipal",
      "date": "2026-11-01",
      "president": "elu1"
    },
    "presence": {
      "elu1": { "present": true, "mandataire": null }
    },
    "votes": [],
    "votesConfidentiels": [
      {
        "id": "secret1",
        "numero": "1",
        "objet": "Choix d'une option",
        "limite": 12,
        "options": [
          { "id": "option1", "nom": "Option A", "voix": 7 },
          { "id": "option2", "nom": "Option B", "voix": 2 }
        ],
        "abstentions": 1,
        "npp": 0
      }
    ]
  }
}
```

Les membres historiques sans champ `actif` sont acceptés et traités comme étant en exercice. Un vote contient `id`, `numero`, `objet`, `choix`, `electeurs` et `president` ; chaque électeur est une copie du membre au moment du vote, avec `present` et `mandataire`. Les choix possibles sont `pour`, `contre`, `abst` et `npp`. Les limites et règles de cohérence détaillées sont définies dans [server/schemas.js](./server/schemas.js).

`votesConfidentiels` est facultatif à l'écriture (il vaut alors `[]` pour les données antérieures à cette fonctionnalité). Chaque vote confidentiel contient un plafond `limite` fixé au nombre d'élus en exercice lors de sa création, des choix nommés dans `options`, ainsi que les compteurs `abstentions` et `npp` (« ne prend pas part au vote »). Chaque suffrage est ajouté à une option, à l'abstention ou à la non-participation. Seuls les nombres agrégés sont stockés : aucune identité ni aucun choix individuel n'est associé à un bulletin. La somme des voix des options, des abstentions et des NPP ne peut dépasser `limite`. Le format antérieur `structures` est encore accepté en entrée et renvoyé sous le nom canonique `options`.

Réponse `200` :

```json
{ "revision": 13 }
```

Erreurs possibles : `400 invalid_data`, `400 invalid_revision` si la révision est trop grande, `401 unauthorized`, `403 csrf_invalid`, `409 state_conflict` si `If-Match` est périmé, `428 revision_required` si la révision manque ou n'est pas un entier positif.

### `POST /api/archive` et `POST /api/v1/archive`

Archive l'état actif courant. Requiert `If-Match` et soit une session avec `X-CSRF-Token`, soit le jeton bearer. Le corps est ignoré ; le serveur archive la version stockée.

Réponse `200` :

```json
{
  "archive": {
    "id": "seance1",
    "archivedAt": "2026-11-01T16:00:00.000Z",
    "snapshot": {}
  },
  "revision": 14
}
```

Une archive ayant le même identifiant de séance est remplacée. Erreurs possibles : `401 unauthorized`, `403 csrf_invalid`, `409 state_conflict`, `428 revision_required`.

### `PUT /api/state/import` et `PUT /api/v1/state/import`

Importe un état actif et une liste d'archives, par exemple depuis une autre instance. L'interface web ne l'utilise pas. Requiert `If-Match` et soit une session avec `X-CSRF-Token`, soit le jeton bearer.

Corps :

```json
{
  "active": {
    "elus": [],
    "seance": {},
    "presence": {},
    "votes": []
  },
  "history": [
    {
      "id": "seance-archivee",
      "archivedAt": "2026-10-01T12:00:00.000Z",
      "snapshot": {}
    }
  ]
}
```

Le format de `active` est le même que pour `PUT /api/state`. Chaque archive contient son identifiant, sa date ISO d'archivage et un instantané de séance valide.

Réponse `200` :

```json
{ "revision": 15 }
```

Erreurs possibles : `400 invalid_data`, `401 unauthorized`, `403 csrf_invalid`, `409 state_conflict`, `428 revision_required`.

## Format commun des erreurs

Les erreurs de l'API sont renvoyées sous la forme :

```json
{ "error": "code_erreur" }
```

Les codes particuliers et leurs statuts sont indiqués avec chaque route. Une erreur interne inattendue renvoie `500 server_error`. Un corps qui n'est pas du JSON valide renvoie `400 invalid_data`, sur toutes les routes et avant même le contrôle d'authentification.

## Routes inconnues

Toute autre route sous `/api` renvoie `404` :

```json
{ "error": "not_found" }
```
