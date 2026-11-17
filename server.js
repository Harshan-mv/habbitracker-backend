require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const authRoutes = require('./routes/authRoutes');
const habitRoutes = require('./routes/habitRoutes');
const logRoutes = require('./routes/logRoutes');
const taskRoutes = require('./routes/taskRoutes');
const financeRoutes = require('./routes/financeRoutes');
const pushRoutes = require('./routes/pushRoutes');
const { startCronJobs } = require('./cronJobs');
const { globalLimiter } = require('./middleware/rateLimiters');

const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);
const allowedOrigins = new Set([
  'https://habbitracker-frontend.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean));

app.use(cors({
  origin: (origin, callback) => {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
  exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy', 'X-Total-Count', 'X-Page', 'X-Limit', 'X-Has-More'],
}));
app.use(helmet());
app.use(compression({
  threshold: Number(process.env.COMPRESSION_THRESHOLD_BYTES) || 1024,
  level: Number(process.env.COMPRESSION_LEVEL) || 1,
}));

const mongoOptions = {
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 5,
  minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 0,
  serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
  socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
  connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || 10000,
  maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_TIME_MS) || 30000,
};

mongoose.connection.on('connected', () => console.log('MongoDB connected'));
mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
mongoose.connection.on('error', (error) => console.error('MongoDB connection error:', error.message));

mongoose.connect(process.env.MONGODB_URI, mongoOptions)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.get('/api/health', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'ok' : 'unavailable',
    database: databaseReady ? 'connected' : 'disconnected',
  });
});

app.use('/api', globalLimiter);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '100kb' }));
app.use('/api/auth', authRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/push', pushRoutes);

// Start Cron Jobs for Push Notifications
const stopCronJobs = startCronJobs();

app.get('/', (req, res) => {
  res.send('API is running');
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

const requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS) || 120000;
server.requestTimeout = requestTimeout;
server.setTimeout(requestTimeout, (socket) => socket.destroy());

let isShuttingDown = false;
const shutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received; shutting down`);
  stopCronJobs();
  server.close(async (error) => {
    if (error) console.error('HTTP server shutdown error:', error);
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      console.error('MongoDB shutdown error:', disconnectError);
      process.exitCode = 1;
    }
  });
  const shutdownTimeout = setTimeout(() => {
    console.error('Graceful shutdown timed out');
    process.exit(1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000);
  shutdownTimeout.unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || error.statusCode || 500;
  if (status >= 500) console.error('Unhandled request error:', error);
  res.status(status).json({ error: status >= 500 ? 'Server error' : error.message });
});
