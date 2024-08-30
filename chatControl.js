// chatControl.js
const { pool } = require('./dbService');
const { getHealthState } = require('./healthService'); // Import the function to get the current health state

// Cooldown periods in milliseconds
const REGULAR_COOLDOWN_PERIOD = 2 * 60 * 1000; // 2 minutes for regular users
const SUPPORTER_COOLDOWN_PERIOD = 1 * 60 * 1000; // 1 minute for supporters

async function isUserOnCooldown(userId) {
    try {
        const result = await pool.query('SELECT last_request, is_supporter FROM users WHERE id = $1', [userId]);
        if (result.rows.length > 0) {
            const { last_request: lastRequest, is_supporter: isSupporter } = result.rows[0];

            const cooldownPeriod = isSupporter ? SUPPORTER_COOLDOWN_PERIOD : REGULAR_COOLDOWN_PERIOD;

            if (lastRequest) {
                const timeSinceLastRequest = Date.now() - new Date(lastRequest).getTime();
                return timeSinceLastRequest < cooldownPeriod;
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking user cooldown:', error);
        throw error;
    }
}

async function updateUserRequestTime(userId) {
    try {
        await pool.query('UPDATE users SET last_request = $1 WHERE id = $2', [new Date(), userId]);
    } catch (error) {
        console.error('Error updating user request time:', error);
        throw error;
    }
}

async function handleChatCommand(command, userId) {
    try {
        const healthState = await getHealthState(); // Get the current health state

        // If health is critical, bypass cooldown checks
        if (healthState === 'CRITICAL') {
            console.log(`Health is CRITICAL. Bypassing cooldown for user ${userId}.`);
            io.emit('command', { command });
            console.log(`Command ${command} executed for user ${userId}.`);
            return { status: 'success', message: `Command ${command} executed successfully due to critical health.` };
        }

        const userOnCooldown = await isUserOnCooldown(userId);

        if (userOnCooldown) {
            console.log(`User ${userId} is on cooldown. Command not executed.`);
            return { status: 'cooldown', message: 'You are on cooldown. Please wait before issuing another command.' };
        }

        // Update the user's last request time
        await updateUserRequestTime(userId);

        // Execute the command (sending it to the RobotJS app via Socket.IO)
        io.emit('command', { command });
        console.log(`Command ${command} executed for user ${userId}.`);

        return { status: 'success', message: `Command ${command} executed successfully.` };
    } catch (error) {
        console.error('Error handling chat command:', error);
        return { status: 'error', message: 'An error occurred while processing your command.' };
    }
}

module.exports = {
    handleChatCommand,
};
