// Debug API to check available Nifty instruments
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { ZerodhaAPI } from '../../../../lib/zerodha'
import User from '../../../../models/User'

/**
 * GET /api/admin/debug-instruments - Debug Nifty instruments available
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

    // Get connected user
    const user = await User.findOne({ 'zerodhaConfig.isConnected': true })
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'No connected Zerodha user found'
      }, { status: 400 })
    }

    const zerodha = new ZerodhaAPI()
    zerodha.setCredentials(
      user.zerodhaConfig.apiKey,
      user.zerodhaConfig.apiSecret,
      user.zerodhaConfig.accessToken
    )

    console.log('🔍 Fetching instruments for debugging...')

    // Get instruments from different exchanges
    const nfoInstruments = await zerodha.getInstruments('NFO')
    const nseInstruments = await zerodha.getInstruments('NSE')

    // Filter for Nifty-related instruments
    const niftyNFO = nfoInstruments.filter((inst: any) => 
      inst.name === 'NIFTY' || inst.tradingsymbol.includes('NIFTY')
    ).slice(0, 20) // Limit for debugging

    const niftyNSE = nseInstruments.filter((inst: any) => 
      inst.name === 'NIFTY 50' || 
      inst.name === 'NIFTY' || 
      inst.tradingsymbol.includes('NIFTY')
    ).slice(0, 20) // Limit for debugging

    return NextResponse.json({
      success: true,
      debug: {
        nfo: {
          total: nfoInstruments.length,
          niftyCount: niftyNFO.length,
          samples: niftyNFO.map(inst => ({
            name: inst.name,
            tradingsymbol: inst.tradingsymbol,
            instrument_type: inst.instrument_type,
            instrument_token: inst.instrument_token,
            expiry: inst.expiry,
            exchange: inst.exchange
          }))
        },
        nse: {
          total: nseInstruments.length,
          niftyCount: niftyNSE.length,
          samples: niftyNSE.map(inst => ({
            name: inst.name,
            tradingsymbol: inst.tradingsymbol,
            instrument_type: inst.instrument_type,
            instrument_token: inst.instrument_token,
            exchange: inst.exchange
          }))
        }
      }
    })

  } catch (error: any) {
    console.error('Debug instruments error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}