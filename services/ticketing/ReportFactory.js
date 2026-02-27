import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

class ReportStrategy {
    generate(data, reply) {
        throw new Error('Method not implemented');
    }
}

class PdfReport extends ReportStrategy {
    generate(data, reply) {
        const doc = new PDFDocument();
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', 'attachment; filename=ticket_report.pdf');

        reply.send(doc);

        doc.fontSize(20).text('Ticket Report', { align: 'center' });
        doc.moveDown();

        data.forEach(ticket => {
            doc.fontSize(12).text(`Ticket ID: ${ticket.ticketId || '-'}`);
            doc.text(`Title: ${ticket.title}`);
            doc.text(`Status: ${ticket.status}`);
            doc.text(`Category: ${ticket.category}`);
            doc.text(`Priority: ${ticket.priority}`);
            doc.text(`Submitted By: ${ticket.submittedByName || ticket.submittedBy?.toString() || 'Unknown'}`);
            doc.text(`Email: ${ticket.submittedByEmail || '-'}`);
            doc.text(`Date: ${new Date(ticket.createdAt).toLocaleDateString()}`);
            doc.moveDown();
            doc.text('-----------------------------------');
            doc.moveDown();
        });

        doc.end();
    }
}

class ExcelReport extends ReportStrategy {
    async generate(data, reply) {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Tickets');

        sheet.columns = [
            { header: 'Ticket ID', key: 'ticketId', width: 15 },
            { header: 'Title', key: 'title', width: 30 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Category', key: 'category', width: 15 },
            { header: 'Priority', key: 'priority', width: 15 },
            { header: 'Submitted By', key: 'submittedByName', width: 25 },
            { header: 'Email', key: 'submittedByEmail', width: 30 },
            { header: 'Created At', key: 'createdAt', width: 20 },
        ];

        data.forEach(ticket => {
            sheet.addRow({
                ticketId: ticket.ticketId || '-',
                title: ticket.title,
                status: ticket.status,
                category: ticket.category,
                priority: ticket.priority,
                submittedByName: ticket.submittedByName || 'Unknown',
                submittedByEmail: ticket.submittedByEmail || '-',
                createdAt: new Date(ticket.createdAt).toLocaleString(),
            });
        });

        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', 'attachment; filename=ticket_report.xlsx');

        const buffer = await workbook.xlsx.writeBuffer();
        reply.send(buffer);
    }
}

class ReportFactory {
    static createReport(type) {
        if (type === 'pdf') {
            return new PdfReport();
        } else if (type === 'excel') {
            return new ExcelReport();
        } else {
            throw new Error('Invalid report type');
        }
    }
}

export default ReportFactory;
