// Firebase Cloud Functions for Tesla API Integration
// Deploy this to handle secure Tesla API calls

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();

// Tesla API endpoints
const TESLA_API_BASE = 'https://owner-api.teslamotors.com/api/1';

// Cloud Function: Get Tesla Vehicle Data
exports.getTeslaVehicleData = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
        // Get user's Tesla tokens from Firestore
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User data not found');
        }

        const userData = userDoc.data();
        const { teslaAccessToken, teslaVehicleId } = userData;

        if (!teslaAccessToken || !teslaVehicleId) {
            throw new functions.https.HttpsError('failed-precondition', 'Tesla credentials not configured');
        }

        // Call Tesla API
        const response = await fetch(
            `${TESLA_API_BASE}/vehicles/${teslaVehicleId}/vehicle_data`,
            {
                headers: {
                    'Authorization': `Bearer ${teslaAccessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new functions.https.HttpsError('internal', 'Tesla API request failed');
        }

        const teslaData = await response.json();

        // Cache the data in Firestore
        await admin.firestore().collection('tesla_cache').doc(userId).set({
            data: teslaData.response,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return teslaData.response;
    } catch (error) {
        console.error('Error fetching Tesla data:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Cloud Function: Refresh Tesla Access Token
exports.refreshTeslaToken = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { refreshToken } = data;

    try {
        // Call Tesla's token refresh endpoint
        const response = await fetch('https://auth.tesla.com/oauth2/v3/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                client_id: functions.config().tesla.client_id,
                refresh_token: refreshToken
            })
        });

        if (!response.ok) {
            throw new functions.https.HttpsError('internal', 'Token refresh failed');
        }

        const tokenData = await response.json();

        // Update user's tokens in Firestore
        await admin.firestore().collection('users').doc(userId).update({
            teslaAccessToken: tokenData.access_token,
            teslaRefreshToken: tokenData.refresh_token,
            tokenUpdated: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true };
    } catch (error) {
        console.error('Error refreshing token:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Cloud Function: Get list of Tesla vehicles
exports.getTeslaVehicles = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        const userData = userDoc.data();
        const { teslaAccessToken } = userData;

        if (!teslaAccessToken) {
            throw new functions.https.HttpsError('failed-precondition', 'Tesla access token not found');
        }

        const response = await fetch(`${TESLA_API_BASE}/vehicles`, {
            headers: {
                'Authorization': `Bearer ${teslaAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new functions.https.HttpsError('internal', 'Failed to fetch vehicles');
        }

        const vehiclesData = await response.json();
        return vehiclesData.response;
    } catch (error) {
        console.error('Error fetching vehicles:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Cloud Function: Wake up Tesla vehicle
exports.wakeTeslaVehicle = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        const userData = userDoc.data();
        const { teslaAccessToken, teslaVehicleId } = userData;

        const response = await fetch(
            `${TESLA_API_BASE}/vehicles/${teslaVehicleId}/wake_up`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${teslaAccessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new functions.https.HttpsError('internal', 'Failed to wake vehicle');
        }

        const wakeData = await response.json();
        return wakeData.response;
    } catch (error) {
        console.error('Error waking vehicle:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Scheduled function to cache Tesla data every 5 minutes for active users
exports.scheduledTeslaDataSync = functions.pubsub
    .schedule('every 5 minutes')
    .onRun(async (context) => {
        const usersSnapshot = await admin.firestore()
            .collection('users')
            .where('teslaAccessToken', '!=', null)
            .get();

        const promises = usersSnapshot.docs.map(async (doc) => {
            const userId = doc.id;
            const userData = doc.data();

            try {
                const response = await fetch(
                    `${TESLA_API_BASE}/vehicles/${userData.teslaVehicleId}/vehicle_data`,
                    {
                        headers: {
                            'Authorization': `Bearer ${userData.teslaAccessToken}`
                        }
                    }
                );

                if (response.ok) {
                    const teslaData = await response.json();
                    await admin.firestore().collection('tesla_cache').doc(userId).set({
                        data: teslaData.response,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            } catch (error) {
                console.error(`Error syncing data for user ${userId}:`, error);
            }
        });

        await Promise.all(promises);
        console.log('Tesla data sync completed');
    });
