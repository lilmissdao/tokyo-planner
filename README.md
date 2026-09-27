# Tokyo Planner

Copied from the production deployment of the `tokyo-planner` Vercel project (team `dao21`).

- `index.html` — the single-page app (static, no build step)
- `api/places.js` — serverless proxy for Google Places search/details
- `api/photo.js` — serverless proxy that redirects to Google Places photos

Both API routes need a `GOOGLE_MAPS_API_KEY` environment variable in Vercel.
