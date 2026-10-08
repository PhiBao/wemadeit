import { indexer, type Commitment } from "envio";

function potId(chainId: number, pot: string) {
  return `${chainId}-${pot.toLowerCase()}`;
}

indexer.onEvent({ contract: "PactPot", event: "Committed" }, async ({ event, context }) => {
  // Keyed by (pot, user), NOT by the event's global index. The contract enforces
  // one commitment per address (`committed[msg.sender]`), so a user identifies
  // their commitment uniquely. The index is kept as data.
  //
  // This matters because `Refunded` does not carry the index, so the old
  // `...-${user}-${index}` key could not be looked up on refund — the handler
  // guessed index 0 and silently missed anyone who was not the first
  // contributor, leaving their refund permanently unmarked.
  const id = `${potId(event.chainId, event.params.pot)}-${event.params.user.toLowerCase()}`;
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

indexer.onEvent({ contract: "PactPot", event: "Refunded" }, async ({ event, context }) => {
  // Declared in config.yaml but previously unhandled. Refunds are a pull pattern,
  // so this fires once per contributor. The pot stays in "Refunding" — it does
  // not resolve to a terminal state onchain — but we mark the commitment claimed
  // so the feed can show claimed-vs-pending instead of implying everyone is done.
  const p = await context.Pot.get(potId(event.chainId, event.params.pot));
  if (p) {
    await context.Pot.set({ ...p, refundedCount: p.refundedCount + 1n });
  }
  // Same (pot, user) key as the Committed handler, so this now resolves for every
// contributor rather than only the one whose global index happened to be 0.
  const id = `${potId(event.chainId, event.params.pot)}-${event.params.user.toLowerCase()}`;
  const c = await context.Commitment.get(id);
  if (c) {
    await context.Commitment.set({ ...c, refundedAt: BigInt(event.block.timestamp) });
  }
});

indexer.onEvent({ contract: "PactPot", event: "SecretRotated" }, async ({ event, context }) => {
  context.log.info(`Invite key rotated on ${event.params.pot}`);
});
