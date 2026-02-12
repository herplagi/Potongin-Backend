const fs = require('fs');
const path = require('path');
const sequelize = require('../src/config/database');

async function runMigration() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        const migrationPath = path.join(__dirname, '../migrations/004_add_reschedule_fields.sql');
        const sql = fs.readFileSync(migrationPath, 'utf-8');

        await sequelize.query(sql);
        console.log('✅ Migration 004 executed successfully');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();