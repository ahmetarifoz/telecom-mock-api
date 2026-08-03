const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createServer } = require("./server");

let server;
let baseUrl;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("health endpoint", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "UP" });
});

test("customer search returns the fixture", async () => {
  const response = await fetch(`${baseUrl}/api/customers/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ msisdn: "905551112233" }),
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.customers[0].customerId, "CUST-1001");
});

test("validation calculates the price difference", async () => {
  const response = await fetch(`${baseUrl}/api/orders/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerId: "CUST-1001",
      billingAccountId: "BA-1001",
      subscriptionId: "SUB-1001",
      eligibilityId: "ELG-TEST",
      action: "CHANGE_OFFER",
      currentOfferId: "OFFER-10GB",
      targetOfferId: "OFFER-20GB",
    }),
  });
  const data = await response.json();
  assert.equal(data.valid, true);
  assert.equal(data.priceSummary.priceDifference, 100);
});

test("missing required field returns 400", async () => {
  const response = await fetch(`${baseUrl}/api/customers/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 400);
});

test("created order can be queried", async () => {
  const createResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      externalReferenceId: "EXT-TEST-1",
      customerId: "CUST-1001",
      billingAccountId: "BA-1001",
      subscriptionId: "SUB-1001",
      validationId: "VAL-TEST",
      channel: "WEB",
      orderItems: [
        {
          action: "MODIFY",
          productId: "SUB-1001",
          currentOfferId: "OFFER-10GB",
          targetOfferId: "OFFER-20GB",
        },
      ],
    }),
  });
  const createdOrder = await createResponse.json();
  assert.equal(createResponse.status, 201);
  assert.equal(createdOrder.status, "ACKNOWLEDGED");

  const statusResponse = await fetch(`${baseUrl}/api/orders/${createdOrder.orderId}`);
  const orderStatus = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.equal(orderStatus.status, "IN_PROGRESS");
});
