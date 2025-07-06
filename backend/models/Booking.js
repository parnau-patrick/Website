const mongoose = require('mongoose');
const BlockedDate = require('./BlockedDates');
const TimeLock = require('./TimeLock');
require('dotenv').config();


const NODE_ENV = process.env.NODE_ENV || 'production';
const MONGO_URL = process.env.MONGO_URL || (NODE_ENV === 'production' 
  ? null 
  : 'mongodb://localhost:27017/barbershop'); 

// Sistem de logging îmbunătățit
const { createContextLogger } = require('../utils/logger');
const logger = createContextLogger('BOOKING-MODEL');


const slotsCache = new Map();
const servicesCache = new Map();
const CACHE_DURATION = 30000; 
const SERVICES_CACHE_DURATION = 300000; 

// Verifică dacă MONGO_URL este setat în producție
if (NODE_ENV === 'production' && !process.env.MONGO_URL) {
  logger.error('ERROR: MONGO_URL environment variable is required in production!');
  process.exit(1);
}

// Services Schema
const serviceSchema = new mongoose.Schema({
  _id: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50
  },
  duration: {
    type: Number,  
    required: true,
    min: 5,
    max: 240
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    max: 10000
  }
});


const bookingSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  
  clientName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
    maxlength: 30 
  },
 
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 100,
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Introduceți un email valid']
  },
  service: {
    type: Number,
    ref: 'Service',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true,
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'declined', 'completed', 'cancelled'],
    default: 'pending'
  },
  verificationCode: {
    type: String,
    maxlength: 10
  },
  verified: {
    type: Boolean,
    default: false
  },
 
  emailCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 20
  },
  
  lastEmailSentAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  completedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
 
  countryCode: {
    type: String,
    trim: true,
    maxlength: 5,
    default: '+40' 
  }
});


bookingSchema.index({ client: 1 });
bookingSchema.index({ phoneNumber: 1 });
bookingSchema.index({ email: 1 }); 
bookingSchema.index({ date: 1, status: 1 }); 
bookingSchema.index({ status: 1, verified: 1 });
bookingSchema.index({ createdAt: 1 });
bookingSchema.index({ date: 1, time: 1 }); 
bookingSchema.index({ service: 1, date: 1 }); 


const blockedUserSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 30
  },
  
  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 100,
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Introduceți un email valid']
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 200
  },
  blockedAt: {
    type: Date,
    default: Date.now
  }
});


blockedUserSchema.index({ email: 1, phoneNumber: 1 });


const emailUsageSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 100
  },
  date: {
    type: Date,
    required: true
  },
  count: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
});

// Index pentru emailUsage
emailUsageSchema.index({ email: 1, date: 1 });

// UPDATED: findOrCreateDailyUsage method cu validare îmbunătățită pentru email
emailUsageSchema.statics.findOrCreateDailyUsage = async function(email) {
  // Validare email
  if (!email || typeof email !== 'string' || email.length > 100) {
    throw new Error('Invalid email');
  }
  
  const cleanEmail = email.trim().toLowerCase().substring(0, 100);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  try {
    let usage = await this.findOne({
      email: cleanEmail,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });
    
    if (!usage) {
      usage = new this({
        email: cleanEmail,
        date: today,
        count: 0
      });
      await usage.save();
    }
    
    return usage;
  } catch (error) {
    logger.error('Error in findOrCreateDailyUsage:', error);
    throw error;
  }
};

// Admin User Schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-zA-Z0-9_]+$/
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin'],
    default: 'admin'
  },
  lastLogin: {
    type: Date
  },
  loginAttempts: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },
  active: {
    type: Boolean,
    default: true
  }
});

// Cache pentru servicii 
const getCachedServices = async () => {
  const cacheKey = 'all-services';
  const cached = servicesCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < SERVICES_CACHE_DURATION) {
    return cached.data;
  }
  
  try {
    const services = await Service.find().lean().limit(50); 
    servicesCache.set(cacheKey, {
      data: services,
      timestamp: Date.now()
    });
    logger.info(` Services cache updated with ${services.length} services`);
    return services;
  } catch (error) {
    logger.error('Eroare la încărcarea serviciilor:', error);
    return [];
  }
};

// Curăță tot cache-ul
const clearSlotsCache = () => {
  slotsCache.clear();
  servicesCache.clear();
  logger.info(' Tot cache-ul a fost curățat');
};

// Invalidează cache-ul pentru o dată specifică
const invalidateCacheForDate = (date) => {
  try {
    const dateStr = new Date(date).toISOString().split('T')[0];
    let deletedCount = 0;
    
    for (const [key] of slotsCache) {
      if (key.startsWith(dateStr)) {
        slotsCache.delete(key);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      logger.info(`🗑️ Cache invalidat pentru ${dateStr} (${deletedCount} intrări)`);
    }
  } catch (error) {
    logger.error('Eroare la invalidarea cache-ului:', error);
  }
};

// Invalidează cache-ul serviciilor
const invalidateServicesCache = () => {
  servicesCache.clear();
  logger.info(' Cache servicii invalidat');
};

// Obține statistici cache
const getCacheStats = () => {
  return {
    slotsCache: {
      size: slotsCache.size,
      keys: Array.from(slotsCache.keys()).slice(0, 10) // Primele 10 pentru debugging
    },
    servicesCache: {
      size: servicesCache.size,
      keys: Array.from(servicesCache.keys())
    }
  };
};


const generateAvailableTimeSlots = async (date, duration) => {
  try {
    // Validare input
    if (!date || isNaN(duration) || duration <= 0 || duration > 240) {
      logger.error('Parametri invalizi pentru generateAvailableTimeSlots');
      return [];
    }

    const cacheKey = `${date.toISOString().split('T')[0]}-${duration}`;
    const cached = slotsCache.get(cacheKey);
    
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      logger.info(` Cache hit pentru ${cacheKey}`);
      return cached.slots;
    }

    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 0) {
      const emptyResult = [];
      slotsCache.set(cacheKey, { slots: emptyResult, timestamp: Date.now() });
      return emptyResult;
    }
    
  
    const dayBlockCheck = await BlockedDate.isDateTimeBlocked(date);
    if (dayBlockCheck.isBlocked && dayBlockCheck.type === 'fullDay') {
      const emptyResult = [];
      slotsCache.set(cacheKey, { slots: emptyResult, timestamp: Date.now() });
      return emptyResult;
    }
    
    
    let startHour, endHour;
    if (dayOfWeek === 6) { 
      startHour = 10;
      endHour = 13;
    } else { 
      startHour = 10;
      endHour = 19;
    }
    
    const allPossibleSlots = [];
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const startTimeInMinutes = hour * 60 + minute;
        const endTimeInMinutes = startTimeInMinutes + duration;
        
        if (endTimeInMinutes <= endHour * 60) {
          allPossibleSlots.push({
            time: startTime,
            startMinutes: startTimeInMinutes,
            endMinutes: endTimeInMinutes
          });
        }
      }
    }

   
    const dateStart = new Date(date.toDateString());
    const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);
    
    const [services, activeLocks, overlappingBookings, blockedTimes] = await Promise.all([
      // Query 1: Toate serviciile cu cache
      getCachedServices(),
      
      // Query 2: Toate lock-urile pentru ziua respectivă
      TimeLock.find({
        date: { $gte: dateStart, $lt: dateEnd }
      }).lean().limit(100), // Limitare pentru securitate
      
      // Query 3: Toate rezervările existente pentru ziua respectivă
      Booking.find({
        date: { $gte: dateStart, $lt: dateEnd },
        status: { $in: ['pending', 'confirmed'] }
      }).populate('service').lean().limit(100), // Limitare pentru securitate
      
      // Query 4: Toate orele blocate specific pentru ziua respectivă
      BlockedDate.find({
        date: dateStart,
        type: 'specificTime'
      }).lean().limit(50) 
    ]);

    // OPTIMIZARE 6: Pre-procesare date pentru căutare rapidă
    const serviceMap = new Map();
    services.forEach(service => {
      serviceMap.set(service._id, service);
    });

    // Convertim lock-urile în intervale de timp ocupate
    const occupiedIntervals = [];
    
    // Adaugă intervalele din lock-uri
    activeLocks.forEach(lock => {
      const lockService = serviceMap.get(lock.serviceId);
      if (lockService) {
        try {
          const lockStart = new Date(`${lock.date.toDateString()} ${lock.time}`);
          if (!isNaN(lockStart.getTime())) {
            const lockStartMinutes = lockStart.getHours() * 60 + lockStart.getMinutes();
            occupiedIntervals.push({
              start: lockStartMinutes,
              end: lockStartMinutes + lockService.duration,
              type: 'lock',
              id: lock._id
            });
          }
        } catch (error) {
          logger.warn('Eroare la procesarea lock-ului:', lock._id, error);
        }
      }
    });
    
    // Adaugă intervalele din rezervări
    overlappingBookings.forEach(booking => {
      if (booking.service && booking.time) {
        try {
          const bookingStart = new Date(`${booking.date.toDateString()} ${booking.time}`);
          if (!isNaN(bookingStart.getTime())) {
            const bookingStartMinutes = bookingStart.getHours() * 60 + bookingStart.getMinutes();
            occupiedIntervals.push({
              start: bookingStartMinutes,
              end: bookingStartMinutes + booking.service.duration,
              type: 'booking',
              id: booking._id
            });
          }
        } catch (error) {
          logger.warn('Eroare la procesarea rezervării:', booking._id, error);
        }
      }
    });
    
    // Adaugă orele blocate specific
    const blockedTimeSet = new Set();
    blockedTimes.forEach(blocked => {
      if (blocked.times && Array.isArray(blocked.times)) {
        blocked.times.forEach(time => {
          if (typeof time === 'string' && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
            blockedTimeSet.add(time);
          }
        });
      }
    });

    // OPTIMIZARE 7: Verificare rapidă pentru disponibilitate
    const availableSlots = allPossibleSlots.filter(slot => {
      // Verifică dacă ora este blocată specific
      if (blockedTimeSet.has(slot.time)) {
        return false;
      }
      
      // Verifică suprapunerea cu intervalele ocupate
      return !occupiedIntervals.some(interval => {
        return (
          (slot.startMinutes >= interval.start && slot.startMinutes < interval.end) ||
          (slot.endMinutes > interval.start && slot.endMinutes <= interval.end) ||
          (slot.startMinutes <= interval.start && slot.endMinutes >= interval.end)
        );
      });
    }).map(slot => slot.time);

    // Salvează în cache
    slotsCache.set(cacheKey, { 
      slots: availableSlots, 
      timestamp: Date.now() 
    });
    
    logger.info(`🎯 Generated ${availableSlots.length} available slots for ${date.toDateString()} in ${Date.now() - (cached ? cached.timestamp : Date.now())}ms`);
    return availableSlots;
    
  } catch (error) {
    logger.error('❌ Error in optimized generateAvailableTimeSlots:', error);
    return [];
  }
};


const checkMultipleTimeSlots = async (date, timeSlots, duration) => {
  try {
    if (!Array.isArray(timeSlots) || timeSlots.length === 0) {
      return {};
    }
    
    // Limitare pentru securitate
    const limitedTimeSlots = timeSlots.slice(0, 50);
    
    const dateStart = new Date(date.toDateString());
    const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);
    
    // O singură query pentru toate verificările
    const [existingBookings, existingLocks, blockedTimes] = await Promise.all([
      Booking.find({
        date: { $gte: dateStart, $lt: dateEnd },
        time: { $in: limitedTimeSlots },
        status: { $in: ['pending', 'confirmed'] }
      }).select('time').lean(),
      
      TimeLock.find({
        date: { $gte: dateStart, $lt: dateEnd },
        time: { $in: limitedTimeSlots }
      }).select('time').lean(),
      
      BlockedDate.find({
        date: dateStart,
        type: 'specificTime',
        times: { $in: limitedTimeSlots }
      }).select('times').lean()
    ]);
    
    // Creează set-uri pentru verificare rapidă
    const bookedTimes = new Set(existingBookings.map(b => b.time));
    const lockedTimes = new Set(existingLocks.map(l => l.time));
    const blockedTimesSet = new Set();
    
    blockedTimes.forEach(blocked => {
      if (blocked.times && Array.isArray(blocked.times)) {
        blocked.times.forEach(time => blockedTimesSet.add(time));
      }
    });
    
    // Verifică fiecare slot
    const results = {};
    limitedTimeSlots.forEach(time => {
      results[time] = !bookedTimes.has(time) && 
                     !lockedTimes.has(time) && 
                     !blockedTimesSet.has(time);
    });
    
    return results;
    
  } catch (error) {
    logger.error('Error in checkMultipleTimeSlots:', error);
    return {};
  }
};


const Service = mongoose.model('Service', serviceSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const BlockedUser = mongoose.model('BlockedUser', blockedUserSchema);
const User = mongoose.model('User', userSchema);
const EmailUsage = mongoose.model('EmailUsage', emailUsageSchema);


const initializeServices = async () => {
  try {
    // Limităm inițializarea serviciilor doar în dezvoltare sau când se cere explicit
    if (NODE_ENV === 'production' && process.env.INIT_SERVICES !== 'true') {
      logger.info('Skipping service initialization in production');
      return;
    }
    
    const count = await Service.countDocuments();
    if (count === 0) {
      await Service.create([
        { _id: 1, name: 'Tuns', duration: 30, price: 80 },
        { _id: 2, name: 'Tuns & Barba', duration: 30, price: 100 },
        { _id: 3, name: 'Precision Haircut', duration: 60, price: 150 }
      ]);
      logger.info('Default services created');
      
      // Invalidează cache-ul serviciilor după creare
      invalidateServicesCache();
    }
  } catch (error) {
    logger.error('Error initializing services:', error);
  }
};



// Improved MongoDB connection with error handling
const connect = async () => {
  try {
    // Log connection info (fără credențiale)
    const sanitizedUrl = MONGO_URL ? MONGO_URL.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') : 'undefined';
    logger.info(`Connecting to MongoDB in ${NODE_ENV} mode: ${sanitizedUrl}`);
    
    // Configurare opțiuni de conexiune cu focus pe securitate și stabilitate
    const connectionOptions = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: 10
    };
    
    // Opțiuni extra în producție
    if (NODE_ENV === 'production') {
      connectionOptions.retryWrites = true;
      connectionOptions.retryReads = true;
      connectionOptions.connectTimeoutMS = 30000;
    }
    
    await mongoose.connect(MONGO_URL, connectionOptions);
    logger.info(`Connected to MongoDB in ${NODE_ENV} mode`);
    
    // Inițializează serviciile
    await initializeServices();
    
    return true;
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    
    // În producție, opriți aplicația dacă nu se poate conecta
    if (NODE_ENV === 'production') {
      logger.error('Failed to connect to MongoDB in production. Exiting.');
      process.exit(1);
    }
    
    return false;
  }
};

// Graceful disconnect
const disconnect = async () => {
  try {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    return true;
  } catch (error) {
    logger.error('Error disconnecting from MongoDB:', error);
    return false;
  }
};


module.exports = {
  // Models
  Service,
  Booking,
  BlockedUser,
  User,
  EmailUsage,
  initializeServices,
  connect,
  disconnect,
  generateAvailableTimeSlots,
  checkMultipleTimeSlots,
  getCachedServices,
  clearSlotsCache,
  invalidateCacheForDate,
  invalidateServicesCache,
  getCacheStats
};