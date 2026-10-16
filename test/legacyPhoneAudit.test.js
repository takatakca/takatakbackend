"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { phoneCollisionPipeline, assessPhoneIdentityAudit } = require("../scripts/audit-legacy-phone-identities");

test("phone identity audit groups in MongoDB and exports aggregate counters only", () => {
  const stages = phoneCollisionPipeline();
  assert.equal(stages[0].$group._id, "$phone");
  assert.deepEqual(stages[1].$group.collisionGroups.$sum.$cond[0], { $gt: ["$count", 1] });
  assert.deepEqual(stages[2].$project, {
    _id: 0, totalAccounts: 1, distinctPhoneValues: 1,
    collisionGroups: 1, collisionAccounts: 1,
  });
  assert.equal(stages.length, 3);
  assert.equal(JSON.stringify(stages).includes("owner@example"), false);
});

test("duplicate legacy phone ownership blocks the unique-index readiness report", () => {
  const result = assessPhoneIdentityAudit(
    [{ totalAccounts: 9, distinctPhoneValues: 7, collisionGroups: 2, collisionAccounts: 4 }],
    [{ key: { phone: 1 }, name: "phone_1", unique: false }]
  );
  assert.equal(result.healthy, false);
  assert.equal(result.collisionGroups, 2);
  assert.equal(result.collisionAccounts, 4);
  assert.equal(result.phoneUniqueIndexPresent, false);
  assert.match(result.nextAction, /reconcile duplicate/);
  assert.equal(Object.keys(result).some(key => /actualPhone|email|phoneNumber/.test(key)), false);
});

test("full unique phone index and zero collisions produce a healthy report", () => {
  const report = assessPhoneIdentityAudit(
    [{ totalAccounts: 27, distinctPhoneValues: 27, collisionGroups: 0, collisionAccounts: 0 }],
    [{ key: { phone: 1 }, unique: true, name: "phone_1" }]
  );
  assert.equal(report.healthy, true);
  assert.equal(report.phoneUniqueIndexPresent, true);
});

test("sparse/partial/compound unique indexes do not falsely prove global uniqueness", () => {
  for (const index of [
    { key: { phone: 1 }, unique: true, sparse: true },
    { key: { phone: 1, tenantId: 1 }, unique: true },
    { key: { phone: 1 }, unique: true, partialFilterExpression: { phone: { $exists: true } } },
  ]) {
    const result = assessPhoneIdentityAudit(
      [{ totalAccounts: 2, distinctPhoneValues: 2, collisionGroups: 0, collisionAccounts: 0 }],
      [index]
    );
    assert.equal(result.healthy, false);
    assert.equal(result.phoneUniqueIndexPresent, false);
  }
});

test("audit rejects impossible MongoDB counts instead of certifying readiness", () => {
  assert.throws(
    () => assessPhoneIdentityAudit([{ totalAccounts: 2, distinctPhoneValues: 3, collisionGroups: 0, collisionAccounts: 0 }]),
    /Inconsistent/
  );
  assert.throws(
    () => assessPhoneIdentityAudit([{ totalAccounts: 3, distinctPhoneValues: 1, collisionGroups: 1, collisionAccounts: 1 }]),
    /Inconsistent/
  );
  assert.throws(() => assessPhoneIdentityAudit([{ totalAccounts: -1 }]), /Inconsistent/);
  assert.equal(assessPhoneIdentityAudit([], []).totalAccounts, 0);
});
