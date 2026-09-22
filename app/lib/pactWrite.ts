"use client";

// Direct viem write path for Mera passkey accounts (bypasses wagmi connectors).
// Wagmi-connected wallets keep using useWriteContract; passkey sessions use this.

import { createPublicClient, createWalletClient, http } from "viem";
import { toViemAccount } from "@category-labs/mera/viem";
import type { Secp256k1SigningSession } from "@category-labs/mera";
import { chainFor } from "./monad";
import { erc20Abi, factoryAbi, potAbi } from "./abi";
import { passkeySession } from "./mera";

function walletFor(session: Secp256k1SigningSession, chainId: number) {
  const chain = chainFor(chainId);
  return createWalletClient({ chain, transport: http(), account: toViemAccount(session) });
}

export function pactPublic(chainId: number) {
  const chain = chainFor(chainId);
  return createPublicClient({ chain, transport: http() });
}

export async function passkeyCommit(pot: `0x${string}`, value: bigint, chainId: number) {
  const s = passkeySession();
  if (!s) throw new Error("no passkey session");
  const wallet = walletFor(s.session, chainId);
  return wallet.writeContract({ address: pot, abi: potAbi, functionName: "commit", value });
}

export async function passkeyCreatePot(
  factory: `0x${string}`,
  args: {
    token: `0x${string}`;
    perPerson: bigint;
    partySize: bigint;
    deadline: bigint;
    payee: `0x${string}`;
    title: string;
    isPrivate?: boolean;
    secretHash?: `0x${string}`;
  },
  chainId: number
) {
  const s = passkeySession();
  if (!s) throw new Error("no passkey session");
  const wallet = walletFor(s.session, chainId);
  if (args.isPrivate) {
    return wallet.writeContract({
      address: factory,
      abi: factoryAbi,
      functionName: "createPot",
      args: [
        args.token,
        args.perPerson,
        args.partySize,
        args.deadline,
        args.payee,
        args.title,
        true,
        args.secretHash!,
      ],
    });
  }
  return wallet.writeContract({
    address: factory,
    abi: factoryAbi,
    functionName: "createPot",
    args: [args.token, args.perPerson, args.partySize, args.deadline, args.payee, args.title],
  });
}

export async function passkeyCommitSecret(
  pot: `0x${string}`,
  value: bigint,
  secret: `0x${string}`,
  chainId: number
) {
  const s = passkeySession();
  if (!s) throw new Error("no passkey session");
  const wallet = walletFor(s.session, chainId);
  return wallet.writeContract({
    address: pot,
    abi: potAbi,
    functionName: "commitWithSecret",
    args: [secret],
    value,
  });
}

const AUSD_FAUCET: Record<number, `0x${string}`> = {
  // Agora's official testnet faucet: requestFunds(address) → 10,000 AUSD.
  // No mainnet faucet exists — mainnet deposits come from wallets/exchanges.
  10143: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
};

/** Testnet only: drip 10,000 AUSD from Agora's faucet to the passkey account. */
export async function passkeyFaucetDrip(to: `0x${string}`, chainId: number) {
  const faucet = AUSD_FAUCET[chainId];
  if (!faucet) throw new Error("No faucet on this network — switch to testnet for free test AUSD.");
  const s = passkeySession();
  if (!s) throw new Error("no passkey session");
  const wallet = walletFor(s.session, chainId);
  return wallet.writeContract({
    address: faucet,
    abi: [{ type: "function", name: "requestFunds", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [] }] as const,
    functionName: "requestFunds",
    args: [to],
  });
}

export async function passkeyApprove(
  token: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint,
  chainId: number
) {
  const s = passkeySession();
  if (!s) throw new Error("no passkey session");
  const wallet = walletFor(s.session, chainId);
  return wallet.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] });
}

export async function passkeyCall(
  pot: `0x${string}`,
  fn: "release" | "expire" | "refund" | "rotateSecret",
  chainId: number,
  args?: readonly unknown[]
) {
  const s = passkeySession();
  if (!s) throw new Error("no passkey session");
  const wallet = walletFor(s.session, chainId);
  return wallet.writeContract({
    address: pot,
    abi: potAbi,
    functionName: fn,
    // release() needs fee args; caller passes them for that case.
    ...(args ? { args: args as never } : {}),
  });
}
