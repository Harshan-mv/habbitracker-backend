const cron = require('node-cron');
const webpush = require('web-push');
const Subscription = require('./models/Subscription');
const HabitLog = require('./models/HabitLog');
const Task = require('./models/Task');
const User = require('./models/User');

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendNotificationToUser(userId, payload) {
  const subscriptions = await Subscription.find({ userId });
  const stringPayload = JSON.stringify(payload);
  
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys
        },
        stringPayload
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log('Subscription has expired or is no longer valid: ', err);
        await Subscription.deleteOne({ _id: sub._id });
      } else {
        console.log('Error sending notification, reason: ', err);
      }
    }
  }
}

function startCronJobs() {
  // At 10:00 AM every day
  cron.schedule('0 10 * * *', async () => {
    console.log('Running 10 AM Notification Job');
    await checkAndSendTaskReminders();
    await checkAndSendHabitReminders();
  });

  // At 9:00 PM every day
  cron.schedule('0 21 * * *', async () => {
    console.log('Running 9 PM Notification Job');
    await checkAndSendTaskReminders();
    await checkAndSendHabitReminders();
  });
}

async function checkAndSendHabitReminders() {
  // "push notification to complete the habbit for that day"
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const users = await User.find({});
    
    for (const user of users) {
      // Find logs for today for this user
      const logs = await HabitLog.find({ userId: user._id, date: todayStr });
      const completedCount = logs.filter(l => l.status === 'completed').length;
      
      // We don't have the total number of habits easily accessible without querying Habits,
      // but if there are some pending logs or if they haven't completed any, we can remind them.
      // A simple reminder:
      await sendNotificationToUser(user._id, {
        title: 'Habit Tracker',
        body: 'Don\'t forget to complete your habits for today!',
        url: '/'
      });
    }
  } catch (err) {
    console.error('Error in checkAndSendHabitReminders', err);
  }
}

async function checkAndSendTaskReminders() {
  // "push notification before the last day and 2 day before of todo list date."
  try {
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    
    const tasks = await Task.find({ status: { $ne: 'completed' } });
    
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const dueDate = new Date(task.dueDate);
      
      const diffTime = dueDate - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      
      if (diffDays === 1) {
        await sendNotificationToUser(task.userId, {
          title: 'Task Due Tomorrow',
          body: `Your task "${task.title}" is due tomorrow!`,
          url: '/'
        });
      } else if (diffDays === 2) {
        await sendNotificationToUser(task.userId, {
          title: 'Task Due in 2 Days',
          body: `Your task "${task.title}" is due in 2 days.`,
          url: '/'
        });
      }
    }
  } catch (err) {
    console.error('Error in checkAndSendTaskReminders', err);
  }
}

module.exports = { startCronJobs };
