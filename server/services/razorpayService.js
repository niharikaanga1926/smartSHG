const crypto = require('crypto');
const { razorpayInstance, isRazorpayConfigured } = require('../config/razorpay');
const { RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } = require('../config/env');

/**
 * Create a Razorpay order (or a simulated test order if credentials are not configured)
 */
async function createRazorpayOrder({ amount, currency = 'INR', receipt, notes = {} }) {
  const amountInPaise = Math.round(amount * 100);

  // SECURITY: Online payments must never silently "simulate" success. If the
  // gateway is not configured with real credentials, we refuse to create an
  // order at all rather than returning a fake order that would later be
  // auto-verified without any real money moving. Backend is the source of
  // truth for whether a payment can even be attempted.
  if (!isRazorpayConfigured() || !razorpayInstance) {
    const err = new Error(
      'Online payments are not available right now. Please contact your Group Head or use a cash payment.'
    );
    err.statusCode = 503;
    err.code = 'PAYMENT_GATEWAY_NOT_CONFIGURED';
    throw err;
  }

  const options = {
    amount: amountInPaise,
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
    notes,
  };
  const order = await razorpayInstance.orders.create(options);
  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    simulated: false,
  };
}

/**
 * Verify Razorpay payment signature.
 * SECURITY: This is the single source of truth for whether a payment is real.
 * There is no "simulated" or "not configured" bypass — if we cannot
 * cryptographically verify the signature against RAZORPAY_KEY_SECRET, the
 * payment is treated as unverified/failed, full stop.
 */
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  if (!RAZORPAY_KEY_SECRET) return false;

  const generatedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  // Constant-time comparison to avoid timing attacks
  const a = Buffer.from(generatedSignature);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify Razorpay Webhook Raw Body Signature
 */
function verifyWebhookSignature(rawBody, webhookSignature) {
  // SECURITY: no secret configured means we cannot trust any webhook payload.
  if (!RAZORPAY_WEBHOOK_SECRET || !webhookSignature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expectedSignature);
  const b = Buffer.from(webhookSignature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
