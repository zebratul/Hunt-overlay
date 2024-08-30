// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const { fetchTwitchToken, refreshTwitchToken } = require('./twitchTokenService');
const { analyzeScreenshot } = require('./screenshotAnalyzer');
const { handleChatCommand } = require('./chatControl'); // Import the function from chatControl.js

const app = express();
const server = http.createServer(app);

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

const CONTROL_ALLOWED = true;

app.use(bodyParser.raw({ limit: '10mb', type: 'image/png' }));
app.use(bodyParser.json());

// Endpoint to retrieve the Twitch token
app.get('/twitch-token', async (req, res) => {
    try {
        const tokenData = await fetchTwitchToken();
        res.json(tokenData);
    } catch (error) {
        console.error('Error retrieving Twitch token:', error);
        res.status(500).send('Error retrieving token');
    }
});

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
app.post('/command', async (req, res) => {
    const { command, userName } = req.body;
    console.log('Received command:', command, 'from user:', userName);

    if (CONTROL_ALLOWED) {
        const result = await handleChatCommand(command, userName, io); // Pass io to handleChatCommand
        res.status(200).json(result);
    } else {
        console.log('Command emission is disabled by CONTROL_ALLOWED');
        res.status(403).send('Command emission is disabled');
    }
});

// Endpoint to receive screenshots
app.post('/analyze', async (req, res) => {
    try {
        const buffer = req.body;
        const healthState = await analyzeScreenshot(buffer);

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

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`CONTROL_ALLOWED is set to ${CONTROL_ALLOWED}`);
});
