// scripts/runMigration003.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration003() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
      multipleStatements: true
    });

    console.log('✅ Connected to database');

    // Check if tables already exist
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME IN ('BarbershopFacility', 'BarbershopHasFacility')
    `, [process.env.DB_NAME]);

    if (tables.length > 0) {
      console.log('⚠️ Migration already applied. Tables found:', tables.map(t => t.TABLE_NAME).join(', '));
      console.log('✅ Skipping migration...');
      return;
    }

    // Read SQL file
    const sqlFile = path.join(__dirname, '..', 'migrations', '003_create_barbershop_facilities.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('📄 Running migration 003_create_barbershop_facilities.sql...');

    // Execute SQL
    await connection.query(sql);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify tables
    const [newTables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME IN ('BarbershopFacility', 'BarbershopHasFacility')
    `, [process.env.DB_NAME]);
    
    console.log('✅ Created tables:', newTables.map(t => t.TABLE_NAME).join(', '));

    // Check data
    const [facilityCount] = await connection.query('SELECT COUNT(*) as count FROM BarbershopFacility');
    console.log(`✅ Total facilities: ${facilityCount[0].count}`);

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

runMigration003();