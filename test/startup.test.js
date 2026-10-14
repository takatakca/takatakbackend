"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../index");
const { sendOtpToPhone } = require("../utils/sendOtpToPhone");
const sendOtpToEmail = require("../utils/sendOtpToEmail");

test("health routes start without external integration secrets", async t => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;

  const live = await fetch(url + "/health/live");
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: "ok" });

  // No production DB connection is made in these unit tests.
  const ready = await fetch(url + "/health/ready");
  assert.equal(ready.status, 503);
  assert.deepEqual(await ready.json(), { status: "not_ready" });

  const allowed = await fetch(url + "/health/live", { headers: { origin: "https://takatak.ca" } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://takatak.ca");
  const other = await fetch(url + "/health/live", { headers: { origin: "https://untrusted.example" } });
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});

test("legacy SMS and email do not initialize provider clients without configuration", async () => {
  // Existing CI needs no credentials to import/start the API.
  if (!process.env.TWILIO_VERIFY_SERVICE_SID) {
    await assert.rejects(sendOtpToPhone("+15145551234"), /not configured/);
  }
  if (!process.env.SENDGRID_API_KEY) {
    await assert.rejects(sendOtpToEmail("user@example.com", "123456"), /not configured/);
  }
});
