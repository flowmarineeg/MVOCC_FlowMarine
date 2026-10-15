import mongoose from 'mongoose'

export const MSDS_MAX_FILES = 5
export const IMO_CLASSES = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '2.1', '2.2', '2.3', '3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '6.2', '7', '8', '9']
export const PACKING_GROUPS = ['I', 'II', 'III', 'N/A']
export const QUOTATION_STATUSES = ['draft', 'sent', 'negotiation', 'approved', 'rejected', 'expired']

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
    // Estimated weights for this container line (kg).
    grossWeight: { type: Number, min: [0, 'Gross weight must be a positive number'] },
    netWeight: { type: Number, min: [0, 'Net weight must be a positive number'] },
  },
  { _id: false }
)

// ─── Rate tables (Buying + Selling share the same shape) ─────────────────
// Each side has an Origin table and a Destination table. A line is priced per
// container size: rate20/rate40 × qty20/qty40. qty* is normally left empty —
// the server then uses the total quantity of that size taken from the
// quotation's containers — and only set when a line isn't per-container
// (e.g. BL / Telex / Documentation are per B/L or per shipment).
const amount = { type: Number, min: [0, 'Must be a positive number'] }

// Every line carries its OWN currency (blank = "no currency" group). Lines saved
// before per-row currencies existed have none; the service then falls back to
// the legacy side/table currency fields below.
export const PAYABLE_TYPES = ['Carrier', 'VO', 'Depot', 'Terminal', 'Trucker', 'Other']
export const BILL_TO_TYPES = ['Shipper', 'Consignee', 'Other']
export const PAYMENT_RESPONSIBILITIES = ['Prepaid', 'Collect']

// payableType/payableTo (buying side) and billTo/paymentResponsibility (selling
// side) are PRD Q-60..Q-62 metadata: who the agent pays / who is billed. They
// never take part in the profitability maths.
const rateLineFields = {
  rate20: amount, rate40: amount, qty20: amount, qty40: amount,
  currency: { type: String, trim: true, uppercase: true },
  payableType: { type: String, enum: [...PAYABLE_TYPES, ''] },
  payableTo: { type: String, trim: true },
  billTo: { type: String, enum: [...BILL_TO_TYPES, ''] },
  paymentResponsibility: { type: String, enum: [...PAYMENT_RESPONSIBILITIES, ''] },
}
const rateLineSchema = new mongoose.Schema(rateLineFields, { _id: false })
// uid is a client-generated id that links a custom row in a Buying table to its
// mirrored row in the Selling table (buying -> selling sync); never shown.
const customLineSchema = new mongoose.Schema(
  { label: { type: String, trim: true, required: true }, uid: { type: String, trim: true }, ...rateLineFields },
  { _id: false }
)

export const ORIGIN_LINE_KEYS = ['oceanFreight', 'dgSurcharge', 'thc', 'bl', 'telex', 'documentation']
export const DESTINATION_LINE_KEYS = ['adminFee', 'dthc', 'lolo', 'importServiceFee', 'deliveryOrder']

const buildTableSchema = (keys) =>
  new mongoose.Schema(
    {
      ...Object.fromEntries(keys.map((key) => [key, { type: rateLineSchema, default: undefined }])),
      custom: { type: [customLineSchema], default: [] },
      // Standard lines the user removed from this quotation (kept so a removed
      // row doesn't come back on reload; its values are cleared when removed).
      hidden: { type: [String], default: [] },
    },
    { _id: false }
  )

const totalsRowSchema = new mongoose.Schema(
  {
    currency: { type: String, default: '' },
    buying: { type: Number, default: 0 },
    selling: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    marginPercent: { type: Number, default: 0 },
    belowMinMargin: { type: Boolean, default: false },
  },
  { _id: false }
)

const originTableSchema = buildTableSchema(ORIGIN_LINE_KEYS)
const destinationTableSchema = buildTableSchema(DESTINATION_LINE_KEYS)

const quotationSchema = new mongoose.Schema(
  {
    // Server-generated: FQ + 2-digit year + 4-digit yearly sequence (FQ260001).
    quotationNo: {
      type: String,
      required: [true, 'Quotation number is required'],
      unique: true,
      trim: true,
    },

    // Revisions keep the base number and add -R1, -R2 ... (quotationNo stays unique).
    baseNo: { type: String, trim: true },
    revision: { type: Number, default: 0, min: 0 },
    revisedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },
    revisedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },
    // Q-03 — a sent/negotiation quote past this date becomes 'expired' (lazily).
    validityDate: { type: Date },

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
    // Dangerous-goods detail (PRD Q-32..Q-39) — only kept while isDangerous.
    properShippingName: { type: String, trim: true },
    imoClass: { type: String, enum: [...IMO_CLASSES, ''] },
    subsidiaryRisk: { type: String, enum: [...IMO_CLASSES, ''] },
    packingGroup: { type: String, enum: [...PACKING_GROUPS, ''] },
    flashPoint: { type: Number },
    marinePollutant: { type: Boolean, default: false },
    emergencyContact: { type: String, trim: true },
    // Reefer (Q-26/27) and out-of-gauge (Q-28) data — only kept for matching container types.
    setTemperature: { type: Number },
    ventilationHumidity: { type: String, trim: true },
    oogDimensions: { type: String, trim: true },
    // MSDS (safety data sheet) uploads for dangerous cargo — max MSDS_MAX_FILES.
    // Only ever written from real multer uploads (never from the JSON body, so
    // it is not in EDITABLE_FIELDS) and streamed back through an auth'd route.
    msdsFiles: {
      type: [
        {
          fileName: { type: String },
          filePath: { type: String },
          mimeType: { type: String },
          uploadedAt: { type: Date },
        },
      ],
      default: [],
    },
    pol: { type: mongoose.Schema.Types.ObjectId, ref: 'Port', required: [true, 'Port of Loading is required'] },
    pod: { type: mongoose.Schema.Types.ObjectId, ref: 'Port', required: [true, 'Port of Discharge is required'] },
    finalDestination: { type: mongoose.Schema.Types.ObjectId, ref: 'Port', default: null },
    transshipmentPort: { type: mongoose.Schema.Types.ObjectId, ref: 'Port', default: null },
    incoterms: {
      type: String,
      enum: ['EXW', 'FCA', 'FOB', 'CPT', 'CIP', 'CFR', 'CIF', 'DAP', 'DPU', 'DDP'],
    },
    targetEtd: { type: Date },
    targetRate: { type: Number, min: [0, 'Target rate must be a positive number'] },
    cargoReadinessDate: { type: Date },
    specialNotes: { type: String, trim: true },

    // ─── 2) NVOCC ──────────────────────────────────────────────────────
    nvocc: { type: mongoose.Schema.Types.ObjectId, ref: 'Nvocc' },
    // Estimate only (PRD Q-41) — the confirmed VO is chosen on the booking.
    plannedVesselOperator: { type: mongoose.Schema.Types.ObjectId, ref: 'VesselOperator', default: null },

    // ─── 3) Buying ─────────────────────────────────────────────────────
    // buyingCurrency / buyingDestinationCurrency (and the selling pair below) are
    // DEPRECATED: currency is per row now. They are no longer editable and only
    // serve as the fallback currency for lines saved before that change.
    buyingCurrency: { type: String, trim: true, default: 'USD' },
    rateValidFrom: { type: Date },
    rateValidTo: { type: Date },
    buyingOrigin: { type: originTableSchema, default: () => ({}) },
    buyingDestinationCurrency: { type: String, trim: true, default: 'USD' },
    buyingDestination: { type: destinationTableSchema, default: () => ({}) },
    // Client demurrage free time (Q-43) — the field was always called "buying"
    // days; the form label is "Free Time (demurrage, days)".
    freeTimeBuyingDays: { type: Number, min: [0, 'Must be a positive number'] },
    detentionFreeTimeDays: { type: Number, min: [0, 'Must be a positive number'] },
    rateSourceReference: { type: String, trim: true },

    // ─── 4) Selling ────────────────────────────────────────────────────
    sellingCurrency: { type: String, trim: true, default: 'USD' },
    sellingOrigin: { type: originTableSchema, default: () => ({}) },
    sellingDestinationCurrency: { type: String, trim: true, default: 'USD' },
    sellingDestination: { type: destinationTableSchema, default: () => ({}) },
    paymentTerms: {
      type: String,
      enum: ['Freight Prepaid', 'Freight Collect'],
    },
    termsRemarks: { type: String, trim: true },

    // ─── 5) Profitability (server-computed — see quotation.service.js) ──
    // Profit is computed PER CURRENCY (no conversion between currencies).
    // totalsByCurrency holds the full breakdown; the four scalar totals below
    // are the PRIMARY currency's (largest selling total) so lists and the
    // convert-to-job prefill still have a single price/cost/margin to read.
    totalsCurrency: { type: String, default: '' },
    totalsByCurrency: { type: [totalsRowSchema], default: [] },
    totalBuyingCost: { type: Number, default: 0 },
    totalSellingPrice: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    profitMarginPercent: { type: Number, default: 0 },
    belowMinMargin: { type: Boolean, default: false },

    // ─── 6) Status & Decision ────────────────────────────────────────
    status: {
      type: String,
      enum: QUOTATION_STATUSES,
      default: 'draft',
    },
    rejectionReason: { type: String, trim: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ─── Linkage (set once, by the convert-to-booking flow) ─────────────
    linkedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    convertedAt: { type: Date, default: null },

    // ─── Tracking (server-set, never trusted from the client) ──────────
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

quotationSchema.index({ status: 1 })
quotationSchema.index({ baseNo: 1 })
quotationSchema.index({ validityDate: 1 })
quotationSchema.index({ nvocc: 1 })
quotationSchema.index({ customer: 1 })
quotationSchema.index({ salesRep: 1 })
quotationSchema.index({ 'containers.containerType': 1 })

export default mongoose.model('Quotation', quotationSchema)
