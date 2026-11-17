const { Sequelize } = require('sequelize');
const { DATABASE_URL } = require('./env');

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: true,
    },
    connectionTimeoutMillis: process.env.E2E_TEST_MODE === '1' ? 10000 : 0,
  },
});

// Sequelize applies connection-string SSL settings after the supplied options.
const sslOptions = sequelize.options.dialectOptions.ssl;
if (sslOptions && typeof sslOptions === 'object') {
  delete sslOptions.checkServerIdentity;
  sslOptions.rejectUnauthorized = true;
} else {
  sequelize.options.dialectOptions.ssl = { rejectUnauthorized: true };
}

// Export sequelize early so models can require it without a circular dependency.
module.exports = { sequelize };

const connectDB = async () => {
  // Load all models and associations before syncing
  require('../models');

  try {
    await sequelize.authenticate();
    console.log(`✅ PostgreSQL connected successfully`);

    await sequelize.sync({ alter: false });
    console.log(`✅ Database models synced`);

    return true;
  } catch (error) {
    console.error(`❌ PostgreSQL connection error: ${error.message}`);
    throw error;
  }
};

module.exports.connectDB = connectDB;
