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
  ssl: true,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log(`✅ PostgreSQL connected successfully`);
    
    // Sync models with database (creates tables if they don't exist)
    await sequelize.sync({ alter: false });
    console.log(`✅ Database models synced`);
    
    return true;
  } catch (error) {
    console.error(`❌ PostgreSQL connection error: ${error.message}`);
    console.warn(`⚠️  Server will start but database features won't work.`);
    return false;
  }
};

module.exports = { sequelize, connectDB };
