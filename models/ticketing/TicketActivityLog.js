import mongoose from 'mongoose';

const ticketActivityLogSchema = new mongoose.Schema({
    ticketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
        required: true
    },
    action: {
        type: String,
        required: true
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    details: {
        type: String
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const TicketActivityLog = mongoose.models.TicketActivityLog || mongoose.model('TicketActivityLog', ticketActivityLogSchema);
export default TicketActivityLog;
