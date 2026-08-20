import mongoose from 'mongoose'

const invitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: [true, 'Role is required'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'refused', 'expired', 'revoked'],
      default: 'pending',
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
)

// Prevent two simultaneous pending invites to the same email
invitationSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
)
invitationSchema.index({ status: 1 })

export default mongoose.model('Invitation', invitationSchema)
