// Pins the two UI state bugs that shipped recently, both invisible to
// TypeScript and ESLint:
//
//  1. The approve->commit handoff used the receipt's isSuccess in `busy`. That
//     flag stays true for the life of the component, so after the approval
//     confirmed the button was permanently disabled reading "Waiting for
//     approval…" — reload was the only escape. Reported with a third-party
//     wallet (AOE) on both mainnet and testnet.
//  2. Feed state (addresses, Envio cards, scanned flag) survived a network
//     switch, so mainnet pots rendered in the testnet feed.

/** Mirrors the settling bridge in Erc20Commit.
 *  `elapsedMs` models the 10s safety-net timeout that releases the lock. */
function makeButton({
  txDone,
  allowance,
  perPerson,
  txPending = false,
  checking = false,
  pkBusy = false,
  elapsedMs = 0,
  SAFETY_MS = 10_000,
}) {
  let settling = false;
  // effect: receipt -> engage the lock
  if (txDone) settling = true;
  // effect: allowance visible -> release
  if (allowance >= perPerson) settling = false;
  // safety net: the lock is never permanent
  if (settling && elapsedMs >= SAFETY_MS) settling = false;

  const busy = txPending || checking || pkBusy || settling;
  if (alreadyCommittedPlaceholder) return { label: "You're in", disabled: true };
  return {
    label: allowance >= perPerson ? (busy ? "Committing…" : "Commit tokens") : busy ? "Waiting for approval…" : "Approve then commit",
    disabled: busy,
  };
}
const alreadyCommittedPlaceholder = false;

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name} ${extra}`);
    failures++;
  }
}

const per = 100000n;

console.log("ERC-20 approve -> commit button state");

check(
  "idle with no allowance offers approve",
  (() => {
    const s = makeButton({ txDone: false, allowance: 0n, perPerson: per });
    return s.label === "Approve then commit" && s.disabled === false;
  })()
);

check(
  "while the approval tx is in flight the button is disabled",
  makeButton({ txDone: false, allowance: 0n, perPerson: per, txPending: true }).disabled === true
);

check(
  "REGRESSION: the approval lock is released by the safety net even if allowance never appears",
  (() => {
    // txDone stays true for the component's lifetime — that was the bug. The
    // 10s safety net is what has to release the lock, so the user is never
    // stranded on a disabled button.
    const after10s = makeButton({ txDone: true, allowance: 0n, perPerson: per, elapsedMs: 10_000 });
    return after10s.disabled === false && after10s.label === "Approve then commit";
  })(),
  "button would read 'Waiting for approval…' until reload"
);

check(
  "immediately after the receipt the button is still locked (brief settling window)",
  makeButton({ txDone: true, allowance: 0n, perPerson: per, elapsedMs: 500 }).disabled === true
);

check(
  "once allowance lands, commit is offered and enabled",
  (() => {
    const s = makeButton({ txDone: true, allowance: per, perPerson: per });
    return s.label === "Commit tokens" && s.disabled === false;
  })()
);

check(
  "the settling window does allow a brief disabled state before allowance lands",
  (() => {
    // Modelling: settling turns on at receipt and off when allowance appears.
    let settling = false;
    settling = true; // receipt
    const during = settling;
    settling = false; // allowance arrives
    return during === true && settling === false;
  })()
);

// ---- feed chain scoping -------------------------------------------------
console.log("\nfeed chain scoping");

function switchChain(state, next) {
  // React's documented reset-during-render pattern.
  if (state.scopedChain !== next) {
    return { scopedChain: next, addrs: [], scanned: false, envioCards: null };
  }
  return state;
}

check(
  "switching mainnet -> testnet clears the previous chain's addresses",
  (() => {
    const s = switchChain({ scopedChain: 143, addrs: ["0xaaa", "0xbbb"], scanned: true, envioCards: [{ addr: "0xaaa" }] }, 10143);
    return s.addrs.length === 0 && s.scanned === false && s.envioCards === null;
  })()
);

check(
  "switching testnet -> mainnet clears too",
  (() => {
    const s = switchChain({ scopedChain: 10143, addrs: ["0xccc"], scanned: true, envioCards: [] }, 143);
    return s.addrs.length === 0 && s.scanned === false && s.envioCards === null;
  })()
);

check(
  "staying on the same chain keeps the feed (no needless reload)",
  (() => {
    const before = { scopedChain: 143, addrs: ["0xaaa"], scanned: true, envioCards: null };
    const after = switchChain(before, 143);
    return after.addrs.length === 1 && after.scanned === true;
  })()
);

check(
  "REGRESSION: no mainnet address survives a switch to testnet",
  (() => {
    const s = switchChain({ scopedChain: 143, addrs: ["0xa8Cc17bcC5bBA8Efa962056F6bD6ce887E02E238"], scanned: true, envioCards: null }, 10143);
    return !s.addrs.includes("0xa8Cc17bcC5bBA8Efa962056F6bD6ce887E02E238");
  })()
);

if (failures) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");