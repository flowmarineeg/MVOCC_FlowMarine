// Fixed charge lines of the Quotation rate tables (Buying + Selling share
// them). Keys mirror ORIGIN_LINE_KEYS / DESTINATION_LINE_KEYS in
// backend/src/Modules/Export/Quotation/quotation.model.js.
export const CONTAINER_SIZES = [20, 40]

export const ORIGIN_LINES = [
  { key: 'oceanFreight', label: 'Ocean Freight' },
  { key: 'dgSurcharge', label: 'DG Surcharge' },
  { key: 'thc', label: 'THC' },
  { key: 'bl', label: 'BL' },
  { key: 'telex', label: 'Telex' },
  { key: 'documentation', label: 'Documentation' },
]

export const DESTINATION_LINES = [
  { key: 'adminFee', label: 'Admin Fee' },
  { key: 'dthc', label: 'DTHC' },
  { key: 'lolo', label: 'LOLO' },
  { key: 'importServiceFee', label: 'Import Service Fee' },
  { key: 'deliveryOrder', label: 'DO' },
]

// Per-line metadata (PRD Q-60..Q-62): who the agent pays on the buying side, who
// is billed and when on the selling side. Mirrors quotation.model.js; it never
// takes part in the profit maths and is not copied between Buying and Selling.
export const PAYABLE_TYPES = ['Carrier', 'VO', 'Depot', 'Terminal', 'Trucker', 'Other']
export const BILL_TO_TYPES = ['Shipper', 'Consignee', 'Other']
export const PAYMENT_RESPONSIBILITIES = ['Prepaid', 'Collect']
export const LINE_META_FIELDS = ['payableType', 'payableTo', 'billTo', 'paymentResponsibility']
