const Task = require('../models/Task');
const { hardCap } = require('../utils/pagination');

// Get all tasks for the logged-in user
exports.getTasks = async (req, res) => {
  try {
    const filter = { userId: req.user.userId };
    const { status, month } = req.query;
    if (status !== undefined) {
      if (!['Not Started', 'In Progress', 'Done', 'Blocked'].includes(status)) {
        return res.status(400).json({ error: 'Invalid task status filter' });
      }
      filter.status = status;
    }
    if (month !== undefined) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return res.status(400).json({ error: 'Month filter must use YYYY-MM' });
      }
      const [year, monthNumber] = month.split('-').map(Number);
      filter.dueDate = {
        $gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
        $lt: new Date(Date.UTC(year, monthNumber, 1)),
      };
    }
    const maximum = hardCap('TASKS_HARD_CAP', 2000);
    const total = await Task.countDocuments(filter);
    if (total > maximum) {
      return res.status(413).json({ error: `Task list exceeds the configured limit of ${maximum}` });
    }
    const tasks = await Task.find(filter).sort({ order: 1, dueDate: 1 }).limit(maximum + 1);
    if (tasks.length > maximum) {
      return res.status(413).json({ error: `Task list exceeds the configured limit of ${maximum}` });
    }
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
};

// Create a new task
exports.createTask = async (req, res) => {
  try {
    const maximum = hardCap('TASKS_HARD_CAP', 2000);
    if (await Task.countDocuments({ userId: req.user.userId }) >= maximum) {
      return res.status(413).json({ error: `Task limit of ${maximum} reached` });
    }
    const maxOrderTask = await Task.findOne({ userId: req.user.userId }).sort('-order');
    const order = maxOrderTask ? maxOrderTask.order + 1 : 0;

    const task = new Task({
      ...req.body,
      userId: req.user.userId,
      order
    });
    const savedTask = await task.save();
    res.status(201).json(savedTask);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task' });
  }
};

// Update an existing task (supports partial updates and reordering)
exports.updateTask = async (req, res) => {
  try {
    const updatedTask = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      req.body,
      { returnDocument: 'after' }
    );
    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update task' });
  }
};

// Batch update tasks (for saving multiple tasks' order after drag and drop)
exports.batchUpdateTasks = async (req, res) => {
  try {
    const { updates } = req.body; // Array of { id, order }
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'Invalid updates payload' });
    }

    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { _id: update.id, userId: req.user.userId },
        update: { order: update.order }
      }
    }));

    await Task.bulkWrite(bulkOps);
    res.json({ message: 'Tasks updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to batch update tasks' });
  }
}

// Delete a task
exports.deleteTask = async (req, res) => {
  try {
    const deletedTask = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!deletedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
};
