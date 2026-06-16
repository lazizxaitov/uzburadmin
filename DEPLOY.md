# Uzbur Admin Deployment

## DigitalOcean choice

Use a `Droplet`, not `App Platform`.

Reason:

- `App Platform` uses ephemeral filesystem storage
- this project stores `SQLite` and uploads on disk
- `DigitalOcean` docs say App Platform does not support volumes and local files are temporary

Sources:

- https://docs.digitalocean.com/products/app-platform/details/limits/
- https://docs.digitalocean.com/products/app-platform/how-to/store-data/

## Recommended server

- Ubuntu 24.04
- Node.js `22 LTS`
- 1 vCPU / 1 GB RAM is enough to start

## Required persistent paths

- `data/`
- `data/uploads/`

If you deploy outside the project directory, set:

- `UZBUR_DATA_DIR`
- `UZBUR_UPLOADS_DIR`
- optional `UZBUR_DB_PATH`

## Required environment variables

- `ADMIN_USER`
- `ADMIN_PASS`
- `AUTH_SECRET`

Optional:

- `MOBILE_API_KEY`
- `CASHIER_USER`
- `CASHIER_PASS`
- `PLUM_BASE_URL`
- `PLUM_USERNAME`
- `PLUM_PASSWORD`

See `.env.example`.

## Server setup

```bash
apt update && apt upgrade -y
apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
```

## App setup

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/lazizxaitov/uzburadmin.git
cd uzburadmin
npm ci
mkdir -p data/uploads
cp .env.example .env
npm run build
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd
```

## Nginx

Ready config:

- `deploy/nginx/uzburadmin.conf:1`

Install:

```bash
cp deploy/nginx/uzburadmin.conf /etc/nginx/sites-available/uzburadmin
ln -s /etc/nginx/sites-available/uzburadmin /etc/nginx/sites-enabled/uzburadmin
nginx -t
systemctl reload nginx
```

## HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com -d www.your-domain.com
```

## Updates

```bash
cd /var/www/uzburadmin
git pull origin main
npm ci
npm run build
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public
pm2 restart uzburadmin
```

## Notes

- Current build passes locally
- `next.config.ts` uses `output: "standalone"`
- mobile app must use production admin URL in `ADMIN_BASE_URL`
