const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const DOCS_PAGE = readFileSync(join(__dirname, "index.html"), "utf8");
const AGENT_GUIDE = readFileSync(join(__dirname, "AGENT_API_CHAINS.md"), "utf8");

const customer = {
  customerId: "CUST-1001",
  customerType: "INDIVIDUAL",
  firstName: "John",
  lastName: "Smith",
  status: "ACTIVE",
  msisdn: "905551112233",
};

const billingAccount = {
  billingAccountId: "BA-1001",
  customerId: customer.customerId,
  status: "ACTIVE",
  currency: "TRY",
  outstandingBalance: 149.9,
  creditClass: "A",
};

const subscription = {
  subscriptionId: "SUB-1001",
  billingAccountId: billingAccount.billingAccountId,
  msisdn: customer.msisdn,
  status: "ACTIVE",
  currentOfferId: "OFFER-10GB",
  commitmentEndDate: "2026-12-31",
  serviceType: "MOBILE_POSTPAID",
};

const offers = [
  {
    offerId: "OFFER-10GB",
    name: "Avantaj 10 GB",
    monthlyPrice: 350,
    currency: "TRY",
    internetQuotaGb: 10,
    voiceMinutes: 1000,
    smsCount: 250,
    commitmentMonths: 12,
  },
  {
    offerId: "OFFER-20GB",
    name: "Avantaj 20 GB",
    monthlyPrice: 450,
    currency: "TRY",
    internetQuotaGb: 20,
    voiceMinutes: 2000,
    smsCount: 500,
    commitmentMonths: 12,
  },
  {
    offerId: "OFFER-UNLIMITED",
    name: "Sinirsiz Plus",
    monthlyPrice: 700,
    currency: "TRY",
    internetQuotaGb: null,
    voiceMinutes: null,
    smsCount: null,
    commitmentMonths: 12,
  },
];

const activeProducts = [
  {
    productId: subscription.subscriptionId,
    productType: "MOBILE_TARIFF",
    offerId: subscription.currentOfferId,
    name: "Avantaj 10 GB",
    status: "ACTIVE",
    activationDate: "2026-01-01T00:00:00.000Z",
    internetQuotaGb: 10,
  },
  {
    productId: "PROD-ROAMING-1001",
    productType: "ROAMING_PACKAGE",
    offerId: "OFFER-ROAMING-1GB",
    name: "Yurt Disi 1 GB",
    status: "ACTIVE",
    activationDate: "2026-07-15T09:00:00.000Z",
    internetQuotaGb: 1,
  },
  {
    productId: "PROD-DISCOUNT-1001",
    productType: "DISCOUNT",
    offerId: "OFFER-LOYALTY-100",
    name: "Sadakat Indirimi",
    status: "ACTIVE",
    activationDate: "2026-01-01T00:00:00.000Z",
    monthlyDiscount: 100,
    currency: "TRY",
  },
];

const usageRecords = [
  {
    usageId: "USG-DATA-1001",
    subscriptionId: subscription.subscriptionId,
    usageType: "DATA",
    startDateTime: "2026-07-01T00:00:00.000Z",
    endDateTime: "2026-07-31T23:59:59.000Z",
    quantity: 14,
    unit: "GB",
    rated: true,
    ratedAmount: 400,
    currency: "TRY",
  },
  {
    usageId: "USG-ROAMING-1001",
    subscriptionId: subscription.subscriptionId,
    usageType: "ROAMING_DATA",
    startDateTime: "2026-07-10T12:30:00.000Z",
    endDateTime: "2026-07-10T13:10:00.000Z",
    quantity: 0.6,
    unit: "GB",
    country: "DE",
    rated: true,
    ratedAmount: 450,
    currency: "TRY",
  },
];

const customerBill = {
  billId: "BILL-2026-07-1001",
  billingAccountId: billingAccount.billingAccountId,
  billingPeriod: { startDate: "2026-07-01", endDate: "2026-07-31" },
  issueDate: "2026-08-01",
  dueDate: "2026-08-15",
  state: "ISSUED",
  amountDue: 1800,
  currency: "TRY",
  billItems: [
    { id: "BI-1", type: "RECURRING", description: "Avantaj 10 GB", amount: 350 },
    { id: "BI-2", type: "USAGE", description: "10 GB kota asimi", amount: 400, usageId: "USG-DATA-1001" },
    { id: "BI-3", type: "ONE_TIME", description: "Yurt Disi 1 GB paketi", amount: 250, productId: "PROD-ROAMING-1001" },
    { id: "BI-4", type: "USAGE", description: "Yurt disi internet kullanimi", amount: 450, usageId: "USG-ROAMING-1001" },
    { id: "BI-5", type: "USAGE", description: "Yurt disi internet kullanimi", amount: 450, usageId: "USG-ROAMING-1001" },
    { id: "BI-6", type: "DISCOUNT", description: "Sadakat indirimi", amount: -100, productId: "PROD-DISCOUNT-1001" },
  ],
};

const internetService = {
  serviceId: "SERVICE-FTTH-1001",
  customerId: customer.customerId,
  subscriptionId: "SUB-HOME-1001",
  name: "Evde Fiber 100 Mbps",
  serviceType: "FIXED_INTERNET",
  technology: "FTTH",
  status: "ACTIVE",
  addressId: "ADDR-CURRENT-1001",
};

const appointmentSlots = [
  { slotId: "SLOT-2026-08-07-AM", start: "2026-08-07T09:00:00+03:00", end: "2026-08-07T12:00:00+03:00" },
  { slotId: "SLOT-2026-08-07-PM", start: "2026-08-07T13:00:00+03:00", end: "2026-08-07T17:00:00+03:00" },
];

// Olusturulan siparisler sunucu yeniden baslayana kadar bellekte tutulur.
const orders = new Map();
const tickets = new Map();
const addresses = new Map();
const qualifications = new Map();
const quotes = new Map();
const relocationOrders = new Map();
const appointments = new Map();

const AUTH_FIXTURES = {
  username: "toolflow-user",
  password: "mock-password",
  staticBearerToken: "static-bearer-token",
  callerToken: "caller-access-token",
  apiKey: "static-api-key",
  oauthClientId: "svc-1",
  oauthClientSecret: "mock-client-secret",
};

const authTestState = {
  loginCalls: 0,
  oauthTokenCalls: 0,
  protectedCalls: 0,
  apiKeyCalls: 0,
  events: [],
};

function resetAuthTestState() {
  authTestState.loginCalls = 0;
  authTestState.oauthTokenCalls = 0;
  authTestState.protectedCalls = 0;
  authTestState.apiKeyCalls = 0;
  authTestState.events = [];
}

function recordAuthEvent(kind, status, details = {}) {
  authTestState.events.push({
    kind,
    status,
    ...details,
    timestamp: new Date().toISOString(),
  });
  if (authTestState.events.length > 25) authTestState.events.shift();
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  response.end(JSON.stringify(data, null, 2));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  response.end(html);
}

function sendMarkdown(response, markdown) {
  response.writeHead(200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "no-cache",
    "Content-Disposition": 'inline; filename="AGENT_API_CHAINS.md"',
  });
  response.end(markdown);
}

async function readJson(request) {
  const bodyText = await readText(request);
  if (!bodyText) return {};

  try {
    return JSON.parse(bodyText);
  } catch {
    const error = new Error("Gecersiz JSON body");
    error.statusCode = 400;
    throw error;
  }
}

async function readText(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function requireFields(body, fields) {
  const missingFields = fields.filter(
    (field) => body[field] === undefined || body[field] === null || body[field] === "",
  );
  if (missingFields.length > 0) {
    const error = new Error(`Zorunlu alanlar eksik: ${missingFields.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
}

function routeMatches(pathname, pattern) {
  const match = pathname.match(pattern);
  return match ? match.slice(1).map(decodeURIComponent) : null;
}

async function handleRequest(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;

  if (request.method === "GET" && (pathname === "/" || pathname === "/docs")) {
    sendHtml(response, 200, DOCS_PAGE);
    return;
  }

  if (request.method === "GET" && pathname === "/agent-guide.md") {
    sendMarkdown(response, AGENT_GUIDE);
    return;
  }

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { status: "UP" });
    return;
  }

  // Tool Flow auth test harness. Counters never store credentials or tokens.
  if (request.method === "POST" && pathname === "/api/test-auth/reset") {
    resetAuthTestState();
    sendJson(response, 200, { reset: true });
    return;
  }

  if (request.method === "GET" && pathname === "/api/test-auth/stats") {
    sendJson(response, 200, {
      loginCalls: authTestState.loginCalls,
      oauthTokenCalls: authTestState.oauthTokenCalls,
      protectedCalls: authTestState.protectedCalls,
      apiKeyCalls: authTestState.apiKeyCalls,
      events: authTestState.events,
    });
    return;
  }

  // Managed auth-service provider. Token path: data.access_token
  if (request.method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(request);
    const scenario = searchParams.get("scenario") || "SUCCESS";
    authTestState.loginCalls += 1;

    if (body.username !== AUTH_FIXTURES.username || body.password !== AUTH_FIXTURES.password) {
      recordAuthEvent("AUTH_SERVICE", 401, { scenario });
      sendJson(response, 401, { error: "INVALID_CREDENTIALS" });
      return;
    }

    const temporaryStatus =
      scenario === "ALWAYS_429" ? 429 : scenario === "ALWAYS_408" ? 408 : 503;
    const temporaryFailure =
      scenario === "ALWAYS_503" ||
      scenario === "ALWAYS_429" ||
      scenario === "ALWAYS_408" ||
      (scenario === "FAIL_TWICE_THEN_SUCCESS" && authTestState.loginCalls <= 2);
    if (temporaryFailure) {
      recordAuthEvent("AUTH_SERVICE", temporaryStatus, { scenario });
      sendJson(response, temporaryStatus, {
        error: "AUTH_SERVICE_TEMPORARILY_UNAVAILABLE",
        retryable: true,
      });
      return;
    }

    const accessToken = `auth-service-token-${authTestState.loginCalls}`;
    recordAuthEvent("AUTH_SERVICE", 200, { scenario });
    sendJson(response, 200, {
      data: {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 300,
      },
    });
    return;
  }

  // OAuth2 client_credentials token endpoint. Expects HTTP Basic client auth.
  if (request.method === "POST" && pathname === "/api/oauth/token") {
    const form = new URLSearchParams(await readText(request));
    const expectedBasic = Buffer.from(
      `${AUTH_FIXTURES.oauthClientId}:${AUTH_FIXTURES.oauthClientSecret}`,
    ).toString("base64");
    const authorization = request.headers.authorization || "";
    authTestState.oauthTokenCalls += 1;

    if (
      authorization !== `Basic ${expectedBasic}` ||
      form.get("grant_type") !== "client_credentials"
    ) {
      recordAuthEvent("OAUTH_TOKEN", 401, { clientAuthMethod: "basic" });
      sendJson(response, 401, { error: "invalid_client" });
      return;
    }

    recordAuthEvent("OAUTH_TOKEN", 200, { clientAuthMethod: "basic" });
    sendJson(response, 200, {
      access_token: `oauth-access-token-${authTestState.oauthTokenCalls}`,
      token_type: "Bearer",
      expires_in: 300,
      scope: form.get("scope") || "orders.read",
    });
    return;
  }

  // Protected downstream for static, caller, managed-service and OAuth tokens.
  if (request.method === "GET" && pathname === "/api/protected/resource") {
    const scenario = searchParams.get("scenario") || "SUCCESS";
    const authorization = request.headers.authorization || "";
    const bearerToken = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    authTestState.protectedCalls += 1;

    const knownToken =
      bearerToken === AUTH_FIXTURES.staticBearerToken ||
      bearerToken === AUTH_FIXTURES.callerToken ||
      bearerToken?.startsWith("auth-service-token-") ||
      bearerToken?.startsWith("oauth-access-token-");
    const rejectFirstGeneration =
      scenario === "REJECT_FIRST_GENERATION" && bearerToken === "auth-service-token-1";
    const authorized = knownToken && scenario !== "ALWAYS_401" && !rejectFirstGeneration;

    if (!authorized) {
      recordAuthEvent("PROTECTED_RESOURCE", 401, {
        scenario,
        authScheme: bearerToken ? "Bearer" : "NONE",
      });
      sendJson(response, 401, { error: "UNAUTHORIZED" });
      return;
    }

    recordAuthEvent("PROTECTED_RESOURCE", 200, { scenario, authScheme: "Bearer" });
    sendJson(response, 200, {
      authorized: true,
      authScheme: "Bearer",
      subject: "toolflow-test-user",
    });
    return;
  }

  // Separate endpoint verifies that API keys use X-API-Key, not Authorization.
  if (request.method === "GET" && pathname === "/api/protected/api-key") {
    authTestState.apiKeyCalls += 1;
    const authorized = request.headers["x-api-key"] === AUTH_FIXTURES.apiKey;
    recordAuthEvent("API_KEY_RESOURCE", authorized ? 200 : 401, {
      authScheme: authorized ? "X-API-Key" : "NONE",
    });
    sendJson(
      response,
      authorized ? 200 : 401,
      authorized
        ? { authorized: true, authScheme: "X-API-Key" }
        : { error: "UNAUTHORIZED" },
    );
    return;
  }

  // 1. Customer Search
  if (request.method === "POST" && pathname === "/api/customers/search") {
    const body = await readJson(request);
    requireFields(body, ["msisdn"]);
    sendJson(response, 200, {
      customers: body.msisdn === customer.msisdn ? [customer] : [],
    });
    return;
  }

  // 2. Customer Details
  const customerMatch = routeMatches(pathname, /^\/api\/customers\/([^/]+)$/);
  if (request.method === "GET" && customerMatch) {
    if (customerMatch[0] !== customer.customerId) {
      sendJson(response, 404, { error: "CUSTOMER_NOT_FOUND", message: "Musteri bulunamadi" });
      return;
    }
    sendJson(response, 200, {
      customerId: customer.customerId,
      status: customer.status,
      segment: "PREMIUM",
      riskLevel: "LOW",
      identityVerified: true,
      billingAccountIds: [billingAccount.billingAccountId],
    });
    return;
  }

  // 3. Billing Account
  if (request.method === "GET" && pathname === "/api/billing-accounts") {
    const customerId = searchParams.get("customerId");
    sendJson(response, 200, {
      billingAccounts: !customerId || customerId === customer.customerId ? [billingAccount] : [],
    });
    return;
  }

  // 4. Mobile Subscription
  if (request.method === "GET" && pathname === "/api/subscriptions") {
    const billingAccountId = searchParams.get("billingAccountId");
    sendJson(response, 200, {
      subscriptions:
        !billingAccountId || billingAccountId === billingAccount.billingAccountId
          ? [subscription]
          : [],
    });
    return;
  }

  // Bill Dispute - TMF637 Product Inventory
  if (request.method === "GET" && pathname === "/api/products") {
    const customerId = searchParams.get("customerId");
    sendJson(response, 200, {
      products: !customerId || customerId === customer.customerId ? activeProducts : [],
    });
    return;
  }

  // Bill Dispute - TMF635 Usage Management
  if (request.method === "GET" && pathname === "/api/usage-records") {
    const subscriptionId = searchParams.get("subscriptionId");
    const period = searchParams.get("period");
    const matchesSubscription = !subscriptionId || subscriptionId === subscription.subscriptionId;
    const matchesPeriod = !period || period === "2026-07";
    sendJson(response, 200, {
      usageRecords: matchesSubscription && matchesPeriod ? usageRecords : [],
    });
    return;
  }

  // Bill Dispute - TMF678 Customer Bill
  if (request.method === "GET" && pathname === "/api/customer-bills") {
    const billingAccountId = searchParams.get("billingAccountId");
    sendJson(response, 200, {
      bills:
        !billingAccountId || billingAccountId === billingAccount.billingAccountId
          ? [customerBill]
          : [],
    });
    return;
  }

  const billMatch = routeMatches(pathname, /^\/api\/customer-bills\/([^/]+)$/);
  if (request.method === "GET" && billMatch) {
    if (billMatch[0] !== customerBill.billId) {
      sendJson(response, 404, { error: "BILL_NOT_FOUND", message: "Fatura bulunamadi" });
      return;
    }
    sendJson(response, 200, customerBill);
    return;
  }

  // Bill Dispute - correlated charge checks
  if (request.method === "POST" && pathname === "/api/charges/validate") {
    const body = await readJson(request);
    requireFields(body, ["billId"]);
    if (body.billId !== customerBill.billId) {
      sendJson(response, 404, { error: "BILL_NOT_FOUND", message: "Fatura bulunamadi" });
      return;
    }
    sendJson(response, 200, {
      billId: customerBill.billId,
      valid: false,
      recommendedDisputeAmount: 450,
      currency: "TRY",
      checks: [
        {
          code: "ROAMING_PACKAGE_AT_USAGE_TIME",
          passed: false,
          chargeValid: true,
          evidence: {
            usageDate: "2026-07-10T12:30:00.000Z",
            packageActivationDate: "2026-07-15T09:00:00.000Z",
          },
          message: "Roaming paketi kullanimdan sonra aktif oldugu icin ilk kullanim paket kapsaminda degildir.",
        },
        {
          code: "DUPLICATE_USAGE_CHARGE",
          passed: false,
          chargeValid: false,
          affectedBillItemIds: ["BI-4", "BI-5"],
          usageId: "USG-ROAMING-1001",
          duplicateAmount: 450,
          message: "Ayni roaming kullanimi iki kez ucretlendirilmistir.",
        },
        {
          code: "PACKAGE_QUOTA_EXCEEDED",
          passed: true,
          evidence: { quotaGb: 10, usedGb: 14, excessGb: 4 },
          message: "Internet paket kotasi 4 GB asilmistir.",
        },
        {
          code: "DISCOUNT_APPLIED",
          passed: true,
          evidence: { expectedAmount: -100, billedAmount: -100 },
          message: "Sadakat indirimi faturaya uygulanmistir.",
        },
        {
          code: "BILL_TOTAL_MATCHES_ITEMS",
          passed: true,
          evidence: { itemTotal: 1800, billTotal: 1800 },
          message: "Fatura toplami kalemlerin toplamiyla eslesmektedir.",
        },
      ],
    });
    return;
  }

  // Internet Outage - TMF638 Service Inventory
  if (request.method === "GET" && pathname === "/api/services") {
    const customerId = searchParams.get("customerId");
    sendJson(response, 200, {
      services: !customerId || customerId === customer.customerId ? [internetService] : [],
    });
    return;
  }

  // Internet Outage - TMF656 Service Problem
  if (request.method === "GET" && pathname === "/api/service-problems") {
    const serviceId = searchParams.get("serviceId");
    const scenario = searchParams.get("scenario");
    const knownOutage = {
      problemId: "SP-MASS-1001",
      category: "MASS_OUTAGE",
      status: "IN_PROGRESS",
      affectedServiceIds: [internetService.serviceId],
      startedAt: "2026-08-06T08:00:00.000Z",
      expectedResolutionAt: "2026-08-06T14:00:00.000Z",
      recommendedAction: "DO_NOT_CREATE_INDIVIDUAL_TICKET",
    };
    sendJson(response, 200, {
      serviceProblems:
        serviceId === internetService.serviceId && scenario === "KNOWN_OUTAGE"
          ? [knownOutage]
          : [],
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/service-tests") {
    const body = await readJson(request);
    requireFields(body, ["serviceId", "testType"]);
    if (body.serviceId !== internetService.serviceId) {
      sendJson(response, 404, { error: "SERVICE_NOT_FOUND", message: "Servis bulunamadi" });
      return;
    }
    sendJson(response, 200, {
      testId: `TEST-${randomUUID().slice(0, 8)}`,
      serviceId: body.serviceId,
      testType: body.testType,
      result: "FAILED",
      startedAt: new Date().toISOString(),
      diagnostics: {
        ontReachable: false,
        opticalSignalDbm: null,
        lastSeenAt: "2026-08-06T08:02:00.000Z",
        probableCause: "OPTICAL_SIGNAL_LOSS",
      },
      recommendedAction: "CREATE_INDIVIDUAL_TICKET_AND_APPOINTMENT",
    });
    return;
  }

  // Shared TMF621 Trouble Ticket endpoint for bill and outage flows.
  if (request.method === "POST" && pathname === "/api/trouble-tickets") {
    const body = await readJson(request);
    requireFields(body, ["customerId", "type", "description"]);
    if (body.customerId !== customer.customerId) {
      sendJson(response, 404, { error: "CUSTOMER_NOT_FOUND", message: "Musteri bulunamadi" });
      return;
    }
    if (!['BILLING_DISPUTE', 'SERVICE_INCIDENT'].includes(body.type)) {
      sendJson(response, 400, { error: "INVALID_TICKET_TYPE", message: "Ticket tipi gecersiz" });
      return;
    }
    if (body.type === "BILLING_DISPUTE" && !body.billId) {
      sendJson(response, 400, { error: "BILL_ID_REQUIRED", message: "Fatura itirazi icin billId zorunludur" });
      return;
    }
    if (body.type === "SERVICE_INCIDENT" && !body.serviceId) {
      sendJson(response, 400, { error: "SERVICE_ID_REQUIRED", message: "Ariza icin serviceId zorunludur" });
      return;
    }
    const ticketId = `TT-${randomUUID().slice(0, 8)}`;
    const ticket = {
      ticketId,
      customerId: body.customerId,
      type: body.type,
      status: "OPEN",
      description: body.description,
      billId: body.billId || null,
      serviceId: body.serviceId || null,
      disputedAmount: body.disputedAmount || null,
      evidence: Array.isArray(body.evidence) ? body.evidence : [],
      createdAt: new Date().toISOString(),
    };
    tickets.set(ticketId, ticket);
    sendJson(response, 201, ticket);
    return;
  }

  const ticketMatch = routeMatches(pathname, /^\/api\/trouble-tickets\/([^/]+)$/);
  if (request.method === "GET" && ticketMatch) {
    const ticket = tickets.get(ticketMatch[0]);
    if (!ticket) {
      sendJson(response, 404, { error: "TICKET_NOT_FOUND", message: "Ticket bulunamadi" });
      return;
    }
    sendJson(response, 200, ticket);
    return;
  }

  // Relocation - TMF673 Geographic Address
  if (request.method === "POST" && pathname === "/api/geographic-addresses/validate") {
    const body = await readJson(request);
    requireFields(body, ["city", "district", "postalCode", "addressLine1"]);
    const addressId = `ADDR-${randomUUID().slice(0, 8)}`;
    const address = {
      addressId,
      validationStatus: "VALIDATED",
      normalizedAddress: {
        city: String(body.city).toUpperCase(),
        district: String(body.district).toUpperCase(),
        postalCode: String(body.postalCode),
        addressLine1: body.addressLine1,
      },
    };
    addresses.set(addressId, address);
    sendJson(response, 200, address);
    return;
  }

  // Relocation - TMF645 Service Qualification
  if (request.method === "POST" && pathname === "/api/service-qualifications") {
    const body = await readJson(request);
    requireFields(body, ["addressId", "serviceType"]);
    const address = addresses.get(body.addressId);
    if (!address) {
      sendJson(response, 404, { error: "ADDRESS_NOT_FOUND", message: "Adres bulunamadi" });
      return;
    }
    const postalCode = address.normalizedAddress.postalCode;
    const technology = postalCode === "34718" ? "FTTH" : postalCode === "06420" ? "DSL" : null;
    const qualificationId = `QUAL-${randomUUID().slice(0, 8)}`;
    const qualification = {
      qualificationId,
      addressId: body.addressId,
      serviceType: body.serviceType,
      qualified: Boolean(technology),
      technology,
      maxDownloadMbps: technology === "FTTH" ? 1000 : technology === "DSL" ? 35 : 0,
      alternativeTechnology: technology === "DSL" ? "DSL" : null,
      reason: technology ? null : "NO_FIXED_SERVICE_COVERAGE",
    };
    qualifications.set(qualificationId, qualification);
    sendJson(response, 200, qualification);
    return;
  }

  if (request.method === "GET" && pathname === "/api/relocation-offers") {
    const qualificationId = searchParams.get("qualificationId");
    const qualification = qualifications.get(qualificationId);
    if (!qualification) {
      sendJson(response, 404, { error: "QUALIFICATION_NOT_FOUND", message: "Uygunluk sonucu bulunamadi" });
      return;
    }
    const relocationOffers = qualification.qualified
      ? qualification.technology === "FTTH"
        ? [{ offerId: "HOME-FIBER-100", name: "Fiber 100 Mbps", monthlyPrice: 600, installationFee: 250, currency: "TRY" }]
        : [{ offerId: "HOME-DSL-35", name: "DSL 35 Mbps", monthlyPrice: 450, installationFee: 200, currency: "TRY" }]
      : [];
    sendJson(response, 200, { qualificationId, offers: relocationOffers });
    return;
  }

  // Relocation - TMF648 Quote
  if (request.method === "POST" && pathname === "/api/quotes") {
    const body = await readJson(request);
    requireFields(body, ["customerId", "qualificationId", "offerId"]);
    const qualification = qualifications.get(body.qualificationId);
    const allowedOfferId = qualification?.technology === "FTTH" ? "HOME-FIBER-100" : "HOME-DSL-35";
    if (!qualification?.qualified || body.offerId !== allowedOfferId) {
      sendJson(response, 409, { error: "OFFER_NOT_QUALIFIED", message: "Teklif bu adres icin uygun degildir" });
      return;
    }
    const quoteId = `QUOTE-${randomUUID().slice(0, 8)}`;
    const quote = {
      quoteId,
      customerId: body.customerId,
      qualificationId: body.qualificationId,
      offerId: body.offerId,
      status: "APPROVED",
      monthlyPrice: qualification.technology === "FTTH" ? 600 : 450,
      installationFee: qualification.technology === "FTTH" ? 250 : 200,
      currency: "TRY",
      validForSeconds: 900,
      createdAt: new Date().toISOString(),
    };
    quotes.set(quoteId, quote);
    sendJson(response, 201, quote);
    return;
  }

  // Relocation - TMF622 Product Ordering. Explicit confirmation is mandatory.
  if (request.method === "POST" && pathname === "/api/relocation-orders") {
    const body = await readJson(request);
    requireFields(body, ["externalReferenceId", "customerId", "subscriptionId", "quoteId", "userConfirmed"]);
    const quote = quotes.get(body.quoteId);
    if (!quote || quote.customerId !== body.customerId) {
      sendJson(response, 404, { error: "QUOTE_NOT_FOUND", message: "Teklif bulunamadi" });
      return;
    }
    if (body.userConfirmed !== true) {
      sendJson(response, 409, { error: "USER_CONFIRMATION_REQUIRED", message: "Siparis icin kullanici onayi gereklidir" });
      return;
    }
    const orderId = `RELOC-${randomUUID().slice(0, 8)}`;
    const relocationOrder = {
      orderId,
      externalReferenceId: body.externalReferenceId,
      customerId: body.customerId,
      subscriptionId: body.subscriptionId,
      quoteId: body.quoteId,
      status: "ACKNOWLEDGED",
      createdAt: new Date().toISOString(),
    };
    relocationOrders.set(orderId, relocationOrder);
    sendJson(response, 201, relocationOrder);
    return;
  }

  // TMF646 Appointment is shared by outage and relocation flows.
  if (request.method === "GET" && pathname === "/api/appointment-slots") {
    const relatedEntityId = searchParams.get("relatedEntityId");
    const exists =
      relatedEntityId === internetService.serviceId || relocationOrders.has(relatedEntityId);
    sendJson(response, 200, { slots: exists ? appointmentSlots : [] });
    return;
  }

  if (request.method === "POST" && pathname === "/api/appointments") {
    const body = await readJson(request);
    requireFields(body, ["customerId", "relatedEntityType", "relatedEntityId", "slotId", "userConfirmed"]);
    const slot = appointmentSlots.find((item) => item.slotId === body.slotId);
    const relatedEntityExists =
      body.relatedEntityId === internetService.serviceId ||
      tickets.has(body.relatedEntityId) ||
      relocationOrders.has(body.relatedEntityId);
    if (!slot || !relatedEntityExists) {
      sendJson(response, 409, { error: "APPOINTMENT_NOT_AVAILABLE", message: "Randevu olusturulamadi" });
      return;
    }
    if (body.userConfirmed !== true) {
      sendJson(response, 409, { error: "USER_CONFIRMATION_REQUIRED", message: "Randevu icin kullanici onayi gereklidir" });
      return;
    }
    const appointmentId = `APT-${randomUUID().slice(0, 8)}`;
    const appointment = {
      appointmentId,
      customerId: body.customerId,
      relatedEntityType: body.relatedEntityType,
      relatedEntityId: body.relatedEntityId,
      status: "BOOKED",
      slot,
      createdAt: new Date().toISOString(),
    };
    appointments.set(appointmentId, appointment);
    sendJson(response, 201, appointment);
    return;
  }

  // 5. Change Plan Eligibility
  if (request.method === "POST" && pathname === "/api/change-plan/eligibility") {
    const body = await readJson(request);
    requireFields(body, [
      "customerId",
      "billingAccountId",
      "subscriptionId",
      "currentOfferId",
      "channel",
    ]);
    const eligible = body.customerId === customer.customerId;
    sendJson(response, 200, {
      eligible,
      eligibilityId: eligible ? `ELG-${randomUUID().slice(0, 8)}` : "",
      eligibleOfferIds: eligible ? ["OFFER-20GB", "OFFER-UNLIMITED"] : [],
      warnings: eligible
        ? [{ code: "COMMITMENT_RENEWED", message: "Yeni taahhut donemi baslayacaktir." }]
        : [],
      blockingReasons: eligible
        ? []
        : [{ code: "CUSTOMER_NOT_FOUND", message: "Musteri uygunluk kontrolunden gecemedi." }],
    });
    return;
  }

  // 6. Product Offerings
  if (request.method === "GET" && pathname === "/api/product-offerings") {
    sendJson(response, 200, { offers });
    return;
  }

  // 7. Compatibility Check
  if (request.method === "POST" && pathname === "/api/compatibility-check") {
    const body = await readJson(request);
    requireFields(body, ["customerId", "subscriptionId", "currentOfferId", "targetOfferId"]);
    const compatible = offers.some((offer) => offer.offerId === body.targetOfferId);
    sendJson(response, 200, {
      compatible,
      targetOfferId: body.targetOfferId,
      oneTimeCharges: compatible
        ? [{ type: "ACTIVATION_FEE", amount: 50, currency: "TRY" }]
        : [],
      removedProducts: [],
      requiredActions: compatible ? ["ACCEPT_NEW_COMMITMENT"] : [],
    });
    return;
  }

  // 8. Order Validation
  if (request.method === "POST" && pathname === "/api/orders/validate") {
    const body = await readJson(request);
    requireFields(body, [
      "customerId",
      "billingAccountId",
      "subscriptionId",
      "eligibilityId",
      "action",
      "currentOfferId",
      "targetOfferId",
    ]);
    const currentOffer = offers.find((offer) => offer.offerId === body.currentOfferId);
    const targetOffer = offers.find((offer) => offer.offerId === body.targetOfferId);
    const valid = body.action === "CHANGE_OFFER" && Boolean(currentOffer && targetOffer);
    const currentPrice = currentOffer?.monthlyPrice ?? 0;
    const newPrice = targetOffer?.monthlyPrice ?? 0;
    sendJson(response, 200, {
      valid,
      validationId: valid ? `VAL-${randomUUID().slice(0, 8)}` : "",
      priceSummary: {
        currentMonthlyPrice: currentPrice,
        newMonthlyPrice: newPrice,
        priceDifference: newPrice - currentPrice,
        currency: "TRY",
      },
      effectiveDate: new Date().toISOString().slice(0, 10),
      errors: valid ? [] : [{ code: "INVALID_OFFER", message: "Teklif veya aksiyon gecersiz." }],
      warnings: valid
        ? [{ code: "PRICE_CHANGE", message: "Aylik ucret degisecektir." }]
        : [],
    });
    return;
  }

  // 9. Product Order
  if (request.method === "POST" && pathname === "/api/orders") {
    const body = await readJson(request);
    requireFields(body, [
      "externalReferenceId",
      "customerId",
      "billingAccountId",
      "subscriptionId",
      "validationId",
      "channel",
      "orderItems",
    ]);
    if (!Array.isArray(body.orderItems) || body.orderItems.length === 0) {
      sendJson(response, 400, { error: "INVALID_ORDER_ITEMS", message: "orderItems bos olamaz" });
      return;
    }
    const orderId = `ORD-${randomUUID().slice(0, 8)}`;
    const createdAt = new Date();
    const targetOfferId = body.orderItems[0].targetOfferId;
    orders.set(orderId, { createdAt, targetOfferId });
    sendJson(response, 201, {
      orderId,
      status: "ACKNOWLEDGED",
      createdAt: createdAt.toISOString(),
      estimatedCompletionSeconds: 3,
    });
    return;
  }

  // 10. Order Status (3 saniye sonra COMPLETED doner.)
  const orderMatch = routeMatches(pathname, /^\/api\/orders\/([^/]+)$/);
  if (request.method === "GET" && orderMatch) {
    const orderId = orderMatch[0];
    const order = orders.get(orderId);
    if (!order) {
      sendJson(response, 404, { error: "ORDER_NOT_FOUND", message: "Siparis bulunamadi" });
      return;
    }
    const completed = Date.now() - order.createdAt.getTime() >= 3000;
    const activatedOffer = offers.find((offer) => offer.offerId === order.targetOfferId);
    sendJson(response, 200, {
      orderId,
      status: completed ? "COMPLETED" : "IN_PROGRESS",
      completedAt: completed ? new Date(order.createdAt.getTime() + 3000).toISOString() : null,
      activatedOffer: completed && activatedOffer
        ? { offerId: activatedOffer.offerId, name: activatedOffer.name }
        : null,
      error: null,
    });
    return;
  }

  sendJson(response, 404, { error: "NOT_FOUND", message: "Endpoint bulunamadi" });
}

function createServer() {
  return http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (!error.statusCode || error.statusCode >= 500) console.error(error);
      sendJson(response, error.statusCode || 500, {
        error: error.statusCode === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    });
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Mock API http://localhost:${PORT} adresinde calisiyor`);
  });
}

module.exports = { createServer };
