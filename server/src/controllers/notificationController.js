import Notification from "../models/Notification.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const listNotifications = asyncHandler(async (req, res) => {
  const data = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Number(req.query.limit || 50)));
  res.json({ success: true, data });
});
export const unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    userId: req.user._id,
    isRead: false,
  });
  res.json({ success: true, data: { count } });
});
export const markRead = asyncHandler(async (req, res) => {
  await Notification.updateOne(
    { _id: req.params.id, userId: req.user._id },
    { $set: { isRead: true } },
  );
  res.json({ success: true, message: "Notification marked as read" });
});
export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { $set: { isRead: true } },
  );
  res.json({ success: true, message: "All notifications marked as read" });
});
