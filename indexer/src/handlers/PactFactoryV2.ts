import { indexer, type Pot } from "envio";

// V2/V4 factories (8-field PotCreated: has title, predates isPrivate).
indexer.contractRegister({ contract: "PactFactoryV2", event: "PotCreated" }, ({ event, context }) => {
  context.addPactPot(event.params.pot);
});

indexer.onEvent({ contract: "PactFactoryV2", event: "PotCreated" }, async ({ event, context }) => {
  const id = `${event.chainId}-${event.params.pot.toLowerCase()}`;
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
    isPrivate: false,
    state: existing?.state ?? "Open",
    commitCount: existing?.commitCount ?? 0n,
    createdAt: BigInt(event.block.timestamp),
    createdTx: event.transaction.hash,
  };
  await context.Pot.set(pot);
});
