# Deployment

This repo can be deployed as:

- Backend API on Render
- Frontend on Netlify

The same Next.js project is used for both. The Netlify frontend calls the Render API through `NEXT_PUBLIC_API_BASE_URL`.

## 1. Push to GitHub

The project is already configured as a Git repo. Push `main` to GitHub before connecting Render or Netlify.

## 2. Deploy Backend on Render

1. Create a new Render **Web Service** from this GitHub repo.
2. Render can read `render.yaml`, or you can set these manually:
   - Build command: `npm ci && npm run build`
   - Start command: `npm run start -- --hostname 0.0.0.0 --port $PORT`
   - Health check path: `/api/products`
3. Add environment variables in Render:
   - `MONGODB_URI`
   - `MONGODB_DB_NAME`
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `CORS_ALLOWED_ORIGINS`

Set `CORS_ALLOWED_ORIGINS` to your Netlify URL after Netlify is deployed, for example:

```text
https://allo-health.netlify.app
```

For preview deployments or testing, you can include multiple origins separated by commas.

## 3. Deploy Frontend on Netlify

1. Import this GitHub repo into Netlify.
2. Netlify reads `netlify.toml`, or you can set these manually:
   - Build command: `npm run build`
   - Publish directory: `.next`
3. Add this environment variable in Netlify:
   - `NEXT_PUBLIC_API_BASE_URL=https://YOUR_RENDER_SERVICE.onrender.com`

The frontend does not need MongoDB or Razorpay secrets when it is calling the Render backend.

## 4. Update Render CORS

After Netlify gives you the final production URL, go back to Render and set:

```text
CORS_ALLOWED_ORIGINS=https://YOUR_NETLIFY_APP.netlify.app
```

Redeploy or restart the Render service after changing the environment variable.

## 5. Expired Reservation Cleanup

The app releases expired reservations lazily before product and reservation reads. The existing endpoint is also available for scheduled cleanup:

```text
GET /api/cron/release-expired
```

You can add a Render cron job or an external cron service later if you want proactive cleanup.
