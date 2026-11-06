import mongoose from 'mongoose';
import Employee from '../models/users/employee.js';
import Department from '../models/enterprise/company/department.js';
import Job from '../models/enterprise/job/job.js';
import Posting from '../models/enterprise/job/posting.js';
import Application from '../models/enterprise/job/application.js';

const valid = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);
const equal = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const deny = (reply, status = 403, error = 'Forbidden') => reply.code(status).send({ error });

// The database-authenticated principal is the ONLY identity source.
// A job title is a DB-backed business policy, not an arbitrary JWT role claim.
export function requireCompanyRole(allowedTitles = ['HR', 'Admin']) {
    return async (request, reply) => {
        const user = request.principal;
        if (user?.__t !== 'Employee' || !allowedTitles.includes(user.jobTitle)) return deny(reply);
        const companyId = request.params?.companyId;
        if (!valid(companyId)) return deny(reply, 400, 'Invalid company ID');
        if (!user.company || !equal(user.company, companyId)) return deny(reply);
    };
}

export function requireCompanyEntity(entity) {
    return async (request, reply) => {
        const companyId = request.params?.companyId;
        let id;
        let model;
        if (entity === 'employee') { id = request.params.employeeId; model = Employee; }
        else if (entity === 'department') { id = request.params.departmentId; model = Department; }
        else return deny(reply, 500, 'Unknown scoped resource');
        if (!valid(id)) return deny(reply, 400, 'Invalid resource ID');
        const owned = await model.exists({ _id: id, company: companyId });
        if (!owned) return deny(reply, 404, 'Resource not found');
    };
}

export async function forbidCompanyReassignment(request, reply) {
    // Data relationship must not be changed through a broad update endpoint.
    const data = request.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return deny(reply, 400, 'Invalid body');
    if (['company', 'companyId', '_id', '__t', 'password', 'email', 'active'].some(k => Object.hasOwn(data,k))) {
        return deny(reply, 403, 'Restricted update field');
    }
}

export async function validateNewEmployeeCompany(request, reply) {
    const body = request.body;
    if (!body || !valid(body.company) || !equal(body.company, request.params.companyId)) {
        return deny(reply, 403, 'Employee company does not match authorized company');
    }
}

export async function validateDepartmentParent(request, reply) {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return deny(reply, 400, 'Invalid body');
    if (body.company && !equal(body.company, request.params.companyId)) return deny(reply);
    if (body.underDepartment) {
        if (!valid(body.underDepartment)) return deny(reply, 400, 'Invalid parent department ID');
        if (!await Department.exists({_id: body.underDepartment, company: request.params.companyId})) return deny(reply, 403, 'Invalid parent department');
    }
}

export function requireHiringRole() {
    return async (request, reply) => {
        if (request.principal?.__t !== 'Employee' || request.principal.jobTitle !== 'HR' || !request.principal.company) return deny(reply);
    };
}

async function checkPostingAccess(request, reply, postingId) {
    if (!valid(postingId)) return deny(reply, 400, 'Invalid posting ID');
    const posting = await Posting.findById(postingId).select('job').lean();
    if (!posting) return deny(reply, 404, 'Posting not found');
    const job = await Job.findById(posting.job).select('company').lean();
    if (!job) return deny(reply, 404, 'Posting job not found');
    if (!equal(job.company, request.principal.company)) return deny(reply);
    return {posting, job};
}

export async function createPostingGuard(request, reply) {
    const {companyId, userId, create} = request.body || {};
    if (!create || typeof create !== 'object' || Array.isArray(create) ||
        !valid(companyId) || !equal(companyId, request.principal.company) ||
        !valid(userId) || !equal(userId, request.principal._id)) return deny(reply);
}

export async function updatePostingGuard(request, reply) {
    const owned = await checkPostingAccess(request, reply, request.params?.postingId);
    if (reply.sent) return;
    const body = request.body;
    if (!body || !valid(body.jobId) || !equal(body.jobId, owned.posting.job) ||
        !body.create || typeof body.create !== 'object' || Array.isArray(body.create)) return deny(reply);
}

export async function postingApplicationsGuard(request, reply) {
    await checkPostingAccess(request, reply, request.params?.postingId);
}

export async function updateApplicationGuard(request, reply) {
    const id = request.params?.applicationId;
    if (!valid(id)) return deny(reply, 400, 'Invalid application ID');
    const application = await Application.findById(id).select('posting').lean();
    if (!application) return deny(reply, 404, 'Application not found');
    await checkPostingAccess(request, reply, String(application.posting));
    if (reply.sent) return;
    // This endpoint is for hiring status updates, never applicant reassignment.
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !Object.keys(body).length || Object.keys(body).some(k => k !== 'status')) {
        return deny(reply, 403, 'Only application status can be updated');
    }
    if (!body.status || typeof body.status !== 'object' || Array.isArray(body.status) ||
        Object.keys(body.status).some(k => !['statusType', 'reason', 'statusDate'].includes(k))) {
        return deny(reply, 403, 'Invalid status update');
    }
}
