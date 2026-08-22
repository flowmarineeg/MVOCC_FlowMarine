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

// Shipper / consignee are entered directly on the booking (not master data) —
// each party's own contact details, not just a company name.
const partySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone1: { type: String, trim: true },
    phone2: { type: String, trim: true },
    address: { type: String, trim: true },
    taxNumber: { type: String, trim: true },
  },
  { _id: false }
)

// POL/POD agents are free-text at Step 2 rather than a Master Data selection.
const agentContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
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
    commodity: {
      type: String,
      required: [true, 'Commodity is required'],
      trim: true,
    },
    ucrNumber: {
      type: String,
      trim: true,
    },
    exportTaxNumber: {
      type: String,
      trim: true,
    },
    importTaxNumber: {
      type: String,
      trim: true,
    },
    importCountry: {
      type: String,
      trim: true,
    },
    packagesCount: {
      type: Number,
      min: [0, 'Number of packages must be a positive number'],
    },
    vgm: {
      type: Number,
      min: [0, 'VGM must be a positive number'],
    },
    isDangerous: {
      type: Boolean,
      default: false,
    },
    dangerousNumber: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !this.isDangerous || !!(v && v.trim())
        },
        message: 'Dangerous goods number is required when cargo is marked dangerous',
      },
    },
    shippingDeclaration: {
      fileName: { type: String },
      filePath: { type: String },
      mimeType: { type: String },
      uploadedAt: { type: Date },
    },

    // ─── Step 2 — Operational Details ────────────────────────────────
    nvocc: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Nvocc',
    },
    price: { type: Number },
    cost: { type: Number },
    freeTime: { type: Date },
    gateInDate: { type: Date },
    gateOutDate: { type: Date },
    containerLocation: { type: String, trim: true },
    shipper: { type: partySchema },
    consignee: { type: partySchema },
    etd: { type: Date },
    atd: { type: Date },
    eta: { type: Date },
    ata: { type: Date },
    carrier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Carrier',
    },
    vesselName: { type: String, trim: true },
    voyageNo: { type: String, trim: true },
    polAgent: { type: agentContactSchema },
    podAgent: { type: agentContactSchema },
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
// (jobNo's unique index comes from `unique: true` on the field itself, above —
// an explicit schema.index() for it as well previously logged a duplicate-index warning on boot)
bookingSchema.index({ status: 1 })
bookingSchema.index({ pol: 1, pod: 1 })
bookingSchema.index({ carrier: 1 })
bookingSchema.index({ nvocc: 1 })
bookingSchema.index({ 'containers.containerType': 1 })

export default mongoose.model('Booking', bookingSchema)
