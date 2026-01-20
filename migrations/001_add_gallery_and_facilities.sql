USE barbershop_db;

-- ==========================================
-- Table: BarbershopImage (Gallery Images)
-- ==========================================
CREATE TABLE IF NOT EXISTS BarbershopImage (
  image_id INT PRIMARY KEY AUTO_INCREMENT,
  barbershop_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  caption VARCHAR(255),
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (barbershop_id) REFERENCES Barbershop(barbershop_id) ON DELETE CASCADE,
  INDEX idx_barbershop_image (barbershop_id),
  INDEX idx_display_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- Table: BarbershopFacility
-- ==========================================
CREATE TABLE IF NOT EXISTS BarbershopFacility (
  facility_id INT PRIMARY KEY AUTO_INCREMENT,
  barbershop_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (barbershop_id) REFERENCES Barbershop(barbershop_id) ON DELETE CASCADE,
  INDEX idx_barbershop_facility (barbershop_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- Insert Sample Data (Optional)
-- ==========================================

-- Get all barbershop IDs
SET @barbershop_count = (SELECT COUNT(*) FROM Barbershop);

-- Insert facilities for all existing barbershops
INSERT INTO BarbershopFacility (barbershop_id, name, icon, description)
SELECT 
  b.barbershop_id,
  'WiFi Gratis',
  'wifi',
  'Koneksi internet gratis untuk pelanggan'
FROM Barbershop b
WHERE NOT EXISTS (
  SELECT 1 FROM BarbershopFacility bf 
  WHERE bf.barbershop_id = b.barbershop_id 
  AND bf.name = 'WiFi Gratis'
);

INSERT INTO BarbershopFacility (barbershop_id, name, icon, description)
SELECT 
  b.barbershop_id,
  'Minuman Gratis',
  'coffee',
  'Minuman gratis selama menunggu'
FROM Barbershop b
WHERE NOT EXISTS (
  SELECT 1 FROM BarbershopFacility bf 
  WHERE bf.barbershop_id = b.barbershop_id 
  AND bf.name = 'Minuman Gratis'
);

INSERT INTO BarbershopFacility (barbershop_id, name, icon, description)
SELECT 
  b.barbershop_id,
  'AC',
  'wind',
  'Ruangan ber-AC'
FROM Barbershop b
WHERE NOT EXISTS (
  SELECT 1 FROM BarbershopFacility bf 
  WHERE bf.barbershop_id = b.barbershop_id 
  AND bf.name = 'AC'
);

INSERT INTO BarbershopFacility (barbershop_id, name, icon, description)
SELECT 
  b.barbershop_id,
  'TV Entertainment',
  'tv',
  'Hiburan TV dan musik'
FROM Barbershop b
WHERE NOT EXISTS (
  SELECT 1 FROM BarbershopFacility bf 
  WHERE bf.barbershop_id = b.barbershop_id 
  AND bf.name = 'TV Entertainment'
);

INSERT INTO BarbershopFacility (barbershop_id, name, icon, description)
SELECT 
  b.barbershop_id,
  'Pembayaran Digital',
  'credit-card',
  'Terima pembayaran cashless'
FROM Barbershop b
WHERE NOT EXISTS (
  SELECT 1 FROM BarbershopFacility bf 
  WHERE bf.barbershop_id = b.barbershop_id 
  AND bf.name = 'Pembayaran Digital'
);

INSERT INTO BarbershopFacility (barbershop_id, name, icon, description)
SELECT 
  b.barbershop_id,
  'Parkir Luas',
  'truck',
  'Area parkir yang luas'
FROM Barbershop b
WHERE NOT EXISTS (
  SELECT 1 FROM BarbershopFacility bf 
  WHERE bf.barbershop_id = b.barbershop_id 
  AND bf.name = 'Parkir Luas'
);

-- ==========================================
-- Verification Query
-- ==========================================
SELECT 'Migration completed successfully!' as status;
SELECT COUNT(*) as total_facilities FROM BarbershopFacility;
SELECT COUNT(*) as total_images FROM BarbershopImage;