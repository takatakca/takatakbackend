"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone } = require("../utils/phoneUtils");
const {
  canonicalPhoneExpression, phoneCollisionPipeline, assessPhoneIdentityAudit,
} = require("../scripts/audit-legacy-phone-identities");

const sample = (totalAccounts, distinctPhoneValues, collisionGroups, collisionAccounts, invalidPhoneAccounts = 0) => ({
  totalAccounts, distinctPhoneValues, collisionGroups, collisionAccounts, invalidPhoneAccounts,
});

test("phone audit canonicalizes inside MongoDB; raw and canonical numbers never leave the pipeline", () => {
  const pipeline = phoneCollisionPipeline();
  assert.equal(pipeline.length, 4);
  assert.deepEqual(pipeline[0], { $project: { canonicalPhone: canonicalPhoneExpression() } });
  assert.equal(pipeline[1].$group._id, "$canonicalPhone");
  assert.deepEqual(pipeline[2].$group.collisionGroups.$sum.$cond[0], {
    $and: [{ $ne: ["$_id", null] }, { $gt: ["$count", 1] }],
  });
  assert.deepEqual(pipeline[3].$project, {
    _id: 0, totalAccounts: 1, distinctPhoneValues: 1,
    collisionGroups: 1, collisionAccounts: 1, invalidPhoneAccounts: 1,
  });
  assert.equal(Object.values(pipeline[3].$project).includes("$_id"), false);
});

test("canonicalization recognizes national +1, spaced +1, and legacy bare +234 spellings", () => {
  const expr = canonicalPhoneExpression();
  assert.equal(expr.$let.in.$switch.default, null);
  // All separators are removed by a nested, server-side string expression.
  const serialized = JSON.stringify(expr);
  for (const separator of ['"find":" "', '"find":"-"', '"find":"."', '"find":"("', '"find":")"']) {
    assert.ok(serialized.includes(separator), separator);
  }
  const branches = expr.$let.in.$switch.branches;
  const compact = input => input.replace(/[ .()\t-]/g, "");
  const canonical = input => {
    const candidate = compact(input);
    for (const branch of branches) {
      if (branch.case.$regexMatch.regex.test(candidate)) {
        return typeof branch.then === "string" ? candidate : "+" + (branch.then.$concat[0] === "+1" ? "1" : "") + candidate;
      }
    }
    return null;
  };
  for (const input of ["(514) 555-0184", "+1 514 555 0184", "15145550184", "5145550184", "+2348035551212", "2348035551212"]) {
    assert.equal(canonical(input), normalizePhone(input));
  }
  for (const invalid of ["", "555-0184", "not-a-phone", "10145550184", "+10145550184"]) {
    assert.equal(canonical(invalid), null);
  }
});

test("canonical collisions block unique index readiness even when raw values differ", () => {
  // MongoDB grouping of 5145550184 and +15145550184 yields one canonical group.
  const result = assessPhoneIdentityAudit(
    [sample(9, 7, 2, 4)],
    [{ key: { phone: 1 }, name: "phone_1", unique: false }]
  );
  assert.equal(result.healthy, false);
  assert.equal(result.collisionGroups, 2);
  assert.equal(result.collisionAccounts, 4);
  assert.equal(result.phoneUniqueIndexPresent, false);
  assert.match(result.nextAction, /canonical duplicate/);
  assert.equal(Object.keys(result).some(key => /actualPhone|email|phoneNumber/.test(key)), false);
});

test("invalid historic or missing numbers always block success, even with unique raw index", () => {
  const result = assessPhoneIdentityAudit(
    [sample(3, 2, 0, 0, 1)],
    [{ key: { phone: 1 }, unique: true, name: "phone_1" }]
  );
  assert.equal(result.invalidPhoneAccounts, 1);
  assert.equal(result.collisionGroups, 0);
  assert.equal(result.healthy, false);
  assert.match(result.nextAction, /invalid or missing/);
});

test("full unique phone index and no canonical collisions or invalid numbers is healthy", () => {
  const report = assessPhoneIdentityAudit(
    [sample(27, 27, 0, 0)],
    [{ key: { phone: 1 }, unique: true, name: "phone_1" }]
  );
  assert.equal(report.healthy, true);
  assert.equal(report.phoneUniqueIndexPresent, true);
  assert.equal(report.invalidPhoneAccounts, 0);
});

test("sparse, partial, compound and non-simple-collation unique indexes do not falsely certify", () => {
  for (const index of [
    { key: { phone: 1 }, unique: true, sparse: true },
    { key: { phone: 1, tenantId: 1 }, unique: true },
    { key: { phone: 1 }, unique: true, partialFilterExpression: { phone: { $exists: true } } },
    { key: { phone: 1 }, unique: true, collation: { locale: "en", strength: 2 } },
  ]) {
    const result = assessPhoneIdentityAudit([sample(2, 2, 0, 0)], [index]);
    assert.equal(result.healthy, false);
    assert.equal(result.phoneUniqueIndexPresent, false);
  }
});

test("audit rejects missing, impossible and inconsistent counts; empty DB is not indexed", () => {
  assert.throws(() => assessPhoneIdentityAudit([{
    totalAccounts: 2, distinctPhoneValues: 2, collisionGroups: 0, collisionAccounts: 0,
  }]), /Inconsistent/);
  assert.throws(() => assessPhoneIdentityAudit([sample(2, 3, 0, 0)]), /Inconsistent/);
  assert.throws(() => assessPhoneIdentityAudit([sample(3, 1, 1, 1)]), /Inconsistent/);
  assert.throws(() => assessPhoneIdentityAudit([sample(3, 3, 0, 0, 1)]), /Inconsistent/);
  assert.throws(() => assessPhoneIdentityAudit([sample(-1, 0, 0, 0)]), /Inconsistent/);
  assert.equal(assessPhoneIdentityAudit([], []).totalAccounts, 0);
  assert.equal(assessPhoneIdentityAudit([], []).healthy, false);
});
