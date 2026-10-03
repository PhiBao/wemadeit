"use client";

// Mera passkey accounts: Face ID / Touch ID → deterministic EOA on Monad.
// One ceremony reproduces the same address on every synced device; no seed
// phrase, no contract, no bundler. Key lives only in page memory (session).

import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
  isMeraError,
} from "@category-labs/mera";
import type { Secp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";

const CRED_KEY = "pact.passkey.credential";

export type PactSession = {
  session: Secp256k1SigningSession;
  address: `0x${string}`;
};

let live: PactSession | null = null;

function derivePrivateKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (!node.privateKey) throw new Error("derivation produced no key");
  return node.privateKey;
}

function openSession(prfOutput: Uint8Array): PactSession {
  const session = createSecp256k1SigningSession({ privateKey: derivePrivateKey(prfOutput) });
  const account = toViemAccount(session);
  live = { session, address: account.address };
  return live;
}

function readStoredCredential() {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    return raw ? (JSON.parse(raw) as { credentialId: string }) : undefined;
  } catch {
    return undefined;
  }
}

export function hasStoredCredential(): boolean {
  return !!readStoredCredential();
}

export function clearStoredCredential() {
  try {
    localStorage.removeItem(CRED_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * True only when the user genuinely dismissed the browser's passkey sheet.
 *
 * Mera collapses four different failures into PASSKEY_OPERATION_FAILED
 * ("WebAuthn failed, was cancelled, returned an unexpected credential, or the
 * credential API is unavailable" — see errors.d.ts). Treating all of them as a
 * cancel made every real failure invisible: the button appeared to do nothing.
 * Only a NotAllowedError/AbortError from the underlying WebAuthn call is an
 * actual dismissal; everything else now surfaces with a real message.
 */
export function isCancel(e: unknown): boolean {
  if (!isMeraError(e)) return false;
  if (e.code !== "PASSKEY_OPERATION_FAILED") return false;
  const name = webAuthnErrorName(e);
  return name === "NotAllowedError" || name === "AbortError";
}

export function isPrfUnavailable(e: unknown): boolean {
  return isMeraError(e) && e.code === "PRF_UNAVAILABLE";
}

/** The underlying DOMException name (e.g. "InvalidStateError"), if any. */
function webAuthnErrorName(e: unknown): string | undefined {
  const cause = (e as { cause?: unknown } | null)?.cause;
  if (!cause) return undefined;
  if (typeof DOMException !== "undefined" && cause instanceof DOMException) return cause.name;
  if (cause instanceof Error) return cause.name;
  return undefined;
}

/** A passkey for this site is already registered in the browser's credential manager. */
export function isAlreadyRegistered(e: unknown): boolean {
  return webAuthnErrorName(e) === "InvalidStateError";
}

function isEdge(): boolean {
  return typeof navigator !== "undefined" && /Edg\//.test(navigator.userAgent);
}

/**
 * Turn a passkey failure into something a non-crypto user can act on. Falls
 * back to the raw message so nothing is silently swallowed again.
 */
export function passkeyErrorMessage(e: unknown): string {
  if (isPrfUnavailable(e)) {
    return "This passkey can't unlock a wallet (no PRF support). Try iCloud Keychain, Google Password Manager, or 1Password — or use email login below.";
  }
  if (isAlreadyRegistered(e)) {
    return isEdge()
      ? "A passkey for this site already exists in Edge's password manager. Remove it there (edge://wallet-passwords, or Settings → Passwords), then try again — or use “I already have a passkey”."
      : "A passkey for this site already exists in this browser. Remove it from your password manager, then try again — or use “I already have a passkey”.";
  }
  const name = webAuthnErrorName(e);
  if (name === "NotSupportedError" || name === "SecurityError") {
    return `This browser couldn't create a passkey here (${name ?? "unsupported"}). Try Chrome, or use email login below.`;
  }
  if (isMeraError(e) && e.code === "CRYPTO_UNAVAILABLE") {
    return "This browser is missing a required crypto feature. Try Chrome, or use email login below.";
  }
  const msg = e instanceof Error ? e.message : String(e);
  return `Face ID failed${name ? ` (${name})` : ""}: ${msg.slice(0, 140)}`;
}

/** This device's authenticator does device biometrics (Face ID / fingerprint). */
export async function supportsPlatformBiometrics(): Promise<boolean> {
  try {
    const c = window.PublicKeyCredential;
    if (!c?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await c.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Sign in with the known passkey. Throws when none is stored. */
export async function passkeySignIn(): Promise<PactSession> {
  if (live) return live;
  const known = readStoredCredential();
  if (!known) throw new Error("no stored passkey");
  const got = await getPasskeyPrfOutput({ rpId: window.location.hostname, credential: known });
  localStorage.setItem(CRED_KEY, JSON.stringify({ credentialId: got.credentialId }));
  return openSession(got.prfOutput);
}

/** Sign in with any passkey the authenticator offers (new device). */
export async function passkeySignInExisting(): Promise<PactSession> {
  if (live) return live;
  const got = await getPasskeyPrfOutput({ rpId: window.location.hostname });
  localStorage.setItem(CRED_KEY, JSON.stringify({ credentialId: got.credentialId }));
  return openSession(got.prfOutput);
}

/** Create a fresh passkey. Shows the browser sheet exactly once. */
export async function passkeyCreate(displayName = "WeMadeIt user"): Promise<PactSession> {
  if (live) return live;
  const rpId = window.location.hostname;
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: "WeMadeIt" },
    user: { name: `wemadeit-${Date.now()}`, displayName },
  });
  localStorage.setItem(CRED_KEY, JSON.stringify({ credentialId: created.credentialId }));
  return openSession(created.prfOutput);
}

/** Legacy entry: prefer passkeySignIn / passkeyCreate directly. */
export async function passkeyConnect(displayName = "WeMadeIt user"): Promise<PactSession> {
  if (hasStoredCredential()) return passkeySignIn();
  return passkeyCreate(displayName);
}

export function passkeySession(): PactSession | null {
  return live;
}

export function passkeyDisconnect() {
  try {
    live?.session.end();
  } finally {
    live = null;
  }
}

export function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
