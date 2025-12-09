const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

// Create Mercado Pago preference
router.post('/create-preference', paymentController.createPreference);

// Webhook to receive payment notifications
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;
