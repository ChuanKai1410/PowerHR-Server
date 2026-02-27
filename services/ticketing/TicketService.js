import Ticket from '../../models/ticketing/Ticket.js';
import User from '../../models/users/user.js';
import TicketObserver from './TicketObserver.js';
import ApiError from '../../util/ApiError.js';

class TicketService {
    async createTicket(data, userId) {
        // Look up user to get email + name for denormalized fields
        const user = await User.findById(userId);
        if (!user) throw new ApiError(404, 'User not found');

        const ticket = await Ticket.create({
            ...data,
            submittedBy: userId,
            submittedByEmail: user.email,
            submittedByName: `${user.firstName} ${user.lastName}`,
        });

        TicketObserver.emit('ticketCreated', {
            ticketId: ticket._id,
            performedBy: userId,
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
                $lte: new Date(filters.endDate),
            };
        }
        if (filters.submittedBy) query.submittedBy = filters.submittedBy;

        return await Ticket.find(query)
            .populate('submittedBy', 'firstName lastName email')
            .sort({ createdAt: -1 });
    }

    async getTicketById(id) {
        const ticket = await Ticket.findById(id)
            .populate('submittedBy', 'firstName lastName email');
        if (!ticket) throw new ApiError(404, 'Ticket not found');
        return ticket;
    }

    async updateTicketInfo(id, userId, data) {
        const ticket = await Ticket.findById(id);
        if (!ticket) throw new ApiError(404, 'Ticket not found');
        if (ticket.submittedBy.toString() !== userId.toString()) {
            throw new ApiError(403, 'You are not allowed to update this ticket');
        }
        if (ticket.status === 'Closed') {
            throw new ApiError(400, 'Cannot update a closed ticket');
        }

        const allowedFields = ['title', 'description', 'category', 'priority'];
        allowedFields.forEach((field) => {
            if (data[field] !== undefined) ticket[field] = data[field];
        });

        await ticket.save();
        return ticket;
    }

    async updateTicketStatus(id, status, userId) {
        const ticket = await Ticket.findById(id);
        if (!ticket) throw new ApiError(404, 'Ticket not found');

        const oldStatus = ticket.status;
        ticket.status = status;

        if (status === 'Closed') {
            ticket.closedAt = new Date();
            TicketObserver.emit('ticketClosed', {
                ticketId: ticket._id,
                performedBy: userId,
            });
        }

        await ticket.save();

        TicketObserver.emit('statusChanged', {
            ticketId: ticket._id,
            oldStatus,
            newStatus: status,
            performedBy: userId,
        });

        return ticket;
    }

    async closeTicket(id, userId) {
        return this.updateTicketStatus(id, 'Closed', userId);
    }
}

export default new TicketService();
