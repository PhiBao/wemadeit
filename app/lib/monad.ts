import { defineChain } from "viem";

function rpcUrl(env: string | undefined, fallback: string): string {
  return env && env.startsWith("http") ? env : fallback;
}

export const monadMainnet = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: [rpcUrl(process.env.NEXT_PUBLIC_MONAD_MAINNET_RPC, "https://rpc.monad.xyz")],
    },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://monadvision.com" },
  },
});

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        rpcUrl(process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC, "https://testnet-rpc.monad.xyz"),
      ],
    },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
});

export function chainFor(chainId: number) {
  return chainId === monadTestnet.id ? monadTestnet : monadMainnet;
}

// Floors mirror PactFactory (v5). There are deliberately NO ceilings on party
// size or duration — the form validates floors only, so users get instant
// feedback instead of a reverted transaction.
export const POT_BOUNDS = {
  minParty: 2,
  minDays: 1,
  maxTitle: 120,
} as const;

const FACTORIES = {
  [monadMainnet.id]: "0x910e17CC1Ea45B824E3Be700430E3F2cD29c5a4E",
  [monadTestnet.id]: "0x2777C66CDE6C15D301cd0bf03C302b56E298e431",
} as const satisfies Record<number, `0x${string}`>;

export type FactoryDeployment = {
  address: `0x${string}`;
  deployBlock: bigint;
};

// Every factory generation per chain, newest first. The app creates through
// FACTORIES but reads through all of history — otherwise pots created before
// an upgrade silently vanish from every feed.
const FACTORY_HISTORY: Record<number, FactoryDeployment[]> = {
  [monadMainnet.id]: [
    { address: "0x910e17CC1Ea45B824E3Be700430E3F2cD29c5a4E", deployBlock: 106168840n },
    { address: "0xDFEcE74f0aDBa3cc18B065DBA0DEc82bE52AA830", deployBlock: 106125317n },
    { address: "0x7F50e78b1763c05F944D898EeCC2081c767b2113", deployBlock: 106124874n },
    { address: "0x457ae4d9e8CC1bC6bf3babA9133D1fCe283a9ABE", deployBlock: 106107408n },
    { address: "0xEF673BDac2C86506874919b1ad05Bd7D7fa64344", deployBlock: 105647209n },
    { address: "0x6792E51FBD24f9315282BD5b6c5E713dCc779C69", deployBlock: 105639807n },
  ],
  [monadTestnet.id]: [
    { address: "0x2777C66CDE6C15D301cd0bf03C302b56E298e431", deployBlock: 63874188n },
    { address: "0xFD842da1854e40c55F19FE63a879CB65cd3B9A28", deployBlock: 63830698n },
    { address: "0x910e17CC1Ea45B824E3Be700430E3F2cD29c5a4E", deployBlock: 63830256n },
    { address: "0xDFEcE74f0aDBa3cc18B065DBA0DEc82bE52AA830", deployBlock: 63812803n },
    { address: "0x4f6aD063f1c20D53a4ea4FA1ba46A8783C782D16", deployBlock: 63354945n },
    { address: "0x6792E51FBD24f9315282BD5b6c5E713dCc779C69", deployBlock: 63347629n },
  ],
};

export function factoryHistoryFor(chainId: number): FactoryDeployment[] {
  return FACTORY_HISTORY[chainId] ?? FACTORY_HISTORY[monadMainnet.id];
}

export function factoryFor(chainId: number): `0x${string}` {
  return FACTORIES[chainId as keyof typeof FACTORIES] ?? FACTORIES[monadMainnet.id];
}

const DEPLOY_BLOCKS = {
  [monadMainnet.id]: 106125317n,
  [monadTestnet.id]: 63830698n,
} as const satisfies Record<number, bigint>;

/** Bounds getLogs scans for "your pots". */
export function deployBlockFor(chainId: number): bigint {
  return DEPLOY_BLOCKS[chainId as keyof typeof DEPLOY_BLOCKS] ?? 0n;
}

/**
 * Canonical AUSD (Agora USD, LayerZero OFT, 6 decimals) per chain.
 * Source: https://docs.agora.finance/developer/contract-deployments
 */
const AUSD: Record<number, `0x${string}`> = {
  [monadMainnet.id]: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
  [monadTestnet.id]: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
};

export function ausdFor(chainId: number): `0x${string}` | null {
  return AUSD[chainId] ?? null;
}

/** Display/scale decimals: native MON 18, AUSD 6, unknown ERC20s default 18. */
export function decimalsForToken(token: string): number {
  const t = token.toLowerCase();
  for (const a of Object.values(AUSD)) {
    if (a.toLowerCase() === t) return 6;
  }
  return 18;
}

export function symbolFor(token: string): string {
  if (/^0x0+$/.test(token)) return "MON";
  const t = token.toLowerCase();
  for (const a of Object.values(AUSD)) {
    if (a.toLowerCase() === t) return "AUSD";
  }
  return "tokens";
}
