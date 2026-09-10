const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayOrderId: {
      type: String,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      index: true,
    },
    razorpaySignature: String,
    amount: {
      type: Number,
      required: true,
      min: [1, 'Payment amount must be greater than zero'],
    },
    currency: {
      type: String,
      default: 'INR',
    },
    purpose: {
      type: String,
      enum: ['SAVINGS', 'LOAN_REPAYMENT', 'OTHER'],
      required: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Loan',
    },
    savingsPeriod: String, // e.g. '2026-09'
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'CAPTURED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    signatureVerificationStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'FAILED', 'NOT_APPLICABLE'],
      default: 'PENDING',
    },
    method: {
      type: String,
      default: 'ONLINE',
    },
    gatewayResponse: mongoose.Schema.Types.Mixed,
    financialTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinancialTransaction',
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ groupId: 1, paymentStatus: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
