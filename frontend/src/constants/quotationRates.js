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
  { key: 'cic', label: 'CIC' },
  { key: 'cmc', label: 'CMC' },
  { key: 'dthc', label: 'DTHC' },
  { key: 'lolo', label: 'LOLO' },
  { key: 'importServiceFee', label: 'Import Service Fee' },
  { key: 'deliveryOrder', label: 'DO' },
]
