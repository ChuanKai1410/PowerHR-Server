import TicketService from './TicketService.js';
import ReportFactory from './ReportFactory.js';
import fs from 'fs';
import path from 'path';

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
        const file = data.file;
        let attachmentUrl = null;

        if (file) {
            // Handle file upload
            const filename = `ticket-${Date.now()}-${file.filename}`;
            const uploadDir = path.join(process.cwd(), 'public', 'uploads');

            // Ensure directory exists
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            const filepath = path.join(uploadDir, filename);
            const buffer = await file.toBuffer();
            fs.writeFileSync(filepath, buffer);
            attachmentUrl = `/uploads/${filename}`;
        }

        return await TicketService.createTicket({
            title,
            description,
            category,
            priority,
            attachmentUrl
        }, userId);
    }

    async getTickets(filters) {
        return await TicketService.getTickets(filters);
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
