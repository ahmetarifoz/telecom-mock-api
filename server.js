const http = require("node:http");
const { randomUUID } = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);

const customer = {
  customerId: "CUST-1001",
  customerType: "INDIVIDUAL",
  firstName: "Ahmet",
  lastName: "Yilmaz",
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

// Olusturulan siparisler sunucu yeniden baslayana kadar bellekte tutulur.
const orders = new Map();

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  response.end(JSON.stringify(data, null, 2));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Gecersiz JSON body");
    error.statusCode = 400;
    throw error;
  }
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

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { status: "UP" });
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
