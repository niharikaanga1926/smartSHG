const Razorpay = require('razorpay');
const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = require('./env');

let razorpayInstance = null;

const isRazorpayConfigured = () => {
  return Boolean(
    RAZORPAY_KEY_ID &&
    RAZORPAY_KEY_SECRET &&
    !RAZORPAY_KEY_ID.includes('YourRazorpay') &&
    !RAZORPAY_KEY_SECRET.includes('YourRazorpay')
  );
};

if (isRazorpayConfigured()) {
  try {
    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
    console.log('[Razorpay] Configured in TEST MODE');
  } catch (err) {
    console.warn('[Razorpay] Initialization warning:', err.message);
  }
} else {
  console.log('[Razorpay] Credentials not set or placeholder detected. Online payments are DISABLED until real RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are configured — payments will never be auto-approved.');
}

module.exports = {
  razorpayInstance,
  isRazorpayConfigured,
};
