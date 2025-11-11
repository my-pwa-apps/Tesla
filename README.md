# Tesla Dashboard Web App

An attractive, feature-rich dashboard designed for the Tesla Model 3 Highland in-car browser.

## 🚗 Features

### Tesla-Specific Tiles
- **Battery Status** - Level, range, charging status with visual indicators
- **Climate Control** - Inside/outside temperature, climate status
- **Vehicle Info** - Odometer, lock status, sentry mode
- **Account Connection** - Firebase-powered secure authentication

### General Information Tiles
- **Weather** - Real-time weather based on location
- **News** - Latest headlines from BBC World News
- **NASA Photo** - Astronomy Picture of the Day
- **Inspirational Quotes** - Motivational quotes
- **Random Facts** - Interesting trivia
- **Currency Converter** - Live exchange rates
- **Nearby Charging** - EV charging stations via OpenChargeMap
- **Quick Links** - Tesla resources and route planners

## 🔥 Firebase Integration

This app uses Firebase to securely handle Tesla API integration, solving the OAuth complexity problem:

### Why Firebase?
- ✅ **Secure** - Client secrets stay on backend
- ✅ **No CORS issues** - Requests go through your Cloud Functions
- ✅ **Token management** - Automatic refresh handling
- ✅ **Data caching** - Firestore caches Tesla data
- ✅ **Background sync** - Updates every 5 minutes

### Firebase Setup

1. **Create Firebase Project**
   ```bash
   # Visit https://console.firebase.google.com/
   # Create a new project
   ```

2. **Enable Services**
   - Authentication (Google Sign-In)
   - Cloud Firestore
   - Cloud Functions

3. **Configure the App**
   - Copy your Firebase config from Project Settings
   - Update `firebase-config.js` with your credentials

4. **Deploy Cloud Functions**
   ```bash
   cd functions
   npm install
   firebase login
   firebase init functions
   firebase deploy --only functions
   ```

5. **Set Tesla API Credentials** (in Firebase Console)
   ```bash
   firebase functions:config:set tesla.client_id="YOUR_TESLA_CLIENT_ID"
   ```

## 📡 Tesla API Integration

### Cloud Functions Provided

- `getTeslaVehicleData` - Fetch current vehicle data
- `refreshTeslaToken` - Refresh expired access tokens
- `getTeslaVehicles` - List all vehicles on account
- `wakeTeslaVehicle` - Wake sleeping vehicle
- `scheduledTeslaDataSync` - Background sync every 5 minutes

### Firestore Structure

```
users/{userId}
  - teslaAccessToken: string
  - teslaRefreshToken: string
  - teslaVehicleId: string
  - tokenUpdated: timestamp

tesla_cache/{userId}
  - data: object (vehicle data)
  - timestamp: timestamp
```

## 🎨 Free APIs Used

| API | Purpose | Auth Required |
|-----|---------|---------------|
| Open-Meteo | Weather data | No |
| RSS2JSON | News feeds | No |
| Quotable | Inspirational quotes | No |
| NASA APOD | Space photos | Demo key included |
| Useless Facts | Random facts | No |
| ExchangeRate-API | Currency conversion | No |
| OpenChargeMap | EV charging stations | No |

## 🚀 Quick Start

### Without Firebase (Demo Mode)
1. Open `index.html` in your browser
2. All tiles work with demo/mock data
3. Tesla tiles show example data

### With Firebase (Full Features)
1. Complete Firebase setup above
2. Sign in with Google
3. Link your Tesla account
4. Enjoy real-time vehicle data!

## 🔐 Tesla Authentication Options

### Option 1: Tessie (Recommended for simplicity)
- Sign up at https://my.tessie.com/
- Link Tesla account through their OAuth
- Use their API token (simpler than direct Tesla API)
- Costs ~$5/month

### Option 2: Direct Tesla API (Free but complex)
- Register at https://tesla.com/developers
- Implement full OAuth 2.0 flow
- Handle token refresh logic
- Included in our Cloud Functions

## 🎯 Design Features

- **Tesla-themed** - Red accent colors (#e82127)
- **Dark mode** - Optimized for in-car viewing
- **Touch-friendly** - Large buttons for touchscreen
- **Glassmorphism** - Modern blur effects
- **Responsive** - Works on all screen sizes
- **Auto-refresh** - Tesla data updates every 30 seconds

## 📱 Browser Compatibility

Tested and optimized for:
- ✅ Tesla Model 3 Highland browser
- ✅ Chrome/Edge
- ✅ Firefox
- ✅ Safari

## 🔒 Security Notes

- Never commit `firebase-config.js` with real credentials to public repos
- Use environment variables for sensitive data
- Tesla tokens are stored securely in Firestore (server-side)
- Client-side code never sees refresh tokens

## 📝 License

MIT - Feel free to use and modify!

## 🤝 Contributing

Suggestions and PRs welcome! Some ideas:
- [ ] Trip planning integration
- [ ] Scheduled charging controls
- [ ] Software update notifications
- [ ] Multiple vehicle support
- [ ] Custom tile configuration
- [ ] PWA support for offline use

## 🎉 Credits

Built with love for Tesla owners who want more from their in-car experience!
