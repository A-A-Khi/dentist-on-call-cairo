# Call-center / doctor-app integrations

## Endpoint

`POST /api/v1/integrations/doctor-visits`

Authenticated with header:

```http
X-Integration-Key: <INTEGRATION_API_KEY>
```

Creates (idempotently):

1. Patient (match by phone, otherwise create)
2. Completed appointment
3. Completed visit + procedure
4. Revenue ledger row (if `paid_egp > 0`)

Health check:

`GET /api/v1/integrations/health` (same header)

## Environment (Railway / API `.env`)

```env
INTEGRATION_API_KEY=generate-with-openssl-rand-hex-32
INTEGRATION_ORG_ID=optional-uuid-of-organization
INTEGRATION_USER_ID=optional-uuid-of-admin-user
```

If org/user are omitted, the API uses the first active organization and first ADMIN user.

## Example body

```json
{
  "external_source": "callcenter-firebase",
  "external_id": "firebaseAppointmentDocId",
  "completed_at": "2026-11-22T20:15:00+02:00",
  "patient": {
    "full_name": "أحمد محمد",
    "phone": "01001234567",
    "city": "القاهرة",
    "address": null,
    "notes": "من الكول سنتر"
  },
  "doctor": {
    "display_name": "Dr. Sayed El-Bahy"
  },
  "appointment": {
    "date": "2026-11-22",
    "time": "20:00",
    "duration_minutes": 30,
    "location": "Home visit",
    "reason": "كشف منزلي"
  },
  "visit": {
    "service_name": "كشف منزلي",
    "cost_egp": 500,
    "paid_egp": 500,
    "clinical_notes": "تشخيص وملاحظات"
  }
}
```

Re-posting the same `external_source` + `external_id` returns the existing visit with `"created": false`.
