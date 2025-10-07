const { MongoClient } = require('mongodb');

async function addOptionsBot() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('tradebot');
    const botsCollection = db.collection('bots');

    // Check if Options Bot already exists
    const existingBot = await botsCollection.findOne({ 
      name: 'Nifty50 Options Bot' 
    });

    if (existingBot) {
      console.log('Nifty50 Options Bot already exists');
      return;
    }

    // Add the Options Bot
    const optionsBot = {
      name: 'Nifty50 Options Bot',
      description: 'Advanced options trading bot with dynamic strike selection and delta analysis',
      strategy: 'Options Delta Strategy',
      riskLevel: 'HIGH',
      minInvestment: 50000,
      maxInvestment: 2000000,
      expectedReturn: 30.0,
      isActive: true,
      parameters: {
        marketHours: '9:15-15:30',
        maxPositions: 1,
        tradeTimeout: 300,
        positionType: 'RISK_PERCENTAGE',
        deltaThreshold: 0.6,
        expiryPreference: 'NEAREST'
      },
      webhookUrl: 'https://niveshawealth.in/api/webhook/tradingview',
      emergencyStop: false,
      symbol: 'NIFTY',
      exchange: 'NFO',
      instrumentType: 'OPTIONS',
      tradingType: 'INTRADAY',
      intradayExitTime: '15:10',
      autoSquareOff: true,
      allowMultiplePositions: false,
      maxPositionHoldDays: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await botsCollection.insertOne(optionsBot);
    console.log('Successfully added Nifty50 Options Bot with ID:', result.insertedId);

    // List all bots
    const allBots = await botsCollection.find({}).toArray();
    console.log('\nAll available bots:');
    allBots.forEach(bot => {
      console.log(`- ${bot.name} (${bot.instrumentType}) - ${bot.isActive ? 'Active' : 'Inactive'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

addOptionsBot();