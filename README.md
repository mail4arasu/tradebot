# TradeBot Portal

A comprehensive trade automation platform with Zerodha integration, allowing users to deploy multiple trading bots, perform backtesting, and manage their trading strategies through a modern web interface.

## Features

- **Multi-Provider Authentication**: Social media (Google, GitHub) and email authentication
- **Secure Zerodha Integration**: Bank-grade encryption for API credentials
- **Multiple Trading Bots**: Various algorithmic strategies for different market conditions
- **Advanced Backtesting**: Test strategies on historical data before deployment
- **Real-time Dashboard**: Live trading metrics and performance analytics
- **Trade History**: Comprehensive trade analysis with date filtering
- **Risk Management**: Built-in position sizing and stop-loss mechanisms

## Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript, Tailwind CSS
- **Authentication**: NextAuth.js with MongoDB adapter
- **Database**: MongoDB with Mongoose ODM
- **API Integration**: Zerodha Connect API
- **Security**: AES-256 encryption for sensitive data
- **UI Components**: Custom components with Radix UI primitives

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MongoDB instance (local or cloud)
- Zerodha Developer Account

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd tradebot-portal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Fill in the required environment variables:
   - MongoDB connection string
   - NextAuth secret and OAuth provider credentials
   - Encryption key for API credentials
   - Twilio credentials for SMS verification (optional)

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `NEXTAUTH_SECRET` | NextAuth.js secret key | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Optional |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Optional |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | Optional |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | Optional |
| `ENCRYPTION_KEY` | 32-character key for API encryption | Yes |
| `TWILIO_ACCOUNT_SID` | Twilio account SID for SMS | Optional |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Optional |

## Zerodha Integration Setup

1. **Create a Developer Account**
   - Visit [Zerodha Developers](https://developers.zerodha.com/)
   - Sign up with your Zerodha credentials

2. **Create a New App**
   - Choose "Connect" as the app type
   - Set app name: "TradeBot Portal"
   - Configure redirect URL for production

3. **Get API Credentials**
   - Copy your API Key and API Secret
   - Enter them in the Settings page of the application

4. **Test Connection**
   - Use the "Test Connection" button to verify integration
   - Successful connection will display your account balance

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard page
│   ├── settings/          # Settings page
│   └── ...
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   └── layout/           # Layout components
├── lib/                  # Utilities and configurations
├── models/               # Mongoose schemas
├── types/                # TypeScript type definitions
└── utils/                # Helper functions
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript compiler

## Security Features

- **API Key Encryption**: All Zerodha API credentials are encrypted using AES-256
- **Session Management**: Secure session handling with NextAuth.js
- **Input Validation**: Comprehensive validation for all user inputs
- **Rate Limiting**: Built-in protection against API abuse
- **CORS Configuration**: Proper cross-origin resource sharing setup

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Disclaimer

This software is for educational and research purposes. Trading in financial markets involves substantial risk. Users are responsible for their own trading decisions and should conduct thorough research before deploying any trading strategies.
