import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminUser } from '@/lib/admin'
import clientPromise from '@/lib/mongodb'
import { 
  calculateATMStrike,
  generateStrikePrices,
  generateOptionsContracts,
  selectBestContract,
  calculatePositionSize,
  getOptionType,
  selectExpiry,
  formatExpiryForSymbol
} from '@/utils/optionsAnalysis'
import { 
  fetchNiftyExpiryDates,
  fetchOptionsQuotes
} from '@/utils/zerodhaOptions'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { action, date, price, capital, riskPercentage } = await request.json()

    // Validate input parameters
    if (!action || !date || !price || !capital || !riskPercentage) {
      return NextResponse.json({ 
        error: 'Missing required parameters: action, date, price, capital, riskPercentage' 
      }, { status: 400 })
    }

    // Get user to fetch Zerodha credentials
    const client = await clientPromise
    const db = client.db('tradebot')
    const user = await db.collection('users').findOne({ email: session.user.email })
    
    if (!user?.zerodhaConfig?.accessToken) {
      return NextResponse.json({ 
        error: 'Zerodha access token not configured. Please go to Settings → Zerodha Integration and connect your Zerodha account.' 
      }, { status: 400 })
    }

    const { apiKey, accessToken } = user.zerodhaConfig

    // Step 1: Calculate ATM strike using the algorithm
    const atmStrike = calculateATMStrike(price)
    console.log(`🎯 ATM Strike calculated: ${atmStrike} (from price: ${price})`)

    // Step 2: Generate strike prices around ATM
    const strikes = generateStrikePrices(atmStrike)
    console.log(`📊 Generated strikes: ${strikes.join(', ')}`)

    // Step 3: Fetch NIFTY expiry dates from Zerodha
    let expiryDates
    try {
      expiryDates = await fetchNiftyExpiryDates(apiKey, accessToken)
      console.log(`📅 Fetched ${expiryDates.length} expiry dates`)
    } catch (error: any) {
      if (error.message.includes('Incorrect `api_key` or `access_token`') || 
          error.message.includes('TokenException')) {
        return NextResponse.json({ 
          error: 'Zerodha access token has expired. Please go to Settings → Zerodha Integration → "Connect Zerodha Account" to refresh your daily token.' 
        }, { status: 401 })
      }
      throw error // Re-throw other errors
    }

    // Step 4: Select appropriate expiry based on date input
    const selectedExpiry = selectExpiry(expiryDates)
    if (!selectedExpiry) {
      return NextResponse.json({ 
        error: 'No suitable expiry dates found' 
      }, { status: 400 })
    }
    console.log(`📅 Selected expiry: ${selectedExpiry.date} (${selectedExpiry.daysToExpiry} days)`)
    console.log(`🔢 Formatted expiry for symbols: ${selectedExpiry.formatted}`)

    // Step 5: Determine option type based on action
    const optionType = getOptionType(action)
    console.log(`🎛️ Option type: ${optionType} (action: ${action})`)

    // Step 6: Generate options contracts for all strikes
    const contracts = generateOptionsContracts(strikes, selectedExpiry.formatted, optionType)
    console.log(`💼 Generated ${contracts.length} contracts:`)
    contracts.forEach((contract, index) => {
      console.log(`   ${index + 1}. ${contract.symbol} (Strike: ${contract.strike}, Expiry: ${contract.expiry})`)
    })

    // Step 7: Fetch real-time quotes from Zerodha API
    let contractsWithData
    try {
      contractsWithData = await fetchOptionsQuotes(contracts, apiKey, accessToken)
      console.log(`📈 Fetched quotes for ${contractsWithData.length} contracts`)
    } catch (error: any) {
      if (error.message.includes('Incorrect `api_key` or `access_token`') || 
          error.message.includes('TokenException')) {
        return NextResponse.json({ 
          error: 'Zerodha access token has expired. Please go to Settings → Zerodha Integration → "Connect Zerodha Account" to refresh your daily token.' 
        }, { status: 401 })
      }
      if (error.message.includes('No instrument tokens found')) {
        return NextResponse.json({ 
          error: 'Options contracts not found in Zerodha instruments. This may indicate expired token or invalid symbols. Please refresh your Zerodha token in Settings.' 
        }, { status: 400 })
      }
      throw error // Re-throw other errors
    }

    // Step 8: Select best contract based on delta and OI
    const bestContract = selectBestContract(contractsWithData)
    if (!bestContract) {
      return NextResponse.json({ 
        error: 'No suitable options contract found (minimum delta 0.6 required)' 
      }, { status: 400 })
    }
    console.log(`🏆 Selected best contract: ${bestContract.symbol}`)

    // Step 9: Calculate position size based on risk percentage
    const lotSize = 50 // NIFTY lot size
    const premiumPerLot = (bestContract.premium || 0) * lotSize
    const positionCalc = calculatePositionSize(
      capital, // Available margin (using capital as proxy)
      riskPercentage,
      premiumPerLot,
      lotSize
    )

    if (!positionCalc.canTrade) {
      return NextResponse.json({ 
        error: 'Insufficient capital for minimum position size' 
      }, { status: 400 })
    }

    // Prepare simulation result
    const simulationResult = {
      selectedContract: {
        symbol: bestContract.symbol,
        strike: bestContract.strike,
        expiry: selectedExpiry.date,
        optionType: bestContract.optionType
      },
      marketData: {
        premium: bestContract.premium || 0,
        delta: bestContract.delta || 0,
        openInterest: bestContract.openInterest || 0,
        lotSize: lotSize
      },
      calculation: {
        positionSize: positionCalc.lots,
        totalInvestment: positionCalc.amount,
        riskAmount: (capital * riskPercentage) / 100
      },
      metadata: {
        atmStrike: atmStrike,
        availableStrikes: strikes,
        selectedExpiryDays: selectedExpiry.daysToExpiry,
        timestamp: new Date().toISOString()
      }
    }

    console.log(`✅ Simulation completed successfully`)

    return NextResponse.json({
      success: true,
      data: simulationResult,
      message: 'Options simulation completed successfully'
    })

  } catch (error) {
    console.error('❌ Options simulation error:', error)
    return NextResponse.json(
      { 
        error: 'Options simulation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}