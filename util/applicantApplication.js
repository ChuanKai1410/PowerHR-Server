import mongoose from 'mongoose';
import Applicant from '../models/users/applicant.js';
import Resume from '../models/resume/resume.js';
import Posting from '../models/enterprise/job/posting.js';
import Application from '../models/enterprise/job/application.js';

function respond(reply, status, message) {
  return reply.code(status).send({ error: message });
}

function applicantId(request) {
  return String(request.principal._id);
}

function resumeLabel(resume) {
  return {
    id: String(resume._id),
    name: resume.basicDetail?.name || 'Untitled resume',
    title: resume.basicDetail?.title || '',
  };
}

export async function listMyApplicationResumes(request, reply) {
  const resumes = await Resume.find({ user: request.principal._id })
    .select('_id basicDetail.name basicDetail.title')
    .sort({ _id: -1 }).limit(30).lean();
  return reply.send({ items: resumes.map(resumeLabel) });
}

export async function myApplicationStatus(request, reply) {
  const { postingId } = request.params;
  if (!mongoose.isValidObjectId(postingId)) return respond(reply, 400, 'Invalid posting ID');
  const existing = await Application.findOne({
    posting: postingId,
    applicant: request.principal._id,
  }).select('_id status.statusType').lean();
  return reply.send({
    applied: Boolean(existing),
    applicationId: existing ? String(existing._id) : null,
    status: existing?.status?.statusType || null,
  });
}

export async function applyForJob(request, reply) {
  const body = request.body;
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, 'postingId') || !Object.hasOwn(body, 'resumeId') ||
      !mongoose.isValidObjectId(body.postingId) || !mongoose.isValidObjectId(body.resumeId)) {
    return respond(reply, 400, 'Invalid application request');
  }
  const { postingId, resumeId } = body;
  const id = applicantId(request);
  const [applicant, posting, resume, existing] = await Promise.all([
    Applicant.findById(id).select('_id').lean(),
    Posting.findById(postingId).select('status deadline').lean(),
    Resume.findOne({ _id: resumeId, user: id }).lean(),
    Application.findOne({ posting: postingId, applicant: id }).select('_id').lean(),
  ]);
  if (!applicant) return respond(reply, 403, 'Applicant account is not available');
  if (existing) return respond(reply, 409, 'You have already applied for this job');
  if (!posting) return respond(reply, 404, 'Job posting not found');
  if (posting.status !== 'open' || (posting.deadline && posting.deadline < new Date())) {
    return respond(reply, 409, 'Job posting is no longer accepting applications');
  }
  if (!resume) return respond(reply, 422, 'Select a resume belonging to your account');

  // Snapshot rather than a mutable reference; remove Mongo metadata and user ownership.
  const snapshot = { ...resume };
  delete snapshot._id;
  delete snapshot.__v;
  delete snapshot.user;
  const serializedResume = JSON.stringify(snapshot);
  if (Buffer.byteLength(serializedResume, 'utf8') > 131072) {
    return respond(reply, 422, 'Resume exceeds the application size limit');
  }
  let created;
  try {
    // Unique applicant+posting index is the final arbiter for concurrent submissions.
    created = await Application.create({
      posting: posting._id,
      applicant: applicant._id,
      resume: serializedResume,
    });
  } catch (error) {
    if (error?.code === 11000) return respond(reply, 409, 'You have already applied for this job');
    throw error;
  }
  try {
    await Applicant.updateOne({ _id: id }, { $addToSet: { appliedJobs: created._id } });
  } catch (error) {
    // Only remove the record created by THIS request (never another applicant's).
    await Application.deleteOne({ _id: created._id, applicant: id });
    throw error;
  }
  return reply.code(201).send({
    message: 'Application submitted successfully',
    application: { id: String(created._id), status: 'New' },
  });
}
