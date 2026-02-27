import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const DB_URL = process.env.DB_URL;

console.log('Connecting to MongoDB...');
await mongoose.connect(DB_URL);
console.log('Connected.');

const db = mongoose.connection.db;

// Drop the stale ticketId_1 index from both possible databases
const databases = ['test', 'powerhr'];
for (const dbName of databases) {
    try {
        const targetDb = db.client.db(dbName);
        const collections = await targetDb.listCollections({ name: 'tickets' }).toArray();
        if (collections.length > 0) {
            const indexes = await targetDb.collection('tickets').indexes();
            const staleIndex = indexes.find(idx => idx.name === 'ticketId_1');
            if (staleIndex) {
                await targetDb.collection('tickets').dropIndex('ticketId_1');
                console.log(`✅ Dropped ticketId_1 index from ${dbName}.tickets`);
            } else {
                console.log(`ℹ️  No ticketId_1 index found in ${dbName}.tickets`);
            }
        } else {
            console.log(`ℹ️  No tickets collection in ${dbName}`);
        }
    } catch (err) {
        console.log(`⚠️  Could not check ${dbName}: ${err.message}`);
    }
}

await mongoose.disconnect();
console.log('Done.');
