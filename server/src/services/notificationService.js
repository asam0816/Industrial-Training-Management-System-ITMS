import Notification from '../models/Notification.js';import User from '../models/User.js';import Student from '../models/Student.js';
export async function notifyUsers(userIds,payload){const ids=[...new Set(userIds.map(String))];if(!ids.length)return;await Notification.insertMany(ids.map(userId=>({userId,...payload})))}
export async function targetStudentUserIds(targetType,targetBatches=[]){if(targetType==='ALL'){return (await User.find({role:'STUDENT',status:'ACTIVE'}).select('_id')).map(x=>x._id)}return (await Student.find({batchId:{$in:targetBatches}}).select('userId')).map(x=>x.userId)}
