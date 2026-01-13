# Testing the /bookings/upcoming Endpoint

## Prerequisites
1. The server must be running: `npm start` or `npm run dev`
2. You need a valid JWT token from a logged-in user

## Getting a JWT Token

First, register/login to get a token:

```bash
# Register a new customer
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Customer",
    "email": "customer@test.com",
    "password": "password123",
    "phone_number": "081234567890"
  }'

# Login to get token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@test.com",
    "password": "password123"
  }'
```

Copy the `token` from the response.

## Testing the Upcoming Bookings Endpoint

### 1. Basic Request (Get first 10 upcoming bookings)
```bash
curl -X GET http://localhost:3001/api/bookings/upcoming \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 2. With Pagination
```bash
# Get page 2 with 20 items per page
curl -X GET "http://localhost:3001/api/bookings/upcoming?page=2&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 3. Filter by Date
```bash
# Get bookings for January 20, 2024
curl -X GET "http://localhost:3001/api/bookings/upcoming?date=2024-01-20" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. Filter by Service
```bash
# Replace SERVICE_UUID with actual service ID
curl -X GET "http://localhost:3001/api/bookings/upcoming?service_id=SERVICE_UUID" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 5. Filter by City
```bash
# Get bookings in Jakarta
curl -X GET "http://localhost:3001/api/bookings/upcoming?city=Jakarta" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 6. Combined Filters
```bash
# Get page 1, limit 15, in Jakarta, on a specific date
curl -X GET "http://localhost:3001/api/bookings/upcoming?page=1&limit=15&city=Jakarta&date=2024-01-20" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Expected Response Format

```json
{
  "bookings": [
    {
      "booking_id": "uuid",
      "customer_id": "uuid",
      "barbershop_id": "uuid",
      "service_id": "uuid",
      "staff_id": "uuid",
      "booking_time": "2024-01-20T10:00:00.000Z",
      "end_time": "2024-01-20T11:00:00.000Z",
      "status": "confirmed",
      "total_price": "50000.00",
      "payment_status": "paid",
      "createdAt": "2024-01-15T08:30:00.000Z",
      "updatedAt": "2024-01-15T08:30:00.000Z",
      "Service": {
        "service_id": "uuid",
        "name": "Haircut",
        "price": "50000.00",
        "duration_minutes": 60
      },
      "Barbershop": {
        "barbershop_id": "uuid",
        "name": "Barbershop A",
        "address": "Jl. Example No. 123",
        "city": "Jakarta"
      },
      "Staff": {
        "staff_id": "uuid",
        "name": "John Doe",
        "specialty": "Hair Styling"
      }
    }
  ],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  }
}
```

## Testing as an Owner

If you want to test as an owner (to see customer information), you need to:

1. Create a barbershop as an owner
2. Have bookings for that barbershop
3. Use the owner's token

The response will include an additional `customer` field with customer details.

## Common Errors

### 401 Unauthorized
```json
{
  "message": "Token tidak ditemukan"
}
```
**Solution**: Make sure to include the Authorization header with a valid token.

### 403 Forbidden
```json
{
  "message": "Akses ditolak. Anda tidak memiliki hak akses yang diperlukan."
}
```
**Solution**: The token belongs to a user without customer or owner role.

### Empty Result
```json
{
  "bookings": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "limit": 10,
    "totalPages": 0
  }
}
```
This is normal if there are no upcoming bookings for the user.

## Using Postman

1. Create a new GET request to `http://localhost:3001/api/bookings/upcoming`
2. In the Authorization tab, select "Bearer Token" and paste your JWT token
3. In the Params tab, add query parameters like:
   - `page`: 1
   - `limit`: 10
   - `date`: 2024-01-20
   - `city`: Jakarta
4. Send the request

## Notes

- The endpoint only returns bookings with `booking_time >= current time` (future bookings)
- Cancelled bookings are excluded from results
- For customers: only their own bookings are returned
- For owners: bookings for all their barbershops are returned
- Results are sorted by booking_time in ascending order (earliest first)
