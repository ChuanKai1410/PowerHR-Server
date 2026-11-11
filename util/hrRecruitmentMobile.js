import mongoose from 'mongoose';
import Job from '../models/enterprise/job/job.js';
import Posting from '../models/enterprise/job/posting.js';
import Application from '../models/enterprise/job/application.js';

const allowedStatus = new Set(['New', 'Viewed', 'Interviewed', 'Rejected', 'Accepted', 'Pending']);
const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);
const err = (reply, status, message) => reply.code(status).send({ error: message });

export async function hrMobileGuard(request, reply) {
  const p = request.principal;
  if (p?.__t !== 'Employee' || p.jobTitle !== 'HR' || !p.company) {
    return err(reply, 403, 'HR access required');
  }
}

function pagination(query = {}) {
  const page = Number(query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return null;
  return { page, limit: 10 };
}

async function ownPosting(postingId, company) {
  if (!isId(postingId)) return { error: 400 };
  const posting = await Posting.findById(postingId).select('_id job status').lean();
  if (!posting) return { error: 404 };
  const job = await Job.findOne({ _id: posting.job, company }).select('_id title employmentType').lean();
  if (!job) return { error: 404 };
  return { posting, job };
}

export async function listHrPostings(request, reply) {
  const parsed = pagination(request.query);
  if (!parsed) return err(reply, 400, 'Invalid page');
  const jobIds = await Job.find({ company: request.principal.company }).distinct('_id');
  const filter = { job: { $in: jobIds } };
  const [total, postings] = await Promise.all([
    Posting.countDocuments(filter),
    Posting.find(filter).select('_id job status createdAt deadline')
      .sort({ createdAt: -1, _id: -1 }).skip((parsed.page - 1) * parsed.limit)
      .limit(parsed.limit).populate({ path: 'job', select: '_id title employmentType' }).lean(),
  ]);
  return reply.send({
    items: postings.map(p => ({
      id: String(p._id),
      title: p.job?.title ?? 'Position unavailable',
      employmentType: p.job?.employmentType ?? '',
      status: p.status ?? 'open',
      createdAt: p.createdAt ?? null,
      deadline: p.deadline ?? null,
    })),
    total, page: parsed.page, hasMore: parsed.page * parsed.limit < total,
  });
}

export async function listHrPostingApplications(request, reply) {
  const parsed = pagination(request.query);
  if (!parsed) return err(reply, 400, 'Invalid page');
  const owned = await ownPosting(request.params.postingId, request.principal.company);
  if (owned.error) return err(reply, owned.error, owned.error === 400 ? 'Invalid posting ID' : 'Posting not found');
  const filter = { posting: owned.posting._id };
  const [total, applications] = await Promise.all([
    Application.countDocuments(filter),
    Application.find(filter).select('_id status.statusType status.statusDate createdAt applicant')
      .sort({ createdAt: -1, _id: -1 }).skip((parsed.page - 1) * parsed.limit)
      .limit(parsed.limit).populate({ path: 'applicant', select: '_id firstName lastName' }).lean(),
  ]);
  return reply.send({
    items: applications.map(a => ({
      id: String(a._id),
      applicantName: [a.applicant?.firstName, a.applicant?.lastName].filter(Boolean).join(' ') || 'Applicant unavailable',
      status: a.status?.statusType ?? 'New',
      createdAt: a.createdAt ?? null,
      statusUpdatedAt: a.status?.statusDate ?? null,
    })),
    total, page: parsed.page, hasMore: parsed.page * parsed.limit < total,
  });
}

export async function updateHrApplicationStatus(request, reply) {
  const { postingId, applicationId } = request.params;
  const body = request.body;
  if (!isId(applicationId)) return err(reply, 400, 'Invalid application ID');
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof body.status !== 'string' ||
      !allowedStatus.has(body.status)) {
    return err(reply, 400, 'Invalid application status');
  }
  const owned = await ownPosting(postingId, request.principal.company);
  if (owned.error) return err(reply, owned.error, owned.error === 400 ? 'Invalid posting ID' : 'Posting not found');
  // Scoped and atomic: both application ID and the authorized posting ID must match.
  const updated = await Application.findOneAndUpdate(
    { _id: applicationId, posting: owned.posting._id },
    { $set: { 'status.statusType': body.status, 'status.statusDate': new Date() } },
    { new: true, runValidators: true },
  ).select('_id status.statusType status.statusDate').lean();
  if (!updated) return err(reply, 404, 'Application not found');
  return reply.send({ application: {
    id: String(updated._id), status: updated.status?.statusType,
    statusUpdatedAt: updated.status?.statusDate ?? null,
  } });
}
