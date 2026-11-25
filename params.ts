// Sweep parameters for the Sharpe-first paper bot. The sweep script rewrites
// these constants between grade-local runs; the shipped commit carries the
// winning set. All amounts in lamports; bps = basis points (10000 = 100%).

/** SOL spent per coin (target stake; the buy is min(stake, size cap)). */
export const STAKE_LAMPORTS = 20000000n; // 0.02 SOL
/** Smallest buy that still counts as a round trip (guardrail: >= 0.01 SOL). */
export const MIN_BUY_LAMPORTS = 10_000_000n; // 0.01 SOL
/** Take-profit: sell when estimated net proceeds reach cost * (1 + TP). */
export const TP_BPS = 1800; // +1800 bps
/** Stop-loss: sell when estimated net proceeds fall to cost * (1 - SL). */
export const SL_BPS = 1000; // -1000 bps
/** Entry filter: minimum buy trades seen since creation. */
export const MIN_BUYS = 8;
/** Entry filter: minimum SOL bought since creation. */
export const MIN_BUY_VOL_LAMPORTS = 1000000000n; // 1.0 SOL
/** Entry filter: minimum distinct buyers since creation. */
export const MIN_BUYERS = 5;
/** Entry filter: minimum price move vs creation price, in bps (0 = flat or up). */
export const MIN_RISE_BPS = 200;
/** Entry window: only coins created within the last N slots (~0.4 s each). */
export const ENTRY_WINDOW_SLOTS = 900; // ~6.0 minutes
/** Time stop: sell any position held longer than N slots. */
export const MAX_HOLD_SLOTS = 3600; // ~24.0 minutes
/** Slippage guard on buys (reject the fill if the price moved more). */
export const BUY_SLIPPAGE_BPS = 500;
/** Slippage guard on sells. */
export const SELL_SLIPPAGE_BPS = 2000;
