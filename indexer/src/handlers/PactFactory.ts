// @ts-ignore — generated ReScript has no TS declarations (see Handlers.gen.ts for types)
// eslint-disable-next-line
import { PactFactory } from "../../generated/src/Handlers.res.js";

function potId(chainId: number, pot: string) {
  return `${chainId}-${pot.toLowerCase()}`;
}

// V3+ factories (9-field PotCreated): register the clone, then store the pot.
PactFactory.PotCreated.contractRegister(({ event, context }: any) => {
  context.addPactPot(event.params.pot);
});

PactFactory.PotCreated.handler(async ({ event, context }: any) => {
  const id = potId(event.chainId, event.params.pot);
  const existing = await context.Pot.get(id);
  await context.Pot.set({
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
  });
});
