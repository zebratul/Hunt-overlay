const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sharp = require('sharp');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
const server = http.createServer(app);

// PostgreSQL connection setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
});

// Twitch API constants
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_REFRESH_TOKEN = process.env.TWITCH_REFRESH_TOKEN;

// CORS setup for Vercel frontend
const corsOptions = {
    origin: ['https://hunt-overlay-react.vercel.app'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
};

app.use(cors(corsOptions));

// Initialize Socket.IO with CORS options
const io = socketIo(server, {
    cors: {
        origin: 'https://hunt-overlay-react.vercel.app',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true,
    },
});

// Environment variable to control if commands are allowed
const CONTROL_ALLOWED = true;

// Constants for pixel positions (A, B, C)
const PIXEL_POSITIONS = [
    { x: 30, y: 0 },   // Pixel A (leftmost pixel)
    { x: 370, y: 0 }, // Pixel B (middle pixel)
    { x: 650, y: 0 }  // Pixel C (rightmost pixel)
];

// Thresholds for color analysis
const RED_THRESHOLD = { r: 0, g: 0, b: 111 };
const BLACK_THRESHOLD = { r: 12, g: 12, b: 12 };

let currentHealthState = 'FULL';

app.use(bodyParser.raw({ limit: '10mb', type: 'image/png' }));
app.use(bodyParser.json());

// Endpoint to retrieve the Twitch token
app.get('/twitch-token', async (req, res) => {
    try {
        const result = await pool.query('SELECT access_token FROM twitch_tokens ORDER BY id DESC LIMIT 1');
        const tokenData = result.rows[0];
        res.json(tokenData);
    } catch (error) {
        console.error('Error retrieving Twitch token:', error);
        res.status(500).send('Error retrieving token');
    }
});

// Function to refresh Twitch token
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
        VALUES ($1, $2)`;
  
        await pool.query(insertQuery, [tokenData.access_token, expiresAt]);

        console.log('New access token saved:', tokenData.access_token);

        return tokenData.access_token;
    } catch (error) {
        console.error('Error refreshing access token:', error);
        throw error;
    }
}

// Endpoint to handle token refresh on demand
app.post('/refresh-token', async (req, res) => {
    try {
        const newToken = await refreshTwitchToken();
        res.json({ access_token: newToken });
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).send('Error refreshing token');
    }
});

// Handle command from frontend to send to local RobotJS app
app.post('/command', (req, res) => {
    const { command } = req.body;
    console.log('Received command:', command);

    // Emit the command only if CONTROL_ALLOWED is true
    if (CONTROL_ALLOWED) {
        io.emit('command', { command });
        res.status(200).send('Command received and emitted');
    } else {
        console.log('Command emission is disabled by CONTROL_ALLOWED');
        res.status(403).send('Command emission is disabled');
    }
});

// Endpoint to receive screenshots
app.post('/analyze', async (req, res) => {
    try {
        const buffer = req.body;

        const pixelPromises = PIXEL_POSITIONS.map(({ x, y }) => 
            sharp(buffer)
                .extract({ left: x, top: y, width: 1, height: 1 })
                .raw()
                .toBuffer()
        );

        const pixelBuffers = await Promise.all(pixelPromises);

        const pixelData = pixelBuffers.map(buffer => ({
            r: buffer[0],
            g: buffer[1],
            b: buffer[2]
        }));

        const healthState = determineHealthState(pixelData);

        if (healthState !== currentHealthState) {
            currentHealthState = healthState;
            console.log('Health State Updated:', { healthState });
            io.emit('overlayUpdate', { healthState });
        } else {
            console.log('Health State Unchanged:', { healthState });
        }

        res.status(200).send('Analysis complete');
    } catch (error) {
        console.error('Error analyzing screenshot:', error);
        res.status(500).send('Error processing image');
    }
});

function determineHealthState(pixelData) {
    const [pixelA, pixelB, pixelC] = pixelData;

    if (isColorMatch(pixelC, RED_THRESHOLD)) {
        return 'FULL';
    } else if (isColorMatch(pixelC, BLACK_THRESHOLD) && isColorMatch(pixelB, RED_THRESHOLD)) {
        return 'HALF';
    } else if (isColorMatch(pixelB, BLACK_THRESHOLD) && isColorMatch(pixelA, RED_THRESHOLD)) {
        return 'CRITICAL';
    } else if (isColorMatch(pixelA, BLACK_THRESHOLD)) {
        return 'DEAD';
    } else {
        return currentHealthState;
    }
}

function isColorMatch(color, threshold, tolerance = 15) {
    return (
        Math.abs(color.r - threshold.r) <= tolerance &&
        Math.abs(color.g - threshold.g) <= tolerance &&
        Math.abs(color.b - threshold.b) <= tolerance
    );
}

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`CONTROL_ALLOWED is set to ${CONTROL_ALLOWED}`);
});
