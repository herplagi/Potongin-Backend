-- backend/migrations/004_add_reschedule_fields.sql
ALTER TABLE bookings 
ADD COLUMN reschedule_count INT DEFAULT 0 COMMENT 'Jumlah reschedule yang sudah dilakukan',
ADD COLUMN original_booking_time DATETIME NULL COMMENT 'Waktu booking awal sebelum reschedule',
ADD COLUMN reschedule_reason VARCHAR(255) NULL COMMENT 'Alasan reschedule (late_checkin, customer_request)';