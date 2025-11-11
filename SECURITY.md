# 🔒 SECURITY SETUP GUIDE

## ⚠️ CRITICAL: Your Credentials Were Exposed!

**IMMEDIATELY:**
1. Go to https://developer.tesla.com/
2. Revoke the current credentials
3. Generate new Client ID and Secret
4. Never share them publicly again!

## ✅ Secure Setup Instructions

### Step 1: Setup Backend Server

1. **Create .env file** (in the `backend` folder):
   ```bash
   cd backend
   cp ../.env.example .env
   ```

2. **Edit .env file** with your NEW credentials:
   ```
   TESLA_CLIENT_ID=your_new_client_id
   TESLA_CLIENT_SECRET=your_new_client_secret
   PORT=3000
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Start the backend**:
   ```bash
   npm start
   ```

### Step 2: Configure Frontend

The frontend is already configured to use your Client ID.
The secret stays safely on the backend server.

### Step 3: Test the Connection

1. Open `index.html` in your browser
2. Click "Connect Tesla Account"
3. Login with your Tesla credentials
4. Authorize the app
5. You'll be redirected back with real data!

## 🔐 Security Best Practices

### ✅ DO:
- Store secrets in `.env` files (never commit)
- Use backend proxy for token exchange
- Keep Client Secret on server only
- Use HTTPS in production
- Regenerate credentials if exposed

### ❌ DON'T:
- Commit `.env` files to Git
- Put secrets in frontend code
- Share credentials publicly
- Hard-code secrets in files

## 📁 File Structure

```
Tesla/
├── backend/
│   ├── server.js       # Backend proxy server
│   ├── package.json    # Dependencies
│   └── .env           # Secrets (NOT in Git)
├── .env.example        # Template (safe to commit)
├── .gitignore          # Protects secrets
└── app.js             # Frontend (no secrets!)
```

## 🚀 Production Deployment

For production, deploy your backend to:
- **Heroku** (easy)
- **Railway** (modern)
- **Vercel** (serverless)
- **AWS/Azure** (enterprise)

Update `backendUrl` in `app.js` to your production URL.

## 🆘 If You Exposed Credentials:

1. **Revoke immediately** at https://developer.tesla.com/
2. Generate new ones
3. Update `.env` file
4. Never commit `.env` to Git
5. Check `.gitignore` includes `.env`

---

**Remember:** Client ID = Public (OK to share)
            Client Secret = Private (NEVER share!)
