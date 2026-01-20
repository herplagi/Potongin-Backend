// backend/app.js
const express = require('express');
const cors = require('cors');
const cron = require('node-cron'); // ✅ Install: npm install node-cron
require('dotenv').config();

const sequelize = require('./src/config/database');
const BookingAutomationService = require('./src/services/booking.automation.service');

// Import routes
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const barbershopRoutes = require('./src/routes/barbershop.routes');
const bookingRoutes = require('./src/routes/booking.routes');
const reviewRoutes = require('./src/routes/review.routes');
const serviceRoutes = require('./src/routes/service.routes');
const staffRoutes = require('./src/routes/staff.routes');
const scheduleRoutes = require('./src/routes/schedule.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const adminRoutes = require('./src/routes/admin.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('public/uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/barbershops', barbershopRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// ✅✅✅ SETUP CRON JOBS
console.log('⏰ Setting up cron jobs...');

// Run setiap 10 menit
cron.schedule('*/10 * * * *', async () => {
  await BookingAutomationService.runAllTasks();
});

// Run reminder setiap 5 menit (untuk lebih akurat)
cron.schedule('*/5 * * * *', async () => {
  await BookingAutomationService.sendBookingReminders();
});

console.log('✅ Cron jobs configured:');
console.log('  - Main automation: Every 10 minutes');
console.log('  - Booking reminders: Every 5 minutes');

// Database sync
sequelize.sync({ alter: false })
  .then(() => {
    console.log('✅ Database connected');
    
    // Run automation once on startup
    setTimeout(() => {
      console.log('🚀 Running initial automation check...');
      BookingAutomationService.runAllTasks();
    }, 5000);
  })
  .catch((error) => {
    console.error('❌ Database connection error:', error);
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;