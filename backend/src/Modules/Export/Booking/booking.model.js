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

// Shipper / consignee / notify are picked from the Parties master data; the
// picked party's details are copied here (a snapshot) so the booking, the BL
// recap and the exports keep reading plain fields even if the master record
// changes or is deleted later.
const partySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    country: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone1: { type: String, trim: true },
    phone2: { type: String, trim: true },
    address: { type: String, trim: true },
    taxNumber: { type: String, trim: true },
  },
  { _id: false }
)

// The POD agent is picked from the Agent (POD AGENTS) master data and copied
// here as a snapshot; the POL agent is no longer captured in the UI.
const agentContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
  },
  { _id: false }
)

// One slot of a container line on the Depot / Container step: the seal number
// typed for it. The container NUMBERS are not chosen by anyone — the form just
// shows the depot's oldest free units of that type, and confirmBooking()
// allocates exactly those (oldest first) and applies these seals in slot order.
const containerAssignmentSchema = new mongoose.Schema(
  {
    containerType: { type: mongoose.Schema.Types.ObjectId, ref: 'ContainerType', required: true },
    sealNumber: { type: String, trim: true },
  },
  { _id: false }
)

// Sprint 007 — Step 2: the equipment the VO actually confirmed (S2-53); it has to
// cover the quantities the job needs before the Booking step can complete.
const confirmedEquipmentSchema = new mongoose.Schema(
  {
    containerType: { type: mongoose.Schema.Types.ObjectId, ref: 'ContainerType', required: true },
    quantity: { type: Number, required: true, min: [0, 'Quantity must be zero or more'] },
  },
  { _id: false }
)

// Sprint 007 — a numbered snapshot of the VO booking taken on roll-over / amend (BR-2.3, BR-2.4).
const bookingVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    reason: { type: String, trim: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
    snapshot: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
)

const stepStampSchema = new mongoose.Schema(
  {
    step: { type: Number, required: true, min: 1, max: 5 },
    completedAt: { type: Date, default: Date.now },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
)

const amendmentSchema = new mongoose.Schema(
  {
    step: { type: Number, required: true, min: 1, max: 5 },
    reason: { type: String, trim: true, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

const draftVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    sentAt: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true },
  },
  { _id: false }
)

const preAlertSchema = new mongoose.Schema(
  {
    sentAt: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recipients: { type: [String], default: [] },
    acknowledgedAt: { type: Date, default: null },
  },
  { _id: false }
)

// Every generated document (loading list, DG manifest, draft / final HBL) is logged so a
// document that was changed after it was sent can be flagged for re-sending (BR-5.4).
const documentLogSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['loading-list', 'dg-manifest', 'draft-hbl', 'hbl'], required: true },
    version: { type: Number, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
    grossWeight: {
      type: Number,
      min: [0, 'Gross weight must be a positive number'],
    },
    netWeight: {
      type: Number,
      min: [0, 'Net weight must be a positive number'],
    },
    hsCode: { type: String, trim: true },
    packageType: { type: String, trim: true },
    isDangerous: {
      type: Boolean,
      default: false,
    },
    // Dangerous goods: class number + UN number (UN number comes from the
    // quotation on convert; the old single "dangerous goods number" is gone).
    dangerousClass: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !this.isDangerous || !!(v && v.trim())
        },
        message: 'Class number is required when cargo is marked dangerous',
      },
    },
    unNumber: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !this.isDangerous || !!(v && v.trim())
        },
        message: 'UN number is required when cargo is marked dangerous',
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
      ref: 'VesselOperator',
    },
    vesselName: { type: String, trim: true },
    voyageNo: { type: String, trim: true },
    etd: { type: Date },
    atd: { type: Date },
    eta: { type: Date },
    ata: { type: Date },
    spaceConfirmationStatus: {
      type: String,
      enum: ['Requested', 'Confirmed', 'Rejected', 'Amended', 'Rolled', 'Cancelled'],
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
    containerLocation: { type: String, trim: true }, // no longer in the UI; kept so old data isn't lost
    containerAssignments: { type: [containerAssignmentSchema], default: [] },

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
    notify: { type: partySchema },
    // true -> notify mirrors the consignee (the form copies it; stored so the UI restores the checkbox)
    notifySameAsConsignee: { type: Boolean, default: false },
    shipperParty: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', default: null },
    consigneeParty: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', default: null },
    notifyParty: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', default: null },

    // ─── Section 8 — Agents ────────────────────────────────────────────
    polAgent: { type: agentContactSchema },
    podAgent: { type: agentContactSchema },
    podAgentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },

    // ─── Section 9 — Status & Notes ────────────────────────────────────
    manifestStatus: {
      type: String,
      enum: ['PENDING', 'SUBMITTED', 'CONFIRMED'],
      default: 'PENDING',
    },
    notes: { type: String, trim: true },

    // ══════════════════════════════════════════════════════════════════
    // Sprint 007 — Booking & Job aligned with the Export PRD (docs/ref.md).
    // Steps 1-3 are booking-owned (booking:* permissions); Steps 4-5 are
    // B&L-owned and sit further down with the other bl:* fields.
    // ══════════════════════════════════════════════════════════════════

    // ─── Step 1 — Preliminary S/D ────────────────────────────────────
    cargoReadinessDate: { type: Date },
    proformaInvoiceNo: { type: String, trim: true },
    proformaInvoiceDate: { type: Date },
    acidNumber: { type: String, trim: true }, // 19 digits, only for Egypt PODs (C8)
    cbm: { type: Number, min: [0, 'CBM must be a positive number'] },
    shipperReference: { type: String, trim: true },
    countryOfOrigin: { type: String, trim: true },
    exporterLicenceNo: { type: String, trim: true },
    stuffingLocationType: {
      type: String,
      enum: ['Shipper premises', 'Depot CFS', 'Third-party CFS', ''],
    },
    stuffingDate: { type: Date },
    specialInstructions: { type: String, trim: true },
    weightVarianceReason: { type: String, trim: true }, // D5 — needed above 5 % from the quoted figure
    // dangerous-goods detail carried from the quotation (the VO and the DG manifest need it)
    properShippingName: { type: String, trim: true },
    subsidiaryRisk: { type: String, trim: true },
    packingGroup: { type: String, trim: true },
    flashPoint: { type: Number },
    marinePollutant: { type: Boolean, default: false },
    emergencyContact: { type: String, trim: true },
    // reefer / out-of-gauge data carried from the quotation
    setTemperature: { type: Number },
    ventilationHumidity: { type: String, trim: true },
    oogDimensions: { type: String, trim: true },

    // ─── Step 2 — Booking (VO space confirmation) ────────────────────
    polTerminal: { type: String, trim: true },
    podTerminal: { type: String, trim: true }, // 'TBA' (to be advised) is allowed
    serviceLoopCode: { type: String, trim: true },
    bookingType: { type: String, enum: ['SOC'], default: 'SOC' }, // always shipper-owned boxes (C7)
    vesselImo: { type: String, trim: true },
    cyOpeningCutoff: { type: Date },
    customsCutoff: { type: Date },
    dgCutoff: { type: Date },
    bookingRequestSentAt: { type: Date },
    confirmedEquipment: { type: [confirmedEquipmentSchema], default: [] },
    dgAcceptanceRef: { type: String, trim: true },
    voFreeTimeDays: { type: Number, min: [0, 'Must be zero or more'] },
    bookingVersions: { type: [bookingVersionSchema], default: [] },

    // ─── Step 3 — Depot / Container: Release Order ───────────────────
    croNumber: { type: String, trim: true },
    croIssueDate: { type: Date },
    croValidityDate: { type: Date },
    croIssuedBy: { type: String, enum: ['Carrier', 'Agent', ''] },
    releasedTo: { type: String, trim: true },
    truckPlateDriver: { type: String, trim: true },
    reconciliationReason: { type: String, trim: true }, // D16 — saved when the 2 % checks fail

    // ─── Step gating, Amend, lifecycle (G4 / G5 / G6) ────────────────
    stepsCompleted: { type: [stepStampSchema], default: [] },
    reconfirmSteps: { type: [Number], default: [] },
    amendments: { type: [amendmentSchema], default: [] },

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
    // 'Confirmed' IS the PRD's "Approved" (S4-52, D9) — the stored value is kept so nothing migrates.
    clientConfirmationStatus: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Amendments Requested'],
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
      enum: ['Freight Prepaid', 'Freight Collect', ''],
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

    // ─── Step 4 — Final S/D (PRD S4-10 .. S4-56) ─────────────────────
    exactShipper: { type: String, trim: true },
    exactConsignee: { type: String, trim: true },
    exactNotify: { type: String, trim: true },
    alsoNotify: { type: String, trim: true },
    marksAndNumbers: { type: String, trim: true },
    exactDescription: { type: String, trim: true },
    finalTotalPackages: { type: Number, min: [0, 'Must be zero or more'] },
    finalGrossWeight: { type: Number, min: [0, 'Must be zero or more'] },
    finalCbm: { type: Number, min: [0, 'Must be zero or more'] },
    finalPackageType: { type: String, trim: true },
    placeOfReceipt: { type: String, trim: true },
    placeOfDelivery: { type: String, trim: true },
    shippersLoadStowCount: { type: Boolean, default: true }, // SLAC remark
    lcDetails: { type: String, trim: true },
    blRemarks: { type: String, trim: true },
    commercialInvoiceNo: { type: String, trim: true },
    commercialInvoiceDate: { type: Date },
    certificateOfOriginNo: { type: String, trim: true },
    customsReleaseDate: { type: Date },
    siSubmittedToVoAt: { type: Date },
    voSiReference: { type: String, trim: true },
    approvedAt: { type: Date },
    approvedBy: { type: String, trim: true },
    amendmentNotes: { type: String, trim: true },
    finalVarianceReason: { type: String, trim: true },
    blDrafts: { type: [draftVersionSchema], default: [] },

    // ─── Step 5 — Sailing, HBL issuance, MBL, pre-alert ──────────────
    freightPayableAt: { type: String, enum: ['Origin', 'Destination', ''] },
    freightPaymentStatus: { type: String, enum: ['Paid', 'Unpaid', 'Credit Approved', ''] },
    holdOverrideReason: { type: String, trim: true },
    freightTermsOverrideReason: { type: String, trim: true },
    shippedOnBoardDate: { type: Date },
    sobVarianceReason: { type: String, trim: true },
    signatoryName: { type: String, trim: true },
    signatoryTitle: { type: String, trim: true },
    blReleaseDate: { type: Date },
    courierAwb: { type: String, trim: true },
    mblShipper: { type: String, trim: true },
    mblConsignee: { type: String, trim: true },
    mblNotify: { type: String, trim: true },
    mblReleaseType: { type: String, enum: ['Original', 'Telex Release', 'Seaway Bill', ''] },
    mblFreightTerms: { type: String, enum: ['Freight Prepaid', 'Freight Collect', ''] },
    mblIssueDate: { type: Date },
    hblIssuedAt: { type: Date, default: null },
    hblIssuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    hblVersion: { type: Number, default: 0 },
    hblHistory: {
      type: [{ number: String, version: Number, issuedAt: Date, replacedAt: Date, reason: String }],
      default: [],
    },
    preAlerts: { type: [preAlertSchema], default: [] },
    documents: { type: [documentLogSchema], default: [] },
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
