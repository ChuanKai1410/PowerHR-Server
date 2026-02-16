import Ticket from '../../models/ticketing/Ticket.js';
import TicketObserver from './TicketObserver.js';

class TicketService {
    async createTicket(data, userId) {
        const ticket = await Ticket.create({
            ...data,
            createdBy: userId
        });
        TicketObserver.emit('ticketCreated', {
            ticketId: ticket._id,
            performedBy: userId
        });
        return ticket;
    }

    async getTickets(filters = {}) {
        const query = {};

        if (filters.status) query.status = filters.status;
        if (filters.category) query.category = filters.category;
        if (filters.startDate && filters.endDate) {
            query.createdAt = {
                $gte: new Date(filters.startDate),
                $lte: new Date(filters.endDate)
            };
        }
        if (filters.createdBy) query.createdBy = filters.createdBy;

        return await Ticket.find(query).populate('createdBy', 'name email').sort({ createdAt: -1 });
    }

    async getTicketById(id) {
        return await Ticket.findById(id).populate('createdBy', 'name email');
    }

    async updateTicketStatus(id, status, userId) {
        const ticket = await Ticket.findById(id);
        if (!ticket) throw new Error('Ticket not found');

        const oldStatus = ticket.status;
        ticket.status = status;

        if (status === 'Closed') {
            ticket.closedAt = new Date();
            TicketObserver.emit('ticketClosed', {
                ticketId: ticket._id,
                performedBy: userId
            });
        }

        await ticket.save();

        TicketObserver.emit('statusChanged', {
            ticketId: ticket._id,
            oldStatus,
            newStatus: status,
            performedBy: userId
        });

        return ticket;
    }

    async closeTicket(id, userId) {
        return this.updateTicketStatus(id, 'Closed', userId);
    }
}

export default new TicketService();
