// backend/utils/autoCleanup.js
const { Booking } = require('../models/Booking');
const Client = require('../models/Client');

// Sistem de logging îmbunătățit
const NODE_ENV = process.env.NODE_ENV;
const logger = {
  info: NODE_ENV === 'production' ? () => {} : console.log,
  warn: console.warn,
  error: (message, error) => {
    if (NODE_ENV === 'production') {
      console.error(message, error instanceof Error ? error.message : error);
    } else {
      console.error(message, error);
    }
  }
};

/**
 * Curăță rezervările expirate (pending care au trecut de data și ora programării)
 */
const cleanupExpiredBookings = async () => {
  try {
    const now = new Date();
    
    // Găsește rezervările pending care au trecut de data și ora programării
    const expiredBookings = await Booking.find({
      status: 'pending',
      $expr: {
        $lt: [
          {
            $dateFromString: {
              dateString: {
                $concat: [
                  { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                  "T",
                  "$time",
                  ":00.000Z"
                ]
              }
            }
          },
          now
        ]
      }
    }).populate('client');
    
    if (expiredBookings.length === 0) {
      logger.info('Auto-cleanup: Nu există rezervări expirate de curățat');
      return { cleaned: 0, errors: 0 };
    }
    
    let cleanedCount = 0;
    let errorCount = 0;
    
    for (const booking of expiredBookings) {
      try {
        // Actualizează statisticile clientului dacă există
        if (booking.client) {
          // Scade din totalBookings pentru că rezervarea nu s-a finalizat
          booking.client.totalBookings = Math.max(0, booking.client.totalBookings - 1);
          await booking.client.save();
        }
        
        // Șterge rezervarea expirată
        await Booking.findByIdAndDelete(booking._id);
        
        cleanedCount++;
        
        logger.info(`Auto-cleanup: Șters booking expirat ${booking._id} pentru ${booking.clientName} - ${booking.date.toISOString().split('T')[0]} ${booking.time}`);
        
      } catch (error) {
        logger.error(`Auto-cleanup: Eroare la ștergerea booking-ului ${booking._id}:`, error);
        errorCount++;
      }
    }
    
    logger.info(`Auto-cleanup completat: ${cleanedCount} rezervări curățate, ${errorCount} erori`);
    
    return { cleaned: cleanedCount, errors: errorCount };
    
  } catch (error) {
    logger.error('Auto-cleanup: Eroare generală la curățarea rezervărilor expirate:', error);
    return { cleaned: 0, errors: 1 };
  }
};

/**
 * Curăță rezervările neconfirmate mai vechi de 24 ore
 */
const cleanupUnconfirmedBookings = async () => {
  try {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    // Găsește rezervările pending create acum mai mult de 24 ore
    const oldUnconfirmedBookings = await Booking.find({
      status: 'pending',
      verified: false,
      createdAt: { $lt: twentyFourHoursAgo }
    }).populate('client');
    
    if (oldUnconfirmedBookings.length === 0) {
      logger.info('Auto-cleanup: Nu există rezervări neconfirmate vechi de curățat');
      return { cleaned: 0, errors: 0 };
    }
    
    let cleanedCount = 0;
    let errorCount = 0;
    
    for (const booking of oldUnconfirmedBookings) {
      try {
        // Actualizează statisticile clientului dacă există
        if (booking.client) {
          booking.client.totalBookings = Math.max(0, booking.client.totalBookings - 1);
          await booking.client.save();
        }
        
        // Șterge rezervarea neconfirmată
        await Booking.findByIdAndDelete(booking._id);
        
        cleanedCount++;
        
        logger.info(`Auto-cleanup: Șters booking neconfirmat ${booking._id} pentru ${booking.clientName} - creat la ${booking.createdAt}`);
        
      } catch (error) {
        logger.error(`Auto-cleanup: Eroare la ștergerea booking-ului neconfirmat ${booking._id}:`, error);
        errorCount++;
      }
    }
    
    logger.info(`Auto-cleanup neconfirmate completat: ${cleanedCount} rezervări curățate, ${errorCount} erori`);
    
    return { cleaned: cleanedCount, errors: errorCount };
    
  } catch (error) {
    logger.error('Auto-cleanup: Eroare generală la curățarea rezervărilor neconfirmate:', error);
    return { cleaned: 0, errors: 1 };
  }
};

/**
 * Curăță rezervările respinse mai vechi de 7 zile
 */
const cleanupDeclinedBookings = async () => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Găsește rezervările respinse mai vechi de 7 zile
    const oldDeclinedBookings = await Booking.find({
      status: 'declined',
      createdAt: { $lt: sevenDaysAgo }
    });
    
    if (oldDeclinedBookings.length === 0) {
      logger.info('Auto-cleanup: Nu există rezervări respinse vechi de curățat');
      return { cleaned: 0, errors: 0 };
    }
    
    const deletedCount = await Booking.deleteMany({
      status: 'declined',
      createdAt: { $lt: sevenDaysAgo }
    });
    
    logger.info(`Auto-cleanup declined completat: ${deletedCount.deletedCount} rezervări respinse curățate`);
    
    return { cleaned: deletedCount.deletedCount, errors: 0 };
    
  } catch (error) {
    logger.error('Auto-cleanup: Eroare la curățarea rezervărilor respinse:', error);
    return { cleaned: 0, errors: 1 };
  }
};

/**
 * Rulează toate operațiunile de curățare
 */
const runFullCleanup = async () => {
  try {
    logger.info('Auto-cleanup: Începe curățarea automată...');
    
    const results = {
      expired: await cleanupExpiredBookings(),
      unconfirmed: await cleanupUnconfirmedBookings(),
      declined: await cleanupDeclinedBookings(),
      totalCleaned: 0,
      totalErrors: 0,
      timestamp: new Date()
    };
    
    results.totalCleaned = results.expired.cleaned + results.unconfirmed.cleaned + results.declined.cleaned;
    results.totalErrors = results.expired.errors + results.unconfirmed.errors + results.declined.errors;
    
    logger.info(`Auto-cleanup: Curățare completă finalizată - Total curățate: ${results.totalCleaned}, Total erori: ${results.totalErrors}`);
    
    return results;
    
  } catch (error) {
    logger.error('Auto-cleanup: Eroare la rularea curățării complete:', error);
    return {
      expired: { cleaned: 0, errors: 1 },
      unconfirmed: { cleaned: 0, errors: 1 },
      declined: { cleaned: 0, errors: 1 },
      totalCleaned: 0,
      totalErrors: 3,
      timestamp: new Date(),
      error: error.message
    };
  }
};

module.exports = {
  cleanupExpiredBookings,
  cleanupUnconfirmedBookings,
  cleanupDeclinedBookings,
  runFullCleanup
};