"use client";

// Private-pot invite secrets. The key travels in the share-link #fragment, so it
// never reaches a server in transit and the chain stores its hash in state.
// It is NOT confidential from the chain once used: the preimage is passed as
// calldata to commitWithSecret(), so the first keyed commit publishes it
// permanently. Invite-only gates discovery, not entry after that point.

import { keccak256 } from "viem";

export function newSecret(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function secretHash(secret: `0x${string}`): `0x${string}` {
  return keccak256(secret);
}

/** Read ?s= or #s= from the current URL (organizer's private share link). */
export function secretFromUrl(): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("s");
  const h = new URLSearchParams(window.location.hash.replace(/^#/, "?")).get("s");
  const v = q ?? h;
  return v && /^0x[0-9a-fA-F]{64}$/.test(v) ? (v as `0x${string}`) : null;
}

export function shareUrl(pot: string, secret: `0x${string}` | null): string {
  const base = `${window.location.origin}/pot/${pot}`;
  return secret ? `${base}#s=${secret}` : base;
}
