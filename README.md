# Telecom Mock API

Plan degisikligi akisini taklit eden, ek kutuphane gerektirmeyen basit bir Node.js mock server.

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

## Hazir test verileri

| Alan | Deger |
| --- | --- |
| MSISDN | `905551112233` |
| Customer ID | `CUST-1001` |
| Billing Account ID | `BA-1001` |
| Subscription ID | `SUB-1001` |
| Mevcut Offer ID | `OFFER-10GB` |
| Hedef Offer ID | `OFFER-20GB` veya `OFFER-UNLIMITED` |

## Endpoint'ler

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

## Public yayinlama (statik IP)

Bu proje uzun sure calisan bir Node.js servisi ve bellek ici veri kullandigi icin kendi
sunucunda Docker ile calistirmaya uygundur.

Sunucuda Docker kuruluysa:

```bash
docker compose up -d --build
```

Kontrol:

```bash
curl http://localhost:3000/health
docker compose ps
```

Disaridan `http://SUNUCU_PUBLIC_IP:3000/health` adresiyle erismek icin:

1. Sunucunun isletim sistemi guvenlik duvarinda TCP `3000` portuna izin ver.
2. Sunucu modem/router arkasindaysa TCP `3000` portunu sunucunun yerel IP adresine yonlendir.
3. ISP tarafinda CGNAT olmadigini ve elindeki adresin public statik IP oldugunu dogrula.

Servisi durdurmak veya loglarini izlemek icin:

```bash
docker compose logs -f
docker compose down
```

### HTTPS ve alan adi

Gercek kullanimda API'yi dogrudan `3000` portundan internete acmak yerine bir alan adini
statik IP'ye yonlendirip Caddy veya Nginx gibi bir reverse proxy ile HTTPS kullan. Reverse
proxy yalnizca `80` ve `443` portlarini disariya acmali; `3000` portu yerel agla
sinirlandirilmalidir.

API su anda `Access-Control-Allow-Origin: *` ile herkese aciktir ve kimlik dogrulama
yapmaz. Hassas veya gercek veri eklemeden once CORS kisitlamasi ve API anahtari gibi bir
koruma eklenmelidir.
