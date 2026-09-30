/**
 * server/app.js
 * 
 * Express application configuration and route mounting.
 */

const express = require('express');
const cors = require('cors');
const path = require('node:path');

const foodRoutes = require('./routes/food');
const reportsRoutes = require('./routes/reports');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging in development
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    });
    next();
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Mount domain routes
app.use('/api/food', foodRoutes);
app.use('/api/reports', reportsRoutes);

// Serve static frontend in production if built
const clientDist = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDist));

// 404 Catch-All for unhandled API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

// Single-page application fallback for client routes (production mode)
app.get('*', (req, res, next) => {
  const indexPath = path.join(clientDist, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) {
      res.status(404).send('Food Diary API is active.');
    }
  });
});

// Global Error Handler (Sanitizes stack traces)
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.stack || err.message);
  
  const status = err.status || err.statusCode || 500;
  const userMessage = status === 500
    ? "Couldn't save or process this request. Please try again."
    : (err.message || 'An error occurred.');

  res.status(status).json({
    success: false,
    error: userMessage
  });
});

module.exports = app;
