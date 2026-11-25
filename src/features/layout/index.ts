export { useLayout } from './model/useLayout'
export { default as BuildCanvas } from './ui/BuildCanvas.vue'
export { default as PiecePalette } from './ui/PiecePalette.vue'
export { default as ObjectInspector } from './ui/ObjectInspector.vue'
export { distance, nextContact } from './lib/geometry'
export {
  inspectContacts,
  inspectRampContacts,
  contactReach,
  CONTACT_ANGLE_LIMIT,
  CONTACT_REACH_FACTOR,
  CONTACT_EVIDENCE_VERSION,
  RAMP_LANE_LIMIT,
  evaluateContacts,
  collectContacts,
  probeContacts,
  analyzeContacts,
  nextContactReport,
  evaluateRampContacts,
} from './lib/contacts'
export type { ContactEvidence, ContactAttempt, ContactNeighbor } from './lib/contacts'
