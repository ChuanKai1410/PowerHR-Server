import mongoose from 'mongoose';

// Auto-generate sequential ticketId like TKT-000001
async function generateTicketId() {
    const count = await mongoose.model('Ticket').countDocuments();
    return `TKT-${String(count + 1).padStart(6, '0')}`;
}

const ticketSchema = new mongoose.Schema({
    ticketId: {
        type: String,
        unique: true,
        index: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
        enum: ['Bug', 'Suggestion', 'Feedback', 'Technical Issue', 'Other'],
    },
    priority: {
        type: String,
        default: 'Medium',
        enum: ['Low', 'Medium', 'High', 'Critical'],
    },
    status: {
        type: String,
        default: 'Pending',
        enum: ['Pending', 'In Progress', 'Resolved', 'Closed'],
    },
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    submittedByEmail: {
        type: String,
        required: true,
    },
    submittedByName: {
        type: String,
        required: true,
    },
    attachments: [
        {
            url: { type: String },
            filename: { type: String },
        },
    ],
    statusUpdates: [
        {
            status: { type: String, required: true },
            description: { type: String, required: true },
            attachment: {
                url: { type: String },
                filename: { type: String },
            },
            updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            updatedAt: { type: Date, default: Date.now }
        }
    ],
    closedAt: {
        type: Date,
    },
}, {
    timestamps: true,
});

// Auto-assign ticketId before first save
ticketSchema.pre('save', async function (next) {
    if (this.isNew && !this.ticketId) {
        this.ticketId = await generateTicketId();
    }
    next();
});

const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
export default Ticket;
