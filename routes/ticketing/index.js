import TicketingFacade from '../../services/ticketing/TicketingFacade.js';

// export const autoPrefix = '/tickets'; // Removed to use directory based routing /ticketing
export default async function (fastify, opts) {
    fastify.post('/', {
        schema: {
            tags: ['ticketing'],
            consumes: ['multipart/form-data'],
            /*
            body: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string' },
                    priority: { type: 'string' },
                    file: { type: 'object' }
                }
            }
            */
        }
    }, async (request, reply) => {
        const ticket = await TicketingFacade.submitTicket(request.body, request.user._id);
        reply.code(201).send(ticket);
    });

    fastify.get('/', {
        schema: {
            tags: ['ticketing'],
            querystring: {
                status: { type: 'string' },
                category: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' }
            }
        }
    }, async (request, reply) => {
        const tickets = await TicketingFacade.getTickets(request.query);
        reply.send(tickets);
    });

    fastify.patch('/:id/status', {
        schema: {
            tags: ['ticketing'],
            body: {
                type: 'object',
                required: ['status'],
                properties: {
                    status: { type: 'string', enum: ['Pending', 'In Progress', 'Resolved', 'Closed'] }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params;
        const { status } = request.body;
        // Assuming user is admin for this route, validation logic needed
        // For now, allow any authenticated user to update status for demo
        const ticket = await TicketingFacade.updateTicketStatus(id, status, request.user._id);
        reply.send(ticket);
    });

    fastify.patch('/:id/close', {
        schema: {
            tags: ['ticketing']
        }
    }, async (request, reply) => {
        const { id } = request.params;
        const ticket = await TicketingFacade.closeTicket(id, request.user._id);
        reply.send(ticket);
    });

    fastify.get('/report/export', {
        schema: {
            tags: ['ticketing'],
            querystring: {
                format: { type: 'string', enum: ['pdf', 'excel'] },
                status: { type: 'string' },
                category: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' }
            }
        }
    }, async (request, reply) => {
        const { format, ...filters } = request.query;
        await TicketingFacade.generateReport(filters, format || 'pdf', reply);
    });
}
