import EventEmitter from 'events';
import TicketActivityLog from '../../models/ticketing/TicketActivityLog.js';

class TicketObserver extends EventEmitter {
    constructor() {
        super();
        this.on('statusChanged', this.logStatusChange);
        this.on('ticketCreated', this.logTicketCreation);
        this.on('ticketClosed', this.logTicketClosure);
    }

    async logStatusChange({ ticketId, oldStatus, newStatus, performedBy }) {
        try {
            await TicketActivityLog.create({
                ticketId,
                action: 'STATUS_UPDATE',
                performedBy,
                details: `Status changed from ${oldStatus} to ${newStatus}`
            });
            console.log(`[TicketObserver] Logged status change for ticket ${ticketId}`);
        } catch (error) {
            console.error('[TicketObserver] Failed to log status change', error);
        }
    }

    async logTicketCreation({ ticketId, performedBy }) {
        try {
            await TicketActivityLog.create({
                ticketId,
                action: 'CREATED',
                performedBy,
                details: 'Ticket created'
            });
            console.log(`[TicketObserver] Logged creation for ticket ${ticketId}`);
        } catch (error) {
            console.error('[TicketObserver] Failed to log ticket creation', error);
        }
    }

    async logTicketClosure({ ticketId, performedBy }) {
        try {
            await TicketActivityLog.create({
                ticketId,
                action: 'CLOSED',
                performedBy,
                details: 'Ticket closed'
            });
            console.log(`[TicketObserver] Logged closure for ticket ${ticketId}`);
        } catch (error) {
            console.error('[TicketObserver] Failed to log ticket closure', error);
        }
    }
}

export default new TicketObserver();
