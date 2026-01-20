// backend/src/services/booking.automation.service.js
const { Op } = require('sequelize');
const Booking = require('../models/Booking.model');
const NotificationService = require('./notification.service');

class BookingAutomationService {
  /**
   * Auto-complete bookings yang sudah 24 jam di status awaiting_confirmation
   */
  static async autoCompleteAwaitingBookings() {
    try {
      console.log('🔄 Running auto-complete for awaiting bookings...');
      
      const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 jam lalu
      
      const awaitingBookings = await Booking.findAll({
        where: {
          status: 'awaiting_confirmation',
          service_completed_at: {
            [Op.lt]: threshold
          }
        }
      });

      let completedCount = 0;
      for (const booking of awaitingBookings) {
        await booking.update({ 
          status: 'completed',
          customer_confirmed_at: new Date() // Auto confirm
        });
        
        // Notifikasi bahwa booking auto-completed
        await NotificationService.sendAutoCompletedNotification(
          booking.customer_id,
          booking.booking_id
        );
        
        completedCount++;
        console.log(`✅ Auto-completed booking ${booking.booking_id}`);
      }

      console.log(`✅ Auto-completed ${completedCount} bookings`);
      return completedCount;
    } catch (error) {
      console.error('❌ Auto-complete error:', error);
      return 0;
    }
  }

  /**
   * Mark no-show untuk bookings yang tidak check-in 15 menit setelah jadwal
   */
  static async markNoShowBookings() {
    try {
      console.log('🔄 Running no-show detection...');
      
      const threshold = new Date(Date.now() - 15 * 60 * 1000); // 15 menit lalu
      
      const noShowBookings = await Booking.findAll({
        where: {
          status: 'confirmed',
          booking_time: {
            [Op.lt]: threshold
          }
        }
      });

      let noShowCount = 0;
      for (const booking of noShowBookings) {
        await booking.update({ status: 'no_show' });
        
        // Notifikasi ke owner bahwa customer no-show
        await NotificationService.sendNoShowNotification(
          booking.barbershop_id,
          booking.booking_id
        );
        
        noShowCount++;
        console.log(`⚠️ Marked no-show: ${booking.booking_id}`);
      }

      console.log(`⚠️ Marked ${noShowCount} bookings as no-show`);
      return noShowCount;
    } catch (error) {
      console.error('❌ No-show detection error:', error);
      return 0;
    }
  }

  /**
   * Send reminder 1 jam sebelum booking
   */
  static async sendBookingReminders() {
    try {
      console.log('🔄 Sending booking reminders...');
      
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
      const fiftyMinutesFromNow = new Date(Date.now() + 50 * 60 * 1000);
      
      const upcomingBookings = await Booking.findAll({
        where: {
          status: 'confirmed',
          booking_time: {
            [Op.between]: [fiftyMinutesFromNow, oneHourFromNow]
          }
        }
      });

      let reminderCount = 0;
      for (const booking of upcomingBookings) {
        await NotificationService.sendBookingReminder(
          booking.customer_id,
          booking.booking_id,
          booking.check_in_code
        );
        
        reminderCount++;
        console.log(`🔔 Sent reminder for booking ${booking.booking_id}`);
      }

      console.log(`🔔 Sent ${reminderCount} reminders`);
      return reminderCount;
    } catch (error) {
      console.error('❌ Reminder error:', error);
      return 0;
    }
  }

  /**
   * Expire pending payments (24 jam)
   */
  static async expirePendingPayments() {
    try {
      console.log('🔄 Expiring pending payments...');
      
      const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const expiredBookings = await Booking.findAll({
        where: {
          payment_status: 'pending',
          status: 'pending_payment',
          createdAt: {
            [Op.lt]: threshold
          }
        }
      });

      let expiredCount = 0;
      for (const booking of expiredBookings) {
        await booking.update({
          status: 'cancelled',
          payment_status: 'expired'
        });
        
        expiredCount++;
        console.log(`❌ Expired booking ${booking.booking_id}`);
      }

      console.log(`❌ Expired ${expiredCount} pending payments`);
      return expiredCount;
    } catch (error) {
      console.error('❌ Expire payments error:', error);
      return 0;
    }
  }

  /**
   * Main scheduler - run all tasks
   */
  static async runAllTasks() {
    console.log('\n========================================');
    console.log('🤖 BOOKING AUTOMATION SERVICE STARTED');
    console.log('Time:', new Date().toISOString());
    console.log('========================================\n');

    const results = {
      autoCompleted: await this.autoCompleteAwaitingBookings(),
      noShows: await this.markNoShowBookings(),
      reminders: await this.sendBookingReminders(),
      expired: await this.expirePendingPayments(),
    };

    console.log('\n========================================');
    console.log('📊 AUTOMATION SUMMARY:');
    console.log(`  - Auto-completed: ${results.autoCompleted}`);
    console.log(`  - No-shows: ${results.noShows}`);
    console.log(`  - Reminders: ${results.reminders}`);
    console.log(`  - Expired: ${results.expired}`);
    console.log('========================================\n');

    return results;
  }
}

module.exports = BookingAutomationService;