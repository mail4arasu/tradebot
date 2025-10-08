import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 DEBUG WEBHOOK ENDPOINT - Analyzing payload...')
    
    // Get raw body as text
    const rawPayload = await request.text()
    
    console.log('📋 Raw Payload (Full):', rawPayload)
    console.log('📏 Payload Length:', rawPayload.length)
    console.log('🔤 Content-Type:', request.headers.get('content-type'))
    
    // Character analysis around position 102 (where the error occurred)
    if (rawPayload.length > 102) {
      console.log('🔍 Character at position 102:', `"${rawPayload.charAt(102)}" (ASCII: ${rawPayload.charCodeAt(102)})`)
      console.log('🔍 Context around position 102:', `"${rawPayload.substring(95, 110)}"`)
      
      // Show a wider context for better understanding
      console.log('🔍 Wider context (90-120):', `"${rawPayload.substring(90, 120)}"`)
    }
    
    // Try to parse as JSON to identify the exact issue
    let parseResult = { success: false, error: '', data: null }
    try {
      const parsed = JSON.parse(rawPayload)
      parseResult.success = true
      parseResult.data = parsed
      console.log('✅ JSON parsing successful:', parsed)
    } catch (jsonError) {
      parseResult.error = jsonError.message
      console.log('❌ JSON parsing failed:', jsonError.message)
      
      // Try to identify common JSON issues
      const analysis = analyzeJSONError(rawPayload, jsonError.message)
      console.log('🔬 JSON Error Analysis:', analysis)
    }
    
    // Character-by-character analysis around the error position
    if (rawPayload.length > 95 && rawPayload.length > 110) {
      console.log('🔤 Character-by-character analysis around position 102:')
      for (let i = 95; i <= Math.min(110, rawPayload.length - 1); i++) {
        const char = rawPayload.charAt(i)
        const ascii = rawPayload.charCodeAt(i)
        const isSpecial = ascii < 32 || ascii > 126
        console.log(`   Position ${i}: "${char}" (ASCII: ${ascii})${isSpecial ? ' ⚠️ SPECIAL CHARACTER' : ''}`)
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Debug analysis completed',
      analysis: {
        rawPayload,
        payloadLength: rawPayload.length,
        contentType: request.headers.get('content-type'),
        parseResult,
        charAtPosition102: rawPayload.length > 102 ? {
          character: rawPayload.charAt(102),
          ascii: rawPayload.charCodeAt(102),
          context: rawPayload.substring(95, 110)
        } : null
      }
    })
    
  } catch (error) {
    console.error('❌ Debug webhook error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}

function analyzeJSONError(payload: string, errorMessage: string): any {
  const analysis = {
    likelyIssues: [],
    suggestions: []
  }
  
  // Check for common JSON issues
  if (errorMessage.includes('Unexpected string')) {
    analysis.likelyIssues.push('Unescaped quotes or improper string formatting')
    analysis.suggestions.push('Check for unescaped quotes in string values')
  }
  
  if (errorMessage.includes('position')) {
    const position = errorMessage.match(/position (\d+)/)?.[1]
    if (position) {
      const pos = parseInt(position)
      if (payload.length > pos) {
        analysis.likelyIssues.push(`Syntax error at character: "${payload.charAt(pos)}"`)
      }
    }
  }
  
  // Check for common formatting issues
  if (payload.includes('\n') || payload.includes('\r')) {
    analysis.likelyIssues.push('Contains newline characters')
    analysis.suggestions.push('Remove or escape newline characters')
  }
  
  if (payload.includes('\t')) {
    analysis.likelyIssues.push('Contains tab characters')
    analysis.suggestions.push('Remove or escape tab characters')
  }
  
  // Check for trailing commas
  if (payload.includes(',}') || payload.includes(',]')) {
    analysis.likelyIssues.push('Trailing commas detected')
    analysis.suggestions.push('Remove trailing commas')
  }
  
  // Check for unescaped quotes
  const quoteMatches = payload.match(/[^\\]"/g)
  if (quoteMatches && quoteMatches.length % 2 !== 0) {
    analysis.likelyIssues.push('Possible unescaped quotes')
    analysis.suggestions.push('Escape quotes in string values with backslash')
  }
  
  return analysis
}