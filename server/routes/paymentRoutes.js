const express = require('express');
const router = express.Router();
const {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
} = require('../controllers/paymentController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/create-order', verifyToken, createPaymentOrder);
router.post('/verify', verifyToken, verifyPayment);
router.post('/webhook', handleWebhook);

module.exports = router;
