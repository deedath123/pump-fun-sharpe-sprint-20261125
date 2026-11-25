// Sharpe-first paper bot for the Pump.fun Sharpe Sprint.
//
// Idea: the final window is scored by hourly Sharpe, not raw PnL, so the bot
// optimises for many small, steady, diversified wins instead of one moonshot:
//   - small equal stakes (0.02-0.05 SOL) across 60+ coins, max 5 open at once,
//   - enter only coins with clear early buyer flow in their first minutes
//     (buy count, buy volume and distinct buyers all rising),
//   - fast exits: a small take-profit and a tight stop-loss, no adds and no
//     averaging down, one position per mint, plus a time stop so a flat coin
//     frees its slot for a fresh one.
//
// Everything here is deterministic: decisions depend only on the events the
// harness delivers, in delivery order. No clock, no environment, no
// unseeded randomness, so the two grading executions produce byte-identical
// action logs.
//
// Written fresh for this competition; the entry filter, exits and sizing are
// chosen by sweeping the dev window with the kit's own grade-local.

import {
  type Batch,
  type BotState,
  type BuyInput,
  type OrderInput,
  type SellInput,
} from './vendor/makefun-bot.ts';
import {
  BUY_SLIPPAGE_BPS,
  ENTRY_WINDOW_SLOTS,
  MAX_HOLD_SLOTS,
  MIN_BUYERS,
  MIN_BUYS,
  MIN_BUY_LAMPORTS,
  MIN_BUY_VOL_LAMPORTS,
  MIN_RISE_BPS,
  SELL_SLIPPAGE_BPS,
  SL_BPS,
  STAKE_LAMPORTS,
  TP_BPS,
} from './params.ts';

/** Curve fees charged on every trade (protocol 95 bps + creator 30 bps). */
const TRADE_FEE_BPS = 125n;
const BPS_DEN = 10_000n;

/** Per-mint flow stats, tracked from its CreateEvent onward. */
interface CoinStat {
  createdSlot: number;
  /** Virtual reserves at creation, for the price-vs-create check. */
  vq0: bigint;
  vt0: bigint;
  buys: number;
  sells: number;
  buyVol: bigint;
  buyers: Set<string>;
  /** Slot the buy order was sent on (null until we buy). */
  boughtAtSlot: number | null;
}

const coins = new Map<string, CoinStat>();
/** Mints we already traded: one position per mint, never re-enter. */
const traded = new Set<string>();

/** Mark-to-market value of `tokens` at the curve's latest reserves. */
function markValue(tokens: bigint, vq: bigint, vt: bigint): bigint {
  if (vt === 0n || tokens === 0n) return 0n;
  return (tokens * vq) / vt;
}

/** Estimated SOL received for selling `value` lamports of tokens, after fees. */
function netProceeds(value: bigint, txFee: bigint): bigint {
  if (value === 0n) return 0n;
  return value - (value * TRADE_FEE_BPS) / BPS_DEN - txFee;
}

/** Price now >= price at creation * (1 + MIN_RISE_BPS), in exact bigint math. */
function priceRisenEnough(c: CoinStat, vq: bigint, vt: bigint): boolean {
  // vq / vt >= (vq0 / vt0) * (10000 + MIN_RISE_BPS) / 10000
  const lhs = vq * c.vt0 * BPS_DEN;
  const rhs = c.vq0 * vt * (BPS_DEN + BigInt(MIN_RISE_BPS));
  return lhs >= rhs;
}

/** Decide the orders for one batch. Exits first (they free slots), then entries. */
export function decideOrders(state: BotState, batch: Batch): OrderInput[] {
  const orders: OrderInput[] = [];
  const txFee = state.txFeeLamports();
  let free = state.freeCashLamports();
  let slots = state.hello.caps.max_open_positions - state.committedPositionCount();
  const maxOrders = state.hello.caps.max_orders_per_batch;

  // ---- exits: take-profit, stop-loss, time stop (full position, no partials) ----
  for (const [mint, pos] of state.positions) {
    if (orders.length >= maxOrders) break;
    const curve = state.curves.get(mint);
    if (curve === undefined || curve.complete) continue;
    const value = markValue(pos.token_amount, curve.virtual_quote_reserves, curve.virtual_token_reserves);
    const net = netProceeds(value, txFee);
    if (net <= 0n) continue; // selling would not cover its own fees; let the harness write it off
    const cost = pos.cost_lamports;
    const tpHit = net * BPS_DEN >= cost * (BPS_DEN + BigInt(TP_BPS));
    const slHit = net * BPS_DEN <= cost * (BPS_DEN - BigInt(SL_BPS));
    let timeHit = false;
    const stat = coins.get(mint);
    if (stat !== undefined && stat.boughtAtSlot !== null) {
      timeHit = state.slot - stat.boughtAtSlot >= MAX_HOLD_SLOTS;
    }
    if (tpHit || slHit || timeHit) {
      orders.push({
        side: 'sell',
        mint,
        token_amount: pos.token_amount,
        max_slippage_bps: SELL_SLIPPAGE_BPS,
      } satisfies SellInput);
    }
  }
  // Slots for entries: positions still held plus buys already in flight.
  // A sell sent this batch frees its slot only once it fills (2 slots on),
  // so committedPositionCount() above is the exact headroom for entries.
  slots = state.hello.caps.max_open_positions - state.committedPositionCount();

  // ---- entries: scan this batch's events in delivery order ----
  for (const e of batch.events) {
    if (orders.length >= maxOrders || slots <= 0) break;
    if (e.event === 'CreateEvent') {
      if (!coins.has(e.mint)) {
        coins.set(e.mint, {
          createdSlot: e.slot,
          vq0: BigInt(e.virtual_quote_reserves),
          vt0: BigInt(e.virtual_token_reserves),
          buys: 0,
          sells: 0,
          buyVol: 0n,
          buyers: new Set<string>(),
          boughtAtSlot: null,
        });
      }
      continue;
    }
    if (e.event !== 'TradeEvent') continue; // CompleteEvent: nothing to do
    const stat = coins.get(e.mint);
    if (stat === undefined) continue; // created before this window; age unknown, skip
    if (stat.boughtAtSlot !== null || traded.has(e.mint)) continue;
    if (e.is_buy) {
      stat.buys += 1;
      stat.buyVol += BigInt(e.sol_amount);
      stat.buyers.add(e.user);
    } else {
      stat.sells += 1;
    }
    // Entry filter: early buyer flow, inside the entry window only.
    if (state.slot - stat.createdSlot > ENTRY_WINDOW_SLOTS) continue;
    if (stat.buys < MIN_BUYS) continue;
    if (stat.buyVol < MIN_BUY_VOL_LAMPORTS) continue;
    if (stat.buyers.size < MIN_BUYERS) continue;
    if (stat.sells >= stat.buys) continue; // buyers must dominate sellers
    const curve = state.curves.get(e.mint);
    if (curve === undefined || curve.complete) continue;
    if (!priceRisenEnough(stat, curve.virtual_quote_reserves, curve.virtual_token_reserves)) continue;
    const cap = state.maxBuyLamports(e.mint);
    if (cap < MIN_BUY_LAMPORTS) continue;
    const amount = cap < STAKE_LAMPORTS ? cap : STAKE_LAMPORTS;
    if (free < amount + txFee) continue;
    orders.push({
      side: 'buy',
      mint: e.mint,
      quote_lamports: amount,
      max_slippage_bps: BUY_SLIPPAGE_BPS,
    } satisfies BuyInput);
    stat.boughtAtSlot = state.slot;
    traded.add(e.mint);
    free -= amount + txFee;
    slots -= 1;
  }
  return orders;
}
