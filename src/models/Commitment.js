import mongoose from 'mongoose';

const proofSchema = new mongoose.Schema({
  imageUrl: String,
  extractedText: String,
  gptAnalysis: String,
  isValid: Boolean,
  verifiedAt: {
    type: Date,
    default: Date.now
  }
});

const completionSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  proof: {
    type: proofSchema,
    default: null
  }
});

const recurringConfigSchema = new mongoose.Schema({
  days: [{
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  }],
  endDate: Date,
  completions: [completionSchema]
});

const commitmentSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  commitment: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['daily', 'weekly'],
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  proofs: [proofSchema],
  recurring: {
    type: recurringConfigSchema,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

commitmentSchema.index({ userId: 1, createdAt: -1 });

export const Commitment = mongoose.model('Commitment', commitmentSchema);