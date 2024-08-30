// screenshotAnalyzer.js
const sharp = require('sharp');

const PIXEL_POSITIONS = [
    { x: 30, y: 0 },   // Pixel A (leftmost pixel)
    { x: 370, y: 0 }, // Pixel B (middle pixel)
    { x: 650, y: 0 }  // Pixel C (rightmost pixel)
];

const RED_THRESHOLD = { r: 0, g: 0, b: 111 };
const BLACK_THRESHOLD = { r: 12, g: 12, b: 12 };

let currentHealthState = 'FULL';

async function analyzeScreenshot(buffer) {
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

    return healthState;
}

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

module.exports = {
    analyzeScreenshot,
};
