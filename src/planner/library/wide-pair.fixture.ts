/** The evaluator's "Wide Pair": two bands of 600 nm (centres 400 and 900 nm), 1,200 nm in total. Each band passes its own range; the total and the edges do not. */
export const WIDE_PAIR = { type: 'narrowband' as const, passbands: [{ centreNm: 400, widthNm: 600 }, { centreNm: 900, widthNm: 600 }] }
