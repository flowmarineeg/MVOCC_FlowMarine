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

const freightRateSchema = new mongoose.Schema(
  {
    containerType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContainerType',
      required: true,
    },
    rate: {
      type: Number,
      required: true,
      min: [0, 'Rate must be a positive number'],
    },
  },
  { _id: false }
)

const feeLineSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true },
    amount: { type: Number, required: true, min: [0, 'Amount must be a positive number'] },
  },
  { _id: false }
)

const quotationSchema = new mongoose.Schema(
  {
    quotationNo: {
      type: String,
      required: [true, 'Quotation number is required'],
      unique: true,
      trim: true,
    },

    // ─── 1) Client Request ────────────────────────────────────────────
    customerType: {
      type: String,
      enum: ['new', 'existing'],
      required: [true, 'Client type is required'],
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    clientName: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
    },
    contactPerson: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    clientReferenceNo: { type: String, trim: true },
    inquiryDate: {
      type: Date,
      required: [true, 'Inquiry date is required'],
      default: Date.now,
    },
    salesRep: {
      type: String,
      required: [true, 'Sales representative is required'],
      trim: true,
    },
    commodity: {
      type: String,
      required: [true, 'Commodity is required'],
      trim: true,
    },
    hsCode: { type: String, trim: true },
    containers: {
      type: [containerEntrySchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one container entry is required',
      },
    },
    grossWeight: { type: Number, min: [0, 'Gross weight must be a positive number'] },
    cbm: { type: Number, min: [0, 'CBM must be a positive number'] },
    isDangerous: { type: Boolean, default: false },
    unClass: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !this.isDangerous || !!(v && v.trim())
        },
        message: 'UN Class is required when cargo is marked dangerous',
      },
    },
    unNumber: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !this.isDangerous || !!(v && v.trim())
        },
        message: 'UN Number is required when cargo is marked dangerous',
      },
    },
    por: { type: mongoose.Schema.Types.ObjectId, ref: 'Port' },
    pol: { type: mongoose.Schema.Types.ObjectId, ref: 'Port', required: [true, 'Port of Loading is required'] },
    pod: { type: mongoose.Schema.Types.ObjectId, ref: 'Port', required: [true, 'Port of Discharge is required'] },
    fpd: { type: mongoose.Schema.Types.ObjectId, ref: 'Port' },
    incoterms: {
      type: String,
      enum: ['EXW', 'FCA', 'FOB', 'CPT', 'CIP', 'CFR', 'CIF', 'DAP', 'DPU', 'DDP'],
    },
    targetEtd: { type: Date },
    specialNotes: { type: String, trim: true },

    // ─── 2) NVOCC ──────────────────────────────────────────────────────
    nvocc: { type: mongoose.Schema.Types.ObjectId, ref: 'Nvocc' },

    // ─── 3) Buying ─────────────────────────────────────────────────────
    buyingCurrency: { type: String, trim: true, default: 'USD' },
    rateValidFrom: { type: Date },
    rateValidTo: { type: Date },
    oceanFreightBuying: { type: [freightRateSchema], default: [] },
    polChargesBuying: {
      thc: { type: Number, min: 0 },
      documentation: { type: Number, min: 0 },
      seal: { type: Number, min: 0 },
      edi: { type: Number, min: 0 },
    },
    podLocalChargesBuying: { type: Number, min: [0, 'Must be a positive number'] },
    freeTimeBuyingDays: { type: Number, min: [0, 'Must be a positive number'] },
    destinationCharge: { type: Number, min: [0, 'Must be a positive number'] },
    rateSourceReference: { type: String, trim: true },

    // ─── 4) Selling ────────────────────────────────────────────────────
    sellingCurrency: { type: String, trim: true, default: 'USD' },
    exchangeRate: { type: Number, min: [0, 'Exchange rate must be a positive number'], default: 1 },
    oceanFreightSelling: { type: [freightRateSchema], default: [] },
    polChargesSelling: { type: Number, min: [0, 'Must be a positive number'] },
    otherFeesToClient: { type: [feeLineSchema], default: [] },
    paymentTerms: {
      type: String,
      enum: ['Freight Prepaid', 'Freight Collect'],
    },

    // ─── 5) Profitability (server-computed — see quotation.service.js) ──
    totalBuyingCost: { type: Number, default: 0 },
    totalSellingPrice: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    profitMarginPercent: { type: Number, default: 0 },
    belowMinMargin: { type: Boolean, default: false },

    // ─── 6) Status & Decision ────────────────────────────────────────
    status: {
      type: String,
      enum: ['draft', 'sent', 'negotiation', 'approved', 'rejected'],
      default: 'draft',
    },
    rejectionReason: { type: String, trim: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    validUntil: { type: Date },

    // ─── Linkage (set once, by the convert-to-booking flow) ─────────────
    linkedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    convertedAt: { type: Date, default: null },

    // ─── Tracking (server-set, never trusted from the client) ──────────
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

quotationSchema.index({ status: 1 })
quotationSchema.index({ nvocc: 1 })
quotationSchema.index({ customer: 1 })
quotationSchema.index({ salesRep: 1 })
quotationSchema.index({ 'containers.containerType': 1 })

export default mongoose.model('Quotation', quotationSchema)
