// @ts-ignore — generated ReScript has no TS declarations (see Handlers.gen.ts for types)
// eslint-disable-next-line
import { PactFactoryV1 } from "../../generated/src/Handlers.res.js";

// V1 factories (7-field PotCreated: no title, predates privacy).
PactFactoryV1.PotCreated.contractRegister(({ event, context }: any) => {
  context.addPactPot(event.params.pot);
});

PactFactoryV1.PotCreated.handler(async ({ event, context }: any) => {
  const id = `${event.chainId}-${event.params.pot.toLowerCase()}`;
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
    title: "",
    isPrivate: false,
    state: existing?.state ?? "Open",
    commitCount: existing?.commitCount ?? 0n,
    createdAt: BigInt(event.block.timestamp),
    createdTx: event.transaction.hash,
  });
});
