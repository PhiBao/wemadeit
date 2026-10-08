# Security review

**Date:** 8 October 2026 · **Commit:** `df32884` (contracts unchanged since deploy)
**Scope:** `contracts/src/` (in scope: `PactFactory.sol`, `PactPot.sol`,
`script/Deploy.s.sol`), `app/`, `indexer/`, repo configuration.
**Method:** three independent methodologies, then adversarial verification of
every finding by a separate reviewer instructed to falsify.

- Pashov Audit Group `solidity-auditor` + `x-ray` threat model — contracts
- Cloudflare `security-audit` — app, client-side, supply chain, deployment
- `skraft9/vulnerability-research` — adversarial mindset and web classes

**Review performed by the team. There has been no third-party audit.** Findings
were reproduced against the deployed bytecode where possible; see *Reproduction*.

---

## Verdict

No Critical or High **theft** path was found. An unprivileged actor cannot take
custody, double-refund, double-commit, re-initialise a clone, or mint value from
a pot in the standard-token configuration. The risk profile is **custody
liveness and documentation accuracy**, not theft.

Bytecode check: mainnet `PactFactory` at `0x910e…5a4E` matches the audited source
with only the `implementation` immutable differing; the `PactPot`
implementation `0xA4a6…d0F9` matches byte-for-byte. The findings apply to
deployed code.

---

## Findings

### S1 — Medium — A full pot whose payee cannot receive leaves contributions locked
`contracts/src/PactPot.sol:150-173` (`release`), `:176-182` (`expire`)

`release()` pushes to the fee recipient and then the payee; either failing call
reverts the whole transaction. `expire()` refuses a full pot
(`if (commitCount >= partySize) revert NotFull();`). There is no rescue function
on the pot, no ownership, no upgrade path. So a pot that is full but whose
`release()` keeps reverting can never refund either.

Reproduced: a payee contract with no `receive()` leaves the pot `Open` + full
with the balance intact and every path reverting. Also reachable via an ERC-20
blacklist on the payee, or a `feeRecipient` that rejects native value (owner-
repairable via `setFee`, but factory-wide for native pots while broken).

**Mitigating context:** the trigger is an organizer-chosen payee. A correct payee
is payable, and anyone can call `release()` later if the payee later becomes
payable. Severity reflects a real permanent-loss state with no recovery, not a
likely accident.

**Fix:** allow `expire()` on a full pot after a grace period, or pay by pull
claim instead of push.

### S2 — Medium — Anyone can deploy a look-alike pot; the app did not distinguish it
`contracts/src/PactPot.sol:73-97` (`initialize`), `app/app/pot/[address]/page.tsx`

The implementation is public and `initialize()` only checks `_initialized`. Any
address can deploy an EIP-1167 proxy at it and initialise with its own payee; the
result accepts commits and releases exactly like a real pot. Verified: such a
clone works while `factory.potCount()` is unchanged. Discovery surfaces were
already safe (the feed enumerates factory-recorded pots only, and the indexer
registers clones from `PotCreated`), so this is a **direct-link phishing**
surface, not feed poisoning.

Compounding it: the payee was never shown before funds moved — the release button
says "to organizer" while `release()` actually pays `payee`, which the creator
sets independently.

**Fixed in this review.** The pot page now reads `factory()` and checks it
against the known factory deployments, showing an "Unverified contract" warning
when it does not match and a "✓ factory-deployed" badge when it does. The payee
address is now displayed above the commit area, before anyone is exposed.

### S3 — Medium — Unauthenticated AI routes with no rate limit or body cap
`app/app/api/assist/parse/route.ts:35-42`, `app/app/api/assist/score/route.ts:8-21`

Neither route authenticates, rate-limits, or caps the request body; both call the
paid TypeSafe API. Additionally `assistAvailable()` fires a real paid parse call
on every cold page load for every visitor, and the pot page fires one score call
per pot per browser.

**Fix:** edge rate limiting, a body cap before `req.json()`, and replace the
homepage probe with a zero-cost health check. Not yet applied.

### S4 — Medium — The keyed-RPC API key is public in the client bundle
`app/lib/monad.ts:3-5, 13-20, 28-37`

Both RPC endpoints are read through `NEXT_PUBLIC_*`, so Next inlines them into
client JavaScript. The QuickNode key was verified byte-for-byte inside a public
static chunk. Anyone can extract it and consume the paid quota; the app has no
multi-URL failover, so that degrades the primary RPC. The README already labels
these variables public, so this was known — but the consequence is real.

**Fix:** proxy RPC through a same-origin rate-limited route, or restrict the key
by origin and rotate it. Not yet applied.

### S5 — Low — Invite key is published onchain by the first keyed commit
`contracts/src/PactPot.sol:107-114`

`commitWithSecret(bytes calldata secret)` compares a plaintext preimage, so
calldata publishes the invite key permanently on first use. Any observer can then
take remaining seats. `rotateSecret()` invalidates a leaked key.

**Documentation corrected in this review.** The README previously said "the chain
stores only its hash", which is false — the hash is in state and the preimage is
in calldata, forever. Stated plainly now: invite-only gates *discovery*, not
entry after the key is spent.

### S6 — Low — Fee can change retroactively; live owner is a single EOA
`contracts/src/PactFactory.sol:51-57`; `script/Deploy.s.sol:9-19`

`setFee` is immediate (capped at 5%) and `release()` reads live factory values,
so a fee raise applies to pots that filled under a lower expectation. Both live
factories are owned by one EOA which is also the fee recipient, with no timelock
or multisig handoff in the deploy script. Principal can never be taken.

**Fix:** snapshot the fee into the pot at initialisation, or move ownership to a
multisig.

### S7 — Low — Invite secrets stored per device, not per account
`app/lib/potVault.ts:20-39`; logout paths in `SessionBar.tsx`, `mera.ts`

One localStorage key holds vaulted pots keyed by chain and address only. A second
account on the same browser profile sees the first account's pots and can copy
their invite links; no logout path clears the vault.

**Fix:** namespace vault entries by owner address and clear secrets on logout.

### S8 — Low — Fee-on-transfer / rebasing tokens break pot accounting
`contracts/src/PactPot.sol:116-135, 157-171, 197`

`_commit` credits the nominal `perPerson` without measuring tokens received, so a
fee-on-transfer token leaves the pot under-funded and `release()` reverts;
refunds then pay first-come-first-served until the balance runs out. Not reachable
with MON or AUSD, both standard, so impact is limited to third-party tokens
created through the permissionless factory.

### S9 — Informational
- Next.js `16.3.5` predates the September 2026 security releases. No reachable
  path in this configuration — the one advisory in range (`next/og`) is
  unreachable only because `opengraph-image.tsx` takes no input. Fragile; upgrade
  to `16.3.8+`.
- No CSP or security headers; the app is frameable. Funds still require a wallet
  or passkey confirmation, so clickjacking impact is low.
- `secretFromUrl` accepts `?s=` as well as `#s=`. The app only ever generates
  fragment links; removing the query fallback would avoid a future leak to logs.
- The legitimacy badge passes an organizer-controlled title to the model, so a
  crafted title can steer its own badge. Advisory only; no funds involved.

---

## Verified safe

| Area | Verdict |
|---|---|
| Reentrancy (`release`, `refund`, `_commit`) | Safe — all value paths share one `nonReentrant`; no CEI violation reachable with it |
| Double refund / refund after release | Safe — flag set before transfer; `state` checked |
| Rounding and 6-vs-18 decimals | Safe — no decimal conversion exists; fee division truncates toward the payee |
| Clone re-initialisation | Safe — implementation locked in constructor, clones initialised atomically |
| Access control on pot funds | Safe — no function anywhere can move pot principal |
| On-chain DoS / gas griefing | Safe — no state-changing function loops over party size, contributors, or factory arrays |
| XSS / DOM injection | Safe — no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function`; all onchain strings render as React text |
| Open redirect | Safe — all navigations are origin-relative templates; explorer links come from fixed chain config |
| Private key persistence | Safe — derived key exists only in the in-memory session; storage holds only the credential ID |
| Committed secrets | Safe — exact-value history search over all 81 commits: no keys, tokens, mnemonics, or RPC URLs ever committed |
| OPENZEPPELIN `SafeERC20` handling | Safe — false-returning and void-return tokens handled; no-code token addresses revert |
| Indexer integrity | Safe — clones register only from factory `PotCreated`; forged events are impossible |

---

## Fixed as a result of this review

1. **Payee shown before funds move** and **unverified-contract warning** — the
   `factory()` check and the `Pays:` line (`app/app/pot/[address]/page.tsx`).
2. **README corrected** — the invite-key claim was false; test count corrected
   16 → 18 in three places.
3. **Indexer refund bug** — `Refunded` hardcoded commitment index `0`, so only
   the first contributor's refund was ever marked. Commitment IDs now key on
   `(pot, user)`, which is unique because the contract allows one commit per
   address.

## Open, not yet fixed

S1 (grace-period refund), S3 (rate limiting), S4 (RPC key exposure),
S6 (fee snapshot / multisig), S7 (vault namespacing), S9 (Next upgrade,
headers). Each has a smallest-effective-fix noted above.

---

## Reproduction

Contracts, with the repo untouched:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts && forge test                    # 18/18
FOUNDRY_TEST=/tmp/opencode/pact-audit forge test \
  --match-path "/tmp/opencode/pact-audit/PoC.t.sol" -vv
```

Findings were falsification-tested by an independent reviewer: each was retested
against source with an attempt to construct a route the finding missed. S1–S8
were confirmed; S2's indexer and feed paths were cleared, leaving the
direct-link phishing surface; no finding was rejected outright.
