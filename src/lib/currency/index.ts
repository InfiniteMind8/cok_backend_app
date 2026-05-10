// Backend currency exports — `formatAmount` is intentionally omitted because
// it is presentation-layer logic that lives in the frontend (website/lib/currency/).
export { getActiveRate, getCurrentRates, rateKey } from './rate-resolver.js'
export { getApplicablePromotion } from './promotion-resolver.js'
export { convertFiatToKcrd, convertKcrdToFiat } from './conversion-engine.js'
export type { RatePair, RateMap } from './rate-resolver.js'
export type { ApplicablePromotion } from './promotion-resolver.js'
export type { ConversionResult } from './conversion-engine.js'
