const jsonResponse = (description, example) => ({
  description,
  content: {
    "application/json": {
      schema: { type: "object", additionalProperties: true },
      ...(example ? { example } : {}),
    },
  },
});

const jsonBody = (required, example) => ({
  required,
  content: {
    "application/json": {
      schema: { type: "object", additionalProperties: true },
      example,
    },
  },
});

const query = (name, example, description) => ({
  name,
  in: "query",
  required: false,
  description,
  schema: { type: "string", example },
});

const path = (name, example) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", example },
});

const ok = { 200: jsonResponse("Successful response") };
const created = { 201: jsonResponse("Resource created") };

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "Telecom Agent Mock API",
    version: "1.0.0",
    description:
      "Interactive API reference for plan change, billing dispute, internet outage, relocation and authentication test flows. Use `static-bearer-token` with BearerAuth for business endpoints.",
  },
  servers: [{ url: "/", description: "Current server" }],
  tags: [
    { name: "System" },
    { name: "Authentication" },
    { name: "Customers" },
    { name: "Plan Change" },
    { name: "Billing Dispute" },
    { name: "Internet Outage" },
    { name: "Relocation" },
    { name: "Tickets & Appointments" },
  ],
  security: [{ BearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        security: [],
        responses: { 200: jsonResponse("Service is healthy", { status: "UP" }) },
      },
    },
    "/api/test-auth/reset": {
      post: {
        tags: ["Authentication"],
        summary: "Reset auth test counters",
        security: [],
        responses: { 200: jsonResponse("Counters reset", { reset: true }) },
      },
    },
    "/api/test-auth/stats": {
      get: {
        tags: ["Authentication"],
        summary: "Read auth test counters and events",
        security: [],
        responses: ok,
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Get a managed-service Bearer token",
        security: [],
        parameters: [
          query("scenario", "SUCCESS", "SUCCESS, ALWAYS_503, ALWAYS_429, ALWAYS_408 or FAIL_TWICE_THEN_SUCCESS"),
        ],
        requestBody: jsonBody(true, {
          username: "toolflow-user",
          password: "mock-password",
        }),
        responses: {
          200: jsonResponse("Token issued", {
            data: {
              access_token: "auth-service-token-1",
              token_type: "Bearer",
              expires_in: 300,
            },
          }),
          401: jsonResponse("Invalid credentials"),
          503: jsonResponse("Temporary auth-service failure"),
        },
      },
    },
    "/api/oauth/token": {
      post: {
        tags: ["Authentication"],
        summary: "OAuth2 client credentials token",
        description: "Use HTTP Basic credentials `svc-1` / `mock-client-secret`.",
        security: [{ BasicAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                required: ["grant_type"],
                properties: {
                  grant_type: { type: "string", enum: ["client_credentials"] },
                  scope: { type: "string", example: "orders.read" },
                },
              },
            },
          },
        },
        responses: { 200: jsonResponse("Token issued"), 401: jsonResponse("Invalid client") },
      },
    },
    "/api/protected/resource": {
      get: {
        tags: ["Authentication"],
        summary: "Test a Bearer-protected downstream resource",
        parameters: [query("scenario", "SUCCESS", "SUCCESS, ALWAYS_401 or REJECT_FIRST_GENERATION")],
        responses: { 200: jsonResponse("Authorized"), 401: jsonResponse("Unauthorized") },
      },
    },
    "/api/protected/api-key": {
      get: {
        tags: ["Authentication"],
        summary: "Test an API-key-protected resource",
        security: [{ ApiKeyAuth: [] }],
        responses: { 200: jsonResponse("Authorized"), 401: jsonResponse("Unauthorized") },
      },
    },
    "/api/customers/search": {
      post: {
        tags: ["Customers"],
        summary: "Search customers by MSISDN",
        requestBody: jsonBody(true, { msisdn: "905551112233" }),
        responses: ok,
      },
    },
    "/api/customers/{customerId}": {
      get: {
        tags: ["Customers"],
        summary: "Get customer details",
        parameters: [path("customerId", "CUST-1001")],
        responses: { ...ok, 404: jsonResponse("Customer not found") },
      },
    },
    "/api/billing-accounts": {
      get: {
        tags: ["Customers"],
        summary: "List billing accounts",
        parameters: [query("customerId", "CUST-1001")],
        responses: ok,
      },
    },
    "/api/subscriptions": {
      get: {
        tags: ["Customers"],
        summary: "List mobile subscriptions",
        parameters: [query("billingAccountId", "BA-1001")],
        responses: ok,
      },
    },
    "/api/change-plan/eligibility": {
      post: {
        tags: ["Plan Change"],
        summary: "Check plan-change eligibility",
        requestBody: jsonBody(true, {
          customerId: "CUST-1001",
          billingAccountId: "BA-1001",
          subscriptionId: "SUB-1001",
          currentOfferId: "OFFER-10GB",
          channel: "WEB",
        }),
        responses: ok,
      },
    },
    "/api/product-offerings": {
      get: { tags: ["Plan Change"], summary: "List product offers", responses: ok },
    },
    "/api/compatibility-check": {
      post: {
        tags: ["Plan Change"],
        summary: "Check offer compatibility",
        requestBody: jsonBody(true, {
          customerId: "CUST-1001",
          subscriptionId: "SUB-1001",
          currentOfferId: "OFFER-10GB",
          targetOfferId: "OFFER-20GB",
        }),
        responses: ok,
      },
    },
    "/api/orders/validate": {
      post: {
        tags: ["Plan Change"],
        summary: "Validate a plan-change order",
        requestBody: jsonBody(true, {
          customerId: "CUST-1001",
          billingAccountId: "BA-1001",
          subscriptionId: "SUB-1001",
          eligibilityId: "ELG-TEST",
          action: "CHANGE_OFFER",
          currentOfferId: "OFFER-10GB",
          targetOfferId: "OFFER-20GB",
        }),
        responses: ok,
      },
    },
    "/api/orders": {
      post: {
        tags: ["Plan Change"],
        summary: "Create a product order",
        requestBody: jsonBody(true, {
          externalReferenceId: "EXT-SWAGGER-1",
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
        responses: created,
      },
    },
    "/api/orders/{orderId}": {
      get: {
        tags: ["Plan Change"],
        summary: "Get product order status",
        parameters: [path("orderId", "ORD-created-id")],
        responses: { ...ok, 404: jsonResponse("Order not found") },
      },
    },
    "/api/products": {
      get: {
        tags: ["Billing Dispute"],
        summary: "List active customer products",
        parameters: [query("customerId", "CUST-1001")],
        responses: ok,
      },
    },
    "/api/usage-records": {
      get: {
        tags: ["Billing Dispute"],
        summary: "List rated usage records",
        parameters: [
          query("subscriptionId", "SUB-1001"),
          query("period", "2026-07", "Billing period in YYYY-MM format"),
        ],
        responses: ok,
      },
    },
    "/api/customer-bills": {
      get: {
        tags: ["Billing Dispute"],
        summary: "List customer bills",
        parameters: [query("billingAccountId", "BA-1001")],
        responses: ok,
      },
    },
    "/api/customer-bills/{billId}": {
      get: {
        tags: ["Billing Dispute"],
        summary: "Get a customer bill",
        parameters: [path("billId", "BILL-2026-07-1001")],
        responses: { ...ok, 404: jsonResponse("Bill not found") },
      },
    },
    "/api/charges/validate": {
      post: {
        tags: ["Billing Dispute"],
        summary: "Validate correlated bill charges",
        requestBody: jsonBody(true, { billId: "BILL-2026-07-1001" }),
        responses: { ...ok, 404: jsonResponse("Bill not found") },
      },
    },
    "/api/services": {
      get: {
        tags: ["Internet Outage"],
        summary: "List customer services",
        parameters: [query("customerId", "CUST-1001")],
        responses: ok,
      },
    },
    "/api/service-problems": {
      get: {
        tags: ["Internet Outage"],
        summary: "Check known service problems",
        parameters: [
          query("serviceId", "SERVICE-FTTH-1001"),
          query("scenario", "KNOWN_OUTAGE", "Use KNOWN_OUTAGE to return a mass outage"),
        ],
        responses: ok,
      },
    },
    "/api/service-tests": {
      post: {
        tags: ["Internet Outage"],
        summary: "Run a remote service test",
        requestBody: jsonBody(true, {
          serviceId: "SERVICE-FTTH-1001",
          testType: "CONNECTIVITY",
        }),
        responses: { ...ok, 404: jsonResponse("Service not found") },
      },
    },
    "/api/trouble-tickets": {
      post: {
        tags: ["Tickets & Appointments"],
        summary: "Create a billing-dispute or service-incident ticket",
        requestBody: jsonBody(true, {
          customerId: "CUST-1001",
          type: "BILLING_DISPUTE",
          description: "Duplicate roaming charge",
          billId: "BILL-2026-07-1001",
          disputedAmount: 450,
          evidence: ["BI-4", "BI-5"],
        }),
        responses: created,
      },
    },
    "/api/trouble-tickets/{ticketId}": {
      get: {
        tags: ["Tickets & Appointments"],
        summary: "Get trouble ticket status",
        parameters: [path("ticketId", "TT-created-id")],
        responses: { ...ok, 404: jsonResponse("Ticket not found") },
      },
    },
    "/api/geographic-addresses/validate": {
      post: {
        tags: ["Relocation"],
        summary: "Validate and normalize a relocation address",
        requestBody: jsonBody(true, {
          city: "Istanbul",
          district: "Kadikoy",
          postalCode: "34718",
          addressLine1: "Example Street 1",
        }),
        responses: ok,
      },
    },
    "/api/service-qualifications": {
      post: {
        tags: ["Relocation"],
        summary: "Qualify fixed internet service at an address",
        requestBody: jsonBody(true, {
          addressId: "ADDR-created-id",
          serviceType: "FIXED_INTERNET",
        }),
        responses: { ...ok, 404: jsonResponse("Address not found") },
      },
    },
    "/api/relocation-offers": {
      get: {
        tags: ["Relocation"],
        summary: "List offers for a qualification result",
        parameters: [query("qualificationId", "QUAL-created-id")],
        responses: { ...ok, 404: jsonResponse("Qualification not found") },
      },
    },
    "/api/quotes": {
      post: {
        tags: ["Relocation"],
        summary: "Create a relocation quote",
        requestBody: jsonBody(true, {
          customerId: "CUST-1001",
          qualificationId: "QUAL-created-id",
          offerId: "HOME-FIBER-100",
        }),
        responses: { ...created, 409: jsonResponse("Offer not qualified") },
      },
    },
    "/api/relocation-orders": {
      post: {
        tags: ["Relocation"],
        summary: "Create a confirmed relocation order",
        requestBody: jsonBody(true, {
          externalReferenceId: "EXT-RELOC-1",
          customerId: "CUST-1001",
          subscriptionId: "SUB-HOME-1001",
          quoteId: "QUOTE-created-id",
          userConfirmed: true,
        }),
        responses: { ...created, 409: jsonResponse("User confirmation required") },
      },
    },
    "/api/appointment-slots": {
      get: {
        tags: ["Tickets & Appointments"],
        summary: "List appointment slots",
        parameters: [query("relatedEntityId", "SERVICE-FTTH-1001")],
        responses: ok,
      },
    },
    "/api/appointments": {
      post: {
        tags: ["Tickets & Appointments"],
        summary: "Book a confirmed appointment",
        requestBody: jsonBody(true, {
          customerId: "CUST-1001",
          relatedEntityType: "SERVICE",
          relatedEntityId: "SERVICE-FTTH-1001",
          slotId: "SLOT-2026-08-07-AM",
          userConfirmed: true,
        }),
        responses: { ...created, 409: jsonResponse("Appointment unavailable or confirmation required") },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description: "Use `static-bearer-token` for the built-in fixture.",
      },
      BasicAuth: {
        type: "http",
        scheme: "basic",
        description: "Use `svc-1` / `mock-client-secret`.",
      },
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "Use `static-api-key`.",
      },
    },
  },
};
