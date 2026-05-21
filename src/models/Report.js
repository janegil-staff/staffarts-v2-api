// src/models/Report.js
//
// A report filed by `reporter` against `reportedUser`, optionally citing a
// specific `message`. Stored for moderation review. `status` lets you triage
// from a future admin view; it defaults to 'open'.

import mongoose from 'mongoose';

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'inappropriate',
  'scam',
  'impersonation',
  'other',
];

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Optional — present when the user reported a specific message rather than
    // the whole account.
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
    },
    reason: {
      type: String,
      enum: REPORT_REASONS,
      default: 'other',
    },
    // Optional free-text detail from the reporter.
    detail: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['open', 'reviewed', 'actioned', 'dismissed'],
      default: 'open',
      index: true,
    },
  },
  { timestamps: true },
);

const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
export default Report;