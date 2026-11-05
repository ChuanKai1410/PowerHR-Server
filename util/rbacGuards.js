import mongoose from 'mongoose';
import Resume from '../models/resume/resume.js';

function deny(reply, code = 403, message = 'Forbidden') {
    return reply.code(code).send({ error: message });
}

function isSelf(request, value) {
    return typeof value === 'string' &&
        mongoose.isValidObjectId(value) &&
        String(request.principal?._id).toLowerCase() === value.toLowerCase();
}

export async function selfGuard(request, reply) {
    const { id, role } = request.params;
    if (!mongoose.isValidObjectId(id)) return deny(reply, 400, 'Invalid user ID');
    if (!isSelf(request, id)) return deny(reply);
    const accountType = request.principal.__t;
    if (role !== 'user' && role.toLowerCase() !== String(accountType).toLowerCase()) {
        return deny(reply);
    }
}

export async function profileUpdateGuard(request, reply) {
    await selfGuard(request, reply);
    if (reply.sent) return;
    const user = request.body?.user;
    if (!user || Array.isArray(user) || typeof user !== 'object') {
        return deny(reply, 400, 'Invalid profile update');
    }
    // Conservative temporary allowlist. Other legitimate profile edits need field-by-field review.
    const allowed = new Set(['profilePicture']);
    if (Object.keys(user).some(k => !allowed.has(k))) {
        return deny(reply, 403, 'Profile field is not self-editable');
    }
}

export async function pictureGuard(request, reply) {
    if (!mongoose.isValidObjectId(request.params.id)) return deny(reply,400,'Invalid user ID');
    if (!isSelf(request, request.params.id)) return deny(reply);
    if (request.body?.id !== request.params.id) return deny(reply,400,'User ID mismatch');
}

export async function applicantGuard(request, reply) {
    if (request.principal?.__t !== 'Applicant') return deny(reply);
    const id = request.body?.applicantId ?? request.body?.user ??
        request.params?.userId ?? request.params?.applicantId;
    if (id !== undefined) {
        if (!mongoose.isValidObjectId(id)) return deny(reply,400,'Invalid applicant ID');
        if (!isSelf(request,id)) return deny(reply);
    }
}

export async function resumeOwnerGuard(request, reply) {
    if (request.principal?.__t !== 'Applicant') return deny(reply);
    const id = request.params?.resumeId ?? request.body?._id;
    if (!mongoose.isValidObjectId(id)) return deny(reply,400,'Invalid resume ID');
    // Database-owned relation, never trust request.body.user.
    const resume = await Resume.findById(id).select('user').lean();
    if (!resume) return deny(reply,404,'Resume not found');
    if (!isSelf(request, String(resume.user))) return deny(reply);
    if (request.body && Object.hasOwn(request.body, 'user')) {
        return deny(reply,400,'Resume ownership cannot be changed');
    }
}

export async function denyUntilScoped(request, reply) {
    return deny(reply, 403, 'Endpoint pending scoped authorization');
}
