# API Documentation: Upcoming Bookings Endpoint

## Endpoint
```
GET /api/bookings/upcoming
```

## Description
Fetches a list of upcoming bookings (reservations) filtered by user role and various optional parameters. This endpoint is designed for the Potongin Android application to display upcoming barbershop appointments.

## Authentication
- **Required**: Yes
- **Type**: JWT Bearer Token
- **Header**: `Authorization: Bearer <token>`

## Authorization
- **Roles**: `customer`, `owner`
- **Customer**: Can only view their own upcoming bookings
- **Owner**: Can view all upcoming bookings for their barbershop(s)

## Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Page number for pagination |
| `limit` | integer | No | 10 | Number of items per page (max: 100) |
| `date` | string | No | - | Filter by specific date (ISO 8601 format: YYYY-MM-DD) |
| `service_id` | UUID | No | - | Filter by specific service |
| `city` | string | No | - | Filter by barbershop city (partial match) |

## Response

### Success Response (200 OK)
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
      },
      "customer": {
        "user_id": "uuid",
        "name": "Customer Name",
        "email": "customer@example.com",
        "phone_number": "081234567890"
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

**Note**: The `customer` field is only included in the response for owner users.

### Error Responses

#### 401 Unauthorized
```json
{
  "message": "Token tidak ditemukan"
}
```

#### 403 Forbidden
```json
{
  "message": "Akses ditolak. Anda tidak memiliki hak akses yang diperlukan."
}
```

#### 500 Internal Server Error
```json
{
  "message": "Server error",
  "error": "Error details (only in development mode)"
}
```

## Example Requests

### Basic Request (Customer)
```bash
curl -X GET "http://localhost:3001/api/bookings/upcoming" \
  -H "Authorization: Bearer <jwt_token>"
```

### With Pagination
```bash
curl -X GET "http://localhost:3001/api/bookings/upcoming?page=2&limit=20" \
  -H "Authorization: Bearer <jwt_token>"
```

### Filter by Date
```bash
curl -X GET "http://localhost:3001/api/bookings/upcoming?date=2024-01-20" \
  -H "Authorization: Bearer <jwt_token>"
```

### Filter by Service
```bash
curl -X GET "http://localhost:3001/api/bookings/upcoming?service_id=<service_uuid>" \
  -H "Authorization: Bearer <jwt_token>"
```

### Filter by City
```bash
curl -X GET "http://localhost:3001/api/bookings/upcoming?city=Jakarta" \
  -H "Authorization: Bearer <jwt_token>"
```

### Combined Filters
```bash
curl -X GET "http://localhost:3001/api/bookings/upcoming?page=1&limit=15&city=Jakarta&date=2024-01-20" \
  -H "Authorization: Bearer <jwt_token>"
```

## Business Logic

### For Customers
- Returns only bookings where `customer_id` matches the authenticated user
- Shows all details of their upcoming appointments
- Excludes cancelled bookings

### For Owners
- Returns bookings for all barbershops owned by the authenticated user
- Includes customer information for managing appointments
- Shows bookings across all their barbershop locations

### General Rules
1. Only returns bookings with `booking_time >= current time` (future bookings)
2. Excludes bookings with `status = 'cancelled'`
3. Results are sorted by `booking_time` in ascending order (earliest first)
4. All related data (Service, Barbershop, Staff) are included in the response

## Integration with Android App

### Recommended Usage in Potongin-Android

1. **Display Upcoming Appointments**
   - Use default parameters to show next 10 appointments
   - Implement pull-to-refresh to reload data

2. **Implement Pagination**
   - Use `page` parameter for infinite scroll
   - Display `pagination.totalPages` for page indicators

3. **Filter Options**
   - Date picker for `date` filter
   - Service dropdown for `service_id` filter
   - Location filter for `city` parameter

4. **Error Handling**
   - Handle 401: Redirect to login
   - Handle 403: Show permission error
   - Handle 500: Show retry option

### Sample Android Integration
```kotlin
// Retrofit interface
@GET("api/bookings/upcoming")
suspend fun getUpcomingBookings(
    @Header("Authorization") token: String,
    @Query("page") page: Int = 1,
    @Query("limit") limit: Int = 10,
    @Query("date") date: String? = null,
    @Query("service_id") serviceId: String? = null,
    @Query("city") city: String? = null
): Response<UpcomingBookingsResponse>
```

## Security Considerations

1. **Authentication**: JWT token must be valid and not expired
2. **Authorization**: Users can only access their own data (customers) or their barbershops' data (owners)
3. **Data Isolation**: Role-based filtering ensures data privacy
4. **Input Validation**: All query parameters are validated and sanitized

## Performance Notes

- Pagination is implemented to prevent large data transfers
- Indexes should be created on `booking_time`, `customer_id`, and `barbershop_id` for optimal performance
- Related data is eagerly loaded to minimize database queries
