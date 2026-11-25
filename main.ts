// Entrypoint: hand the strategy to the make.fun replay shim.
import { runBot } from './vendor/makefun-bot.ts';
import { decideOrders } from './strategy.ts';

await runBot({
  onBatch: (state, batch) => decideOrders(state, batch),
});
