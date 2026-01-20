// scripts/runMigration002.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration002() {
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
      multipleStatements: true
    });

    console.log('✅ Connected to database');

    // Check if columns already exist
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'bookings' 
      AND COLUMN_NAME IN ('check_in_code', 'qr_code_token', 'checked_in_at')
    `, [process.env.DB_NAME]);

    if (columns.length > 0) {
      console.log('⚠️ Migration already applied. Columns found:', columns.map(c => c.COLUMN_NAME).join(', '));
      console.log('✅ Skipping migration...');
      return;
    }

    // Read SQL file
    const sqlFile = path.join(__dirname, '..', 'migrations', '002_add_checkin_system.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('📄 Running migration 002_add_checkin_system.sql...');

    // Execute SQL
    await connection.query(sql);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify columns
    const [newColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'bookings' 
      AND COLUMN_NAME IN ('check_in_code', 'qr_code_token', 'checked_in_at', 'check_in_method', 'service_started_at', 'service_completed_at', 'customer_confirmed_at')
    `, [process.env.DB_NAME]);
    
    console.log('✅ Added columns:', newColumns.map(c => c.COLUMN_NAME).join(', '));

  } catch (error) {
    console.error('❌ Migration error:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('✅ Connection closed');
    }
  }
}

runMigration002();