# Telecom Agent Mock API

Telekom agent'larinin yalnizca API cagirmasini degil; musteri, urun, kullanim, fatura ve servis cevaplarini iliskilendirerek gerekceli karar vermesini test eden, bagimliliksiz Node.js mock server.

## Senaryolar

| Senaryo | Ornek musteri talebi | Test edilen yetenek | TM Forum |
| --- | --- | --- | --- |
| Plan degisikligi | "Paketimi 20 GB'a yukselt." | Eligibility, fiyat farki ve siparis | TMF629, TMF637, TMF622 |
| Fatura itirazi | "Faturam neden 1.800 TL geldi? Hataliysa itiraz olustur." | Coklu veri korelasyonu ve gerekce | TMF637, TMF635, TMF678, TMF621 |
| Internet arizasi | "Internetim iki saattir calismiyor." | Teshis ve dogru ticket karari | TMF638, TMF656, TMF621, TMF646 |
| Ev interneti tasima | "Internetimi yeni adresime tasimak istiyorum." | Uzun multi-API orchestration | TMF673, TMF645, TMF648, TMF622, TMF646 |

## Calistirma

Node.js 18 veya ustu yeterlidir.

```bash
npm start
```

Sunucu varsayilan olarak `http://localhost:3000` adresinde acilir. Farkli port icin:

```bash
PORT=8080 npm start
```

Gelistirme sirasinda otomatik yeniden baslatma:

```bash
npm run dev
```

Test:

```bash
npm test
```

Sunucu basladiktan sonra senaryolari ve tum API zincirlerini gosteren web sayfasi:

- API katalogu: [http://localhost:3000](http://localhost:3000)
- Alternatif adres: [http://localhost:3000/docs](http://localhost:3000/docs)
- Agent guide raw Markdown: [http://localhost:3000/agent-guide.md](http://localhost:3000/agent-guide.md)
- Health check: [http://localhost:3000/health](http://localhost:3000/health)

Sayfa harici font, CDN veya frontend kutuphanesi kullanmaz; dogrudan mock server tarafindan sunulur.

## Hazir test verileri

| Alan | Deger |
| --- | --- |
| MSISDN | `905551112233` |
| Customer ID | `CUST-1001` |
| Billing Account ID | `BA-1001` |
| Subscription ID | `SUB-1001` |
| Mevcut Offer ID | `OFFER-10GB` |
| Hedef Offer ID | `OFFER-20GB` veya `OFFER-UNLIMITED` |
| Temmuz faturasi | `BILL-2026-07-1001` / 1.800 TRY |
| Ev interneti servisi | `SERVICE-FTTH-1001` |

Tasima uygunluk fixture'lari postal code ile secilir:

| Postal code | Sonuc |
| --- | --- |
| `34718` | FTTH, 1000 Mbps'e kadar |
| `06420` | Fiber yok, DSL 35 Mbps onerilir |
| Diger | Sabit internet servisi yok, teklif ve siparis olusturulmaz |

## API endpoint'leri

| Islem | Method | Endpoint |
| --- | --- | --- |
| Health check | GET | `/health` |
| Customer Search | POST | `/api/customers/search` |
| Customer Details | GET | `/api/customers/:customerId` |
| Billing Account | GET | `/api/billing-accounts?customerId=CUST-1001` |
| Mobile Subscription | GET | `/api/subscriptions?billingAccountId=BA-1001` |
| Change Plan Eligibility | POST | `/api/change-plan/eligibility` |
| Product Offerings | GET | `/api/product-offerings` |
| Compatibility Check | POST | `/api/compatibility-check` |
| Order Validation | POST | `/api/orders/validate` |
| Product Order | POST | `/api/orders` |
| Order Status | GET | `/api/orders/:orderId` |
| Active Products | GET | `/api/products?customerId=CUST-1001` |
| Usage Records | GET | `/api/usage-records?subscriptionId=SUB-1001&period=2026-07` |
| Customer Bills | GET | `/api/customer-bills?billingAccountId=BA-1001` |
| Customer Bill | GET | `/api/customer-bills/:billId` |
| Charge Validation | POST | `/api/charges/validate` |
| Service Inventory | GET | `/api/services?customerId=CUST-1001` |
| Known Service Problems | GET | `/api/service-problems?serviceId=SERVICE-FTTH-1001` |
| Remote Service Test | POST | `/api/service-tests` |
| Trouble Ticket | POST | `/api/trouble-tickets` |
| Trouble Ticket Status | GET | `/api/trouble-tickets/:ticketId` |
| Address Validation | POST | `/api/geographic-addresses/validate` |
| Service Qualification | POST | `/api/service-qualifications` |
| Relocation Offers | GET | `/api/relocation-offers?qualificationId=:id` |
| Quote | POST | `/api/quotes` |
| Relocation Order | POST | `/api/relocation-orders` |
| Appointment Slots | GET | `/api/appointment-slots?relatedEntityId=:id` |
| Appointment | POST | `/api/appointments` |
| Managed Auth Login | POST | `/api/auth/login` |
| OAuth2 Token | POST | `/api/oauth/token` |
| Bearer-protected Resource | GET | `/api/protected/resource` |
| API-key-protected Resource | GET | `/api/protected/api-key` |
| Auth Harness Reset | POST | `/api/test-auth/reset` |
| Auth Harness Stats | GET | `/api/test-auth/stats` |

## Hizli deneme

```bash
curl -X POST http://localhost:3000/api/customers/search \
  -H 'Content-Type: application/json' \
  -d '{"msisdn":"905551112233"}'
```

```bash
curl http://localhost:3000/api/customers/CUST-1001
```

```bash
curl -X POST http://localhost:3000/api/change-plan/eligibility \
  -H 'Content-Type: application/json' \
  -d '{
    "customerId":"CUST-1001",
    "billingAccountId":"BA-1001",
    "subscriptionId":"SUB-1001",
    "currentOfferId":"OFFER-10GB",
    "channel":"WEB"
  }'
```

Product Order endpoint'i siparisi once `ACKNOWLEDGED` olarak olusturur. Donen `orderId` ile Order Status endpoint'i cagrildiginda ilk 3 saniye `IN_PROGRESS`, sonrasinda `COMPLETED` doner. Veriler bellekte tutuldugu icin sunucu yeniden basladiginda olusturulmus siparisler silinir.

## Senaryo notlari

Fatura fixture'inda toplam 1.800 TRY ve kalem toplami birbiriyle uyumludur; sadakat indirimi uygulanmis, 10 GB kota 4 GB asilmis ve roaming paketi kullanimdan sonra aktive edilmistir. Asil hata, `USG-ROAMING-1001` kullaniminin `BI-4` ve `BI-5` kalemlerinde iki kez ucretlendirilmesidir. Onerilen itiraz tutari 450 TRY'dir.

Internet arizasi fixture'inda varsayilan olarak genel kesinti yoktur ve uzaktan test `OPTICAL_SIGNAL_LOSS` ile basarisiz olur. Genel kesinti dalini test etmek icin `GET /api/service-problems?serviceId=SERVICE-FTTH-1001&scenario=KNOWN_OUTAGE` kullanilir; cevap ayri ticket olusturulmamasi gerektigini belirtir.

Tasima siparisi ve randevu olusturma endpoint'leri `userConfirmed: true` olmadan islem yapmaz. Ayrintili request/response sozlesmeleri ve ornek akislar [API.md](./API.md) dosyasindadir.

## Tool Flow auth test harness

Bu mock server, Tool Flow auth manuel testlerinin downstream tarafini yerel olarak calistirir. Her testten once sayaclari sifirla:

```bash
curl -X POST http://localhost:3000/api/test-auth/reset
```

Auth-service provider node ayarlari:

| Alan | Deger |
| --- | --- |
| URL | `POST http://localhost:3000/api/auth/login` |
| JSON body | `{"username":"toolflow-user","password":"mock-password"}` |
| Token path | `data.access_token` |

Korunan asil API: `GET http://localhost:3000/api/protected/resource`.

Hazir auth fixture'lari:

| Test | Deger / URL |
| --- | --- |
| Static Bearer | `static-bearer-token` |
| Caller's token | `caller-access-token` |
| Expired caller token | `expired-caller-token` |
| Static API key | Header `X-API-Key: static-api-key` |
| Ilk token 401, refresh sonrasi basari | `/api/protected/resource?scenario=REJECT_FIRST_GENERATION` |
| Her deneme 401 | `/api/protected/resource?scenario=ALWAYS_401` |
| Token servisi her zaman 503 | `/api/auth/login?scenario=ALWAYS_503` |
| Token servisi 2x503, sonra basari | `/api/auth/login?scenario=FAIL_TWICE_THEN_SUCCESS` |
| Token servisi 429 / 408 | `scenario=ALWAYS_429` / `scenario=ALWAYS_408` |

Cache ve retry kontrolu icin:

```bash
curl http://localhost:3000/api/test-auth/stats
```

Response'taki `loginCalls`, `protectedCalls` ve `events` alanlari kac gercek downstream istegi geldigini gosterir. Event'ler credential veya token degeri saklamaz. Ornegin ayni flow iki kez calistirildiginda cache basariliysa `loginCalls` artmamalidir. Expired caller token backend tarafinda engellendiyse `protectedCalls` sifir kalmalidir.

OAuth2 Client Credentials fixture'i:

| Alan | Deger |
| --- | --- |
| Token URL | `http://localhost:3000/api/oauth/token` |
| Client ID | `svc-1` |
| Client secret | `mock-client-secret` |
| Scope | `orders.read` |
| Client auth method | `basic` |

### Bu repoda dogrudan test edilemeyenler

Bu server downstream davranisini saglar; su kontroller gercek `llm_service`, `cognitus-gen-ui`, Redis ve veritabani ortaminda yapilmalidir:

- Migration'in uygulanmasi ve DB state kontrolu
- Builder formu, provider rozetleri ve canvas validation mesajlari
- Kullaniciya gosterilen Turkce hata metinlerinin tam eslesmesi
- Retry'nin sohbetten gizlenmesi ve operator trace detaylari
- Redis cache degerinin sifreli olmasi
- Run trace/body/header maskelemesi ve `tool_flow_runs.state` sizinti kontrolu

## Proje dosyalari

| Dosya | Aciklama |
| --- | --- |
| `server.js` | Mock veriler, endpoint'ler ve bellek ici transaction kayitlari |
| `index.html` | `/` ve `/docs` adreslerinden sunulan API katalog sayfasi |
| `server.test.js` | Tum senaryolarin happy-path ve failure-branch testleri |
| `API.md` | Ayrintili JSON request/response sozlesmeleri |
| `AGENT_API_CHAINS.md` | Gelistirme sirasinda agent'a verilecek kisa API chain referansi |

Olusturulan siparisler, ticket'lar, quote'lar ve randevular bellek icinde tutulur; sunucu yeniden baslatildiginda sifirlanir.
