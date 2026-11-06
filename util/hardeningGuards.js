import mongoose from 'mongoose';
import Form from '../models/enterprise/form/form.js';

const deny = (reply, code = 403, message = 'Forbidden') => reply.code(code).send({ error: message });
const validId = (id) => typeof id === 'string' && mongoose.isValidObjectId(id);
const eq = (a, b) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase();
const allowedStaff = (request, titles) => request.principal?.__t === 'Employee' && titles.includes(request.principal?.jobTitle);
const sameCompany = (request, companyId) => validId(String(companyId ?? '')) && eq(request.principal?.company, companyId);

export async function companyLogAdmin(request, reply) {
    if (!allowedStaff(request, ['Admin'])) return deny(reply);
    const companyId = request.params?.companyId;
    if (!validId(companyId)) return deny(reply, 400, 'Invalid company ID');
    if (!sameCompany(request, companyId)) return deny(reply);
}

export async function formCreateGuard(request, reply) {
    if (!allowedStaff(request, ['HR', 'Admin'])) return deny(reply);
    const { createdBy, company } = request.body ?? {};
    if (!validId(createdBy) || !validId(company)) return deny(reply, 400, 'Invalid form owner or company');
    if (!eq(request.principal?._id, createdBy) || !sameCompany(request, company)) return deny(reply);
}

export async function formUserGuard(request, reply) {
    if (!allowedStaff(request, ['HR', 'Admin'])) return deny(reply);
    const userId = request.params?.userId;
    if (!validId(userId)) return deny(reply, 400, 'Invalid user ID');
    if (!eq(request.principal?._id, userId)) return deny(reply);
}

async function checkForm(request, reply, formId, { published = false, management = false } = {}) {
    if (!validId(formId)) return deny(reply, 400, 'Invalid form ID');
    if (request.principal?.__t !== 'Employee') return deny(reply);
    const form = await Form.findById(formId).select('company createdBy collaborator setting.published').lean();
    if (!form) return deny(reply, 404, 'Form not found');
    if (!sameCompany(request, form.company)) return deny(reply);
    if (published && form.setting?.published !== true) return deny(reply);
    if (management) {
        if (!allowedStaff(request, ['HR', 'Admin'])) return deny(reply);
        const collaborator = Array.isArray(form.collaborator) && form.collaborator.some(id => eq(id, request.principal?._id));
        if (!eq(form.createdBy, request.principal?._id) && !collaborator && request.principal?.jobTitle !== 'Admin') return deny(reply);
    }
}

export async function formManageReadGuard(request, reply) {
    return checkForm(request, reply, request.params?.formId, { management: true });
}

export async function formPublishedListGuard(request, reply) {
    if (request.principal?.__t !== 'Employee') return deny(reply);
    const { companyId, userId } = request.params ?? {};
    if (!validId(companyId) || !validId(userId)) return deny(reply, 400, 'Invalid ID');
    if (!sameCompany(request, companyId) || !eq(request.principal?._id, userId)) return deny(reply);
}

export async function formPublishedReadGuard(request, reply) {
    return checkForm(request, reply, request.params?.formId, { published: true });
}

export async function formSubmitGuard(request, reply) {
    const { id, userId } = request.params ?? {};
    if (!validId(id) || !validId(userId)) return deny(reply, 400, 'Invalid ID');
    if (!eq(request.principal?._id, userId)) return deny(reply);
    return checkForm(request, reply, id, { published: true });
}

export async function formFeedbackReadGuard(request, reply) {
    return checkForm(request, reply, request.params?.formId, { management: true });
}

export async function denyUntilResourceScoped(request, reply) {
    return deny(reply, 403, 'Endpoint pending resource-scoped authorization');
}
