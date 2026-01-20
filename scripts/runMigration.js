// backend/scripts/runMigration.js
const fs = require('fs');
const path = require('path');
const sequelize = require('../src/config/database');

async function runMigration() {
  try {
    console.log('🚀 Starting migration...');
    
    const migrationFile = path.join(__dirname, '../migrations/002_add_checkin_system.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 50) + '...');
      await sequelize.query(statement);
    }
    
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();