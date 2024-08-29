const { Client } = require('pg');
const axios = require('axios');
require('dotenv').config();

// PostgreSQL connection setup
const dbClient = new Client({
    connectionString: process.env.DATABASE_URL, // Ensure you set this environment variable in Render
    ssl: {
        rejectUnauthorized: false
    }
});

dbClient.connect();

// Function to get the stored token from the database
async function getStoredToken() {
    const res = await dbClient.query('SELECT * FROM twitch_tokens ORDER BY id DESC LIMIT 1');
    if (res.rows.length > 0) {
        return res.rows[0];
    } else {
        return null;
    }
}

// Function to store or update the token in the database
async function storeToken(accessToken, expiresIn) {
    const expiresAt = new Date(Date.now() + expiresIn * 1000); // Calculate the expiration time
    await dbClient.query('INSERT INTO twitch_tokens (access_token, expires_at) VALUES ($1, $2)', [accessToken, expiresAt]);
}

// Function to fetch a new access token
async function fetchNewAccessToken() {
    try {
        const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'client_credentials', // Use client_credentials or authorization_code as per your flow
            },
        });

        const tokenData = response.data;

        // Store the new token in the database
        await storeToken(tokenData.access_token, tokenData.expires_in);

        return tokenData.access_token;
    } catch (error) {
        console.error('Error fetching new access token:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Function to get a valid token (from the database or by refreshing)
async function getValidToken() {
    const storedToken = await getStoredToken();

    if (storedToken) {
        const currentTime = new Date();
        const expiresAt = new Date(storedToken.expires_at);

        if (currentTime < expiresAt) {
            console.log('Using stored access token');
            return storedToken.access_token;
        }
    }

    console.log('Fetching a new access token');
    return await fetchNewAccessToken();
}

module.exports = {
    getValidToken
};
