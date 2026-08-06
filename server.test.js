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

async function resetAuthHarness() {
  const response = await fetch(`${baseUrl}/api/test-auth/reset`, { method: "POST" });
  assert.equal(response.status, 200);
}

async function requestManagedToken(scenario = "SUCCESS") {
  return fetch(`${baseUrl}/api/auth/login?scenario=${scenario}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "toolflow-user", password: "mock-password" }),
  });
}

function requestBusinessApi(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      authorization: "Bearer static-bearer-token",
      ...options.headers,
    },
  });
}

test("health endpoint", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "UP" });
});

test("documentation page is served from root and docs", async () => {
  for (const pathname of ["/", "/docs"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.match(html, /Telecom Agent API Lab/);
    assert.match(html, /Bill Dispute/);
    assert.match(html, /Managed auth, observable retries/);
    assert.match(html, /Copy for your agent/);
  }
});

test("agent guide is served as markdown", async () => {
  const response = await fetch(`${baseUrl}/agent-guide.md`);
  const markdown = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/markdown/);
  assert.match(markdown, /^# Agent API Chain Quick Reference/);
  assert.match(markdown, /## Auth Test Harness/);
});

test("business APIs reject missing, malformed and unissued bearer tokens", async () => {
  for (const headers of [
    {},
    { authorization: "Basic dGVzdDp0ZXN0" },
    { authorization: "Bearer invalid-token" },
    { authorization: "Bearer auth-service-token-not-issued" },
  ]) {
    const response = await fetch(`${baseUrl}/api/customers/search`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ msisdn: "905551112233" }),
    });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate"), /^Bearer/);
    assert.deepEqual(await response.json(), {
      error: "UNAUTHORIZED",
      message: "Gecerli bir Bearer token gereklidir",
    });
  }
});

test("a managed token grants access to business APIs", async () => {
  await resetAuthHarness();
  const tokenResponse = await requestManagedToken();
  const token = (await tokenResponse.json()).data.access_token;
  const response = await fetch(`${baseUrl}/api/customers/search`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ msisdn: "905551112233" }),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).customers[0].customerId, "CUST-1001");
});

test("customer search returns the fixture", async () => {
  const response = await requestBusinessApi("/api/customers/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ msisdn: "905551112233" }),
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.customers[0].customerId, "CUST-1001");
  assert.equal(data.customers[0].firstName, "John");
  assert.equal(data.customers[0].lastName, "Smith");
});

test("validation calculates the price difference", async () => {
  const response = await requestBusinessApi("/api/orders/validate", {
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
  const response = await requestBusinessApi("/api/customers/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 400);
});

test("created order can be queried", async () => {
  const createResponse = await requestBusinessApi("/api/orders", {
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

  const statusResponse = await requestBusinessApi(`/api/orders/${createdOrder.orderId}`);
  const orderStatus = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.equal(orderStatus.status, "IN_PROGRESS");
});

test("bill validation correlates usage, products and bill items", async () => {
  const [productsResponse, usageResponse, billsResponse] = await Promise.all([
    requestBusinessApi("/api/products?customerId=CUST-1001"),
    requestBusinessApi("/api/usage-records?subscriptionId=SUB-1001&period=2026-07"),
    requestBusinessApi("/api/customer-bills?billingAccountId=BA-1001"),
  ]);
  const products = await productsResponse.json();
  const usage = await usageResponse.json();
  const bills = await billsResponse.json();

  assert.equal(products.products.length, 3);
  assert.equal(usage.usageRecords.length, 2);
  assert.equal(bills.bills[0].amountDue, 1800);

  const validationResponse = await requestBusinessApi("/api/charges/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ billId: bills.bills[0].billId }),
  });
  const validation = await validationResponse.json();
  const duplicateCheck = validation.checks.find(
    (check) => check.code === "DUPLICATE_USAGE_CHARGE",
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.recommendedDisputeAmount, 450);
  assert.deepEqual(duplicateCheck.affectedBillItemIds, ["BI-4", "BI-5"]);
});

test("billing dispute ticket can be created and queried", async () => {
  const createResponse = await requestBusinessApi("/api/trouble-tickets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerId: "CUST-1001",
      type: "BILLING_DISPUTE",
      description: "Roaming kullanimi iki kez ucretlendirilmis.",
      billId: "BILL-2026-07-1001",
      disputedAmount: 450,
      evidence: ["BI-4", "BI-5", "USG-ROAMING-1001"],
    }),
  });
  const ticket = await createResponse.json();
  assert.equal(createResponse.status, 201);
  assert.equal(ticket.status, "OPEN");
  assert.equal(ticket.disputedAmount, 450);

  const getResponse = await requestBusinessApi(`/api/trouble-tickets/${ticket.ticketId}`);
  assert.equal(getResponse.status, 200);
  assert.equal((await getResponse.json()).ticketId, ticket.ticketId);
});

test("outage diagnosis supports ticket and confirmed appointment", async () => {
  const servicesResponse = await requestBusinessApi("/api/services?customerId=CUST-1001");
  const services = await servicesResponse.json();
  const serviceId = services.services[0].serviceId;

  const problemsResponse = await requestBusinessApi(`/api/service-problems?serviceId=${serviceId}`);
  assert.deepEqual((await problemsResponse.json()).serviceProblems, []);

  const testResponse = await requestBusinessApi("/api/service-tests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ serviceId, testType: "FULL_DIAGNOSTIC" }),
  });
  const diagnostic = await testResponse.json();
  assert.equal(diagnostic.result, "FAILED");
  assert.equal(diagnostic.diagnostics.probableCause, "OPTICAL_SIGNAL_LOSS");

  const ticketResponse = await requestBusinessApi("/api/trouble-tickets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerId: "CUST-1001",
      type: "SERVICE_INCIDENT",
      description: "Genel kesinti yok, uzaktan test basarisiz.",
      serviceId,
      evidence: [diagnostic.testId],
    }),
  });
  const ticket = await ticketResponse.json();

  const appointmentResponse = await requestBusinessApi("/api/appointments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerId: "CUST-1001",
      relatedEntityType: "TROUBLE_TICKET",
      relatedEntityId: ticket.ticketId,
      slotId: "SLOT-2026-08-07-AM",
      userConfirmed: true,
    }),
  });
  const appointment = await appointmentResponse.json();
  assert.equal(appointmentResponse.status, 201);
  assert.equal(appointment.status, "BOOKED");
});

test("known mass outage tells the agent not to create an individual ticket", async () => {
  const response = await requestBusinessApi(
    "/api/service-problems?serviceId=SERVICE-FTTH-1001&scenario=KNOWN_OUTAGE",
  );
  const data = await response.json();
  assert.equal(data.serviceProblems.length, 1);
  assert.equal(
    data.serviceProblems[0].recommendedAction,
    "DO_NOT_CREATE_INDIVIDUAL_TICKET",
  );
});

test("relocation flow offers DSL when fiber is unavailable", async () => {
  const addressResponse = await requestBusinessApi("/api/geographic-addresses/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: "Ankara",
      district: "Cankaya",
      postalCode: "06420",
      addressLine1: "Ornek Mah. 1. Sok. No: 2",
    }),
  });
  const address = await addressResponse.json();

  const qualificationResponse = await requestBusinessApi("/api/service-qualifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ addressId: address.addressId, serviceType: "FIXED_INTERNET" }),
  });
  const qualification = await qualificationResponse.json();
  assert.equal(qualification.qualified, true);
  assert.equal(qualification.technology, "DSL");

  const offersResponse = await requestBusinessApi(
    `/api/relocation-offers?qualificationId=${qualification.qualificationId}`,
  );
  const relocationOffers = await offersResponse.json();
  assert.equal(relocationOffers.offers[0].offerId, "HOME-DSL-35");

  const quoteResponse = await requestBusinessApi("/api/quotes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerId: "CUST-1001",
      qualificationId: qualification.qualificationId,
      offerId: "HOME-DSL-35",
    }),
  });
  const quote = await quoteResponse.json();

  const unconfirmedResponse = await requestBusinessApi("/api/relocation-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      externalReferenceId: "EXT-RELOCATE-1",
      customerId: "CUST-1001",
      subscriptionId: "SUB-HOME-1001",
      quoteId: quote.quoteId,
      userConfirmed: false,
    }),
  });
  assert.equal(unconfirmedResponse.status, 409);

  const confirmedResponse = await requestBusinessApi("/api/relocation-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      externalReferenceId: "EXT-RELOCATE-1",
      customerId: "CUST-1001",
      subscriptionId: "SUB-HOME-1001",
      quoteId: quote.quoteId,
      userConfirmed: true,
    }),
  });
  const relocationOrder = await confirmedResponse.json();
  assert.equal(confirmedResponse.status, 201);
  assert.equal(relocationOrder.status, "ACKNOWLEDGED");
});

test("relocation does not return offers where no fixed service exists", async () => {
  const addressResponse = await requestBusinessApi("/api/geographic-addresses/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: "Kars",
      district: "Merkez",
      postalCode: "99999",
      addressLine1: "Uzak Mah. No: 1",
    }),
  });
  const address = await addressResponse.json();
  const qualificationResponse = await requestBusinessApi("/api/service-qualifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ addressId: address.addressId, serviceType: "FIXED_INTERNET" }),
  });
  const qualification = await qualificationResponse.json();
  assert.equal(qualification.qualified, false);

  const offersResponse = await requestBusinessApi(
    `/api/relocation-offers?qualificationId=${qualification.qualificationId}`,
  );
  assert.deepEqual((await offersResponse.json()).offers, []);
});

test("static bearer and API key credentials use the correct headers", async () => {
  await resetAuthHarness();

  const bearerResponse = await fetch(`${baseUrl}/api/protected/resource`, {
    headers: { authorization: "Bearer static-bearer-token" },
  });
  assert.equal(bearerResponse.status, 200);
  assert.equal((await bearerResponse.json()).authScheme, "Bearer");

  const apiKeyResponse = await fetch(`${baseUrl}/api/protected/api-key`, {
    headers: { "x-api-key": "static-api-key" },
  });
  assert.equal(apiKeyResponse.status, 200);
  assert.equal((await apiKeyResponse.json()).authScheme, "X-API-Key");

  const wrongHeaderResponse = await fetch(`${baseUrl}/api/protected/api-key`, {
    headers: { authorization: "Bearer static-api-key" },
  });
  assert.equal(wrongHeaderResponse.status, 401);
});

test("caller token is accepted as bearer and expired token is rejected", async () => {
  await resetAuthHarness();

  const validResponse = await fetch(`${baseUrl}/api/protected/resource`, {
    headers: { authorization: "Bearer caller-access-token" },
  });
  assert.equal(validResponse.status, 200);
  assert.equal((await validResponse.json()).authScheme, "Bearer");

  const expiredResponse = await fetch(`${baseUrl}/api/protected/resource`, {
    headers: { authorization: "Bearer expired-caller-token" },
  });
  assert.equal(expiredResponse.status, 401);
});

test("managed auth service exposes data.access_token without logging secrets", async () => {
  await resetAuthHarness();
  const tokenResponse = await requestManagedToken();
  const tokenBody = await tokenResponse.json();

  assert.equal(tokenResponse.status, 200);
  assert.equal(tokenBody.data.access_token, "auth-service-token-1");
  assert.equal(tokenBody.data.nope, undefined);

  const stats = await (await fetch(`${baseUrl}/api/test-auth/stats`)).json();
  const serializedEvents = JSON.stringify(stats.events);
  assert.equal(stats.loginCalls, 1);
  assert.doesNotMatch(serializedEvents, /mock-password|auth-service-token/);
});

test("managed auth supports one silent refresh after the first 401", async () => {
  await resetAuthHarness();

  const firstToken = (await (await requestManagedToken()).json()).data.access_token;
  const firstAttempt = await fetch(
    `${baseUrl}/api/protected/resource?scenario=REJECT_FIRST_GENERATION`,
    { headers: { authorization: `Bearer ${firstToken}` } },
  );
  assert.equal(firstAttempt.status, 401);

  const refreshedToken = (await (await requestManagedToken()).json()).data.access_token;
  const secondAttempt = await fetch(
    `${baseUrl}/api/protected/resource?scenario=REJECT_FIRST_GENERATION`,
    { headers: { authorization: `Bearer ${refreshedToken}` } },
  );
  assert.equal(secondAttempt.status, 200);

  const stats = await (await fetch(`${baseUrl}/api/test-auth/stats`)).json();
  assert.equal(stats.loginCalls, 2);
  assert.equal(stats.protectedCalls, 2);
  assert.deepEqual(
    stats.events.map((event) => event.status),
    [200, 401, 200, 200],
  );
});

test("protected resource can return a persistent 401 for retry exhaustion", async () => {
  await resetAuthHarness();
  const token = (await (await requestManagedToken()).json()).data.access_token;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/api/protected/resource?scenario=ALWAYS_401`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 401);
  }

  const stats = await (await fetch(`${baseUrl}/api/test-auth/stats`)).json();
  assert.equal(stats.protectedCalls, 2);
});

test("auth service can fail twice with 503 and then recover", async () => {
  await resetAuthHarness();
  const statuses = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    statuses.push((await requestManagedToken("FAIL_TWICE_THEN_SUCCESS")).status);
  }
  assert.deepEqual(statuses, [503, 503, 200]);

  const stats = await (await fetch(`${baseUrl}/api/test-auth/stats`)).json();
  assert.equal(stats.loginCalls, 3);
});

test("OAuth2 client credentials requires Basic auth and returns a usable token", async () => {
  await resetAuthHarness();
  const tokenUrl = `${baseUrl}/api/oauth/token`;
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "orders.read",
  });

  const invalidResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  assert.equal(invalidResponse.status, 401);

  const basic = Buffer.from("svc-1:mock-client-secret").toString("base64");
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const token = await tokenResponse.json();
  assert.equal(tokenResponse.status, 200);
  assert.equal(token.token_type, "Bearer");
  assert.equal(token.scope, "orders.read");

  const protectedResponse = await fetch(`${baseUrl}/api/protected/resource`, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  assert.equal(protectedResponse.status, 200);
});
