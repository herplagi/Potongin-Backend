# Upcoming Bookings Endpoint Implementation

## Overview
This implementation adds a new endpoint `/api/bookings/upcoming` to the Potongin Backend API, enabling the Android application to retrieve and display upcoming barbershop reservations.

## What Was Implemented

### 1. New Endpoint: GET `/api/bookings/upcoming`
- **Location**: `src/routes/booking.routes.js` (line 12)
- **Controller**: `src/controllers/booking.controller.js` (`getUpcomingBookings` function)
- **Authentication**: Required (JWT Bearer Token)
- **Authorization**: Customer and Owner roles

### 2. Features

#### Pagination
- Query parameters: `page` (default: 1) and `limit` (default: 10, max: 100)
- Returns total count and total pages in response
- Input validation to prevent abuse (min: 1, max: 100 for limit)

#### Filtering
- **By Date**: `date` parameter (ISO 8601 format: YYYY-MM-DD)
  - Returns bookings for the specified date
  - Still ensures only future bookings are returned (even if past date is specified)
- **By Service**: `service_id` parameter (UUID)
  - Returns bookings for a specific service
- **By Location**: `city` parameter (string)
  - Partial match search for barbershop city

#### Role-Based Access Control
- **Customers**: Can only view their own upcoming bookings
- **Owners**: Can view all bookings for their barbershop(s)
  - Includes customer information (name, email, phone)

#### Data Inclusion
- Service details (name, price, duration)
- Barbershop details (name, address, city)
- Staff details (name, specialty)
- Customer details (for owners only)

### 3. Response Format
```json
{
  "bookings": [...],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  }
}
```

## Files Changed

1. **src/controllers/booking.controller.js**
   - Added `getUpcomingBookings` function (lines 488-624)
   - Implements all filtering, pagination, and role-based logic

2. **src/routes/booking.routes.js**
   - Added new route: `router.get('/upcoming', authMiddleware, checkRole(['customer', 'owner']), BookingController.getUpcomingBookings);`

3. **docs/API_UPCOMING_BOOKINGS.md** (New)
   - Complete API documentation with examples
   - Android integration guide
   - Security considerations

4. **docs/TESTING_UPCOMING_BOOKINGS.md** (New)
   - Manual testing guide
   - cURL examples
   - Postman instructions

## Security Considerations

### Implemented
✅ **Authentication**: JWT token required for all requests
✅ **Authorization**: Role-based access control (customer/owner)
✅ **Input Validation**: Pagination parameters validated (max limit: 100)
✅ **Data Isolation**: Users only see data they have permission to access
✅ **SQL Injection Prevention**: Sequelize ORM with parameterized queries
✅ **Date Filter Security**: Ensures only future bookings are returned

### Known Issue (Pre-existing)
⚠️ **Rate Limiting**: Not implemented (applies to all endpoints in the application)
- CodeQL scan identified this as a security concern
- Recommendation: Implement rate-limiting middleware (e.g., express-rate-limit) globally
- This is outside the scope of this implementation

## Testing

### Structural Tests
All structural tests pass:
- Controller function exists and is exported
- Route is properly configured with middleware
- Authentication middleware is applied
- Role-based access control is configured
- Pagination logic is implemented
- Filtering parameters are supported
- Upcoming bookings filter is implemented
- Role-based data access is implemented
- Related data inclusion is configured

### Manual Testing
See `docs/TESTING_UPCOMING_BOOKINGS.md` for manual testing instructions.

## Integration with Android App

The endpoint is ready for integration with the Potongin-Android app:
- Repository: https://github.com/herplagi/Potongin-Android
- See `docs/API_UPCOMING_BOOKINGS.md` for Android integration examples

## Usage Examples

### Basic Request
```bash
curl -X GET "http://localhost:3001/api/bookings/upcoming" \
  -H "Authorization: Bearer <your_jwt_token>"
```

### With Filters
```bash
curl -X GET "http://localhost:3001/api/bookings/upcoming?page=1&limit=20&city=Jakarta&date=2024-01-20" \
  -H "Authorization: Bearer <your_jwt_token>"
```

## Performance Notes

- Pagination prevents large data transfers
- Sequelize ORM handles query optimization
- Related data is eagerly loaded to minimize database queries
- Recommend adding database indexes on:
  - `bookings.booking_time`
  - `bookings.customer_id`
  - `bookings.barbershop_id`

## Deployment Checklist

- [ ] Ensure database indexes exist on booking_time, customer_id, barbershop_id
- [ ] Configure production JWT_SECRET in environment variables
- [ ] Consider implementing rate-limiting for all API endpoints
- [ ] Monitor endpoint performance and adjust pagination limits if needed
- [ ] Update API documentation if base URL changes

## Future Enhancements

Potential improvements that could be added later:
- [ ] Add sorting options (by date, price, status)
- [ ] Add status filter (confirmed, pending_payment, completed)
- [ ] Add payment_status filter
- [ ] Add date range filter (start_date, end_date)
- [ ] Add full-text search for barbershop names
- [ ] Add response caching for frequently accessed pages
- [ ] Implement rate limiting

## Support

For issues or questions:
- Check the API documentation: `docs/API_UPCOMING_BOOKINGS.md`
- Check the testing guide: `docs/TESTING_UPCOMING_BOOKINGS.md`
- Review the code: `src/controllers/booking.controller.js`
