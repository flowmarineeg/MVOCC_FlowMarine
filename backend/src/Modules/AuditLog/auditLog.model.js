import mongoose from 'mongoose'

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    userEmail: {
      type: String,
      default: null,
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      uppercase: true,
      trim: true,
    },
    resource: {
      type: String,
      required: [true, 'Resource is required'],
      trim: true,
    },
    resourceId: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
    result: {
      type: String,
      enum: ['SUCCESS', 'FAILURE'],
      required: true,
      default: 'SUCCESS',
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

auditLogSchema.index({ user: 1 })
auditLogSchema.index({ action: 1 })
auditLogSchema.index({ resource: 1 })
auditLogSchema.index({ result: 1 })
auditLogSchema.index({ createdAt: -1 })

export default mongoose.model('AuditLog', auditLogSchema)
