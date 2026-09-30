/**
 * api/index.js
 * 
 * Vercel Serverless Function entry point.
 * Wraps the Express application for serverless execution on Vercel.
 */

const app = require('../server/app');

module.exports = app;
