import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
    profilePicture: {
        type: String,
    },

    firstName: {
        type: String,
        required: true,
    },
    lastName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Prefer not to say'],
        required: true,
    },
    preferences: {
        fontSize: {
            type: String,
            enum: ['small', 'medium', 'large', 'extra large'],
            default: 'medium'
        },
        theme: {
            type: String,
            enum: ['light', 'dark', 'auto'],
            default: 'auto'
        },
        accessibility: {
            highContrast: { type: Boolean, default: false },
            screenReader: { type: Boolean, default: false },
            keyboardNav: { type: Boolean, default: false },
            animationReducer: { type: Boolean, default: false },
            focusIndicators: { type: Boolean, default: false }
        },
        notifications: {
            newJobApplication: {
                push: { type: Boolean, default: true },
                email: { type: Boolean, default: true },
                inApp: { type: Boolean, default: true }
            },
            inAppMessages: {
                push: { type: Boolean, default: true },
                email: { type: Boolean, default: true },
                inApp: { type: Boolean, default: true }
            },
            systemUpdates: {
                push: { type: Boolean, default: true },
                email: { type: Boolean, default: true },
                inApp: { type: Boolean, default: true }
            },
            quietHours: {
                enabled: { type: Boolean, default: false },
                start: { type: String, default: '22:00' },
                end: { type: String, default: '08:00' }
            }
        },
        privacy: {
            dataSharing: { type: Boolean, default: true },
            activityTracking: { type: Boolean, default: true },
            thirdPartyIntegrations: { type: Boolean, default: true }
        }
    }
},
    { timestamps: true });

userSchema.methods.comparePassword = async function (password) {
    const compare = await bcrypt.compare(password, this.password);
    return compare;
};

userSchema.methods.getMe = function () {
    const userObject = this.toObject();
    delete userObject.password;
    userObject.role = userObject.__t;
    delete userObject.__t;
    return userObject;
};

userSchema.methods.getPublicProfile = function () {
    const userObject = this.toObject();
    delete userObject.password;
    delete userObject.__t;
    delete userObject.appliedJobs;
    return userObject;
};

userSchema.pre('save', async function (next) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(this.password, salt);
    this.password = hash;

    //email is lowercase
    this.email = this.email.toLowerCase();

    //name is uppercase
    this.firstName = this.firstName.toUpperCase();
    this.lastName = this.lastName.toUpperCase();
    next();
});

userSchema.pre('create', async function (next) {
    const salt = await bcrypt.genSalt(10);
    const hash = bcrypt.hash(this.password, salt);
    this.password = hash;

    //email is lowercase
    this.email = this.email.toLowerCase();

    //name is uppercase
    this.firstName = this.firstName.toUpperCase();
    this.lastName = this.lastName.toUpperCase();
    next();
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
