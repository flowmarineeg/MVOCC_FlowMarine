import mongoose from 'mongoose'

const containerEntrySchema = new mongoose.Schema(
  {
    containerType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContainerType',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
    },
  },
  { _id: false }
)

const bookingSchema = new mongoose.Schema(
  {
    // ─── Step 1 — Client Quotation ───────────────────────────────────
    jobNo: {
      type: String,
      required: [true, 'Job number is required'],
      unique: true,
      trim: true,
    },
    clientName: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
    },
    clientPhone: {
      type: String,
      required: [true, 'Client phone is required'],
      trim: true,
    },
    clientEmail: {
      type: String,
      required: [true, 'Client email is required'],
      trim: true,
      lowercase: true,
    },
    containers: {
      type: [containerEntrySchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one container entry is required',
      },
    },
    pol: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Port',
      required: [true, 'Port of Loading is required'],
    },
    pod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Port',
      required: [true, 'Port of Discharge is required'],
    },
    blNo: {
      type: String,
      trim: true,
    },

    // ─── Step 2 — Operational Details ────────────────────────────────
    price: { type: Number },
    cost: { type: Number },
    freeTimeEstimated: { type: Date },
    freeTimeFinal: { type: Date },
    gateInDate: { type: Date },
    gateOutDate: { type: Date },
    containerLocation: { type: String, trim: true },
    shipper: { type: String, trim: true },
    consignee: { type: String, trim: true },
    etd: { type: Date },
    atd: { type: Date },
    eta: { type: Date },
    ata: { type: Date },
    mainVessel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vessel',
    },
    voyageNo: { type: String, trim: true },
    polAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
    },
    podAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
    },
    manifestStatus: {
      type: String,
      enum: ['PENDING', 'SUBMITTED', 'CONFIRMED'],
      default: 'PENDING',
    },
    notes: { type: String, trim: true },

    // ─── System Fields ───────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },
    step: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
)

// Indexes
bookingSchema.index({ status: 1 })
bookingSchema.index({ pol: 1, pod: 1 })
bookingSchema.index({ jobNo: 1 }, { unique: true })

export default mongoose.model('Booking', bookingSchema)
