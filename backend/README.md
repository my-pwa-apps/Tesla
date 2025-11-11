# Tesla Dashboard Backend

Secure backend proxy for Tesla OAuth authentication.

## Deploy to Vercel

### 1. Install Vercel CLI (Optional)
```bash
npm install -g vercel
```

### 2. Deploy via Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Configure the project:
   - **Root Directory**: `backend`
   - **Framework Preset**: Other
   - **Build Command**: (leave empty)
   - **Output Directory**: (leave empty)

5. Add Environment Variables:
   - `TESLA_CLIENT_ID` = `98115f27-6ac6-4a11-9bc8-c256cce5f8cc`
   - `TESLA_CLIENT_SECRET` = `ta-secret.@vN5q2MiuF+S`
   - `PORT` = `3000` (optional, Vercel handles this)

6. Click "Deploy"

### 3. Deploy via CLI (Alternative)

```bash
cd backend
vercel
```

Follow the prompts and add environment variables when asked.

### 4. Update Frontend

After deployment, update your frontend's `app.js`:

```javascript
const BACKEND_URL = 'https://your-project.vercel.app';
```

Replace `your-project` with your actual Vercel project name.

### 5. Update Tesla App Redirect URI

Go to [Tesla Developer Portal](https://developer.tesla.com/) and add:
- `https://your-github-pages-url/callback.html`

Example: `https://my-pwa-apps.github.io/Tesla/callback.html`

## Testing

After deployment, test your endpoints:
- `https://your-project.vercel.app/api/config`
- Should return: `{"clientId":"98115f27..."}`

## Environment Variables

Required environment variables in Vercel dashboard:
- `TESLA_CLIENT_ID` - Your Tesla app client ID
- `TESLA_CLIENT_SECRET` - Your Tesla app client secret
- `PORT` - (Optional) Port number, Vercel handles this automatically
