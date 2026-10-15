// Sprint 007 — which step each saved field belongs to (mirrors BOOKING_STEP_FIELDS / BL_STEP_FIELDS
// in backend/src/Modules/Export/Booking/booking.steps.js — keep in sync). The forms use it to skip
// fields of a completed (locked) step when they save, so a locked step is never re-sent.

export const BOOKING_STEP_FIELDS = {
  1: [
    'clientName', 'clientPhone', 'clientEmail', 'pol', 'pod', 'containers', 'commodity', 'hsCode', 'ucrNumber',
    'packagesCount', 'packageType', 'grossWeight', 'netWeight', 'cbm', 'isDangerous', 'dangerousClass', 'unNumber',
    'properShippingName', 'subsidiaryRisk', 'packingGroup', 'flashPoint', 'marinePollutant', 'emergencyContact',
    'setTemperature', 'ventilationHumidity', 'oogDimensions', 'shippingDeclaration', 'cargoReadinessDate',
    'proformaInvoiceNo', 'proformaInvoiceDate', 'acidNumber', 'shipperReference', 'countryOfOrigin',
    'exporterLicenceNo', 'stuffingLocationType', 'stuffingDate', 'specialInstructions', 'weightVarianceReason',
    'shipper', 'consignee', 'notify', 'notifySameAsConsignee', 'shipperParty', 'consigneeParty', 'notifyParty',
    'podAgent', 'podAgentRef', 'polAgent', 'exportTaxNumber', 'importTaxNumber', 'importCountry', 'blNo',
  ],
  2: [
    'carrier', 'vesselName', 'vesselImo', 'voyageNo', 'etd', 'eta', 'spaceConfirmationStatus', 'carrierBookingRef',
    'voContactPerson', 'siCutoff', 'vgmCutoff', 'cyGateInCutoff', 'cyOpeningCutoff', 'customsCutoff', 'dgCutoff',
    'polTerminal', 'podTerminal', 'serviceLoopCode', 'bookingRequestSentAt', 'confirmedEquipment', 'dgAcceptanceRef',
    'voFreeTimeDays', 'bookingConfirmationStatus', 'bookingConfirmationFile', 'nvocc', 'currency', 'price', 'cost', 'freeTime',
  ],
  3: [
    'depot', 'containerAssignments', 'croNumber', 'croIssueDate', 'croValidityDate', 'croIssuedBy', 'releasedTo',
    'truckPlateDriver', 'reconciliationReason', 'gateInDate', 'gateOutDate', 'containerLocation',
  ],
}

export const BL_STEP_FIELDS = {
  4: [
    'exactShipper', 'exactConsignee', 'exactNotify', 'alsoNotify', 'marksAndNumbers', 'exactDescription',
    'finalTotalPackages', 'finalGrossWeight', 'finalCbm', 'finalPackageType', 'placeOfReceipt', 'placeOfDelivery',
    'shippersLoadStowCount', 'lcDetails', 'blRemarks', 'commercialInvoiceNo', 'commercialInvoiceDate',
    'certificateOfOriginNo', 'exportCustomsDeclarationNo', 'customsReleaseDate', 'elHarkaRepName',
    'certificateReceivedDate', 'customsCertificateFile', 'siSubmittedToVoAt', 'voSiReference', 'finalVarianceReason',
    'consigneeToOrder', 'notifyPartyName', 'notifyPartyAddress', 'destinationAgentDetails',
    // the approval handshake completes Step 4, so it locks with it
    'clientConfirmationStatus', 'approvedAt', 'approvedBy', 'amendmentNotes', 'draftSentToClientDate', 'blDraftVersion',
  ],
  5: [
    'hblNumber', 'mblNumber', 'blType', 'telexReleaseSentDate', 'numberOfOriginalBLs', 'freightTermsOnBL',
    'freightPayableAt', 'freightPaymentStatus', 'holdOverrideReason', 'freightTermsOverrideReason', 'atd',
    'shippedOnBoardDate', 'sobVarianceReason', 'placeOfIssue', 'dateOfIssue', 'signatoryName', 'signatoryTitle',
    'blReleaseDate', 'courierAwb', 'mblShipper', 'mblConsignee', 'mblNotify', 'mblReleaseType', 'mblFreightTerms',
    'mblIssueDate',
  ],
}

// Steps whose fields are read-only: completed ones, and all of them once the HBL is issued.
export const lockedSteps = (stepsCompleted = [], hblIssued = false) =>
  hblIssued ? [1, 2, 3, 4, 5] : stepsCompleted

// Removes every key of a locked step from a FormData before it is sent.
export function dropLockedFields(fd, locked, map) {
  for (const step of locked) for (const key of map[step] || []) fd.delete(key)
}
