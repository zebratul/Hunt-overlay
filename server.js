const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sharp = require('sharp');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const corsOptions = {
    origin: ['https://hunt-overlay-react.vercel.app'], // Replace with your Vercel app's URL
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

// Constants for pixel positions (A, B, C)
const PIXEL_POSITIONS = [
    { x: 30, y: 0 },   // Pixel A (leftmost pixel)
    { x: 370, y: 0 }, // Pixel B (middle pixel)
    { x: 650, y: 0 }  // Pixel C (rightmost pixel)
];

// Thresholds for color analysis
const RED_THRESHOLD = { r: 0, g: 0, b: 110 }; // Example: red color for full health
const BLACK_THRESHOLD = { r: 10, g: 10, b: 10 }; // Example: black color for no health

let currentHealthState = 'FULL';

app.use(bodyParser.raw({ limit: '10mb', type: 'image/png' }));

// Endpoint to receive screenshots
app.post('/analyze', async (req, res) => {
    console.log('received req:', req);
    
    try {
        const buffer = req.body;

        // Extract pixels A, B, C
        const pixelPromises = PIXEL_POSITIONS.map(({ x, y }) => 
            sharp(buffer)
                .extract({ left: x, top: y, width: 1, height: 1 })
                .raw()
                .toBuffer()
        );

        const pixelBuffers = await Promise.all(pixelPromises);

        // Convert Buffer data to RGB values
        const pixelData = pixelBuffers.map(buffer => ({
            r: buffer[0],
            g: buffer[1],
            b: buffer[2]
        }));

        // console.log('pixelData', pixelData );
        
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

// Function to determine the current health state based on pixel colors
function determineHealthState(pixelData) {
    // Extract RGB values for A, B, C pixels
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
        return currentHealthState; // No change detected
    }
}

// Helper function to match colors with some tolerance
function isColorMatch(color, threshold, tolerance = 10) {
    return (
        Math.abs(color.r - threshold.r) <= tolerance &&
        Math.abs(color.g - threshold.g) <= tolerance &&
        Math.abs(color.b - threshold.b) <= tolerance
    );
}

// Start the server
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
});
