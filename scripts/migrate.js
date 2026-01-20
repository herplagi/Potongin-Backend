// scripts/migrate.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
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

    // Read SQL file
    const sqlFile = path.join(__dirname, '..', 'migrations', '001_add_gallery_and_facilities.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('📄 Running migration...');

    // Execute SQL
    const [results] = await connection.query(sql);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify tables
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME IN ('BarbershopImage', 'BarbershopFacility')
    `, [process.env.DB_NAME]);
    
    console.log('✅ Created tables:', tables.map(t => t.TABLE_NAME).join(', '));
    
    // Check data
    const [facilityCount] = await connection.query('SELECT COUNT(*) as count FROM BarbershopFacility');
    console.log(`✅ Total facilities: ${facilityCount[0].count}`);

  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('✅ Connection closed');
    }
  }
}

runMigration();