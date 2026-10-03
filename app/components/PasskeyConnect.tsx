"use client";

import { useEffect, useState } from "react";
import {
  clearStoredCredential,
  hasStoredCredential,
  isCancel,
  isPrfUnavailable,
  passkeyCreate,
  passkeyDisconnect,
  passkeySignIn,
  passkeySignInExisting,
  shortAddress,
  supportsPlatformBiometrics,
} from "../lib/mera";
import { useMera } from "../lib/mera-context";

// Smart Face ID flow: we know whether this browser has a passkey for us, so
// we never show a doomed "pick a passkey" sheet first. No stored credential →
// straight to create. Stored → straight to sign-in. A quiet secondary path
// covers returning users on a new device.
export default function PasskeyConnect() {
  const { meraAddr: addr, setMeraAddr } = useMera();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [known, setKnown] = useState(false);
  const [bio, setBio] = useState<boolean | null>(null);

  useEffect(() => {
    setKnown(hasStoredCredential());
    supportsPlatformBiometrics().then(setBio);
  }, []);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      setMeraAddr((await passkeyCreate()).address);
      setKnown(true);
    } catch (e) {
      if (isCancel(e)) {
        // dismissed — back to idle, no scolding
      } else if (isPrfUnavailable(e)) {
        setErr(
          "That passkey can't unlock a wallet (no PRF support). Try iCloud Keychain, Google Password Manager, or 1Password — or use email login below."
        );
      } else {
        setErr(e instanceof Error ? e.message.slice(0, 160) : "Face ID failed — try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (existing = false) => {
    setBusy(true);
    setErr(null);
    try {
      setMeraAddr((await (existing ? passkeySignInExisting() : passkeySignIn())).address);
      setKnown(true);
    } catch (e) {
      if (isCancel(e)) {
        // dismissed — back to idle
      } else {
        // Stored credential is stale (deleted passkey, new profile…).
        clearStoredCredential();
        setKnown(false);
        setErr("Couldn't find that passkey on this device. Create a new one below.");
      }
    } finally {
      setBusy(false);
    }
  };

  const go = () => (known ? signIn() : create());

  const out = () => {
    passkeyDisconnect();
    setMeraAddr(null);
  };

  if (addr) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-emerald-100 px-3 py-1 font-mono">🍏 {shortAddress(addr)}</span>
        <button onClick={out} className="underline">
          sign out
        </button>
      </div>
    );
  }

  // Keep this noun-only: it is interpolated after a possessive elsewhere, so
  // embedding "your" here produced "Creates your your password manager…".
  const bioWord = bio === false ? "password manager or security key" : "Face ID";
  return (
    <div>
      <button
        onClick={go}
        disabled={busy}
        className="rounded-xl bg-black px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Waiting for confirmation…" : known ? "Resume with Face ID" : "Continue with Face ID"}
      </button>
      <p className="mt-1 text-xs text-gray-600">
        {known
          ? `One tap restores your session with ${bioWord} — same account, no seed phrase.`
          : `First time? Creates your ${bioWord} login automatically — no seed phrase, works on your other synced devices.`}
      </p>
      {!known && !busy && (
        <button onClick={() => signIn(true)} className="mt-1 text-xs underline">
          I already have a passkey for this site
        </button>
      )}
      {err && <p className="mt-1 text-sm text-red-700">{err}</p>}
    </div>
  );
}
