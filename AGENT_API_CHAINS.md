# Agent API Chain Quick Reference

Base URL: `http://localhost:3000` · JSON unless noted. Full contract: [`API.md`](./API.md).

All business API calls require `Authorization: Bearer <token>`. The header is omitted from repeated examples below. For a static test, use `Bearer static-bearer-token`; managed and OAuth tokens are described in the Auth Test Harness section.

## Fixtures

`msisdn=905551112233` · `customerId=CUST-1001` · `billingAccountId=BA-1001` · `subscriptionId=SUB-1001` · `serviceId=SERVICE-FTTH-1001`

## Rules

- Follow the chains; correlate IDs between responses.
- Send the Bearer token on every business API request. On `401`, follow the configured refresh policy at most once; never continue the business flow unauthenticated.
- Fields shown with concrete fixture values are examples. Always prefer IDs returned by the current flow; never invent IDs.
- Treat an empty collection as a valid `200` result, not as a transport error. Stop the flow when the required entity or offer is absent.
- Check decision fields such as `eligible`, `compatible`, `valid`, `qualified`, and `recommendedAction` before calling the next endpoint.
- Never create an order or appointment without explicit user approval (`userConfirmed:true`).
- Do not create an individual outage ticket when a mass outage exists.
- Never expose tokens, credentials, internal URLs, or raw downstream errors to users.
- Dynamic IDs use prefixes such as `ELG-`, `VAL-`, `ORD-`, `TT-`, `ADDR-`, `QUAL-`, `QUOTE-`, `RELOC-`, and `APT-`. Copy the complete value from the response.

## 1. Plan Change

`Customer → Account → Subscription → Eligibility → Offers → Compatibility → Validation → Order → Status`

```text
POST /api/customers/search                 {msisdn} → customers[].customerId
GET  /api/billing-accounts?customerId=...             → billingAccounts[].billingAccountId
GET  /api/subscriptions?billingAccountId=...           → subscriptions[].subscriptionId,currentOfferId
POST /api/change-plan/eligibility          {customerId,billingAccountId,subscriptionId,currentOfferId,channel} → eligible,eligibilityId
GET  /api/product-offerings                           → offers[]
POST /api/compatibility-check             {customerId,subscriptionId,currentOfferId,targetOfferId} → compatible,oneTimeCharges
POST /api/orders/validate                  {customerId,billingAccountId,subscriptionId,eligibilityId,action:"CHANGE_OFFER",currentOfferId,targetOfferId} → valid,validationId,priceSummary
POST /api/orders                           {externalReferenceId,customerId,billingAccountId,subscriptionId,validationId,channel,orderItems:[...]} → orderId,status
GET  /api/orders/:orderId                             → status,activatedOffer
```

### Plan change request/response details

Search the customer and carry the returned IDs through the flow:

```http
POST /api/customers/search
Content-Type: application/json

{"msisdn":"905551112233"}
```

```json
{
  "customers": [
    {
      "customerId": "CUST-1001",
      "customerType": "INDIVIDUAL",
      "firstName": "John",
      "lastName": "Smith",
      "status": "ACTIVE",
      "msisdn": "905551112233"
    }
  ]
}
```

If `customers` is empty, stop. Use `customerId` to get the account, then use `billingAccountId` to get the subscription:

```json
{
  "billingAccounts": [
    {
      "billingAccountId": "BA-1001",
      "customerId": "CUST-1001",
      "status": "ACTIVE",
      "currency": "TRY",
      "outstandingBalance": 149.9,
      "creditClass": "A"
    }
  ]
}
```

```json
{
  "subscriptions": [
    {
      "subscriptionId": "SUB-1001",
      "billingAccountId": "BA-1001",
      "msisdn": "905551112233",
      "status": "ACTIVE",
      "currentOfferId": "OFFER-10GB",
      "commitmentEndDate": "2026-12-31",
      "serviceType": "MOBILE_POSTPAID"
    }
  ]
}
```

Run eligibility before presenting target offers:

```json
{
  "customerId": "CUST-1001",
  "billingAccountId": "BA-1001",
  "subscriptionId": "SUB-1001",
  "currentOfferId": "OFFER-10GB",
  "channel": "AGENT"
}
```

```json
{
  "eligible": true,
  "eligibilityId": "ELG-...",
  "eligibleOfferIds": ["OFFER-20GB", "OFFER-UNLIMITED"],
  "warnings": [
    {"code": "COMMITMENT_RENEWED", "message": "Yeni taahhut donemi baslayacaktir."}
  ],
  "blockingReasons": []
}
```

Stop when `eligible=false`; explain `blockingReasons`. From `GET /api/product-offerings`, only present offers whose `offerId` appears in `eligibleOfferIds`. An offer contains `name`, `monthlyPrice`, `currency`, `internetQuotaGb`, `voiceMinutes`, `smsCount`, and `commitmentMonths`.

After the user selects a target offer, check compatibility:

```json
{
  "customerId": "CUST-1001",
  "subscriptionId": "SUB-1001",
  "currentOfferId": "OFFER-10GB",
  "targetOfferId": "OFFER-20GB"
}
```

```json
{
  "compatible": true,
  "targetOfferId": "OFFER-20GB",
  "oneTimeCharges": [{"type": "ACTIVATION_FEE", "amount": 50, "currency": "TRY"}],
  "removedProducts": [],
  "requiredActions": ["ACCEPT_NEW_COMMITMENT"]
}
```

Stop when `compatible=false`. Show one-time charges and required actions before validation. Validate the complete change:

```json
{
  "customerId": "CUST-1001",
  "billingAccountId": "BA-1001",
  "subscriptionId": "SUB-1001",
  "eligibilityId": "ELG-...",
  "action": "CHANGE_OFFER",
  "currentOfferId": "OFFER-10GB",
  "targetOfferId": "OFFER-20GB"
}
```

```json
{
  "valid": true,
  "validationId": "VAL-...",
  "priceSummary": {
    "currentMonthlyPrice": 350,
    "newMonthlyPrice": 450,
    "priceDifference": 100,
    "currency": "TRY"
  },
  "effectiveDate": "2026-08-06",
  "errors": [],
  "warnings": [{"code": "PRICE_CHANGE", "message": "Aylik ucret degisecektir."}]
}
```

Stop when `valid=false`. Summarize `priceSummary`, `effectiveDate`, compatibility charges, warnings, and commitment impact. Call `POST /api/orders` only after explicit user approval:

```json
{
  "externalReferenceId": "AGENT-PLAN-CHANGE-001",
  "customerId": "CUST-1001",
  "billingAccountId": "BA-1001",
  "subscriptionId": "SUB-1001",
  "validationId": "VAL-...",
  "channel": "AGENT",
  "orderItems": [
    {
      "action": "MODIFY",
      "productId": "SUB-1001",
      "currentOfferId": "OFFER-10GB",
      "targetOfferId": "OFFER-20GB"
    }
  ]
}
```

```json
{
  "orderId": "ORD-...",
  "status": "ACKNOWLEDGED",
  "createdAt": "2026-08-06T10:00:00.000Z",
  "estimatedCompletionSeconds": 3
}
```

Poll `GET /api/orders/:orderId`. `IN_PROGRESS` has `completedAt:null` and `activatedOffer:null`; `COMPLETED` returns the activated offer. Stop polling on `COMPLETED` or a non-null `error`.

## 2. Bill Dispute

`Customer → Account → Products → Usage → Bill → Charge Validation → Ticket`

```text
GET  /api/products?customerId=CUST-1001                         → products[]
GET  /api/usage-records?subscriptionId=SUB-1001&period=2026-07 → usageRecords[]
GET  /api/customer-bills?billingAccountId=BA-1001              → bills[].billId,billItems,amountDue
POST /api/charges/validate {billId:"BILL-2026-07-1001"}        → valid,checks[],recommendedDisputeAmount
POST /api/trouble-tickets  {customerId,type:"BILLING_DISPUTE",description,billId,disputedAmount,evidence} → ticketId,status
```

Fixture conclusion: bill items total TRY 1,800; discount and overage are valid; `USG-ROAMING-1001` is charged twice (`BI-4`,`BI-5`). Dispute TRY 450.

### Bill dispute request/response details

Use the IDs found during customer/account lookup. Inventory and usage responses are collections:

```json
{
  "products": [
    {
      "productId": "PROD-ROAMING-1001",
      "productType": "ROAMING_PACKAGE",
      "offerId": "OFFER-ROAMING-1GB",
      "status": "ACTIVE",
      "activationDate": "2026-07-15T09:00:00.000Z"
    }
  ]
}
```

```json
{
  "usageRecords": [
    {
      "usageId": "USG-ROAMING-1001",
      "usageType": "ROAMING_DATA",
      "startDateTime": "2026-07-10T12:30:00.000Z",
      "quantity": 0.6,
      "unit": "GB",
      "rated": true,
      "ratedAmount": 450,
      "currency": "TRY"
    }
  ]
}
```

`GET /api/customer-bills` returns `bills[]`; each bill contains `billingPeriod`, `amountDue`, `currency`, and `billItems[]`. Correlate `billItems[].usageId` with usage and `billItems[].productId` with products. Then validate the selected `billId`:

```json
{"billId":"BILL-2026-07-1001"}
```

```json
{
  "billId": "BILL-2026-07-1001",
  "valid": false,
  "recommendedDisputeAmount": 450,
  "currency": "TRY",
  "checks": [
    {
      "code": "DUPLICATE_USAGE_CHARGE",
      "passed": false,
      "chargeValid": false,
      "affectedBillItemIds": ["BI-4", "BI-5"],
      "usageId": "USG-ROAMING-1001",
      "duplicateAmount": 450,
      "message": "Ayni roaming kullanimi iki kez ucretlendirilmistir."
    }
  ]
}
```

Base the explanation on `checks`; do not dispute checks where `chargeValid=true`. Create a ticket only after explaining the evidence and amount:

```json
{
  "customerId": "CUST-1001",
  "type": "BILLING_DISPUTE",
  "description": "Roaming kullanimi iki kez ucretlendirilmis.",
  "billId": "BILL-2026-07-1001",
  "disputedAmount": 450,
  "evidence": ["BI-4", "BI-5", "USG-ROAMING-1001"]
}
```

```json
{
  "ticketId": "TT-...",
  "customerId": "CUST-1001",
  "type": "BILLING_DISPUTE",
  "status": "OPEN",
  "billId": "BILL-2026-07-1001",
  "serviceId": null,
  "disputedAmount": 450,
  "evidence": ["BI-4", "BI-5", "USG-ROAMING-1001"],
  "createdAt": "2026-08-06T10:00:00.000Z"
}
```

## 3. Internet Outage

`Customer → Service → Known Problems → Remote Test → Ticket → Appointment`

```text
GET  /api/services?customerId=CUST-1001                  → services[].serviceId
GET  /api/service-problems?serviceId=...                 → serviceProblems[]
POST /api/service-tests {serviceId,testType:"FULL_DIAGNOSTIC"} → result,diagnostics,testId
POST /api/trouble-tickets {customerId,type:"SERVICE_INCIDENT",description,serviceId,evidence} → ticketId
GET  /api/appointment-slots?relatedEntityId=...          → slots[]
POST /api/appointments {customerId,relatedEntityType,relatedEntityId,slotId,userConfirmed:true} → appointmentId,status
```

Default: no mass outage; remote test returns `OPTICAL_SIGNAL_LOSS`. Mass-outage branch: add `scenario=KNOWN_OUTAGE` to `/api/service-problems`; stop before ticket creation.

### Outage request/response details

`GET /api/services?customerId=...` returns `services[]`. Select the active fixed-internet service and carry its `serviceId`. Always check known problems before running an individual diagnostic:

```json
{
  "serviceProblems": [],
  "checkedAt": "2026-08-06T10:00:00.000Z"
}
```

With `scenario=KNOWN_OUTAGE`, a problem includes `problemId`, `category:MASS_OUTAGE`, `status`, `startedAt`, `expectedResolutionAt`, and `recommendedAction:DO_NOT_CREATE_INDIVIDUAL_TICKET`. In that branch, report the outage and stop.

When no known problem exists, run:

```json
{"serviceId":"SERVICE-FTTH-1001","testType":"FULL_DIAGNOSTIC"}
```

```json
{
  "testId": "TEST-...",
  "serviceId": "SERVICE-FTTH-1001",
  "testType": "FULL_DIAGNOSTIC",
  "result": "FAILED",
  "diagnostics": {
    "ontReachable": false,
    "opticalSignalDbm": null,
    "lastSeenAt": "2026-08-06T08:02:00.000Z",
    "probableCause": "OPTICAL_SIGNAL_LOSS"
  },
  "recommendedAction": "CREATE_INDIVIDUAL_TICKET_AND_APPOINTMENT"
}
```

Create the incident ticket with diagnostic evidence:

```json
{
  "customerId": "CUST-1001",
  "type": "SERVICE_INCIDENT",
  "description": "Uzaktan testte optik sinyal kaybi tespit edildi.",
  "serviceId": "SERVICE-FTTH-1001",
  "evidence": ["TEST-...", "OPTICAL_SIGNAL_LOSS"]
}
```

The `201` response contains `ticketId`, `status:OPEN`, `serviceId`, `evidence`, and `createdAt`. Query slots with the service ID:

```http
GET /api/appointment-slots?relatedEntityId=SERVICE-FTTH-1001
```

```json
{
  "slots": [
    {
      "slotId": "SLOT-2026-08-07-AM",
      "start": "2026-08-07T09:00:00+03:00",
      "end": "2026-08-07T12:00:00+03:00"
    }
  ]
}
```

Present slots and wait for explicit selection/approval. Link the booked appointment to the created ticket:

```json
{
  "customerId": "CUST-1001",
  "relatedEntityType": "TROUBLE_TICKET",
  "relatedEntityId": "TT-...",
  "slotId": "SLOT-2026-08-07-AM",
  "userConfirmed": true
}
```

Response `201` contains `appointmentId`, `status:BOOKED`, the selected `slot`, and `createdAt`. A missing confirmation returns `409 USER_CONFIRMATION_REQUIRED`.

## 4. Home Internet Relocation

`Address → Qualification → Offers → Quote → Order → Appointment`

```text
POST /api/geographic-addresses/validate {city,district,postalCode,addressLine1} → addressId
POST /api/service-qualifications        {addressId,serviceType:"FIXED_INTERNET"} → qualified,technology,qualificationId
GET  /api/relocation-offers?qualificationId=... → offers[]
POST /api/quotes {customerId,qualificationId,offerId} → quoteId,monthlyPrice,installationFee
POST /api/relocation-orders {externalReferenceId,customerId,subscriptionId:"SUB-HOME-1001",quoteId,userConfirmed:true} → orderId
GET  /api/appointment-slots?relatedEntityId=:orderId → slots[]
POST /api/appointments {customerId,relatedEntityType:"RELOCATION_ORDER",relatedEntityId:orderId,slotId,userConfirmed:true} → appointmentId
```

Coverage: `34718→FTTH`, `06420→DSL`, other postal codes → no offers; do not create quote/order.

### Relocation request/response details

Validate and normalize the destination address:

```json
{
  "city": "Istanbul",
  "district": "Kadikoy",
  "postalCode": "34718",
  "addressLine1": "Ornek Mah. Test Sok. No: 1"
}
```

```json
{
  "addressId": "ADDR-...",
  "validationStatus": "VALIDATED",
  "normalizedAddress": {
    "city": "ISTANBUL",
    "district": "KADIKOY",
    "postalCode": "34718",
    "addressLine1": "Ornek Mah. Test Sok. No: 1"
  }
}
```

Use the returned `addressId`:

```json
{"addressId":"ADDR-...","serviceType":"FIXED_INTERNET"}
```

```json
{
  "qualificationId": "QUAL-...",
  "addressId": "ADDR-...",
  "serviceType": "FIXED_INTERNET",
  "qualified": true,
  "technology": "FTTH",
  "maxDownloadMbps": 1000,
  "alternativeTechnology": null,
  "reason": null
}
```

If `qualified=false`, report `reason` and stop. Otherwise query offers with `qualificationId`. The response includes each offer's `offerId`, `name`, `monthlyPrice`, `installationFee`, and `currency`. Create a quote for the offer selected by the user:

```json
{
  "customerId": "CUST-1001",
  "qualificationId": "QUAL-...",
  "offerId": "HOME-FIBER-100"
}
```

```json
{
  "quoteId": "QUOTE-...",
  "status": "APPROVED",
  "monthlyPrice": 600,
  "installationFee": 250,
  "currency": "TRY",
  "validForSeconds": 900,
  "createdAt": "2026-08-06T10:00:00.000Z"
}
```

Summarize the monthly and installation prices. After explicit approval, create the relocation order:

```json
{
  "externalReferenceId": "AGENT-RELOCATION-001",
  "customerId": "CUST-1001",
  "subscriptionId": "SUB-HOME-1001",
  "quoteId": "QUOTE-...",
  "userConfirmed": true
}
```

The `201` response contains `orderId`, `status:ACKNOWLEDGED`, `quoteId`, and `createdAt`. Use that relocation `orderId` for both slot lookup and appointment linkage:

```json
{
  "customerId": "CUST-1001",
  "relatedEntityType": "RELOCATION_ORDER",
  "relatedEntityId": "RELOC-...",
  "slotId": "SLOT-2026-08-07-PM",
  "userConfirmed": true
}
```

## Auth Test Harness

```text
POST /api/test-auth/reset                       → reset:true
POST /api/auth/login {username:"toolflow-user",password:"mock-password"} → data.access_token
GET  /api/protected/resource                    Authorization: Bearer <token>
GET  /api/protected/api-key                     X-API-Key: static-api-key
POST /api/oauth/token                           Basic svc-1:mock-client-secret; form grant_type=client_credentials
GET  /api/test-auth/stats                       → loginCalls,protectedCalls,events (no secrets)
```

Scenarios: protected `REJECT_FIRST_GENERATION` or `ALWAYS_401`; login `FAIL_TWICE_THEN_SUCCESS`, `ALWAYS_503`, `ALWAYS_429`, or `ALWAYS_408`.

### Auth request/response details

- Reset state before every independent scenario; otherwise call counters and token generations carry over.
- Managed auth request is JSON. Read the bearer token from `data.access_token`; never log or display its value.
- Protected resource uses `Authorization: Bearer <token>` and returns `{"authorized":true,"authScheme":"Bearer","subject":"toolflow-test-user"}` on success.
- API-key auth uses exactly `X-API-Key: static-api-key`; sending it as a bearer token must fail with `401`.
- OAuth token request uses `Content-Type: application/x-www-form-urlencoded`, HTTP Basic credentials, and body `grant_type=client_credentials&scope=orders.read`.
- `REJECT_FIRST_GENERATION` expected sequence is login `200` → protected `401` → silent refresh/login `200` → protected `200`. Stats should show `loginCalls=2` and `protectedCalls=2`.
- Retry only configured transient statuses (`408`, `429`, and `5xx`). Do not retry ordinary validation `400`, auth `401` without a refresh policy, missing entity `404`, or business-rule `409`.

## Errors

`400` invalid input · `401` auth failure · `404` missing entity · `409` rule/confirmation conflict · `5xx/429/408` retryable only where specified.
