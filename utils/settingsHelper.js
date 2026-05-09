const Settings = require('../models/Settings');

// Cache with 5-minute expiry
let settingsCache = {};
let lastCacheTime = {};

async function getSetting(key, defaultValue = null) {
    const now = Date.now();
    
    // Return from cache if valid
    if (settingsCache[key] !== undefined && 
        lastCacheTime[key] && 
        (now - lastCacheTime[key]) < 5 * 60 * 1000) {
        return settingsCache[key];
    }
    
    try {
        const value = await Settings.get(key, defaultValue);
        
        // Update cache
        settingsCache[key] = value;
        lastCacheTime[key] = now;
        
        return value;
    } catch (error) {
        console.error(`Error getting setting ${key}:`, error);
        return defaultValue;
    }
}

// Specific getters for common settings
async function getWithdrawalRate() {
    return await getSetting('withdrawal_rate', 20);
}

async function getMinWithdrawalCredits() {
    return await getSetting('min_withdrawal_credits', 10);
}

async function getTeacherLevelForWithdrawal() {
    return await getSetting('teacher_level_withdrawal_unlock', 3);
}

async function getCreditPurchaseRate() {
    return await getSetting('credit_purchase_rate', 1);
}

async function getTeacherLevelForCustomRate() {
    return await getSetting('teacher_level_custom_rate_unlock', 4);
}

async function getTeacherLevelForGroupSession() {
    return await getSetting('teacher_level_group_session_unlock', 5);
}

async function getSessionValidityMinutes() {
    return await getSetting('session_validity_minutes', 35);
}

async function getSessionPartialMinutes() {
    return await getSetting('session_partial_minutes', 20);
}

// Clear cache (useful after admin updates)
function clearSettingsCache() {
    settingsCache = {};
    lastCacheTime = {};
}

module.exports = {
    getSetting,
    getWithdrawalRate,
    getMinWithdrawalCredits,
    getTeacherLevelForWithdrawal,
    getCreditPurchaseRate,
    getTeacherLevelForCustomRate,
    getTeacherLevelForGroupSession,
    getSessionValidityMinutes,
    getSessionPartialMinutes,
    clearSettingsCache
};