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
    // ─── Section 1 — Header & Job Info ────────────────────────────────
    // jobNo is server-generated (getNextJobNo() in booking.service.js) —
    // never accepted from the client, same "delete from payload, server
    // sets it" pattern as shippingDeclaration.
    jobNo: {
      type: String,
      required: [true, 'Job number is required'],
      unique: true,
      trim: true,
    },
    // Independent of `status` below (pending/confirmed/cancelled, which
    // drives stock allocation) — a parallel, purely descriptive lifecycle
    // the ops team sets by hand.
    jobStatus: {
      type: String,
      enum: ['open', 'in_progress', 'completed', 'closed_invoiced'],
      default: 'open',
    },
    // Set once at creation from req.user, never edited afterward.
    // `createdAt` (via timestamps below) doubles as "Job Opened ... Date".
    jobOpenedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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

    // ─── Section 2 — Shipment & Cargo ─────────────────────────────────
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
    grossWeight: {
      type: Number,
      min: [0, 'Gross weight must be a positive number'],
    },
    cbm: {
      type: Number,
      min: [0, 'CBM must be a positive number'],
    },
    hsCode: { type: String, trim: true },
    packageType: { type: String, trim: true },
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

    // ─── Section 4 — Customs (Nafeza) ─────────────────────────────────
    // customsSubmittedAt is server-set the instant customsSubmitted flips
    // false → true (stampCustomsSubmittedAt() in booking.service.js) —
    // never accepted from the client.
    customsSubmitted: { type: Boolean, default: false },
    customsReferenceNo: { type: String, trim: true },
    customsSubmittedAt: { type: Date, default: null },

    // Set once, when this booking was created via a Quotation's
    // "Convert to Job" action — see Modules/Export/Quotation.
    quotation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      default: null,
    },

    // ─── Section 3 — Carrier Booking Confirmation ─────────────────────
    carrier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Carrier',
    },
    vesselName: { type: String, trim: true },
    voyageNo: { type: String, trim: true },
    etd: { type: Date },
    atd: { type: Date },
    eta: { type: Date },
    ata: { type: Date },
    spaceConfirmationStatus: {
      type: String,
      enum: ['Requested', 'Confirmed', 'Rejected'],
      default: 'Requested',
    },
    carrierBookingRef: { type: String, trim: true },
    voContactPerson: { type: String, trim: true },
    siCutoff: { type: Date },
    vgmCutoff: { type: Date },
    cyGateInCutoff: { type: Date },
    // "⭐ Milestone" field (product-note code FM-07-NV — a fixed UI label,
    // not stored here).
    bookingConfirmationStatus: {
      type: String,
      enum: ['Not Issued', 'Issued'],
      default: 'Not Issued',
    },
    bookingConfirmationFile: {
      fileName: { type: String },
      filePath: { type: String },
      mimeType: { type: String },
      uploadedAt: { type: Date },
    },

    // ─── Section 5 — Containers ────────────────────────────────────────
    // Which depot this booking's containers are allocated from — required
    // before confirm (enforced in booking.service.js's confirmBooking, not
    // here, so a draft booking isn't forced to pick one early).
    depot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Depot',
      default: null,
    },
    gateInDate: { type: Date },
    gateOutDate: { type: Date },
    containerLocation: { type: String, trim: true },

    // ─── Section 6 — Commercial ────────────────────────────────────────
    nvocc: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Nvocc',
    },
    currency: { type: String, trim: true, default: 'USD' },
    price: { type: Number },
    cost: { type: Number },
    freeTime: { type: Date },

    // ─── Section 7 — Parties ───────────────────────────────────────────
    shipper: { type: partySchema },
    consignee: { type: partySchema },

    // ─── Section 8 — Agents ────────────────────────────────────────────
    polAgent: { type: agentContactSchema },
    podAgent: { type: agentContactSchema },

    // ─── Section 9 — Status & Notes ────────────────────────────────────
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

    // ══════════════════════════════════════════════════════════════════
    // B&L (Bill of Lading / documentation) — a separate tab, gated by its
    // own bl:read/bl:update permissions rather than booking:*, so a
    // documentation-only role can use this without full Booking ops
    // access. See BL_PROJECTION/BL_EDITABLE_FIELDS in booking.service.js.
    // Deliberately does NOT duplicate `atd` (used as "actual sail date")
    // or add a second closing-status field — `jobStatus` above already
    // covers job closure (completed / closed_invoiced).
    // ══════════════════════════════════════════════════════════════════

    // ─── Customs Certificate ────────────────────────────────────────
    elHarkaRepName: { type: String, trim: true },
    exportCustomsDeclarationNo: { type: String, trim: true },
    certificateReceivedDate: { type: Date },
    customsCertificateFile: {
      fileName: { type: String },
      filePath: { type: String },
      mimeType: { type: String },
      uploadedAt: { type: Date },
    },

    // ─── BL Parties & Draft BL ──────────────────────────────────────
    // Shipper/consignee name+address+tax numbers printed on the BL are
    // NOT duplicated here — they already exist as `shipper`/`consignee`
    // and `exportTaxNumber`/`importTaxNumber` above.
    hblNumber: { type: String, trim: true },
    mblNumber: { type: String, trim: true },
    notifyPartyName: { type: String, trim: true },
    notifyPartyAddress: { type: String, trim: true },
    destinationAgentDetails: { type: String, trim: true },
    consigneeToOrder: { type: Boolean, default: false },
    blDraftVersion: { type: String, trim: true },
    draftSentToClientDate: { type: Date },
    clientConfirmationStatus: {
      type: String,
      enum: ['Pending', 'Confirmed'],
      default: 'Pending',
    },

    // ─── BL Release ──────────────────────────────────────────────────
    blType: {
      type: String,
      enum: ['Original 3/3', 'Seaway Bill', 'Express Release', 'Telex Release'],
      default: 'Telex Release',
    },
    // "⭐ Milestone" (product-note code FM-11-NV — a fixed UI label, not
    // stored here).
    telexReleaseSentDate: { type: Date },
    numberOfOriginalBLs: { type: Number, min: [0, 'Must be a positive number'] },
    freightTermsOnBL: {
      type: String,
      enum: ['Freight Prepaid', 'Freight Collect'],
    },
    placeOfIssue: { type: String, trim: true },
    dateOfIssue: { type: Date },

    // ─── Sea/Customs Closure ─────────────────────────────────────────
    // This checklist only becomes editable in the UI once `atd` (Actual
    // Time of Departure, above) is set — no separate "actual sail date"
    // field is stored twice.
    finalLoadListStatus: {
      type: String,
      enum: ['Pending', 'Sent'],
      default: 'Pending',
    },
    dgManifestRequired: { type: Boolean, default: false },
    dgManifestStatus: {
      type: String,
      enum: ['N/A', 'Pending', 'Sent'],
      default: 'N/A',
    },
    reeferManifestRequired: { type: Boolean, default: false },
    reeferManifestStatus: {
      type: String,
      enum: ['N/A', 'Pending', 'Sent'],
      default: 'N/A',
    },
    // "⭐ Milestone" fields below (codes are fixed UI labels, not stored).
    paymentRequestSent: { type: Boolean, default: false },
    invoiceStatus: {
      type: String,
      enum: ['Draft', 'Issued', 'Paid'],
      default: 'Draft',
    },
    preAlertSent: { type: Boolean, default: false },
    subManifestNafezaSubmitted: { type: Boolean, default: false },
    subManifestIssuedSent: { type: Boolean, default: false },

    // ─── Final Follow-up & Closing ───────────────────────────────────
    // ETA vs ATA is a computed display in the BL form (both fields
    // already exist above) — not stored twice. Job closing itself is
    // `jobStatus` (completed / closed_invoiced), not a separate field.
    podAgentUpdateLog: {
      type: [{ date: { type: Date, required: true }, note: { type: String, trim: true } }],
      default: [],
    },
    customerNotifiedDate: { type: Date },
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
bookingSchema.index({ depot: 1 })
bookingSchema.index({ 'containers.containerType': 1 })

export default mongoose.model('Booking', bookingSchema)
