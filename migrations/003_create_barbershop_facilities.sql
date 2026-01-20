-- backend/migrations/003_create_barbershop_facilities.sql

-- Create BarbershopFacility table
CREATE TABLE IF NOT EXISTS BarbershopFacility (
  facility_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(100) NOT NULL COMMENT 'Nama fasilitas (WiFi, AC, Parkir, dll)',
  icon VARCHAR(50) DEFAULT 'check-circle' COMMENT 'Icon name for frontend',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_facility_name (name),
  INDEX idx_facility_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create BarbershopHasFacility (junction table)
CREATE TABLE IF NOT EXISTS BarbershopHasFacility (
  barbershop_id VARCHAR(36) NOT NULL,
  facility_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (barbershop_id, facility_id),
  FOREIGN KEY (barbershop_id) REFERENCES barbershops(barbershop_id) ON DELETE CASCADE,
  FOREIGN KEY (facility_id) REFERENCES BarbershopFacility(facility_id) ON DELETE CASCADE,
  INDEX idx_barbershop_facility (barbershop_id),
  INDEX idx_facility_barbershop (facility_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default facilities
INSERT INTO BarbershopFacility (facility_id, name, icon) VALUES
(UUID(), 'WiFi Gratis', 'wifi'),
(UUID(), 'AC', 'wind'),
(UUID(), 'Parkir', 'truck'),
(UUID(), 'Toilet', 'droplet'),
(UUID(), 'Mushola', 'compass'),
(UUID(), 'TV', 'tv'),
(UUID(), 'Minuman Gratis', 'coffee'),
(UUID(), 'Pembayaran Cashless', 'credit-card'),
(UUID(), 'Ruang Tunggu', 'home'),
(UUID(), 'Charging Station', 'battery-charging'),
(UUID(), 'Musik', 'music'),
(UUID(), 'Majalah/Koran', 'book-open')
ON DUPLICATE KEY UPDATE name = VALUES(name);