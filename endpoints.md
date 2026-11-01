# API HTTP

L'API est servie par le même serveur que l'interface, sous le préfixe `/api`. Les réponses sont en JSON, sauf la déconnexion qui renvoie `204 No Content`. Les routes sont destinées au client web du projet ; il n'y a pas d'API key ni de jeton bearer.

## Authentification et protections

- La connexion crée une session serveur stockée dans PostgreSQL et renvoie un cookie de session `HttpOnly`, `SameSite=Strict`. En production, le cookie est également `Secure`.
- Après connexion, les requêtes mutantes doivent fournir le jeton CSRF reçu dans la réponse de connexion ou de `/api/auth/me`, dans l'en-tête `X-CSRF-Token`.
- Les routes qui modifient l'état demandent également la révision actuelle dans l'en-tête `If-Match`. La révision retournée par l'API doit être réutilisée telle quelle, sous forme de chaîne.
- Le client web envoie les cookies en same-origin. Une session expire après huit heures d'inactivité glissante.

## Routes

### `GET /api/health`

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

Réponses d'erreur : `400 invalid_data` pour un corps invalide ; `400 invalid_credentials` ou `401 invalid_credentials` pour des identifiants invalides ; `429` si la limite de tentatives est atteinte.

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

### `GET /api/state`

Récupère l'état actif, les archives et la révision. Requiert une session valide.

Réponse `200` :

```json
{
  "active": {
    "elus": [],
    "seance": {},
    "presence": {},
    "votes": []
  },
  "history": [],
  "revision": 12
}
```

`active` vaut `null` avant la première initialisation. `history` contient des objets `{ "id", "archivedAt", "snapshot" }`.

### `PUT /api/state`

Remplace l'état actif complet. Requiert une session, `X-CSRF-Token` et `If-Match`.

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
    "votes": []
  }
}
```

Les membres historiques sans champ `actif` sont acceptés et traités comme étant en exercice. Un vote contient `id`, `numero`, `objet`, `choix`, `electeurs` et `president` ; chaque électeur est une copie du membre au moment du vote, avec `present` et `mandataire`. Les choix possibles sont `pour`, `contre`, `abst` et `npp`. Les limites et règles de cohérence détaillées sont validées par le schéma du serveur.

Réponse `200` :

```json
{ "revision": 13 }
```

Erreurs possibles : `400 invalid_data`, `401 unauthorized`, `403 csrf_invalid`, `409 state_conflict` si `If-Match` est périmé, `428 revision_required` si la révision manque.

### `POST /api/archive`

Archive l'état actif courant. Requiert une session, `X-CSRF-Token` et `If-Match`. Le corps est ignoré ; le serveur archive la version stockée.

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

### `PUT /api/state/import`

Importe un état actif et une liste d'archives. Cette route est principalement utilisée lors de la migration des anciennes données locales. Requiert une session, `X-CSRF-Token` et `If-Match`.

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

Les codes particuliers et leurs statuts sont indiqués avec chaque route. Une erreur interne inattendue renvoie `500 server_error`.

## Routes inconnues

Toute autre route sous `/api` renvoie `404` :

```json
{ "error": "not_found" }
```
