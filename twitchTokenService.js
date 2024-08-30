// twitchTokenService.js
const axios = require('axios');
const { pool } = require('./dbService');

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_REFRESH_TOKEN = process.env.TWITCH_REFRESH_TOKEN;

async function fetchTwitchToken() {
    try {
        const result = await pool.query('SELECT access_token FROM twitch_tokens ORDER BY id DESC LIMIT 1');
        return result.rows[0];
    } catch (error) {
        console.error('Error retrieving Twitch token:', error);
        throw error;
    }
}

async function refreshTwitchToken() {
    try {
        const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                refresh_token: TWITCH_REFRESH_TOKEN,
                grant_type: 'refresh_token',
            },
        });

        const tokenData = response.data;
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

        // Save the new token to the database
        const insertQuery = `
            INSERT INTO twitch_tokens (access_token, expires_at)
            VALUES ($1, $2)
        `;
        await pool.query(insertQuery, [tokenData.access_token, expiresAt]);

        console.log('New access token saved:', tokenData.access_token);
        return tokenData.access_token;
    } catch (error) {
        console.error('Error refreshing access token:', error);
        throw error;
    }
}

module.exports = {
    fetchTwitchToken,
    refreshTwitchToken,
};
