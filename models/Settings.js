const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Predefined settings with defaults
const defaultSettings = [
    {
        key: 'withdrawal_rate',
        value: 20,
        description: '1 credit = ₹X when teacher withdraws credits'
    },
    {
        key: 'min_withdrawal_credits',
        value: 10,
        description: 'Minimum credits required for withdrawal'
    },
    {
        key: 'teacher_level_withdrawal_unlock',
        value: 3,
        description: 'Minimum teacher level to withdraw credits'
    },
    {
        key: 'credit_purchase_rate',
        value: 1,
        description: '1 credit = ₹X when student purchases credits'
    },
    {
        key: 'teacher_level_custom_rate_unlock',
        value: 4,
        description: 'Minimum teacher level to set custom rates'
    },
    {
        key: 'teacher_level_group_session_unlock',
        value: 5,
        description: 'Minimum teacher level for group sessions'
    },
    {
        key: 'teacher_level_withdrawal_unlock',
        value: 3,
        description: 'Minimum teacher level to withdraw credits'
    },
   {
    key: 'session_partial_minutes',
    value: 2,
    description: 'Minimum minutes for partially valid session'
},
{
    key: 'session_validity_minutes',
    value: 3,
    description: 'Minimum minutes for fully valid session'
}
];

// Method to initialize default settings
settingsSchema.statics.initDefaults = async function() {
    for (const setting of defaultSettings) {
        const exists = await this.findOne({ key: setting.key });
        if (!exists) {
            await this.create(setting);
            
        }
    }
};

// Method to get setting value
settingsSchema.statics.get = async function(key, defaultValue = null) {
    const setting = await this.findOne({ key, isActive: true });
    return setting ? setting.value : defaultValue;
};

// Method to set setting value (for admin)
settingsSchema.statics.set = async function(key, value, updatedBy = null) {
    return await this.findOneAndUpdate(
        { key },
        {
            key,
            value,
            updatedBy,
            updatedAt: new Date()
        },
        { upsert: true, new: true }
    );
};

module.exports = mongoose.model('Settings', settingsSchema);