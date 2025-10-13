#!/usr/bin/env node
/**
 * Clear unencrypted data from development database
 * 
 * This script deletes all documents from WritingDeskJob and UserSavedLetter collections
 * to prepare for the new encrypted schema. This is safe for development environments only.
 * 
 * Usage: npm run clear-dev-data
 */

import { MongoClient } from 'mongodb';

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/mp_writer';
  
  console.log('🔌 Connecting to MongoDB...');
  console.log(`   URI: ${mongoUri}`);
  
  const client = new MongoClient(mongoUri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db();
    
    // Clear WritingDeskJob collection
    console.log('🗑️  Clearing writingdeskjobs collection...');
    const writingDeskResult = await db.collection('writingdeskjobs').deleteMany({});
    console.log(`   Deleted ${writingDeskResult.deletedCount} document(s)\n`);
    
    // Clear UserSavedLetter collection
    console.log('🗑️  Clearing usersavedletters collection...');
    const savedLettersResult = await db.collection('usersavedletters').deleteMany({});
    console.log(`   Deleted ${savedLettersResult.deletedCount} document(s)\n`);
    
    console.log('✅ Data clear complete!');
    console.log('\nSummary:');
    console.log(`   WritingDeskJobs deleted: ${writingDeskResult.deletedCount}`);
    console.log(`   UserSavedLetters deleted: ${savedLettersResult.deletedCount}`);
    console.log('\nOther collections (users, useraddresses, etc.) remain intact.');
    
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

