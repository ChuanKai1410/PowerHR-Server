import mongoose from 'mongoose';
import Application from '../models/enterprise/job/application.js';

const projection = 'posting applicant status createdAt interview offer';

export function parseTrackingQuery(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 10);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 30) {
    return { error: 'Invalid pagination parameters' };
  }
  return { page, limit };
}

function serialize(application, detailed = false) {
  const posting = application.posting;
  const job = posting?.job;
  const company = job?.company;
  const status = application.status?.statusType ?? 'New';
  const result = {
    id: String(application._id),
    postingId: posting?._id ? String(posting._id) : null,
    title: job?.title ?? 'Position unavailable',
    companyName: company?.name ?? 'Company unavailable',
    employmentType: job?.employmentType ?? '',
    status,
    appliedAt: application.createdAt ?? null,
    statusUpdatedAt: application.status?.statusDate ?? null,
    postingAvailable: Boolean(posting && job),
  };
  if (detailed) {
    result.description = posting?.description ?? '';
    // Deliberately omit internal HR reasons, resume snapshot, interviewer IDs and private contact details.
    result.interviews = (application.interview ?? []).map((item) => ({
      date: item.interviewDate ?? null,
      type: item.interviewType ?? null,
      status: item.status ?? null,
    }));
    result.offerStatus = application.offer?.status?.statusType ?? null;
  }
  return result;
}

function withJob(query) {
  return query.populate({
    path: 'posting', select: '_id job description',
    populate: {
      path: 'job', select: '_id title employmentType company',
      populate: { path: 'company', select: '_id name' },
    },
  });
}

export async function listMyApplications(request, reply) {
  const parsed = parseTrackingQuery(request.query);
  if (parsed.error) return reply.code(400).send({ error: parsed.error });
  const { page, limit } = parsed;
  const applicant = request.principal._id;
  const [total, records] = await Promise.all([
    Application.countDocuments({ applicant }),
    withJob(Application.find({ applicant }).select(projection)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit)).lean(),
  ]);
  return reply.send({
    items: records.map((record) => serialize(record)),
    page, limit, total, hasMore: page * limit < total,
  });
}

export async function getMyApplicationDetails(request, reply) {
  const { applicationId } = request.params;
  if (!mongoose.isValidObjectId(applicationId)) {
    return reply.code(400).send({ error: 'Invalid application ID' });
  }
  const record = await withJob(Application.findOne({
    _id: applicationId,
    applicant: request.principal._id,
  }).select(projection)).lean();
  if (!record) return reply.code(404).send({ error: 'Application not found' });
  return reply.send({ application: serialize(record, true) });
}
