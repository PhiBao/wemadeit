// Pins the passkey failure classification. Regression guard: isCancel() used to
// treat EVERY PASSKEY_OPERATION_FAILED as a user dismissal, which made real
// browser failures (Edge, existing credentials, unsupported API) render as a
// dead button with no message at all.

/** Mirrors Mera's error shape. */
class MeraError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.code = code;
    this.cause = options.cause;
  }
}
const isMeraError = (e) => e instanceof MeraError;

function webAuthnErrorName(e) {
  const cause = e?.cause;
  if (!cause) return undefined;
  if (typeof DOMException !== "undefined" && cause instanceof DOMException) return cause.name;
  if (cause instanceof Error) return cause.name;
  return undefined;
}

function isCancel(e) {
  if (!isMeraError(e)) return false;
  if (e.code !== "PASSKEY_OPERATION_FAILED") return false;
  const name = webAuthnErrorName(e);
  return name === "NotAllowedError" || name === "AbortError";
}

function isAlreadyRegistered(e) {
  return webAuthnErrorName(e) === "InvalidStateError";
}

// A stand-in for the browser DOMExceptions Mera wraps.
const domErr = (name) => {
  const e = new Error(`${name}: simulated`);
  e.name = name;
  return e;
};

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}`);
    failures++;
  }
}

const failed = (code, cause) => new MeraError(code, "op failed", { cause });

console.log("passkey failure classification");

check("NotAllowedError is a genuine cancel", isCancel(failed("PASSKEY_OPERATION_FAILED", domErr("NotAllowedError"))));
check("AbortError is a genuine cancel", isCancel(failed("PASSKEY_OPERATION_FAILED", domErr("AbortError"))));

check(
  "InvalidStateError is NOT a cancel (existing passkey in Edge)",
  !isCancel(failed("PASSKEY_OPERATION_FAILED", domErr("InvalidStateError"))) &&
    isAlreadyRegistered(failed("PASSKEY_OPERATION_FAILED", domErr("InvalidStateError")))
);
check(
  "NotSupportedError is NOT a cancel (browser lacks API)",
  !isCancel(failed("PASSKEY_OPERATION_FAILED", domErr("NotSupportedError")))
);
check(
  "SecurityError is NOT a cancel (rpId mismatch)",
  !isCancel(failed("PASSKEY_OPERATION_FAILED", domErr("SecurityError")))
);
check(
  "missing cause is NOT a cancel — Mera's catch-all must still surface",
  !isCancel(failed("PASSKEY_OPERATION_FAILED", undefined))
);
check("PRF_UNAVAILABLE is never a cancel", !isCancel(failed("PRF_UNAVAILABLE", domErr("NotAllowedError"))));
check("non-Mera errors are never a cancel", !isCancel(new Error("boom")));

// The original bug: any PASSKEY_OPERATION_FAILED was swallowed.
const legacyBehaviour = (e) => isMeraError(e) && e.code === "PASSKEY_OPERATION_FAILED";
check(
  "legacy logic would have swallowed InvalidStateError (the reported bug)",
  legacyBehaviour(failed("PASSKEY_OPERATION_FAILED", domErr("InvalidStateError")))
);
check(
  "new logic surfaces InvalidStateError instead",
  !isCancel(failed("PASSKEY_OPERATION_FAILED", domErr("InvalidStateError")))
);

if (failures) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");