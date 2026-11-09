import Posting from '../models/enterprise/job/posting.js';

const workTypes = new Set(['full-time', 'part-time', 'internship', 'contract', 'freelance']);

export function parseDiscoveryQuery(query = {}) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 30) {
        return { error: 'Invalid pagination parameters' };
    }
    const search = String(query.search ?? '').trim();
    if (search.length > 100) return { error: 'Search term is too long' };
    const type = String(query.type ?? '').trim();
    if (type && !workTypes.has(type)) return { error: 'Invalid employment type' };
    return { page, limit, search, type };
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function discoverJobs(query) {
    const { page, limit, search, type } = query;
    const now = new Date();
    const joined = [
        { $match: { status: 'open', $or: [{ deadline: null }, { deadline: { $gte: now } }] } },
        { $lookup: { from: 'jobs', localField: 'job', foreignField: '_id', as: 'jobInfo' } },
        { $unwind: '$jobInfo' },
        { $lookup: { from: 'companies', localField: 'jobInfo.company', foreignField: '_id', as: 'companyInfo' } },
        { $unwind: '$companyInfo' },
    ];
    const conditions = [];
    if (type) conditions.push({ 'jobInfo.employmentType': type });
    if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        conditions.push({ $or: [
            { 'jobInfo.title': regex },
            { 'companyInfo.name': regex },
        ] });
    }
    if (conditions.length) joined.push({ $match: { $and: conditions } });
    const result = await Posting.aggregate([
        ...joined,
        { $facet: {
            metadata: [{ $count: 'total' }],
            items: [
                { $sort: { createdAt: -1, _id: -1 } },
                { $skip: (page - 1) * limit },
                { $limit: limit },
                { $project: {
                    _id: 0,
                    id: { $toString: '$_id' },
                    title: '$jobInfo.title',
                    companyName: '$companyInfo.name',
                    companyId: { $toString: '$companyInfo._id' },
                    companyCity: { $ifNull: ['$companyInfo.address.city', ''] },
                    companyState: { $ifNull: ['$companyInfo.address.state', ''] },
                    employmentType: '$jobInfo.employmentType',
                    description: '$description',
                    qualification: '$qualification',
                    industry: '$jobInfo.industry',
                    environment: '$jobInfo.environment',
                    salaryMin: '$salaryRange.min',
                    salaryMax: '$salaryRange.max',
                    deadline: '$deadline',
                    createdAt: '$createdAt',
                    experienceMin: '$experience.min',
                    experienceMax: '$experience.max',
                } },
            ],
        } },
    ]);
    const total = result[0]?.metadata?.[0]?.total ?? 0;
    return { items: result[0]?.items ?? [], page, limit, total, hasMore: page * limit < total };
}
