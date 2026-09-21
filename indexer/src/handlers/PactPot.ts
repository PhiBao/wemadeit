import { indexer, type Commitment } from "envio";

function potId(chainId: number, pot: string) {
  return `${chainId}-${pot.toLowerCase()}`;
}

indexer.onEvent({ contract: "PactPot", event: "Committed" }, async ({ event, context }) => {
  const id = `${potId(event.chainId, event.params.pot)}-${event.params.user.toLowerCase()}-${event.params.index.toString()}`;
  const commitment: Commitment = {
    id,
    pot_id: potId(event.chainId, event.params.pot),
    user: event.params.user.toLowerCase(),
    index: event.params.index,
    createdAt: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
  };
  await context.Commitment.set(commitment);
  const p = await context.Pot.get(potId(event.chainId, event.params.pot));
  if (p) {
    await context.Pot.set({ ...p, commitCount: p.commitCount + 1n });
  }
});

indexer.onEvent({ contract: "PactPot", event: "Tilted" }, async ({ event, context }) => {
  const p = await context.Pot.get(potId(event.chainId, event.params.pot));
  if (p) {
    await context.Pot.set({ ...p, state: "Tilted" });
  }
});

indexer.onEvent({ contract: "PactPot", event: "RefundingOpened" }, async ({ event, context }) => {
  const p = await context.Pot.get(potId(event.chainId, event.params.pot));
  if (p) {
    await context.Pot.set({ ...p, state: "Refunding" });
  }
});

indexer.onEvent({ contract: "PactPot", event: "SecretRotated" }, async ({ event, context }) => {
  context.log.info(`Invite key rotated on ${event.params.pot}`);
});
