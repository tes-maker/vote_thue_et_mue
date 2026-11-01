# Votes du conseil municipal – Thue et Mue

Application web pour préparer les séances du conseil municipal, saisir les présences, procurations et votes, consulter l'historique et exporter les résultats.

![Aperçu de l'onglet « Séance & présences »](image.png)

## Fonctionnement

- L'interface est servie par le serveur Node.js ; elle ne doit pas être ouverte directement avec `index.html` ni via `python -m http.server`.
- L'API enregistre automatiquement la séance en cours et les archives dans PostgreSQL. Plusieurs postes connectés au même serveur partagent les mêmes données.
- La liste des routes HTTP, des formats d'échange et des protections est décrite dans [endpoints.md](./endpoints.md).
- La connexion utilise un compte serveur. Le mot de passe n'est jamais envoyé au navigateur autrement que pour la requête HTTPS de connexion ; les sessions sont conservées côté serveur.
- Le bouton **Archiver cette séance** crée une copie consultable dans l'onglet **Historique**. Le serveur archive également la séance avant le démarrage d'une nouvelle séance.
- Les boutons **Exporter les résultats (CSV)** et **Exporter en JSON** téléchargent des copies destinées à l'exploitation ou à l'échange. Ils ne servent pas à sauvegarder le serveur.
- À la première connexion après mise à jour, les anciennes données du navigateur sont migrées vers PostgreSQL si elles sont encore présentes. Elles ne sont supprimées du navigateur qu'après la migration réussie.

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

Dans `.env`, configurez les valeurs suivantes. Remplacez le mot de passe par celui défini pour PostgreSQL et générez un secret de session neuf avec `openssl rand -hex 32` dans un autre terminal :

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
DATABASE_URL=postgresql://vote_app:MOT_DE_PASSE_POSTGRES@127.0.0.1:5432/vote_app
SESSION_SECRET=COLLER_ICI_UN_SECRET_GENERE_AVEC_OPENSSL
TRUST_PROXY=0
```

Enregistrez le fichier dans `nano` avec **Ctrl+O**, puis **Entrée** ; quittez avec **Ctrl+X**. Le fichier `.env` est ignoré par Git : ne le partagez pas et n'y inscrivez pas des secrets déjà divulgués.

Installez les dépendances, créez les tables et le compte administrateur :

```bash
npm ci
npm run db:migrate
npm run admin:create -- paul@exemple.fr
```

La commande de création du compte demande un mot de passe administrateur. Exécutez-la une seule fois pour créer ce compte. Si l'adresse existe déjà, ne relancez pas la commande : connectez-vous avec le compte existant. Pour démarrer l'application :

```bash
npm start
```

Ouvrez [http://127.0.0.1:3000](http://127.0.0.1:3000) dans votre navigateur et connectez-vous avec le compte créé. Le serveur reste actif dans le terminal ; **Ctrl+C** l'arrête. Les données sont stockées dans la base PostgreSQL locale.

## Installation sur un serveur Linux

Exemple pour Ubuntu ou Debian avec PostgreSQL, Node.js 20 ou plus récent, et Nginx en HTTPS. Installez Node.js 20+ depuis une source de paquets approuvée par votre organisation, puis vérifiez `node --version` et `npm --version`. Les commandes d'administration sont à adapter à votre environnement.

### 1. Installer PostgreSQL et créer la base

```bash
sudo apt update
sudo apt install postgresql nginx
```

Créez un utilisateur et une base dédiés :

```bash
sudo -u postgres psql
```

Dans l'invite PostgreSQL :

```sql
CREATE ROLE vote_app LOGIN;
CREATE DATABASE vote_app OWNER vote_app;
\password vote_app
\q
```

La commande `\password vote_app` demande un mot de passe sans l'inscrire dans l'historique SQL. Pour simplifier l'URL de connexion, générez-en un composé de caractères hexadécimaux, par exemple avec `openssl rand -hex 32`. Conservez-le dans un gestionnaire de secrets ou dans le fichier d'environnement protégé du serveur ; ne le placez pas dans le dépôt.

### 2. Installer l'application

Copiez le dépôt dans `/opt/vote_thue_et_mue`, puis installez les dépendances :

```bash
cd /opt/vote_thue_et_mue
npm ci --omit=dev
```

Créez le compte système et les dossiers de configuration :

```bash
sudo useradd --system --home /opt/vote_thue_et_mue --shell /usr/sbin/nologin vote-cm
sudo install -d -o root -g vote-cm -m 750 /etc/vote-cm
sudo install -d -o vote-cm -g vote-cm -m 700 /var/backups/vote-cm
```

Créez `/etc/vote-cm/app.env` à partir de [.env.example](./.env.example). Remplacez le mot de passe de base et générez un secret de session :

```bash
openssl rand -hex 32
```

Exemple de configuration (ne copiez pas les valeurs d'exemple telles quelles) :

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATABASE_URL=postgresql://vote_app:MOT_DE_PASSE_POSTGRES@127.0.0.1:5432/vote_app
SESSION_SECRET=COLLER_ICI_UN_SECRET_GENERE_AVEC_OPENSSL
TRUST_PROXY=1
```

Utilisez le mot de passe hexadécimal choisi précédemment dans `DATABASE_URL` (ou encodez les caractères spéciaux selon le format d'URL). Protégez ce fichier :

```bash
sudo chown root:vote-cm /etc/vote-cm/app.env
sudo chmod 640 /etc/vote-cm/app.env
```

Appliquez le schéma et créez le compte de connexion de l'application :

```bash
cd /opt/vote_thue_et_mue
sudo -u vote-cm env APP_ENV_FILE=/etc/vote-cm/app.env npm run db:migrate
sudo -u vote-cm env APP_ENV_FILE=/etc/vote-cm/app.env npm run admin:create -- administrateur@exemple.fr
```

La seconde commande demande le mot de passe sans l'afficher. Choisissez un mot de passe unique d'au moins 12 caractères.

### 3. Démarrer l'application

Installez et activez le service systemd fourni :

```bash
sudo cp deploy/vote-cm.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vote-cm
sudo systemctl status vote-cm
```

L'API écoute uniquement sur `127.0.0.1:3000`. Vérifiez son état depuis le serveur :

```bash
curl http://127.0.0.1:3000/api/health
```

La réponse attendue est `{"status":"ok"}`.

### 4. Activer HTTPS avec Nginx

Configurez un nom DNS et un certificat TLS, puis ajoutez un site Nginx qui transmet les requêtes à Node.js :

```nginx
server {
    listen 80;
    server_name votes.exemple.fr;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name votes.exemple.fr;

    ssl_certificate /etc/letsencrypt/live/votes.exemple.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votes.exemple.fr/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

N'exposez pas directement le port 3000 ni le port PostgreSQL sur Internet. `TRUST_PROXY=1` ne doit être activé que si Node.js est accessible uniquement derrière ce reverse proxy de confiance.

### 5. Activer les sauvegardes automatiques

Les sauvegardes sont faites sur le serveur avec `pg_dump`, chaque jour à 02 h 15 ; systemd les relance après un redémarrage. Les fichiers PostgreSQL vérifiés sont conservés 30 jours dans `/var/backups/vote-cm`.

Créez un compte PostgreSQL de sauvegarde en lecture seule :

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE vote_backup LOGIN;
GRANT CONNECT ON DATABASE vote_app TO vote_backup;
GRANT pg_read_all_data TO vote_backup;
\password vote_backup
\q
```

Générez un autre mot de passe avec `openssl rand -hex 32`, puis créez `/etc/vote-cm/pgpass` avec cette ligne :

```text
127.0.0.1:5432:vote_app:vote_backup:MOT_DE_PASSE_DE_SAUVEGARDE
```

Puis protégez-le :

```bash
sudo chown vote-cm:vote-cm /etc/vote-cm/pgpass
sudo chmod 600 /etc/vote-cm/pgpass
```

Créez `/etc/vote-cm/backup.env` :

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=vote_app
PGUSER=vote_backup
PGPASSFILE=/etc/vote-cm/pgpass
```

Installez et activez le minuteur :

```bash
sudo cp deploy/vote-cm-backup.service deploy/vote-cm-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vote-cm-backup.timer
sudo systemctl start vote-cm-backup.service
sudo systemctl status vote-cm-backup.service
```

Vérifiez régulièrement les journaux avec `journalctl -u vote-cm-backup.service`. Gardez également une copie chiffrée des sauvegardes sur un autre serveur ou un stockage indépendant : une sauvegarde située sur le même disque ne protège pas d'une panne de ce disque.

Pour restaurer une sauvegarde, arrêtez l'application, restaurez le fichier `.dump` dans une base de données, vérifiez les données, puis redémarrez l'application. Exemple de restauration vers une base dédiée :

```bash
sudo -u postgres createdb --owner=vote_app vote_app_restore
sudo install -o postgres -g postgres -m 600 /var/backups/vote-cm/votes-AAAAmmjjTHHMMSSZ.dump /tmp/vote-restore.dump
sudo -u postgres pg_restore --no-owner --role=vote_app --dbname=vote_app_restore /tmp/vote-restore.dump
sudo rm /tmp/vote-restore.dump
```

Après vérification, modifiez `DATABASE_URL` dans `/etc/vote-cm/app.env` pour pointer vers la base restaurée, puis redémarrez le service. Ne restaurez pas une sauvegarde en production sans avoir d'abord conservé une copie de la base actuelle.

## Utilisation

1. Connectez-vous avec le compte créé par l'administrateur du serveur.
2. Dans **Liste des élus**, utilisez **Modifier** puis **Valider** pour corriger un nom ou une fonction. Le statut **En exercice / Démissionnaire** permet de retirer un membre des présences et des nouveaux votes sans supprimer ses votes déjà enregistrés.
3. Dans **Séance & présences**, renseignez l'intitulé, la date, le président, puis les présences et procurations. Un élu présent peut porter plusieurs procurations.
4. Dans **Votes**, créez chaque délibération puis saisissez les votes. Les votants sont enregistrés au moment où la délibération est créée ; ils sont « Pour » par défaut.
5. Utilisez **Exporter les résultats (CSV)** pour obtenir un tableau plat, une ligne par vote individuel, avec des colonnes stables et séparées par des points-virgules. Le fichier est encodé en UTF-8 avec BOM pour faciliter son ouverture dans Excel.
6. Utilisez **Exporter en JSON** pour obtenir les données détaillées de la séance en cours.
7. Cliquez sur **Archiver cette séance** pour la conserver dans l'historique du serveur. L'archivage est confirmé à l'écran.

Le résultat est calculé automatiquement. En cas d'égalité, la voix du président de séance est prépondérante. Les votes déjà enregistrés conservent le nom et le choix de l'élu même si celui-ci est ensuite retiré de la liste.

## Sécurité et limites

- Le site doit être utilisé en HTTPS. La connexion utilise un cookie de session `HttpOnly`, `Secure` en production et `SameSite=Strict`, avec expiration après inactivité.
- Les mots de passe sont stockés sous forme de hash bcrypt ; les tentatives de connexion sont limitées.
- L'API valide les données, exige un jeton CSRF pour les écritures et refuse une sauvegarde si une autre connexion a modifié la séance entre-temps. Dans ce cas, rechargez la page pour récupérer la dernière version.
- Les comptes sont créés depuis le serveur avec `npm run admin:create -- adresse@exemple.fr`. Il n'existe pas encore d'écran de gestion des comptes.
- L'application est conçue pour une seule commune et un seul registre partagé. Les sauvegardes PostgreSQL automatiques doivent être testées périodiquement en effectuant une restauration de contrôle.
