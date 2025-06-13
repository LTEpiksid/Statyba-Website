// auth-utils.js
/**
 * Generates a random alphanumeric CAPTCHA string.
 * @returns {string} The generated CAPTCHA text.
 */
export function generateCaptchaText() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let captcha = '';
    for (let i = 0; i < 6; i++) {
        captcha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return captcha;
}

/**
 * Manages login attempts and cooldown states.
 * @param {number} maxAttempts - Maximum allowed failed attempts.
 * @param {number} cooldownSeconds - Cooldown duration in seconds.
 * @returns {object} An object with methods to manage attempts and cooldown.
 */
export function createLoginAttemptManager(maxAttempts, cooldownSeconds) {
    let failedAttempts = 0;
    let cooldownEndTime = 0; // Timestamp when cooldown ends

    /**
     * Increments failed attempts and potentially sets a cooldown.
     * @returns {boolean} True if cooldown is now active, false otherwise.
     */
    function recordFailedAttempt() {
        failedAttempts++;
        if (failedAttempts >= maxAttempts) {
            cooldownEndTime = Date.now() + cooldownSeconds * 1000;
            return true; // Cooldown initiated
        }
        return false;
    }

    /**
     * Resets failed attempts and clears any active cooldown.
     */
    function resetAttempts() {
        failedAttempts = 0;
        cooldownEndTime = 0;
    }

    /**
     * Checks if a cooldown is currently active.
     * @returns {boolean} True if in cooldown, false otherwise.
     */
    function isCooldownActive() {
        return Date.now() < cooldownEndTime;
    }

    /**
     * Gets the remaining time in seconds for the cooldown.
     * @returns {number} Remaining seconds, or 0 if no cooldown.
     */
    function getCooldownRemainingSeconds() {
        const remaining = cooldownEndTime - Date.now();
        return Math.max(0, Math.floor(remaining / 1000));
    }

    /**
     * Gets the current number of failed attempts.
     * @returns {number}
     */
    function getFailedAttempts() {
        return failedAttempts;
    }

    return {
        recordFailedAttempt,
        resetAttempts,
        isCooldownActive,
        getCooldownRemainingSeconds,
        getFailedAttempts
    };
}
