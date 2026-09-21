// @ts-ignore — generated ReScript has no TS declarations (see Handlers.gen.ts for types)
// eslint-disable-next-line
import { PactPot } from "../../generated/src/Handlers.res.js";

PactPot.Committed.handler(async ({ event, context }: any) => {
  const potId = `${event.chainId}-${event.params.pot.toLowerCase()}`;
  await context.Commitment.set({
    id: `${potId}-${event.params.user.toLowerCase()}-${event.params.index.toString()}`,
    pot_id: potId,
    user: event.params.user.toLowerCase(),
    index: event.params.index,
    createdAt: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
  });
  const p = await context.Pot.get(potId);
  if (p) {
    await context.Pot.set({ ...p, commitCount: p.commitCount + 1n });
  }
});

PactPot.Tilted.handler(async ({ event, context }: any) => {
  const p = await context.Pot.get(`${event.chainId}-${event.params.pot.toLowerCase()}`);
  if (p) {
    await context.Pot.set({ ...p, state: "Tilted" });
  }
});

PactPot.RefundingOpened.handler(async ({ event, context }: any) => {
  const p = await context.Pot.get(`${event.chainId}-${event.params.pot.toLowerCase()}`);
  if (p) {
    await context.Pot.set({ ...p, state: "Refunding" });
  }
});

PactPot.Refunded.handler(async ({ event, context }: any) => {
  context.log.info(`Refund on ${event.params.pot} to ${event.params.user}`);
});

PactPot.SecretRotated.handler(async ({ event, context }: any) => {
  context.log.info(`Invite key rotated on ${event.params.pot}`);
});
