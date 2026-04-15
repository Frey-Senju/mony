# Mony API Documentation

## Base URL

**Development**: `http://localhost:8000`  
**Production**: `https://mony-api.onrender.com`

## Authentication

All endpoints except `/auth/*` and `/health` require JWT token in `Authorization` header:

```
Authorization: Bearer {access_token}
```

### Auth Endpoints

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password",
  "name": "John Doe"
}

Response (201):
{
  "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2026-04-15T10:00:00Z"
  }
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}

Response (200):
{
  "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": { ... }
}
```

---

## Transaction Endpoints

### List Transactions
```http
GET /api/transactions?skip=0&limit=20&type=&month=&year=

Response (200):
{
  "items": [
    {
      "id": "uuid",
      "userId": "uuid",
      "type": "expense",
      "amount": 50.00,
      "description": "Groceries",
      "date": "2026-04-15",
      "categoryId": "uuid",
      "createdAt": "2026-04-15T10:00:00Z"
    }
  ],
  "total": 100,
  "skip": 0,
  "limit": 20
}
```

### Create Transaction
```http
POST /api/transactions
Content-Type: application/json

{
  "type": "expense",
  "amount": 50.00,
  "description": "Groceries",
  "date": "2026-04-15",
  "categoryId": "uuid"
}

Response (201):
{
  "id": "uuid",
  "userId": "uuid",
  "type": "expense",
  "amount": 50.00,
  "description": "Groceries",
  "date": "2026-04-15",
  "categoryId": "uuid",
  "createdAt": "2026-04-15T10:00:00Z"
}
```

### Get Transaction
```http
GET /api/transactions/{id}

Response (200):
{ ... transaction object ... }
```

### Update Transaction
```http
PUT /api/transactions/{id}
Content-Type: application/json

{
  "amount": 60.00,
  "description": "Groceries + Tips"
}

Response (200):
{ ... updated transaction ... }
```

### Delete Transaction
```http
DELETE /api/transactions/{id}

Response (204): No content
```

---

## Category Endpoints

### List Categories
```http
GET /api/categories

Response (200):
{
  "items": [
    {
      "id": "uuid",
      "name": "Groceries",
      "color": "#FF6B6B",
      "icon": "shopping-cart",
      "userId": null
    }
  ]
}
```

### Create Category
```http
POST /api/categories
Content-Type: application/json

{
  "name": "Entertainment",
  "color": "#4ECDC4",
  "icon": "film"
}

Response (201):
{ ... category object ... }
```

---

## Report Endpoints

### Monthly Summary
```http
GET /api/reports/summary?month=4&year=2026

Response (200):
{
  "month": 4,
  "year": 2026,
  "income": 5000.00,
  "expenses": 1500.00,
  "balance": 3500.00,
  "transactionCount": 25
}
```

### Category Breakdown
```http
GET /api/reports/by-category?month=4&year=2026

Response (200):
{
  "categories": [
    {
      "categoryId": "uuid",
      "categoryName": "Groceries",
      "amount": 500.00,
      "count": 12,
      "percentage": 33.3
    }
  ]
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "INVALID_INPUT",
  "message": "Invalid email format",
  "details": { "field": "email" }
}
```

### 401 Unauthorized
```json
{
  "error": "UNAUTHORIZED",
  "message": "Token expired or invalid"
}
```

### 404 Not Found
```json
{
  "error": "NOT_FOUND",
  "message": "Transaction not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "INTERNAL_SERVER_ERROR",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limiting

- **Free tier**: 100 requests/minute per user
- **Burst limit**: 10 requests/second

---

## Changelog

### v0.1.0
- Initial API design
- Authentication endpoints
- Transaction CRUD
- Categories
- Reports

---

*API Documentation | Mony v0.1.0*
