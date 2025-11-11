const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const TESLA_CONFIG = {
    clientId: process.env.TESLA_CLIENT_ID,
    clientSecret: process.env.TESLA_CLIENT_SECRET,
    tokenUrl: 'https://auth.tesla.com/oauth2/v3/token',
    apiUrl: 'https://owner-api.teslamotors.com/api/1'
};

// Endpoint to get public config (Client ID only)
app.get('/api/config', (req, res) => {
    if (!TESLA_CONFIG.clientId) {
        return res.status(500).json({ 
            error: 'Tesla Client ID not configured in .env file' 
        });
    }
    
    res.json({
        clientId: TESLA_CONFIG.clientId
    });
});

// Exchange authorization code for tokens
app.post('/api/auth/token', async (req, res) => {
    const { code, code_verifier, redirect_uri } = req.body;
    
    try {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: TESLA_CONFIG.clientId,
            client_secret: TESLA_CONFIG.clientSecret,
            code: code,
            code_verifier: code_verifier,
            redirect_uri: redirect_uri
        });
        
        const response = await fetch(TESLA_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        
        res.json(data);
    } catch (error) {
        console.error('Token exchange error:', error);
        res.status(500).json({ error: 'Token exchange failed' });
    }
});

// Refresh access token
app.post('/api/auth/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    
    try {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: TESLA_CONFIG.clientId,
            client_secret: TESLA_CONFIG.clientSecret,
            refresh_token: refresh_token
        });
        
        const response = await fetch(TESLA_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        
        res.json(data);
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

// Proxy Tesla API requests
app.get('/api/vehicles', async (req, res) => {
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (!accessToken) {
        return res.status(401).json({ error: 'No access token provided' });
    }
    
    try {
        const response = await fetch(`${TESLA_CONFIG.apiUrl}/vehicles`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API error:', error);
        res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
});

// Get vehicle data
app.get('/api/vehicles/:id/vehicle_data', async (req, res) => {
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    const vehicleId = req.params.id;
    
    if (!accessToken) {
        return res.status(401).json({ error: 'No access token provided' });
    }
    
    try {
        const response = await fetch(
            `${TESLA_CONFIG.apiUrl}/vehicles/${vehicleId}/vehicle_data`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API error:', error);
        res.status(500).json({ error: 'Failed to fetch vehicle data' });
    }
});

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';

app.listen(PORT, HOST, () => {
    console.log(`Backend server running on http://${HOST}:${PORT}`);
    console.log(`Tesla OAuth credentials loaded from environment variables`);
    console.log(`Client ID: ${TESLA_CONFIG.clientId ? TESLA_CONFIG.clientId.substring(0, 8) + '...' : 'NOT SET'}`);
}).on('error', (err) => {
    console.error('Failed to start server:', err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please kill the process or use a different port.`);
    }
    process.exit(1);
});
