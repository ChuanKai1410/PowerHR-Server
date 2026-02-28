import TicketingFacade from '../../services/ticketing/TicketingFacade.js';
import ApiError from '../../util/ApiError.js';

// Middleware: only non-Applicant users (Employee, SysAdmin) can access admin routes
function requireAdmin(request, reply, done) {
    const role = request.user?.__t;
    if (!role || role === 'Applicant') {
        return reply.status(403).send({ error: 'Access denied: Employees and SysAdmin only' });
    }
    done();
}

// Middleware: only SysAdmin can access (e.g. report export)
function requireSysAdmin(request, reply, done) {
    const role = request.user?.__t;
    if (role !== 'SysAdmin') {
        return reply.status(403).send({ error: 'Access denied: SysAdmin only' });
    }
    done();
}

export default async function (fastify, opts) {

    // POST / — Submit a new ticket (all authenticated users)
    fastify.post('/', {
        schema: {
            tags: ['ticketing'],
            consumes: ['multipart/form-data'],
            description: 'Submit a new ticket with optional JPEG/PNG attachment'
        }
    }, async (request, reply) => {
        try {
            const ticket = await TicketingFacade.submitTicket(request.body, request.user.id);
            reply.code(201).send(ticket);
        } catch (error) {
            request.log.error({ err: error, msg: 'POST /ticketing error', user: request.user });
            if (error instanceof ApiError) {
                return reply.status(error.statusCode).send({ error: error.message });
            }
            reply.status(500).send({ error: error.message || 'Something went wrong' });
        }
    });

    // GET /mine — Get only MY tickets (all authenticated users)
    fastify.get('/mine', {
        schema: {
            tags: ['ticketing'],
            description: 'Get tickets created by the currently authenticated user',
            querystring: {
                type: 'object',
                properties: {
                    status: { type: 'string' },
                    category: { type: 'string' },
                    startDate: { type: 'string' },
                    endDate: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const tickets = await TicketingFacade.getMyTickets(request.user.id, request.query);
            reply.send(tickets);
        } catch (error) {
            if (error instanceof ApiError) {
                return reply.status(error.statusCode).send({ error: error.message });
            }
            reply.status(500).send({ error: error.message || 'Something went wrong' });
        }
    });

    // GET /report/export — Export report as PDF or Excel (SysAdmin only)
    // Must be defined BEFORE /:id to avoid route conflict
    fastify.get('/report/export', {
        preHandler: requireSysAdmin,
        schema: {
            tags: ['ticketing'],
            description: 'Generate and export a ticket report (PDF or Excel). Admin/Employee only.',
            querystring: {
                type: 'object',
                properties: {
                    format: { type: 'string', enum: ['pdf', 'excel'] },
                    status: { type: 'string' },
                    category: { type: 'string' },
                    startDate: { type: 'string' },
                    endDate: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { format, ...filters } = request.query;
            await TicketingFacade.generateReport(filters, format || 'pdf', reply);
        } catch (error) {
            if (error instanceof ApiError) {
                return reply.status(error.statusCode).send({ error: error.message });
            }
            reply.status(500).send({ error: error.message || 'Something went wrong' });
        }
    });

    // GET / — Get all tickets with filters (SysAdmin only)
    fastify.get('/', {
        preHandler: requireSysAdmin,
        schema: {
            tags: ['ticketing'],
            description: 'Get all tickets with optional filters. Admin/Employee only.',
            querystring: {
                type: 'object',
                properties: {
                    status: { type: 'string' },
                    category: { type: 'string' },
                    startDate: { type: 'string' },
                    endDate: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const tickets = await TicketingFacade.getTickets(request.query);
            reply.send(tickets);
        } catch (error) {
            if (error instanceof ApiError) {
                return reply.status(error.statusCode).send({ error: error.message });
            }
            reply.status(500).send({ error: error.message || 'Something went wrong' });
        }
    });

    // GET /:id — Get a single ticket by ID (all authenticated users)
    fastify.get('/:id', {
        schema: {
            tags: ['ticketing'],
            description: 'Get a single ticket by ID',
            params: {
                type: 'object',
                required: ['id'],
                properties: {
                    id: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const ticket = await TicketingFacade.getTicketById(request.params.id);
            reply.send(ticket);
        } catch (error) {
            if (error instanceof ApiError) {
                return reply.status(error.statusCode).send({ error: error.message });
            }
            reply.status(500).send({ error: error.message || 'Something went wrong' });
        }
    });

    // PATCH /:id — Update ticket info (title, description, category, priority) — owner only
    fastify.patch('/:id', {
        schema: {
            tags: ['ticketing'],
            description: 'Update ticket information. Only the ticket owner can update, and only if not Closed.',
            params: {
                type: 'object',
                required: ['id'],
                properties: {
                    id: { type: 'string' }
                }
            },
            body: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string', enum: ['Bug', 'Suggestion', 'Feedback', 'Other'] },
                    priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const ticket = await TicketingFacade.updateTicketInfo(
                request.params.id,
                request.user.id,
                request.body
            );
            reply.send(ticket);
        } catch (error) {
            if (error instanceof ApiError) {
                return reply.status(error.statusCode).send({ error: error.message });
            }
            reply.status(500).send({ error: error.message || 'Something went wrong' });
        }
    });

    // PATCH /:id/status — Update ticket status (SysAdmin only)
    fastify.patch('/:id/status', {
        preHandler: requireSysAdmin,
        schema: {
            tags: ['ticketing'],
            consumes: ['multipart/form-data'],
            description: 'Update ticket status with description and optional attachment. Admin/Employee only.',
            params: {
                type: 'object',
                required: ['id'],
                properties: {
                    id: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const ticket = await TicketingFacade.updateTicketStatus(request);
            reply.send(ticket);
        } catch (error) {
            if (error instanceof ApiError) {
                return reply.status(error.statusCode).send({ error: error.message });
            }
            reply.status(500).send({ error: error.message || 'Something went wrong' });
        }
    });

    // PATCH /:id/close — Close a ticket (SysAdmin only)
    fastify.patch('/:id/close', {
        preHandler: requireSysAdmin,
        schema: {
            tags: ['ticketing'],
            description: 'Close a ticket. Admin/Employee only.',
            params: {
                type: 'object',
                required: ['id'],
                properties: {
                    id: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const ticket = await TicketingFacade.closeTicket(request.params.id, request.user._id);
            reply.send(ticket);
        } catch (error) {
            if (error instanceof ApiError) {
                return reply.status(error.statusCode).send({ error: error.message });
            }
            reply.status(500).send({ error: error.message || 'Something went wrong' });
        }
    });
}
