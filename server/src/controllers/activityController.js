import ActivityLog from "../models/ActivityLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const listActivity = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)),
    limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const f = {};
  if (req.query.action) f.action = { $regex: req.query.action, $options: "i" };
  if (req.query.module) f.module = req.query.module;
  const [data, total] = await Promise.all([
    ActivityLog.find(f)
      .populate("userId", "name role")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ActivityLog.countDocuments(f),
  ]);
  res.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});
