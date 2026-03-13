CREATE TABLE
    IF NOT EXISTS staff_unavailability (
        unavailability_id CHAR(36) PRIMARY KEY,
        staff_id CHAR(36) NOT NULL,
        barbershop_id CHAR(36) NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        reason VARCHAR(255) NULL,
        status ENUM ('active', 'cancelled') NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_staff_range (staff_id, start_time, end_time),
        INDEX idx_barbershop_range (barbershop_id, start_time, end_time),
        CONSTRAINT fk_unavailability_staff FOREIGN KEY (staff_id) REFERENCES staff (staff_id) ON DELETE CASCADE,
        CONSTRAINT fk_unavailability_barbershop FOREIGN KEY (barbershop_id) REFERENCES barbershops (barbershop_id) ON DELETE CASCADE
    );