import { Sequelize } from 'sequelize';
import { configDotenv } from 'dotenv';

configDotenv();

const isProd = process.env.NODE_ENV === 'production';

const sequelize = new Sequelize(process.env.SUPABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',

  dialectOptions: isProd
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {},

  logging: false,

  pool: {
    max: 10,
    min: 3,
    acquire: 70000,
    idle: 10000,
  },
});

export default sequelize;
