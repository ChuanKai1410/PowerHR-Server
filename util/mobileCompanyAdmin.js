import mongoose from 'mongoose';
import Employee from '../models/users/employee.js';
import Department from '../models/enterprise/company/department.js';
import Company from '../models/enterprise/company/company.js';

const fail = (reply, status, error) => reply.code(status).send({ error });
const validId = (id) => typeof id === 'string' && mongoose.isValidObjectId(id);
const cleanName = (v) => typeof v === 'string' ? v.trim() : '';

export async function requireMobileCompanyAdmin(request, reply) {
  const p = request.principal;
  if (p?.__t !== 'Employee' || p.jobTitle !== 'Admin' || !validId(String(p.company ?? ''))) {
    return fail(reply, 403, 'Company Admin account required');
  }
  if (!await Company.exists({ _id: p.company })) {
    return fail(reply, 404, 'Company not found');
  }
}

export async function listMobileEmployees(request, reply) {
  const page = Number(request.query?.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) {
    return fail(reply, 400, 'Invalid page');
  }
  const filter = { company: request.principal.company };
  const [total, rows] = await Promise.all([
    Employee.countDocuments(filter),
    Employee.find(filter)
      .select('_id firstName lastName jobTitle department')
      .sort({ _id: 1 }).skip((page - 1) * 10).limit(10).lean(),
  ]);
  return reply.send({
    items: rows.map((r) => ({
      id: String(r._id),
      name: [r.firstName, r.lastName].filter(Boolean).join(' ') || 'Unnamed employee',
      jobTitle: r.jobTitle ?? '',
      departmentId: r.department ? String(r.department) : null,
    })),
    page, total, hasMore: page * 10 < total,
  });
}

export async function listMobileAdminDepartments(request, reply) {
  const items = await Department.find({ company: request.principal.company })
    .select('_id name').sort({ name: 1, _id: 1 }).limit(200).lean();
  const total = await Department.countDocuments({ company: request.principal.company });
  return reply.send({
    items: items.map((d) => ({ id: String(d._id), name: d.name })),
    total, truncated: total > items.length,
  });
}

export async function createMobileDepartment(request, reply) {
  const body = request.body;
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'name')) {
    return fail(reply, 400, 'Only department name is allowed');
  }
  const name = cleanName(body.name);
  if (name.length < 2 || name.length > 80) return fail(reply, 400, 'Department name must be 2 to 80 characters');
  const exists = await Department.exists({ company: request.principal.company, name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (exists) return fail(reply, 409, 'Department name already exists');
  const created = await Department.create({ name, company: request.principal.company });
  return reply.code(201).send({ department: { id: String(created._id), name: created.name } });
}

export async function renameMobileDepartment(request, reply) {
  const { departmentId } = request.params;
  if (!validId(departmentId)) return fail(reply, 400, 'Invalid department ID');
  const body = request.body;
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'name')) {
    return fail(reply, 400, 'Only department name is allowed');
  }
  const name = cleanName(body.name);
  if (name.length < 2 || name.length > 80) return fail(reply, 400, 'Department name must be 2 to 80 characters');
  const department = await Department.findOne({ _id: departmentId, company: request.principal.company }).select('_id name');
  if (!department) return fail(reply, 404, 'Department not found');
  const exists = await Department.exists({ company: request.principal.company, _id: { $ne: departmentId }, name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (exists) return fail(reply, 409, 'Department name already exists');
  department.name = name;
  await department.save();
  return reply.send({ department: { id: String(department._id), name: department.name } });
}
