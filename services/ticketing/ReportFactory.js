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

        // Send the document stream
        reply.send(doc);

        doc.fontSize(20).text('Ticket Report', { align: 'center' });
        doc.moveDown();

        data.forEach(ticket => {
            doc.fontSize(12).text(`Title: ${ticket.title}`);
            doc.text(`Status: ${ticket.status}`);
            doc.text(`Category: ${ticket.category}`);
            doc.text(`Priority: ${ticket.priority}`);
            doc.text(`Created By: ${ticket.createdBy?.name || ticket.createdBy?.toString() || 'Unknown'}`); // Assuming population or ID
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
            { header: 'ID', key: '_id', width: 25 },
            { header: 'Title', key: 'title', width: 30 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Category', key: 'category', width: 15 },
            { header: 'Priority', key: 'priority', width: 15 },
            { header: 'Created By', key: 'createdBy', width: 25 },
            { header: 'Created At', key: 'createdAt', width: 20 }
        ];

        data.forEach(ticket => {
            sheet.addRow({
                _id: ticket._id.toString(),
                title: ticket.title,
                status: ticket.status,
                category: ticket.category,
                priority: ticket.priority,
                createdBy: ticket.createdBy?.name || ticket.createdBy?.toString() || 'Unknown',
                createdAt: new Date(ticket.createdAt).toLocaleString()
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
