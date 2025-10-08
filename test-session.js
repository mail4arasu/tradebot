// Test script to debug session and auth issues
const { MongoClient } = require('mongodb');

async function testSessionAuth() {
  const client = new MongoClient('mongodb://tradebotapp:TradeBotApp2025@localhost:27017/tradebot?authSource=admin');
  
  try {
    console.log('🔧 Connecting to MongoDB...');
    await client.connect();
    
    const db = client.db('tradebot');
    
    // Check user in database
    console.log('\n👤 Database User Check:');
    const user = await db.collection('users').findOne({ email: 'mail4arasu@gmail.com' });
    
    if (user) {
      console.log('✅ User found in database');
      console.log('- Email:', user.email);
      console.log('- Role:', user.role);
      console.log('- Name:', user.name);
      console.log('- ID:', user._id.toString());
    } else {
      console.log('❌ User not found in database!');
      return;
    }
    
    // Check NextAuth sessions (if any)
    console.log('\n🔐 NextAuth Sessions Check:');
    try {
      const sessions = await db.collection('sessions').find({ userId: user._id.toString() }).toArray();
      if (sessions.length > 0) {
        console.log(`📋 Found ${sessions.length} active session(s):`);
        sessions.forEach((session, index) => {
          console.log(`  Session ${index + 1}:`);
          console.log(`  - Expires: ${session.expires}`);
          console.log(`  - User ID: ${session.userId}`);
        });
      } else {
        console.log('📋 No sessions found in sessions collection');
      }
    } catch (error) {
      console.log('📋 Sessions collection might not exist (normal for JWT strategy)');
    }
    
    // Check NextAuth accounts
    console.log('\n🔗 NextAuth Accounts Check:');
    try {
      const accounts = await db.collection('accounts').find({ userId: user._id.toString() }).toArray();
      if (accounts.length > 0) {
        console.log(`📋 Found ${accounts.length} linked account(s):`);
        accounts.forEach((account, index) => {
          console.log(`  Account ${index + 1}:`);
          console.log(`  - Provider: ${account.provider}`);
          console.log(`  - Type: ${account.type}`);
        });
      } else {
        console.log('📋 No accounts found (normal for credentials provider)');
      }
    } catch (error) {
      console.log('📋 Accounts collection might not exist');
    }
    
    // Test what the profile API should return
    console.log('\n🧪 Profile API Test Simulation:');
    const profileResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role || 'user',
      zerodhaConfig: user.zerodhaConfig ? {
        isConnected: user.zerodhaConfig.isConnected,
        balance: user.zerodhaConfig.balance,
        lastSync: user.zerodhaConfig.lastSync
      } : undefined
    };
    
    console.log('📤 API would return:');
    console.log('- Role:', profileResponse.role);
    console.log('- Should show admin?', profileResponse.role === 'admin' ? '✅ YES' : '❌ NO');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n📤 Disconnected from MongoDB');
  }
}

testSessionAuth();