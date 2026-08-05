# Agent API Chain Quick Reference

Base URL: `http://localhost:3000` · JSON unless noted. Full contract: [`API.md`](./API.md).

## Fixtures

`msisdn=905551112233` · `customerId=CUST-1001` · `billingAccountId=BA-1001` · `subscriptionId=SUB-1001` · `serviceId=SERVICE-FTTH-1001`

## Rules

- Follow the chains; correlate IDs between responses.
- Never create an order or appointment without explicit user approval (`userConfirmed:true`).
- Do not create an individual outage ticket when a mass outage exists.
- Never expose tokens, credentials, internal URLs, or raw downstream errors to users.

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

## Errors

`400` invalid input · `401` auth failure · `404` missing entity · `409` rule/confirmation conflict · `5xx/429/408` retryable only where specified.
