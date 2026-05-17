import mongoose from 'mongoose';

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI not set in environment');
  }

  const dbName = process.env.DB_NAME || 'staffartsv2';

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 10_000,
  });

  console.log(`✅ MongoDB connected: ${mongoose.connection.name}`);

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected');
  });
};

export default connectDB;