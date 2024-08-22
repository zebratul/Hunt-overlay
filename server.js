// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sharp = require('sharp');
const bodyParser = require('body-parser');

const cors = require('cors');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
app.use(cors());

// Constants for pixel positions (example values, adjust based on game resolution)
const PIXEL_POSITIONS = [
    { x: 100, y: 700 }, // Example pixel positions for health bar
    { x: 110, y: 700 },
    { x: 120, y: 700 }
];

// Thresholds for color analysis
const HEALTH_THRESHOLDS = {
    FULL: { r: 255, g: 0, b: 0 }, // Example: red color for full health
    TWO_THIRDS: { r: 255, g: 165, b: 0 }, // Example: orange color for two-thirds health
    ONE_THIRD: { r: 255, g: 255, b: 0 }, // Example: yellow color for one-third health
    ZERO: { r: 0, g: 0, b: 0 } // Example: black color for zero health
};

let currentHealthState = 'FULL';

app.use(bodyParser.raw({ limit: '10mb', type: 'image/png' }));

// Endpoint to receive screenshots
app.post('/analyze', async (req, res) => {
    try {
        const buffer = req.body;
        console.log('received req:', req);
        
        // Extract pixels
        const pixelPromises = PIXEL_POSITIONS.map(({ x, y }) => 
            sharp(buffer)
                .extract({ left: x, top: y, width: 1, height: 1 })
                .raw()
                .toBuffer()
        );

        const pixelData = await Promise.all(pixelPromises);

        const healthState = determineHealthState(pixelData);

        if (healthState !== currentHealthState) {
            currentHealthState = healthState;
            console.log('overlayUpdate', { healthState });  
            io.emit('overlayUpdate', { healthState });
        }

        res.status(200).send('Analysis complete');
    } catch (error) {
        console.error('Error analyzing screenshot:', error);
        res.status(500).send('Error processing image');
    }
});

// Function to determine the current health state based on pixel colors
function determineHealthState(pixelData) {
    // Extract RGB values from the first pixel as an example
    const [r, g, b] = pixelData[0];

    if (isColorMatch(r, g, b, HEALTH_THRESHOLDS.FULL)) {
        return 'FULL';
    } else if (isColorMatch(r, g, b, HEALTH_THRESHOLDS.TWO_THIRDS)) {
        return 'TWO_THIRDS';
    } else if (isColorMatch(r, g, b, HEALTH_THRESHOLDS.ONE_THIRD)) {
        return 'ONE_THIRD';
    } else if (isColorMatch(r, g, b, HEALTH_THRESHOLDS.ZERO)) {
        return 'ZERO';
    } else {
        return currentHealthState; // No change detected
    }
}

// Helper function to match colors with some tolerance
function isColorMatch(r, g, b, threshold, tolerance = 10) {
    return (
        Math.abs(r - threshold.r) <= tolerance &&
        Math.abs(g - threshold.g) <= tolerance &&
        Math.abs(b - threshold.b) <= tolerance
    );
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
