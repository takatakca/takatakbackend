"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Users = require("../models/User");
const upmind = require("../services/upmindService");

function response() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    set(key, value) { this.headers[key] = value; return this; },
    json(body) { this.body = body; return this; },
  };
}

function loadDashboardWithStubs(t, user, { orders = [], invoices = [], tickets = [], fail = false } = {}) {
  let clientCalls = 0;
  t.mock.method(Users, "findById", id => {
    assert.equal(id, "507f1f77bcf86cd799439011");
    return { select: async fields => {
      assert.equal(fields, "+upmindClientId");
      return user;
    } };
  });
  for (const [method, result] of [["getOrders", orders], ["getInvoices", invoices], ["getTickets", tickets]]) {
    t.mock.method(upmind, method, async clientId => {
      clientCalls++;
      assert.equal(clientId, "client-owner");
      if (fail) throw new Error("Simulated invalid provider page");
      return result;
    });
  }
  const modulePath = require.resolve("../controller/userDashboard");
  delete require.cache[modulePath];
  const handler = require(modulePath).getUserDashboard;
  t.after(() => { delete require.cache[modulePath]; });
  return { handler, calls: () => clientCalls };
}

const authenticated = { user: { id: "507f1f77bcf86cd799439011" } };
const account = {
  _id: authenticated.user.id,
  firstName: "Test",
  lastName: "Owner",
  email: "owner@example.com",
  upmindClientId: "client-owner",
};

test("unlinked dashboard does not invent zero billing totals", async t => {
  const { handler, calls } = loadDashboardWithStubs(t, { ...account, upmindClientId: null });
  const res = response();
  await handler(authenticated, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
  assert.equal(res.body.integrationStatus, "not_linked");
  assert.equal(res.body.integrationsAvailable, false);
  assert.deepEqual(res.body.summary, {
    totalOrders: null, totalInvoices: null, unpaidInvoices: null, activeTickets: null,
  });
  assert.equal(calls(), 0, "Unlinked accounts must not request another owner's Upmind data");
});

test("linked dashboard uses only the owner client and confirmed complete lists", async t => {
  const invoices = Array.from({ length: 26 }, (_, id) => ({
    id, status: id === 25 ? "unpaid" : "paid",
  }));
  const { handler, calls } = loadDashboardWithStubs(t, account, {
    orders: [{ id: "o-1", status: "active", domain: "example.test" }],
    invoices, tickets: [{ id: "t-1", status: "open" }],
  });
  const res = response();
  await handler(authenticated, res);
  assert.equal(res.body.integrationStatus, "available");
  assert.equal(res.body.summary.totalOrders, 1);
  assert.equal(res.body.summary.totalInvoices, 26);
  assert.equal(res.body.summary.unpaidInvoices, 1);
  assert.equal(res.body.summary.activeTickets, 1);
  assert.equal(res.body.user.upmindClientId, "client-owner");
  assert.equal(calls(), 3);
});

test("Upmind transport or incomplete page error produces unknown totals, not zero", async t => {
  const { handler } = loadDashboardWithStubs(t, account, { fail: true });
  const res = response();
  await handler(authenticated, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.integrationStatus, "unavailable");
  assert.equal(res.body.integrationsAvailable, false);
  assert.equal(res.body.summary.totalOrders, null);
  assert.equal(res.body.summary.totalInvoices, null);
  assert.equal(res.body.summary.unpaidInvoices, null);
  assert.equal(res.body.summary.activeTickets, null);
});
