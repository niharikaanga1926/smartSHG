const Payment = require('../models/Payment');
const Savings = require('../models/Savings');
const Member = require('../models/Member');
const Group = require('../models/Group');
const Loan = require('../models/Loan');
const { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } = require('../services/razorpayService');
const { recordTransaction } = require('../services/ledgerService');
const { recordRepayment } = require('../services/loanService');
const { logAudit } = require('../services/auditService');
const { createNotification } = require('../services/notificationService');
const { formatReceipt } = require('../utils/receiptGenerator');

// @desc    Create Razorpay Order for Savings or Loan Repayment
// @route   POST /api/payments/create-order
const createPaymentOrder = async (req, res, next) => {
  try {
    const { amount, purpose, groupId, loanId, savingsPeriod } = req.body;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
    }

    const member = await Member.findOne({ groupId, userId: req.user._id });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member profile not found for this group.' });
    }

    const internalPaymentId = `PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    let orderData;
    try {
      orderData = await createRazorpayOrder({
        amount: numAmount,
        currency: 'INR',
        receipt: internalPaymentId,
        notes: {
          purpose,
          memberId: member._id.toString(),
          groupId,
          userId: req.user._id.toString(),
        },
      });
    } catch (gatewayErr) {
      // SECURITY: never fall back to a "simulated" order here. If the
      // gateway can't be reached/configured, the payment attempt stops.
      return res.status(gatewayErr.statusCode || 502).json({
        success: false,
        message: gatewayErr.message || 'Unable to start online payment right now.',
        code: gatewayErr.code || 'PAYMENT_GATEWAY_ERROR',
      });
    }

    const payment = await Payment.create({
      paymentId: internalPaymentId,
      razorpayOrderId: orderData.orderId,
      amount: numAmount,
      purpose,
      memberId: member._id,
      userId: req.user._id,
      groupId,
      loanId: loanId || undefined,
      savingsPeriod: savingsPeriod || undefined,
      paymentStatus: 'PENDING',
    });

    res.json({
      success: true,
      order: {
        orderId: orderData.orderId,
        amount: orderData.amount, // in paise
        currency: orderData.currency,
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_simulated',
        paymentId: payment.paymentId,
        simulated: orderData.simulated,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify Payment Signature & Capture
// @route   POST /api/payments/verify
const verifyPayment = async (req, res, next) => {
  try {
    const { orderId, paymentId, signature, internalPaymentId } = req.body;

    const paymentRecord = await Payment.findOne({
      $or: [{ razorpayOrderId: orderId }, { paymentId: internalPaymentId }],
    }).populate('memberId');

    if (!paymentRecord) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    if (paymentRecord.paymentStatus === 'CAPTURED') {
      return res.json({ success: true, message: 'Payment already processed and captured.', payment: paymentRecord });
    }

    const isValid = verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

    if (!isValid) {
      paymentRecord.paymentStatus = 'FAILED';
      paymentRecord.signatureVerificationStatus = 'FAILED';
      await paymentRecord.save();
      return res.status(400).json({ success: false, message: 'Payment signature verification failed. Untrusted payload.' });
    }

    // Signature verified
    paymentRecord.razorpayPaymentId = paymentId || `pay_sim_${Date.now()}`;
    paymentRecord.razorpaySignature = signature || 'simulated_sig';
    paymentRecord.paymentStatus = 'CAPTURED';
    paymentRecord.signatureVerificationStatus = 'VERIFIED';
    paymentRecord.method = 'UPI/ONLINE';

    const group = await Group.findById(paymentRecord.groupId);
    let receiptData = null;

    if (paymentRecord.purpose === 'SAVINGS') {
      const period = paymentRecord.savingsPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const receiptNumber = `RCP-ONL-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

      // Record in Financial Ledger: destination BANK (online money flows into bank)
      const finTx = await recordTransaction({
        groupId: paymentRecord.groupId,
        transactionType: 'SAVINGS_COLLECTION',
        category: 'Member Monthly Savings (Online)',
        description: `Online savings for period ${period}`,
        amount: paymentRecord.amount,
        paymentMethod: 'ONLINE',
        sourceAccount: 'EXTERNAL',
        destinationAccount: 'BANK',
        memberId: paymentRecord.memberId._id,
        reference: paymentRecord.razorpayPaymentId,
        createdBy: req.user._id,
      });

      paymentRecord.financialTransactionId = finTx._id;

      // Create Savings record
      await Savings.create({
        transactionId: `TXN-SAV-${Date.now()}`,
        receiptNumber,
        groupId: paymentRecord.groupId,
        memberId: paymentRecord.memberId._id,
        userId: req.user._id,
        period,
        amount: paymentRecord.amount,
        paymentMethod: 'ONLINE',
        status: 'COMPLETED',
        recordedBy: req.user._id,
        notes: `Razorpay Online Payment: ${paymentRecord.razorpayPaymentId}`,
        financialTransactionId: finTx._id,
      });

      // Update Member total savings
      await Member.findByIdAndUpdate(paymentRecord.memberId._id, {
        $inc: { totalSavings: paymentRecord.amount },
      });

      receiptData = formatReceipt({
        receiptNumber,
        transactionId: finTx.transactionId,
        groupName: group.name,
        groupCode: group.code,
        villageTown: group.villageTown,
        district: group.district,
        memberName: req.user.name,
        memberNumber: paymentRecord.memberId.memberNumber,
        amount: paymentRecord.amount,
        purpose: `Monthly Savings (${period}) - Online`,
        paymentMethod: 'ONLINE',
        date: new Date(),
        recordedByName: 'Razorpay Gateway',
      });
    } else if (paymentRecord.purpose === 'LOAN_REPAYMENT' && paymentRecord.loanId) {
      const result = await recordRepayment({
        loanId: paymentRecord.loanId,
        amount: paymentRecord.amount,
        paymentMethod: 'ONLINE',
        reference: paymentRecord.razorpayPaymentId,
        recordedByUser: req.user,
      });

      receiptData = formatReceipt({
        receiptNumber: result.receiptNumber,
        transactionId: result.transactionId,
        groupName: group.name,
        groupCode: group.code,
        villageTown: group.villageTown,
        district: group.district,
        memberName: req.user.name,
        memberNumber: paymentRecord.memberId.memberNumber,
        amount: paymentRecord.amount,
        purpose: `Loan Repayment - Online`,
        paymentMethod: 'ONLINE',
        date: new Date(),
        recordedByName: 'Razorpay Gateway',
      });
    }

    await paymentRecord.save();

    await logAudit({
      groupId: paymentRecord.groupId,
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'ONLINE_PAYMENT_CAPTURED',
      targetModel: 'Payment',
      targetId: paymentRecord._id,
      amount: paymentRecord.amount,
      description: `Online payment of ₹${paymentRecord.amount} captured via Razorpay`,
      reference: paymentRecord.razorpayPaymentId,
      req,
    });

    res.json({
      success: true,
      message: 'Payment verified and credited to group successfully.',
      payment: paymentRecord,
      receipt: receiptData,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Razorpay Webhook handler (raw body verified, idempotent)
// @route   POST /api/payments/webhook
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
    }

    const event = req.body;
    console.log(`[Razorpay Webhook] Received event: ${event.event}`);

    // Idempotent processing of payment.captured
    if (event.event === 'payment.captured') {
      const entity = event.payload?.payment?.entity;
      if (entity && entity.order_id) {
        const paymentRecord = await Payment.findOne({ razorpayOrderId: entity.order_id });
        if (paymentRecord && paymentRecord.paymentStatus !== 'CAPTURED') {
          paymentRecord.razorpayPaymentId = entity.id;
          paymentRecord.paymentStatus = 'CAPTURED';
          paymentRecord.signatureVerificationStatus = 'VERIFIED';
          paymentRecord.gatewayResponse = entity;
          await paymentRecord.save();
        }
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Razorpay Webhook] Error:', err.message);
    res.status(200).json({ status: 'error_logged' }); // Webhooks acknowledge receipt
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
};
