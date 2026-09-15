import mongoose from 'mongoose'

// Individual physical container units — replaces the old aggregate
// ContainerStock count. Each unit belongs to one container type, one NVOCC,
// and sits at one depot. `status` tracks whether it's free to quote against
// or already allocated to a confirmed booking; allocation is FIFO by
// createdAt (oldest stock first) — see decrementStock() in
// container.service.js.
const containerSchema = new mongoose.Schema(
  {
    containerNumber: {
      type: String,
      required: [true, 'Container number is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    containerType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContainerType',
      required: true,
    },
    nvocc: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Nvocc',
      required: true,
    },
    depot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Depot',
      required: true,
    },
    status: {
      type: String,
      enum: ['available', 'allocated'],
      default: 'available',
    },

    // ─── Per-unit operational lifecycle — only meaningful while
    // status === 'allocated'; cleared back to null on release. `booking`
    // is what lets incrementStock() release exactly the units a specific
    // booking allocated instead of guessing by recency.
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    sealNumber: { type: String, trim: true, default: null },
    guaranteeReceiptStatus: {
      type: String,
      enum: ['Received', 'Pending', null],
      default: null,
    },
    containerStatus: {
      type: String,
      enum: ['Empty Assigned', 'Gated-In', 'Loaded', 'Departed', null],
      default: null,
    },
    gateInDate: { type: Date, default: null },
    vasUploadStatus: {
      type: String,
      enum: ['Not Uploaded', 'Uploaded', null],
      default: null,
    },
  },
  { timestamps: true }
)

containerSchema.index({ containerType: 1, nvocc: 1, depot: 1 })
containerSchema.index({ booking: 1 })

export default mongoose.model('Container', containerSchema)
