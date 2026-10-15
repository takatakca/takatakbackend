"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

function withUpmindClient(t, get) {
  const old = {
    key: process.env.UPMIND_KEY,
    brand: process.env.UPMIND_BRAND_ID,
  };
  process.env.UPMIND_KEY = "test-only-key";
  process.env.UPMIND_BRAND_ID = "test-brand";
  const seen = [];
  t.mock.method(axios, "create", () => ({
    async get(url, options) {
      seen.push({ url, params: options?.params });
      return { data: await get(url, options?.params) };
    },
  }));
  const id = require.resolve("../services/upmindService");
  delete require.cache[id];
  const service = require(id);
  t.after(() => {
    delete require.cache[id];
    if (old.key === undefined) delete process.env.UPMIND_KEY;
    else process.env.UPMIND_KEY = old.key;
    if (old.brand === undefined) delete process.env.UPMIND_BRAND_ID;
    else process.env.UPMIND_BRAND_ID = old.brand;
  });
  return { service, seen };
}

test("Upmind invoices paginate to the complete count, not just the first page", async t => {
  const { service, seen } = withUpmindClient(t, async (url, page) => {
    assert.equal(url, "/admin/clients/client-1/invoices");
    const invoices = Array.from({ length: 26 }, (_, i) => ({
      id: i + 1,
      number: "INV-" + (i + 1),
      status: i === 25 ? "unpaid" : "paid",
      total: 1,
    }));
    return { status: "ok", total: 26, data: invoices.slice(page.offset, page.offset + page.limit) };
  });
  const invoices = await service.getInvoices("client-1");
  assert.equal(invoices.length, 26);
  assert.equal(invoices.filter(x => x.status === "unpaid").length, 1);
  assert.deepEqual(seen.map(x => x.params), [{ limit: 25, offset: 0 }, { limit: 25, offset: 25 }]);
});

test("Upmind orders and tickets reject malformed bodies rather than reporting zero", async t => {
  const { service, seen } = withUpmindClient(t, async () => ({ status: "ok", total: 0 }));
  await assert.rejects(service.getOrders("client-1"), /Upmind orders unavailable/);
  await assert.rejects(service.getTickets("client-1"), /Upmind tickets unavailable/);
  assert.deepEqual(seen.map(x => x.url), [
    "/admin/clients/client-1/orders",
    "/admin/clients/client-1/tickets",
  ]);
});

test("Upmind incomplete billing pagination fails closed on a missing later page", async t => {
  const { service, seen } = withUpmindClient(t, async (_url, page) => {
    if (page.offset === 0) return { status: "ok", total: 2, data: [{ id: "order-1" }] };
    return { status: "ok", total: 2, data: [] };
  });
  await assert.rejects(service.getOrders("client-1"), /Upmind orders unavailable/);
  assert.deepEqual(seen.map(x => x.params.offset), [0, 1]);
});

test("Upmind accepts a verified empty total, but not malformed IDs or oversized lists", async t => {
  const { service, seen } = withUpmindClient(t, async (url) => {
    if (url.endsWith("/tickets")) return { status: "ok", total: 0, data: [] };
    return { status: "ok", total: 1001, data: [] };
  });
  assert.deepEqual(await service.getTickets("client-1"), []);
  await assert.rejects(service.getInvoices("client-1"), /Upmind invoices unavailable/);
  const before = seen.length;
  await assert.rejects(service.getOrders("../another-client"), /Upmind orders unavailable/);
  assert.equal(seen.length, before, "Invalid owner ID must not call Upmind");
});
