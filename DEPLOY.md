# Uzbur Admin Deployment

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

See `.env.example`.

## Production start

```bash
npm install
npm run build
npm run start
```

## Reverse proxy

Use HTTPS in front of the app and expose uploads through the same domain.

## Notes

- SQLite is used directly by admin panel server.
- Mobile app must point to the production admin public API URL.
- `next.config.ts` uses `output: "standalone"` for easier server deployment.
