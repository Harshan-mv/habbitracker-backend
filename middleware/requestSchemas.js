const { z } = require('zod');

const objectBody = z.record(z.string(), z.unknown());
const taskLimitValue = Number(process.env.TASKS_HARD_CAP);
const taskBatchLimit = Number.isInteger(taskLimitValue) && taskLimitValue > 0 ? taskLimitValue : 2000;

const registerBody = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
}).passthrough();

const loginBody = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
}).passthrough();

const googleCredentialBody = z.object({
  credential: z.string().min(1).max(8192),
}).passthrough();

const resetEmail = z.string().trim().email().max(254);

const forgotPasswordBody = z.object({
  email: resetEmail,
}).passthrough();

const verifyOtpBody = z.object({
  email: resetEmail,
  code: z.string().regex(/^\d{6}$/),
}).passthrough();

const resetPasswordBody = z.object({
  email: resetEmail,
  resetToken: z.string().min(1).max(256),
  password: z.string().min(6),
}).passthrough();

const taskCreateBody = z.object({
  title: z.string().min(1),
  status: z.enum(['Not Started', 'In Progress', 'Done', 'Blocked']).optional(),
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
  order: z.coerce.number().finite().optional(),
}).passthrough();

const taskUpdateBody = z.object({
  title: z.string().min(1).optional(),
  order: z.coerce.number().finite().optional(),
  status: z.enum(['Not Started', 'In Progress', 'Done', 'Blocked']).optional(),
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
}).passthrough();

const batchTasksBody = z.object({
  updates: z.array(z.object({
    id: z.string().min(1),
    order: z.coerce.number().finite(),
  }).passthrough()).max(taskBatchLimit),
}).passthrough();

const habitCreateBody = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
}).passthrough();

const habitUpdateBody = z.object({
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
}).passthrough();

const habitLogBody = z.object({
  habitId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).passthrough();

const financeBody = z.object({
  incomes: z.array(z.object({
    name: z.string().min(1),
    amount: z.coerce.number().finite().nonnegative(),
    sourceType: z.string().optional(),
  }).passthrough()).optional(),
  expenses: z.array(z.object({
    name: z.string().min(1),
    amount: z.coerce.number().finite().nonnegative(),
    category: z.string().optional(),
  }).passthrough()).optional(),
  realizedPnL: z.coerce.number().finite().optional(),
  charges: z.coerce.number().finite().nonnegative().optional(),
  savingsGoal: z.coerce.number().finite().nonnegative().optional(),
  savingsTarget: z.coerce.number().finite().nonnegative().optional(),
  savingsAchieved: z.coerce.number().finite().nonnegative().optional(),
  emergencyFund: z.coerce.number().finite().nonnegative().optional(),
  emergencyAchieved: z.coerce.number().finite().nonnegative().optional(),
  emergencyTarget: z.coerce.number().finite().nonnegative().optional(),
  emiMonthsLeft: z.coerce.number().finite().nonnegative().optional(),
  emiTotalMonths: z.coerce.number().finite().nonnegative().optional(),
  carryForward: z.coerce.number().finite().nonnegative().optional(),
  prevSavingsAchieved: z.coerce.number().finite().nonnegative().optional(),
  prevEmergencyAchieved: z.coerce.number().finite().nonnegative().optional(),
  note: z.string().optional(),
}).passthrough();

const goalCreateBody = z.object({
  name: z.string().min(1).max(80),
  targetAmount: z.number().finite().positive(),
  monthlyAllocation: z.number().finite().nonnegative().optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
}).passthrough();

const allocationBody = z.object({
  amount: z.number().finite().nonnegative(),
}).passthrough();

const categoryBody = z.object({
  kind: z.enum(['expense', 'income']),
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).passthrough();

const pushSubscriptionBody = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }).passthrough(),
}).passthrough();

const pushUnsubscribeBody = z.object({
  endpoint: z.string().url(),
}).passthrough();

module.exports = {
  objectBody,
  registerBody,
  loginBody,
  googleCredentialBody,
  forgotPasswordBody,
  verifyOtpBody,
  resetPasswordBody,
  taskCreateBody,
  taskUpdateBody,
  batchTasksBody,
  habitCreateBody,
  habitUpdateBody,
  habitLogBody,
  financeBody,
  goalCreateBody,
  allocationBody,
  categoryBody,
  pushSubscriptionBody,
  pushUnsubscribeBody,
};
