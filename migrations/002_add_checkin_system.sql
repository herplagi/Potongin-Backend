-- backend/migrations/002_add_checkin_system.sql

-- ✅ Tambah kolom baru untuk check-in system
ALTER TABLE bookings 
ADD COLUMN check_in_code VARCHAR(6) NULL COMMENT 'PIN 6-digit untuk check-in',
ADD COLUMN qr_code_token VARCHAR(64) NULL COMMENT 'Token unik untuk QR code',
ADD COLUMN checked_in_at DATETIME NULL COMMENT 'Waktu customer check-in',
ADD COLUMN check_in_method ENUM('qr_code', 'pin', 'geofencing', 'manual') NULL COMMENT 'Metode check-in yang digunakan',
ADD COLUMN service_started_at DATETIME NULL COMMENT 'Waktu layanan dimulai',
ADD COLUMN service_completed_at DATETIME NULL COMMENT 'Waktu layanan selesai oleh owner',
ADD COLUMN customer_confirmed_at DATETIME NULL COMMENT 'Waktu customer konfirmasi selesai';

-- ✅ Update ENUM status untuk menambahkan status baru
ALTER TABLE bookings 
MODIFY COLUMN status ENUM(
    'pending_payment',
    'confirmed',
    'checked_in',
    'in_progress',
    'awaiting_confirmation',
    'completed',
    'cancelled',
    'no_show'
) NOT NULL DEFAULT 'pending_payment';

-- ✅ Tambah index untuk performa query
CREATE INDEX idx_check_in_code ON bookings(check_in_code);
CREATE INDEX idx_qr_code_token ON bookings(qr_code_token);
CREATE INDEX idx_checked_in_at ON bookings(checked_in_at);
CREATE INDEX idx_booking_status_time ON bookings(status, booking_time);

-- ✅ Tambah constraint untuk memastikan data valid
ALTER TABLE bookings
ADD CONSTRAINT chk_checkin_time 
CHECK (checked_in_at IS NULL OR checked_in_at <= service_started_at OR service_started_at IS NULL);

ALTER TABLE bookings
ADD CONSTRAINT chk_service_time 
CHECK (service_started_at IS NULL OR service_completed_at IS NULL OR service_started_at <= service_completed_at);