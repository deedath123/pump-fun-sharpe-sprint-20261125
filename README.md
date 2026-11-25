[![make.fun](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532.svg)](https://make.fun/c/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![rank](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/deedath123/pump-fun-sharpe-sprint-20261125/rank.svg)](https://make.fun/c/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![reward](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/deedath123/pump-fun-sharpe-sprint-20261125/reward.svg)](https://make.fun/c/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)

# Pump.fun Sharpe Sprint — Cleanest Paper Bot Wins

A Sharpe-first paper-trading bot for the [Pump.fun Sharpe Sprint](https://make.fun/c/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532) bounty on make.fun. It trades a 6-hour pump.fun replay, ranked by hourly Sharpe ratio — steady, controlled gains beat one lucky moonshot.

## Strategy

- **Small equal stakes** (0.02 SOL) spread across 60+ coins, max 5 open positions at once, 10 SOL paper capital.
- **Early buyer flow only:** a coin is entered only in its first ~6 minutes and only when it already shows ≥8 buy trades, ≥1.0 SOL bought and ≥5 distinct buyers, with buyers dominating sellers and the price ≥2% above its creation price. Coins without flow are skipped.
- **Fast exits:** take-profit +18% and stop-loss −10% on estimated net proceeds, plus a time stop (~24 min) so a flat coin frees its slot. No adds, no averaging down, one position per mint, never re-entered.
- **Deterministic:** decisions depend only on the delivered events, in delivery order — no clock, no environment, no unseeded randomness — so the two grading executions produce byte-identical action logs.

## Layout

- `main.ts` — entrypoint (Node 22, `node main.ts`)
- `strategy.ts` — the strategy, written fresh for this competition
- `params.ts` — the swept parameters (stake, TP/SL, entry filter, windows)
- `vendor/makefun-bot.ts` — byte-identical copy of the kit SDK shim

## Dev-window backtest

Graded with the kit's own `grade-local` (process driver) on the 24 h dev window (2026-11-02–03), sweeping stake {0.02/0.03/0.05}, TP {+8%/+12%/+18%}, SL {−6%/−10%} and three entry-filter strictness levels (21 variants). Shipped variant (stake 0.02 SOL, TP +18%, SL −10%, strict filter):

| metric | dev window |
|---|---|
| Net PnL | −0.319 SOL |
| Sharpe (hourly) | −0.765 |
| Max drawdown | 3.23% |
| Round trips (≥0.01 SOL) | 426 on 426 distinct mints |
| Fills | 851 |
| Guardrails | compliant (mints, drawdown, round trips all pass) |
| Net ex top-3 coins | −0.384 SOL (top-3 share of gains 9.5%) |

Every swept variant lost on the dev window — the kit pilots lost too (momentum −9.38, reversion −1.78, sniper −0.09 SOL) — so this ships as a probe: the best net with the lowest drawdown and the best ex-top-3 check. The final window is a fresh regime, and the dev grade is the signal, not a promise.
