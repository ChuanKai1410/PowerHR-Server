import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import app from './setup.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import TicketService from '../services/ticketing/TicketService.js';

describe('Ticketing Module', () => {
    let token;
    let userId;
    let ticketId;

    beforeAll(async () => {
        userId = new mongoose.Types.ObjectId();
        // app.ready() is called in setup.js beforeAll
        // We need to wait for app to be ready to access app.jwt
        await app.ready();
        token = jwt.sign({ _id: userId }, 'secret', { expiresIn: '1h' });
    });

    beforeEach(async () => {
        const ticket = await TicketService.createTicket({
            title: 'Seed Ticket',
            description: 'Seeded for test',
            category: 'Bug',
            priority: 'Medium'
        }, userId);
        ticketId = ticket._id;
    });

    it('should create a ticket with attachment', async () => {
        const boundary = '--------------------------boundary';
        const content = 'Test file content';

        let payload = `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="title"\r\n\r\nTest Ticket\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="description"\r\n\r\nThis is a test ticket\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="category"\r\n\r\nBug\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="priority"\r\n\r\nHigh\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="file"; filename="test.txt"\r\n';
        payload += 'Content-Type: text/plain\r\n\r\n';
        payload += content + '\r\n';
        payload += `--${boundary}--`;

        const response = await app.inject({
            method: 'POST',
            url: '/ticketing',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            payload: payload
        });

        expect(response.statusCode).toBe(201);
        const data = response.json();
        expect(data).toHaveProperty('_id');
        expect(data.title).toBe('Test Ticket');
        expect(data.status).toBe('Pending');
        ticketId = data._id;
    });

    it('should list tickets with filters', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/ticketing?status=Pending',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
        expect(data[0].status).toBe('Pending');
    });

    it('should update ticket status (Admin)', async () => {
        const response = await app.inject({
            method: 'PATCH',
            url: `/ticketing/${ticketId}/status`,
            headers: {
                'Authorization': `Bearer ${token}`
            },
            payload: {
                status: 'In Progress'
            }
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(data.status).toBe('In Progress');
    });

    it('should close ticket', async () => {
        const response = await app.inject({
            method: 'PATCH',
            url: `/ticketing/${ticketId}/close`,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(data.status).toBe('Closed');
        expect(data.closedAt).toBeDefined();
    });

    it('should export report as PDF', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/ticketing/report/export?format=pdf',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('should export report as Excel', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/ticketing/report/export?format=excel',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
});
