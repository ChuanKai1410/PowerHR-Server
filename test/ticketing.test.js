import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import app from './setup.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import TicketService from '../services/ticketing/TicketService.js';
import User from '../models/users/user.js';

describe('Ticketing Module', () => {
    let token;
    let adminToken;
    let userId;
    let adminId;
    let ticketId;

    beforeEach(async () => {
        // afterEach drops the whole DB, so recreate users before each test
        const applicant = await User.create({
            firstName: 'TEST',
            lastName: 'APPLICANT',
            email: 'test.applicant@test.com',
            password: 'hashedpassword',
            gender: 'Male',
            __t: 'Applicant',
        });
        const admin = await User.create({
            firstName: 'TEST',
            lastName: 'ADMIN',
            email: 'test.admin@test.com',
            password: 'hashedpassword',
            gender: 'Male',
            __t: 'SysAdmin',
        });

        userId = applicant._id;
        adminId = admin._id;
        token = jwt.sign({ id: userId, __t: 'Applicant' }, 'secret', { expiresIn: '1h' });
        adminToken = jwt.sign({ id: adminId, __t: 'SysAdmin' }, 'secret', { expiresIn: '1h' });

        // Seed a ticket for tests that need an existing ticket
        const ticket = await TicketService.createTicket({
            title: 'Seed Ticket',
            description: 'Seeded for test',
            category: 'Bug',
            priority: 'Medium',
            attachments: [],
        }, userId);
        ticketId = ticket._id;
    });

    // ─── Submit Ticket ────────────────────────────────────────────────────────

    it('should create a ticket with image attachment', async () => {
        const boundary = '--------------------------boundary';
        const content = 'fake jpeg content';

        let payload = `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="title"\r\n\r\nTest Ticket\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="description"\r\n\r\nThis is a test ticket\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="category"\r\n\r\nBug\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="priority"\r\n\r\nHigh\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="file"; filename="test.jpg"\r\n';
        payload += 'Content-Type: image/jpeg\r\n\r\n';
        payload += content + '\r\n';
        payload += `--${boundary}--`;

        const response = await app.inject({
            method: 'POST',
            url: '/ticketing',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            payload,
        });

        expect(response.statusCode).toBe(201);
        const data = response.json();
        expect(data).toHaveProperty('_id');
        expect(data).toHaveProperty('ticketId');
        expect(data.ticketId).toMatch(/^TKT-\d{6}$/);
        expect(data.title).toBe('Test Ticket');
        expect(data.status).toBe('Pending');
        expect(Array.isArray(data.attachments)).toBe(true);
        expect(data.submittedByEmail).toBeDefined();
        ticketId = data._id;
    });

    it('should reject ticket upload with non-image file', async () => {
        const boundary = '--------------------------boundary2';

        let payload = `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="title"\r\n\r\nBad File Ticket\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="description"\r\n\r\nShould fail\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="category"\r\n\r\nBug\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="priority"\r\n\r\nMedium\r\n';
        payload += `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="file"; filename="doc.pdf"\r\n';
        payload += 'Content-Type: application/pdf\r\n\r\nPDF content\r\n';
        payload += `--${boundary}--`;

        const response = await app.inject({
            method: 'POST',
            url: '/ticketing',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            payload,
        });

        expect(response.statusCode).toBe(400);
    });

    // ─── My Tickets ───────────────────────────────────────────────────────────

    it('should return only my tickets from GET /mine', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/ticketing/mine',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
        data.forEach(ticket => {
            const submittedById = ticket.submittedBy?._id || ticket.submittedBy;
            if (submittedById !== null && submittedById !== undefined) {
                expect(submittedById.toString()).toBe(userId.toString());
            }
        });
    });

    // ─── Get All Tickets (Admin only) ─────────────────────────────────────────

    it('should list tickets with filters (admin)', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/ticketing?status=Pending',
            headers: { 'Authorization': `Bearer ${adminToken}` },
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
        expect(data[0].status).toBe('Pending');
    });

    it('should deny GET / for Applicant role', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/ticketing',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        expect(response.statusCode).toBe(403);
    });

    // ─── Get Single Ticket ────────────────────────────────────────────────────

    it('should get a single ticket by ID', async () => {
        const response = await app.inject({
            method: 'GET',
            url: `/ticketing/${ticketId}`,
            headers: { 'Authorization': `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(data._id.toString()).toBe(ticketId.toString());
        expect(data).toHaveProperty('ticketId');
        expect(data).toHaveProperty('submittedByEmail');
        expect(data).toHaveProperty('submittedByName');
    });

    // ─── Update Ticket Info ───────────────────────────────────────────────────

    it('should update ticket info (owner)', async () => {
        const response = await app.inject({
            method: 'PATCH',
            url: `/ticketing/${ticketId}`,
            headers: { 'Authorization': `Bearer ${token}` },
            payload: { title: 'Updated Title', priority: 'High' },
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(data.title).toBe('Updated Title');
        expect(data.priority).toBe('High');
    });

    it('should deny ticket info update for non-owner', async () => {
        const response = await app.inject({
            method: 'PATCH',
            url: `/ticketing/${ticketId}`,
            headers: { 'Authorization': `Bearer ${adminToken}` },
            payload: { title: 'Unauthorized Update' },
        });
        expect(response.statusCode).toBe(403);
    });

    // ─── Update Ticket Status (Admin only) ────────────────────────────────────

    it('should update ticket status (Admin)', async () => {
        const response = await app.inject({
            method: 'PATCH',
            url: `/ticketing/${ticketId}/status`,
            headers: { 'Authorization': `Bearer ${adminToken}` },
            payload: { status: 'In Progress' },
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(data.status).toBe('In Progress');
    });

    it('should deny status update for Applicant', async () => {
        const response = await app.inject({
            method: 'PATCH',
            url: `/ticketing/${ticketId}/status`,
            headers: { 'Authorization': `Bearer ${token}` },
            payload: { status: 'In Progress' },
        });
        expect(response.statusCode).toBe(403);
    });

    // ─── Close Ticket (Admin only) ────────────────────────────────────────────

    it('should close ticket (Admin)', async () => {
        const response = await app.inject({
            method: 'PATCH',
            url: `/ticketing/${ticketId}/close`,
            headers: { 'Authorization': `Bearer ${adminToken}` },
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(data.status).toBe('Closed');
        expect(data.closedAt).toBeDefined();
    });

    // ─── Report Export (Admin only) ───────────────────────────────────────────

    it('should export report as PDF', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/ticketing/report/export?format=pdf',
            headers: { 'Authorization': `Bearer ${adminToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('should export report as Excel', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/ticketing/report/export?format=excel',
            headers: { 'Authorization': `Bearer ${adminToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('should deny report export for Applicant', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/ticketing/report/export?format=pdf',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        expect(response.statusCode).toBe(403);
    });
});
