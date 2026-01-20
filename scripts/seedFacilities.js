// scripts/seedFacilities.js
const mysql = require('mysql2/promise');
require('dotenv').config();

async function seedFacilities() {
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

    // Check current facilities
    const [existingFacilities] = await connection.query(
      'SELECT facility_id, name FROM BarbershopFacility'
    );

    console.log(`📊 Current facilities count: ${existingFacilities.length}`);
    
    if (existingFacilities.length > 0) {
      console.log('📋 Existing facilities:');
      existingFacilities.forEach(f => {
        console.log(`   - ${f.name} (${f.facility_id})`);
      });
    }

    // Facilities to insert
    const facilitiesToInsert = [
      { name: 'WiFi Gratis', icon: 'wifi' },
      { name: 'AC', icon: 'wind' },
      { name: 'Parkir', icon: 'truck' },
      { name: 'Toilet', icon: 'droplet' },
      { name: 'Mushola', icon: 'compass' },
      { name: 'TV', icon: 'tv' },
      { name: 'Minuman Gratis', icon: 'coffee' },
      { name: 'Pembayaran Cashless', icon: 'credit-card' },
      { name: 'Ruang Tunggu', icon: 'home' },
      { name: 'Charging Station', icon: 'battery-charging' },
      { name: 'Musik', icon: 'music' },
      { name: 'Majalah/Koran', icon: 'book-open' }
    ];

    // Insert only if not exists
    let insertedCount = 0;
    for (const facility of facilitiesToInsert) {
      const [exists] = await connection.query(
        'SELECT facility_id FROM BarbershopFacility WHERE name = ?',
        [facility.name]
      );

      if (exists.length === 0) {
        await connection.query(
          'INSERT INTO BarbershopFacility (facility_id, name, icon, is_active) VALUES (UUID(), ?, ?, true)',
          [facility.name, facility.icon]
        );
        console.log(`✅ Inserted: ${facility.name}`);
        insertedCount++;
      } else {
        console.log(`⚠️ Skipped (exists): ${facility.name}`);
      }
    }

    console.log(`\n✅ Seeding completed! Inserted ${insertedCount} new facilities.`);

    // Final count
    const [finalCount] = await connection.query(
      'SELECT COUNT(*) as count FROM BarbershopFacility WHERE is_active = true'
    );
    console.log(`📊 Total active facilities: ${finalCount[0].count}`);

  } catch (error) {
    console.error('❌ Seeding error:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('✅ Connection closed');
    }
  }
}

seedFacilities();