# Kisa API Sozlesmesi

Base URL: `http://localhost:3000`  
Tum body'ler JSON'dur. Hazir veri: `msisdn=905551112233`, `customerId=CUST-1001`, `billingAccountId=BA-1001`, `subscriptionId=SUB-1001`, `currentOfferId=OFFER-10GB`; hedef teklif: `OFFER-20GB` veya `OFFER-UNLIMITED`.

Tum business endpoint'leri `Authorization: Bearer <token>` header'i ister. Hazir token `static-bearer-token` kullanilabilir veya `POST /api/auth/login` / `POST /api/oauth/token` cevabindan token alinabilir. Eksik, Bearer olmayan veya gecersiz token `401 UNAUTHORIZED` doner. `/`, `/docs`, `/agent-guide.md`, `/health` ve auth test harness endpoint'leri kendi asagida belirtilen erisim kurallariyla calisir.

Akis: musteri ara -> detay/hesap/abonelik al -> uygunluk -> teklifler -> uyumluluk -> validasyon -> siparis olustur -> durumu sorgula.

## Endpointler

### `GET /health`

Response `200`: `{"status":"UP"}`

### `POST /api/customers/search`

Request: `{"msisdn":"905551112233"}`  
Response `200` alanlari: `customers[] -> customerId, customerType, firstName, lastName, status, msisdn`; eslesme yoksa liste bostur.

### `GET /api/customers/:customerId`

Request: path'te `customerId`.  
Response `200` alanlari: `customerId, status, segment, riskLevel, identityVerified, billingAccountIds[]`  
Response `404`: `{"error":"CUSTOMER_NOT_FOUND","message":"..."}`

### `GET /api/billing-accounts?customerId=:customerId`

Request: opsiyonel `customerId` query parametresi.  
Response `200` alanlari: `billingAccounts[] -> billingAccountId, customerId, status, currency, outstandingBalance, creditClass`

### `GET /api/subscriptions?billingAccountId=:billingAccountId`

Request: opsiyonel `billingAccountId` query parametresi.  
Response `200` alanlari: `subscriptions[] -> subscriptionId, billingAccountId, msisdn, status, currentOfferId, commitmentEndDate, serviceType`

### `POST /api/change-plan/eligibility`

Request: `{"customerId","billingAccountId","subscriptionId","currentOfferId","channel"}`  
Response `200`: `{"eligible":true,"eligibilityId":"ELG-...","eligibleOfferIds":[],"warnings":[],"blockingReasons":[]}`

### `GET /api/product-offerings`

Response `200` alanlari: `offers[] -> offerId, name, monthlyPrice, currency, internetQuotaGb, voiceMinutes, smsCount, commitmentMonths`

### `POST /api/compatibility-check`

Request: `{"customerId","subscriptionId","currentOfferId","targetOfferId"}`  
Response `200`: `{"compatible":true,"targetOfferId","oneTimeCharges":[],"removedProducts":[],"requiredActions":[]}`

### `POST /api/orders/validate`

Request: `{"customerId","billingAccountId","subscriptionId","eligibilityId","action":"CHANGE_OFFER","currentOfferId","targetOfferId"}`  
Response `200`: `{"valid":true,"validationId":"VAL-...","priceSummary":{"currentMonthlyPrice","newMonthlyPrice","priceDifference","currency"},"effectiveDate":"YYYY-MM-DD","errors":[],"warnings":[]}`

### `POST /api/orders`

Request: `{"externalReferenceId","customerId","billingAccountId","subscriptionId","validationId","channel","orderItems":[{"action":"MODIFY","productId","currentOfferId","targetOfferId"}]}`  
Response `201`: `{"orderId":"ORD-...","status":"ACKNOWLEDGED","createdAt":"ISO-8601","estimatedCompletionSeconds":3}`

### `GET /api/orders/:orderId`

Request: path'te onceki cagriyla donen `orderId`.  
Response `200`: `{"orderId","status":"IN_PROGRESS|COMPLETED","completedAt":null,"activatedOffer":null,"error":null}`. Siparis 3 saniye sonra `COMPLETED` olur; `completedAt` ve `activatedOffer` dolar.  
Response `404`: `{"error":"ORDER_NOT_FOUND","message":"..."}`

## Fatura itirazi akisi

Akis: aktif urunleri al -> rated kullanimlari al -> faturayi al -> kalemleri dogrula -> gerekce ve kanitlarla itiraz ticket'i olustur.

### `GET /api/products?customerId=CUST-1001`

TMF637 karsiligi. Response `200`: `products[]`. Fixture; 10 GB tarife, 15 Temmuz'da aktive edilen roaming paketi ve aylik 100 USD sadakat indirimi icerir.

### `GET /api/usage-records?subscriptionId=SUB-1001&period=2026-07`

TMF635 karsiligi. Response `200`: `usageRecords[] -> usageId, usageType, startDateTime, endDateTime, quantity, unit, rated, ratedAmount, currency`. Fixture'da 14 GB yerel veri ve 10 Temmuz tarihli 0,6 GB roaming kullanimi vardir.

### `GET /api/customer-bills?billingAccountId=BA-1001`

### `GET /api/customer-bills/BILL-2026-07-1001`

TMF678 karsiligi. Response fatura alanlari: `billId, billingAccountId, billingPeriod, issueDate, dueDate, state, amountDue, currency, billItems[]`. Fatura 1.800 USD'dir. Ayni `USG-ROAMING-1001` referansi `BI-4` ve `BI-5` uzerinden iki kez ucretlendirilmistir.

### `POST /api/charges/validate`

Request: `{"billId":"BILL-2026-07-1001"}`

Response `200`: `valid, recommendedDisputeAmount, currency, checks[]`. Kontroller paket aktivasyon zamanini, mukerrer kullanimi, kota asimini, indirimi ve fatura toplam uyumunu ayri kanitlarla doner. Fixture sonucu `valid=false`, `recommendedDisputeAmount=450` olur.

### `POST /api/trouble-tickets`

TMF621 karsiligi ve fatura/ariza akislarinda ortaktir.

Fatura itirazi request ornegi:

```json
{
  "customerId": "CUST-1001",
  "type": "BILLING_DISPUTE",
  "description": "The same roaming usage was charged twice.",
  "billId": "BILL-2026-07-1001",
  "disputedAmount": 450,
  "evidence": ["BI-4", "BI-5", "USG-ROAMING-1001"]
}
```

Ariza ticket'i icin `type=SERVICE_INCIDENT` ve `serviceId` zorunludur. Response `201`: `ticketId, status=OPEN, description, billId, serviceId, disputedAmount, evidence, createdAt`.

### `GET /api/trouble-tickets/:ticketId`

Response `200`: olusturulan ticket. Response `404`: `TICKET_NOT_FOUND`.

## Internet arizasi akisi

Akis: servis envanteri -> genel kesinti kontrolu -> uzaktan test -> sadece musteriye ozel arizada ticket -> kullanici onayiyla randevu.

### `GET /api/services?customerId=CUST-1001`

TMF638 karsiligi. Response `200`: `services[]`. Fixture servis: `SERVICE-FTTH-1001`, FTTH, aktif.

### `GET /api/service-problems?serviceId=SERVICE-FTTH-1001`

TMF656 karsiligi. Varsayilan response'da `serviceProblems=[]` olur. Genel kesinti dalini calistirmak icin `scenario=KNOWN_OUTAGE` eklenir. Bu cevapta `category=MASS_OUTAGE` ve `recommendedAction=DO_NOT_CREATE_INDIVIDUAL_TICKET` doner.

### `POST /api/service-tests`

Request:

```json
{"serviceId":"SERVICE-FTTH-1001","testType":"FULL_DIAGNOSTIC"}
```

Response `200`: `testId, result=FAILED, diagnostics, recommendedAction`. Fixture `OPTICAL_SIGNAL_LOSS` teshisi ve `CREATE_INDIVIDUAL_TICKET_AND_APPOINTMENT` aksiyonu doner.

### `GET /api/appointment-slots?relatedEntityId=:id`

TMF646 karsiligi. `relatedEntityId`, servis ID'si veya daha once olusturulmus tasima siparis ID'si olabilir. Response `200`: `slots[] -> slotId, start, end`.

### `POST /api/appointments`

Request:

```json
{
  "customerId": "CUST-1001",
  "relatedEntityType": "TROUBLE_TICKET",
  "relatedEntityId": "TT-...",
  "slotId": "SLOT-2026-08-07-AM",
  "userConfirmed": true
}
```

Response `201`: `appointmentId, status=BOOKED, slot, createdAt`. `userConfirmed` tam olarak `true` degilse response `409 USER_CONFIRMATION_REQUIRED`.

## Ev interneti tasima akisi

Akis: adres dogrulama -> hizmet uygunlugu -> teklifler -> quote -> kullanici onayiyla tasima siparisi -> randevu.

### `POST /api/geographic-addresses/validate`

TMF673 karsiligi. Request: `{"city","district","postalCode","addressLine1"}`. Response `200`: `addressId, validationStatus=VALIDATED, normalizedAddress`.

### `POST /api/service-qualifications`

TMF645 karsiligi. Request: `{"addressId":"ADDR-...","serviceType":"FIXED_INTERNET"}`.

Postal code sonuc matrisi:

| postalCode | qualified | technology | maxDownloadMbps |
| --- | --- | --- | --- |
| `34718` | true | FTTH | 1000 |
| `06420` | true | DSL | 35 |
| Diger | false | null | 0 |

### `GET /api/relocation-offers?qualificationId=:id`

Response `200`: `offers[]`. FTTH icin `HOME-FIBER-100`, DSL icin `HOME-DSL-35` doner. Kapsama yoksa liste bostur.

### `POST /api/quotes`

TMF648 karsiligi. Request: `{"customerId":"CUST-1001","qualificationId":"QUAL-...","offerId":"HOME-DSL-35"}`. Response `201`: `quoteId, status=APPROVED, monthlyPrice, installationFee, currency, validForSeconds`. Adreste uygun olmayan teklif icin response `409 OFFER_NOT_QUALIFIED`.

### `POST /api/relocation-orders`

TMF622 karsiligi. Request:

```json
{
  "externalReferenceId": "EXT-RELOCATE-1",
  "customerId": "CUST-1001",
  "subscriptionId": "SUB-HOME-1001",
  "quoteId": "QUOTE-...",
  "userConfirmed": true
}
```

Response `201`: `orderId, status=ACKNOWLEDGED, quoteId, createdAt`. Acik kullanici onayi yoksa response `409 USER_CONFIRMATION_REQUIRED`. Kapsama yoksa quote olusmayacagi icin siparis de olusturulamaz.

## Tool Flow auth test API'leri

Bu endpoint'ler Tool Flow'un cache, retry, refresh, header secimi ve OAuth2 davranislarini gozlemlemek icin deterministik bir downstream saglar. Her bagimsiz testten once `POST /api/test-auth/reset` cagrilmalidir.

### `POST /api/test-auth/reset`

Auth provider, protected resource, API key ve OAuth sayaclarini sifirlar.

Response `200`:

```json
{"reset":true}
```

### `GET /api/test-auth/stats`

Response `200`:

```json
{
  "loginCalls": 2,
  "oauthTokenCalls": 0,
  "protectedCalls": 2,
  "apiKeyCalls": 0,
  "events": [
    {"kind":"AUTH_SERVICE","status":200,"scenario":"SUCCESS","timestamp":"..."},
    {"kind":"PROTECTED_RESOURCE","status":401,"scenario":"REJECT_FIRST_GENERATION","authScheme":"Bearer","timestamp":"..."}
  ]
}
```

Event kayitlarinda token, password, client secret veya request body tutulmaz.

### `POST /api/auth/login`

Managed auth-service provider endpoint'i. Request:

```json
{
  "username": "toolflow-user",
  "password": "mock-password"
}
```

Normal response `200`:

```json
{
  "data": {
    "access_token": "auth-service-token-1",
    "token_type": "Bearer",
    "expires_in": 300
  }
}
```

Provider node'da token path `data.access_token` olmalidir. Yanlis-path testi icin `data.nope` secilebilir.

Query scenario matrisi:

| scenario | Davranis |
| --- | --- |
| `SUCCESS` veya bos | Her cagrida yeni jenerasyon token, `200` |
| `FAIL_TWICE_THEN_SUCCESS` | Reset sonrasi ilk iki cagri `503`, ucuncu `200` |
| `ALWAYS_503` | Her cagri `503` |
| `ALWAYS_429` | Her cagri `429` |
| `ALWAYS_408` | Her cagri `408` |

### `GET /api/protected/resource`

`Authorization: Bearer <token>` bekler. Kabul edilen fixture'lar:

- `static-bearer-token`
- `caller-access-token`
- `/api/auth/login` tarafindan uretilen `auth-service-token-*`
- `/api/oauth/token` tarafindan uretilen `oauth-access-token-*`

Basarili response `200`:

```json
{"authorized":true,"authScheme":"Bearer","subject":"toolflow-test-user"}
```

Gecersiz veya eksik token response `401`: `{"error":"UNAUTHORIZED"}`. `expired-caller-token` bilerek gecersizdir. Caller-token expiry kontrolu dogru yerde yapiliyorsa bu token ile downstream hic cagrilmamali ve stats'ta `protectedCalls=0` kalmalidir.

Query scenario'lari:

| scenario | Davranis |
| --- | --- |
| `REJECT_FIRST_GENERATION` | `auth-service-token-1` icin 401, sonraki jenerasyon icin 200 |
| `ALWAYS_401` | Gecerli token olsa bile her zaman 401 |

`REJECT_FIRST_GENERATION`, sessiz refresh testini deterministik yapar: provider'dan token-1 -> protected 401 -> provider'dan token-2 -> protected 200. Stats sonucu `loginCalls=2`, `protectedCalls=2` olmalidir.

### `GET /api/protected/api-key`

Yalnizca `X-API-Key: static-api-key` header'ini kabul eder. Ayni degeri `Authorization: Bearer ...` ile gondermek `401` doner. Bu endpoint, caller token'in yanlislikla `X-API-Key` veya API key'in yanlislikla Bearer olarak gitmedigini ayirmak icindir.

### `POST /api/oauth/token`

OAuth2 Client Credentials endpoint'i. Body `application/x-www-form-urlencoded` olmalidir:

```text
grant_type=client_credentials&scope=orders.read
```

HTTP Basic fixture'i:

```text
client_id     = svc-1
client_secret = mock-client-secret
```

Basarili response `200`: `access_token, token_type=Bearer, expires_in=300, scope`. Eksik/gecersiz Basic credential veya grant type icin `401 {"error":"invalid_client"}` doner.

## Genel hatalar

Eksik zorunlu alan veya gecersiz JSON: `400 {"error":"BAD_REQUEST","message":"..."}`. Bilinmeyen endpoint: `404 {"error":"NOT_FOUND","message":"..."}`.
