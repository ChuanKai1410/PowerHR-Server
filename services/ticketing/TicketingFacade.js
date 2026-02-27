import TicketService from './TicketService.js';
import ReportFactory from './ReportFactory.js';
import ApiError from '../../util/ApiError.js';
import fs from 'fs';
import path from 'path';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

class TicketingFacade {
    async submitTicket(data, userId) {
        const extractValue = (field) => {
            if (field && typeof field === 'object' && field.value !== undefined) {
                return field.value;
            }
            return field;
        };

        const title = extractValue(data.title);
        const description = extractValue(data.description);
        const category = extractValue(data.category);
        const priority = extractValue(data.priority);
        const attachments = [];

        // Support both single file (data.files as object) and multiple files (data.files as array)
        const rawFiles = data.files
            ? Array.isArray(data.files) ? data.files : [data.files]
            : [];

        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        for (const file of rawFiles) {
            // Validate — only JPEG and PNG allowed
            if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
                throw new ApiError(400, 'Only JPEG and PNG image files are allowed as attachments');
            }

            const filename = `ticket-${Date.now()}-${file.filename}`;
            const filepath = path.join(uploadDir, filename);
            const buffer = await file.toBuffer();
            fs.writeFileSync(filepath, buffer);

            attachments.push({
                url: `/uploads/${filename}`,
                filename: file.filename,
            });
        }

        return await TicketService.createTicket({
            title,
            description,
            category,
            priority,
            attachments,
        }, userId);
    }

    async getMyTickets(userId, filters = {}) {
        return await TicketService.getTickets({ ...filters, submittedBy: userId });
    }

    async getTickets(filters) {
        return await TicketService.getTickets(filters);
    }

    async getTicketById(id) {
        return await TicketService.getTicketById(id);
    }

    async updateTicketInfo(id, userId, data) {
        return await TicketService.updateTicketInfo(id, userId, data);
    }

    async updateTicketStatus(id, status, adminId) {
        return await TicketService.updateTicketStatus(id, status, adminId);
    }

    async closeTicket(id, userId) {
        return await TicketService.closeTicket(id, userId);
    }

    async generateReport(filters, format, reply) {
        const tickets = await TicketService.getTickets(filters);
        const reportStrategy = ReportFactory.createReport(format);
        return reportStrategy.generate(tickets, reply);
    }
}

export default new TicketingFacade();
