const express = require('express');
const router = express.Router();
const googleSheetsController = require('../controllers/googleSheetsController');

module.exports = googleSheetsController.router;
