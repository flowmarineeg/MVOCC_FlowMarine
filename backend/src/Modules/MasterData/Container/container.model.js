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

    // ─── Sprint 007 — Step 3 container grid (PRD S3-24 .. S3-44) ──────────
    customsSealNo: { type: String, trim: true, default: null },
    payloadWeightKg: { type: Number, min: 0, default: null },
    cbm: { type: Number, min: 0, default: null },
    packagesInContainer: { type: Number, min: 0, default: null },
    vgmMethod: { type: Number, enum: [1, 2, null], default: null },
    packingWeightKg: { type: Number, min: 0, default: null },
    vgmWeightKg: { type: Number, min: 0, default: null },
    weighbridgeTicket: { type: String, trim: true, default: null },
    vgmDeclaredBy: { type: String, trim: true, default: null },
    vgmSubmittedAt: { type: Date, default: null },
    conditionAtGateOut: { type: String, enum: ['Sound', 'Damaged', null], default: null },
    conditionNotes: { type: String, trim: true, default: null },
    gateOutEirNo: { type: String, trim: true, default: null },
    gateInEirNo: { type: String, trim: true, default: null },
    gateOutDate: { type: Date, default: null },
    lateGateInReason: { type: String, trim: true, default: null },
  },
  { timestamps: true }
)

containerSchema.index({ containerType: 1, nvocc: 1, depot: 1 })
containerSchema.index({ booking: 1 })

export default mongoose.model('Container', containerSchema)
