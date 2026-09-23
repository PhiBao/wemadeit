import { indexer, type Pot } from "envio";

function potId(chainId: number, pot: string) {
  return `${chainId}-${pot.toLowerCase()}`;
}

// V3+ factories (9-field PotCreated): register the clone, then store the pot.
indexer.contractRegister({ contract: "PactFactory", event: "PotCreated" }, ({ event, context }) => {
  context.addPactPot(event.params.pot);
});

indexer.onEvent({ contract: "PactFactory", event: "PotCreated" }, async ({ event, context }) => {
  const id = potId(event.chainId, event.params.pot);
  const existing = await context.Pot.get(id);
  const pot: Pot = {
    id,
    chainId: BigInt(event.chainId),
    address: event.params.pot.toLowerCase(),
    organizer: event.params.organizer.toLowerCase(),
    payee: event.params.payee.toLowerCase(),
    token: event.params.token.toLowerCase(),
    perPerson: event.params.perPerson,
    partySize: event.params.partySize,
    deadline: event.params.deadline,
    title: event.params.title,
    isPrivate: event.params.isPrivate,
    state: existing?.state ?? "Open",
    commitCount: existing?.commitCount ?? 0n,
    createdAt: BigInt(event.block.timestamp),
    createdTx: event.transaction.hash,
  };
  await context.Pot.set(pot);
});
