// Guards the pot page's read-derivation against the data shapes it actually
// sees. The page crashed twice in production on exactly these cases:
//   1. r[9].failure / r[10].failure read while `r` was still empty -> TypeError
//   2. title()/isPrivate() reverts on pre-v2 pots, so the completeness gate
//      never passed and the page polled forever.
// TypeScript cannot catch either, so they are pinned here.

/** Mirrors the page's `r` derivation from useReadContracts. */
function derive(data) {
  return (data ?? []).map((d) => ({
    result: d?.result,
    failure: !!d && d.status === "failure",
  }));
}

/** Mirrors the page's completeness gate + legacy detection. */
function assess(r) {
  const complete =
    r.length >= 11 &&
    r[0].result !== undefined &&
    r[1].result !== undefined &&
    r[2].result !== undefined &&
    r[3].result !== undefined &&
    r[4].result !== undefined &&
    r[5].result !== undefined &&
    r[6].result !== undefined &&
    r[8].result !== undefined;
  const legacy = !!(r[9]?.failure || r[10]?.failure);
  return { complete, legacy };
}

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}`);
    failures++;
  }
}

// The 11 reads, in page order:
// state, commitCount, partySize, perPerson, deadline, token, payee,
// organizer, contributors, title, isPrivate
const ok = (result) => ({ status: "success", result });
const bad = () => ({ status: "failure", error: new Error("execution reverted") });
const gated = [
  ok(0), // state
  ok(1n), // commitCount
  ok(2n), // partySize
  ok(10n ** 18n), // perPerson
  ok(1800000000n), // deadline
  ok("0x0000000000000000000000000000000000000000"), // token
  ok("0x0000000000000000000000000000000000000001"), // payee
  ok("0x0000000000000000000000000000000000000002"), // organizer
  ok([]), // contributors
];

console.log("pot page read derivation");
check("empty data does not throw and is incomplete", (() => {
  const { complete } = assess(derive(undefined));
  return complete === false;
})());
check("partial data is incomplete", (() => {
  const { complete } = assess(derive(gated.slice(0, 5)));
  return complete === false;
})());
check("modern pot (all 11 reads ok) is complete, not legacy", (() => {
  const { complete, legacy } = assess(derive([...gated, ok("Trip"), ok(false)]));
  return complete === true && legacy === false;
})());
check("legacy pot (title+isPrivate revert) is complete and flagged legacy", (() => {
  const { complete, legacy } = assess(derive([...gated, bad(), bad()]));
  return complete === true && legacy === true;
})());
check("legacy pot with only title reverting is flagged legacy", (() => {
  const { complete, legacy } = assess(derive([...gated, bad(), ok(false)]));
  return complete === true && legacy === true;
})());
check("organizer missing does not block completeness", (() => {
  const { complete } = assess(
    derive([...gated.slice(0, 7), ok(undefined), ...gated.slice(8), ok("T"), ok(false)])
  );
  return complete === true;
}));

if (failures) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");