// Test API to debug sync issues
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { ZerodhaAPI } from '../../../../lib/zerodha'
import { decrypt } from '../../../../lib/encryption'
import mongoose from 'mongoose'

// Define User model inline
const UserSchema = new mongoose.Schema({
  email: String,
  zerodhaConfig: {
    apiKey: String,
    apiSecret: String, 
    accessToken: String,
    isConnected: Boolean
  }
})

const User = mongoose.models.User || mongoose.model('User', UserSchema)

/**
 * GET /api/admin/test-sync - Test sync functionality step by step
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin check
    const adminEmails = ['mail4arasu@gmail.com', 'admin@niveshawealth.in']
    if (!adminEmails.includes(session.user.email)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot')
    }

    // Get connected user
    const user = await User.findOne({ 'zerodhaConfig.isConnected': true })
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'No connected Zerodha user found'
      }, { status: 400 })
    }

    // Decrypt credentials
    const apiKey = decrypt(user.zerodhaConfig.apiKey)
    const apiSecret = decrypt(user.zerodhaConfig.apiSecret)
    const accessToken = decrypt(user.zerodhaConfig.accessToken)

    console.log('🔐 Using credentials for:', user.email)
    
    const zerodha = new ZerodhaAPI()
    zerodha.setCredentials(apiKey, apiSecret, accessToken)

    const testResults = {
      step1_auth: null,
      step2_instruments: null,
      step3_historical: null,
      step4_parsing: null
    }

    try {
      // Step 1: Test authentication
      console.log('🧪 Step 1: Testing authentication...')
      const profile = await zerodha.getProfile()
      testResults.step1_auth = {
        success: true,
        userName: profile?.data?.user_name || 'Unknown'
      }
    } catch (error) {
      testResults.step1_auth = {
        success: false,
        error: (error as Error).message
      }
      return NextResponse.json({ success: false, testResults })
    }

    try {
      // Step 2: Test instruments fetch
      console.log('🧪 Step 2: Testing instruments fetch...')
      const instruments = await zerodha.getInstruments('NFO')
      
      const niftyInstruments = instruments.filter((inst: any) => 
        inst.name === '"NIFTY"' && 
        inst.instrument_type === 'FUT'
      ).slice(0, 3)

      testResults.step2_instruments = {
        success: true,
        totalInstruments: instruments.length,
        niftyCount: niftyInstruments.length,
        samples: niftyInstruments.map(inst => ({
          tradingsymbol: inst.tradingsymbol,
          instrument_token: inst.instrument_token,
          expiry: inst.expiry
        }))
      }

      if (niftyInstruments.length === 0) {
        return NextResponse.json({ 
          success: false, 
          error: 'No Nifty instruments found',
          testResults 
        })
      }

      // Step 3: Test historical data fetch for one instrument
      console.log('🧪 Step 3: Testing historical data fetch...')
      const testInstrument = niftyInstruments[0]
      
      // Try to get just 1 day of recent data
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 1)

      console.log(`📊 Testing with ${testInstrument.tradingsymbol} (${testInstrument.instrument_token})`)
      console.log(`📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)

      const historicalData = await zerodha.getHistoricalData(
        parseInt(testInstrument.instrument_token),
        '5minute',
        startDate,
        endDate
      )

      testResults.step3_historical = {
        success: true,
        instrument: testInstrument.tradingsymbol,
        dataPoints: historicalData.length,
        sampleData: historicalData.slice(0, 3)
      }

      // Step 4: Test data parsing
      console.log('🧪 Step 4: Testing data parsing...')
      if (historicalData.length > 0) {
        const sample = historicalData[0]
        testResults.step4_parsing = {
          success: true,
          sampleCandle: {
            date: sample.date,
            open: sample.open,
            high: sample.high,
            low: sample.low,
            close: sample.close,
            volume: sample.volume
          }
        }
      } else {
        testResults.step4_parsing = {
          success: false,
          error: 'No historical data returned'
        }
      }

    } catch (error) {
      const step = !testResults.step2_instruments ? 'step2_instruments' :
                   !testResults.step3_historical ? 'step3_historical' : 'step4_parsing'
      
      testResults[step] = {
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack
      }
    }

    return NextResponse.json({
      success: true,
      testResults,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Test sync error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
      stack: error.stack
    }, { status: 500 })
  }
}