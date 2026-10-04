// Verifies the AUSD (ERC-20) commit sequence against real testnet state using
// eth_call simulation, which needs no gas and no funds.
//
// Context: several recent bugs shipped from reasoning alone — a permanently
// disabled button, a stale balance, and mainnet pots leaking into the testnet
// feed. None are catchable by TypeScript or ESLint. This checks the contract
// interaction sequence the UI drives, so at least that layer is proven rather
// than assumed.
//
//   node scripts/erc20-flow.simulate.mjs
//
// Simulated, not submitted: it proves the call sequence and encodings are valid,
// and that the post-commit reads the UI depends on return what the UI expects.
// It does NOT exercise React state — see chain-switch.test.mjs for that.

import { createPublicClient, http, parseUnits, zeroAddress } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const RPC = process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC;
if (!RPC) {
  console.error("NEXT_PUBLIC_MONAD_TESTNET_RPC is not set");
  process.exit(2);
}

const CHAIN = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
};
const FACTORY = "0x2777C66CDE6C15D301cd0bf03C302b56E298e431";
const AUSD = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";

const factoryAbi = [
  {
    type: "function",
    name: "createPot",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "perPerson", type: "uint256" },
      { name: "partySize", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "payee", type: "address" },
      { name: "title", type: "string" },
    ],
    outputs: [{ name: "pot", type: "address" }],
  },
  {
    type: "function",
    name: "potCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allPots",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
];
const potAbi = [
  { type: "function", name: "commit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "commitCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "state", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "perPerson", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "partySize", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
];

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name} ${extra}`);
    failures++;
  }
};

const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC) });
const account = privateKeyToAccount(generatePrivateKey());
const perPerson = parseUnits("0.1", 6);

async function main() {
  console.log("AUSD (ERC-20) commit flow — testnet simulation\n");
  console.log(`  simulated account: ${account.address}`);

  // 1. The factory must accept an AUSD pot with 6-decimal math.
  let potAddr;
  try {
    const sim = await publicClient.simulateContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: "createPot",
      args: [AUSD, perPerson, 2n, BigInt(Math.floor(Date.now() / 1000) + 86400), account.address, "simulated ausd pot"],
      account,
    });
    potAddr = sim.result;
    check("createPot(AUSD) simulates and returns a pot", !!potAddr, String(potAddr));
  } catch (e) {
    check("createPot(AUSD) simulates", false, (e?.shortMessage ?? e?.message ?? "").slice(0, 110));
    return;
  }

  // 2. A real existing AUSD pot to read back, proving the UI's reads work.
  const n = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "potCount" });
  let existing;
  for (let i = 0n; i < n; i++) {
    const a = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "allPots", args: [i] });
    const tok = await publicClient.readContract({ address: a, abi: potAbi, functionName: "token" });
    if (tok.toLowerCase() === AUSD.toLowerCase()) {
      existing = a;
      break;
    }
  }

  if (!existing) {
    console.log("\n  (no existing AUSD pot on chain to read back — skipping read checks)");
  } else {
    console.log(`\n  existing AUSD pot: ${existing}`);
    const [token, per, size, count] = await Promise.all([
      publicClient.readContract({ address: existing, abi: potAbi, functionName: "token" }),
      publicClient.readContract({ address: existing, abi: potAbi, functionName: "perPerson" }),
      publicClient.readContract({ address: existing, abi: potAbi, functionName: "partySize" }),
      publicClient.readContract({ address: existing, abi: potAbi, functionName: "commitCount" }),
    ]);
    check("token() is AUSD", token.toLowerCase() === AUSD.toLowerCase(), token);
    // 6 decimals: 25 AUSD encodes as 25 * 10^6. Assert the scale explicitly
    // rather than a modulus, which was wrong the first time round (it checked
    // 12 decimals and failed against perfectly correct 6-decimal data).
    const asUnits = Number(per) / 1e6;
    check("perPerson decodes to a sane 6-decimal amount", asUnits > 0 && asUnits < 1e6, `${per} = ${asUnits} AUSD`);
    check("commitCount < partySize (open)", count < size, `${count}/${size}`);

    // commit() from an account holding no AUSD and no allowance must revert.
    // This is the case the UI has to explain rather than leave as a dead button.
    try {
      await publicClient.simulateContract({
        address: existing,
        abi: potAbi,
        functionName: "commit",
        account,
      });
      check("commit() from an account with no allowance reverts", false, "simulation unexpectedly succeeded");
    } catch (e) {
      check("commit() from an account with no allowance reverts", true);
      console.log(`         reason: ${(e?.shortMessage ?? e?.message ?? "").slice(0, 90)}`);
    }
  }

  // NOTE: `potAddr` above came from simulateContract, which never deploys the
  // clone, so any call against it returns success because there is no code at
  // that address. Only deployed pots can be simulated against — hence the
  // commit-revert check lives against `existing` instead. An earlier version of
  // this script got that wrong and reported a false failure.
  void potAddr;

  if (failures) {
    console.error(`\n${failures} failing`);
    process.exit(1);
  }
  console.log("\nall passing");
}

main().catch((e) => {
  console.error("harness error:", (e?.shortMessage ?? e?.message ?? e));
  process.exit(1);
});