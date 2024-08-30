// chatControl.js
const { pool } = require('./dbService');
const { getCurrentHealthState } = require('./screenshotAnalyzer'); // Import the function to get the current health state
const socketIo = require('socket.io');

const io = socketIo(server, {
    cors: {
        origin: 'https://hunt-overlay-react.vercel.app',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true,
    },
});

// Cooldown periods in milliseconds
const REGULAR_COOLDOWN_PERIOD = 2 * 60 * 1000; // 2 minutes for regular users
const SUPPORTER_COOLDOWN_PERIOD = 1 * 60 * 1000; // 1 minute for supporters

async function findOrCreateUser(username) {
    try {
        const result = await pool.query('SELECT id, last_request, is_supporter FROM users WHERE username = $1', [username]);
        
        if (result.rows.length > 0) {
            return result.rows[0];
        } else {
            // If the user does not exist, create a new user
            const insertResult = await pool.query(
                'INSERT INTO users (username, last_request, is_supporter, points) VALUES ($1, $2, $3, $4) RETURNING *',
                [username, null, false, 0] // Default values: no last request, not a supporter, 0 points
            );
            return insertResult.rows[0];
        }
    } catch (error) {
        console.error('Error finding or creating user:', error);
        throw error;
    }
}

async function isUserOnCooldown(username) {
    try {
        const user = await findOrCreateUser(username);
        const cooldownPeriod = user.is_supporter ? SUPPORTER_COOLDOWN_PERIOD : REGULAR_COOLDOWN_PERIOD;

        if (user.last_request) {
            const timeSinceLastRequest = Date.now() - new Date(user.last_request).getTime();
            return timeSinceLastRequest < cooldownPeriod;
        }
        return false;
    } catch (error) {
        console.error('Error checking user cooldown:', error);
        throw error;
    }
}

async function updateUserRequestTime(username) {
    try {
        const user = await findOrCreateUser(username);
        await pool.query('UPDATE users SET last_request = $1 WHERE id = $2', [new Date(), user.id]);
    } catch (error) {
        console.error('Error updating user request time:', error);
        throw error;
    }
}

async function handleChatCommand(command, username) {
    try {
        const healthState = getCurrentHealthState(); // Get the current health state

        // If health is critical, bypass cooldown checks
        if (healthState === 'CRITICAL') {
            console.log(`Health is CRITICAL. Bypassing cooldown for user ${username}.`);
            io.emit('command', { command });
            console.log(`Command ${command} executed for user ${username}.`);
            return { status: 'success', message: `Command ${command} executed successfully due to critical health.` };
        }

        const userOnCooldown = await isUserOnCooldown(username);

        if (userOnCooldown) {
            console.log(`User ${username} is on cooldown. Command not executed.`);
            return { status: 'cooldown', message: 'You are on cooldown. Please wait before issuing another command.' };
        }

        // Update the user's last request time
        await updateUserRequestTime(username);

        // Execute the command (sending it to the RobotJS app via Socket.IO)
        io.emit('command', { command });
        console.log(`Command ${command} executed for user ${username}.`);

        return { status: 'success', message: `Command ${command} executed successfully.` };
    } catch (error) {
        console.error('Error handling chat command:', error);
        return { status: 'error', message: 'An error occurred while processing your command.' };
    }
}

module.exports = {
    handleChatCommand,
};
