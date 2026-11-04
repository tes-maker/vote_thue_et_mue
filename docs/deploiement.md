# Déploiement sur un serveur Linux

Ce guide s'adresse à la personne qui installe l'application en production. Pour un essai sur votre ordinateur, suivez plutôt [le démarrage local](../README.md#lancer-lapplication-en-local).

Exemple pour Ubuntu ou Debian avec PostgreSQL, Node.js 20 ou plus récent, et Nginx en HTTPS. Installez Node.js 20+ depuis une source de paquets approuvée par votre organisation, puis vérifiez `node --version` et `npm --version`. Les commandes d'administration sont à adapter à votre environnement.

## 1. Installer PostgreSQL et créer la base

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

## 2. Installer l'application

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

Créez `/etc/vote-cm/app.env` à partir de [.env.example](../.env.example). Remplacez le mot de passe de base et générez un secret de session :

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
# Facultatif : openssl rand -hex 32 ; ne jamais exposer dans le navigateur
API_BEARER_TOKEN=COLLER_ICI_UN_JETON_ALEATOIRE
TRUST_PROXY=1
```

`TRUST_PROXY=1` est indispensable derrière Nginx : sans lui, Express ne voit pas que la requête initiale est en HTTPS, n'émet pas le cookie de session et la connexion échoue. Le rôle de chaque variable est décrit dans [le README](../README.md#configuration).

Supprimez `API_BEARER_TOKEN` si vous n'avez pas d'intégration serveur-à-serveur. Sinon, générez un jeton distinct avec `openssl rand -hex 32`. Utilisez le mot de passe hexadécimal choisi précédemment dans `DATABASE_URL` (ou encodez les caractères spéciaux selon le format d'URL). Protégez ce fichier :

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

## 3. Démarrer l'application

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

## 4. Activer HTTPS avec Nginx

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

## 5. Activer les sauvegardes automatiques

Les sauvegardes sont faites sur le serveur avec `pg_dump`, chaque jour à 02 h 15 ; systemd les relance après un redémarrage. Chaque fichier est contrôlé avec `pg_restore --list` avant d'être conservé, puis supprimé au bout de 30 jours, dans `/var/backups/vote-cm`. Les fichiers portent un nom de la forme `votes-AAAAmmjjTHHMMSSZ-XXXXXX.dump`.

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
sudo install -o postgres -g postgres -m 600 /var/backups/vote-cm/votes-AAAAmmjjTHHMMSSZ-XXXXXX.dump /tmp/vote-restore.dump
sudo -u postgres pg_restore --no-owner --role=vote_app --dbname=vote_app_restore /tmp/vote-restore.dump
sudo rm /tmp/vote-restore.dump
```

Après vérification, modifiez `DATABASE_URL` dans `/etc/vote-cm/app.env` pour pointer vers la base restaurée, puis redémarrez le service. Ne restaurez pas une sauvegarde en production sans avoir d'abord conservé une copie de la base actuelle.
