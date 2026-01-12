
import sequelize from '../config/database-config.js';
import { QueryTypes } from 'sequelize';

const migrate = async () => {
  try {
    console.log('Starting migration...');
    
    await sequelize.query(`
      ALTER TABLE "website_chat_messages" 
      ADD COLUMN IF NOT EXISTS "sender_user_id" VARCHAR(255);
    `, { type: QueryTypes.RAW });
    console.log('Added sender_user_id');

    await sequelize.query(`
      ALTER TABLE "website_chat_messages" 
      ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(255);
    `, { type: QueryTypes.RAW });
    console.log('Added display_name');

    try {
        await sequelize.query(`
          ALTER TYPE "enum_website_chat_messages_sender_type" ADD VALUE IF NOT EXISTS 'Counsellor';
          ALTER TYPE "enum_website_chat_messages_sender_type" ADD VALUE IF NOT EXISTS 'Admin';
        `, { type: QueryTypes.RAW });
        console.log('Updated ENUM types');
    } catch (e) {
        console.log('Enum update skipped or failed (might already exist or not supported in this DB version easily this way):', e.message);
    }

    console.log('Migration complete.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrate();
