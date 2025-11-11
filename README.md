# Tesla Dashboard Web App

An attractive, feature-rich dashboard designed for the Tesla Model 3 Highland in-car browser with authentic Tesla design aesthetics.

## 🚗 Features

### Tesla-Specific Tiles
- **Battery Status** - Level, range, charging status with visual indicators
- **Climate Control** - Inside/outside temperature, climate status
- **Vehicle Info** - Odometer, lock status, sentry mode
- **Account Connection** - OAuth authentication with auth.tesla.com

### General Information Tiles
- **Weather** - Real-time weather based on location
- **News** - Latest headlines from BBC World News
- **NASA Photo** - Astronomy Picture of the Day
- **Inspirational Quotes** - Motivational quotes
- **Random Facts** - Interesting trivia
- **Currency Converter** - Live exchange rates
- **Nearby Charging** - EV charging stations via OpenChargeMap
- **Quick Links** - Tesla resources and route planners

## � Tesla API Authentication

This app supports direct OAuth integration with Tesla's auth.tesla.com.

### ⚠️ Important: CORS Limitations

Direct browser-to-Tesla API calls will fail due to CORS restrictions. You have several options:

### Recommended Approaches:

#### 1️⃣ Use Tessie (Easiest - $5/month)
- Sign up at https://my.tessie.com/
- Link your Tesla account through their OAuth
- Use Tessie's API (no CORS issues)
- Get instant access to all vehicle data

#### 2️⃣ Use TeslaFi
- Similar to Tessie
- Great logging features
- https://www.teslafi.com/

#### 3️⃣ Self-Host TeslaMate (Free)
- Open source Tesla data logger
- Requires Docker/server setup
- https://github.com/adriankumpf/teslamate

#### 4️⃣ Build a Backend Proxy
- Use Node.js, Python, or Go
- Proxy requests to Tesla API
- Handle OAuth token exchange securely
- No CORS issues

### Direct OAuth Setup (Advanced)

1. **Register Your App**
   - Visit: https://developer.tesla.com/
   - Create a new application
   - Get your Client ID and Client Secret

2. **Configure the App**
   ```javascript
   // In app.js, update TESLA_OAUTH_CONFIG:
   const TESLA_OAUTH_CONFIG = {
       clientId: 'your_actual_client_id',
       clientSecret: 'your_actual_client_secret',
       redirectUri: window.location.origin + '/callback.html',
       // ... rest of config
   };
   ```

3. **Note on Security**
   - ⚠️ Client secrets in browser code are visible to users
   - This is acceptable for personal use only
   - For production, use a backend proxy

### OAuth Flow

The app implements PKCE (Proof Key for Code Exchange) for security:
1. User clicks "Connect Tesla Account"
2. Redirects to auth.tesla.com
3. User logs in and authorizes
4. Returns to callback.html with authorization code
5. Exchanges code for access token
6. Stores tokens in localStorage

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

### Demo Mode (No Setup Required)
1. Open `index.html` in your browser
2. All tiles work with demo/mock data
3. Tesla tiles show realistic example data

### With Real Tesla Data
1. Choose your preferred method (Tessie/TeslaFi/Backend)
2. Update OAuth configuration in `app.js`
3. Click "Connect Tesla Account"
4. Authorize the app
5. Enjoy real-time vehicle data!

## 🎨 Tesla Design System

The app faithfully recreates Tesla's signature aesthetic:

- **Typography**: Montserrat font (closest to Tesla's Gotham)
- **Colors**: Pure black, dark grays, Tesla red (#cc0000), Tesla blue (#3e6ae1)
- **Layout**: Minimalist, angular design with sharp corners
- **Logo**: Official Tesla SVG logo in header
- **Buttons**: Tesla blue primary actions
- **Typography**: Light font weights (300-500) for that premium feel
- **Spacing**: Clean, generous spacing like Tesla interfaces

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

- ⚠️ Client secrets in browser are visible - use only for personal projects
- For production apps, implement a backend proxy
- Tokens stored in localStorage (less secure than httpOnly cookies)
- PKCE implemented for additional OAuth security
- Consider using Tessie/TeslaFi for better security

## 📝 License

MIT - Feel free to use and modify!

## 🤝 Contributing

Suggestions and PRs welcome! Some ideas:
- [ ] Backend proxy implementation
- [ ] Tessie API integration
- [ ] Trip planning with A Better Route Planner
- [ ] Scheduled charging controls
- [ ] Software update notifications
- [ ] Multiple vehicle support
- [ ] Custom tile configuration
- [ ] PWA support for offline use
- [ ] Voice control integration

## 🎉 Credits

Built with love for Tesla owners who want more from their in-car experience!
