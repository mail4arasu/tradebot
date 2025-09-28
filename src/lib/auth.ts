import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import clientPromise from './mongodb'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          const client = await clientPromise
          const users = client.db('tradebot').collection('users')
          
          const user = await users.findOne({ email: credentials.email })
          
          if (!user) {
            return null
          }

          // Check password
          if (user.password && await bcrypt.compare(credentials.password, user.password)) {
            return {
              id: user._id.toString(),
              email: user.email,
              name: user.name,
              image: user.image,
            }
          }
          
          return null
        } catch (error) {
          console.error('Auth error:', error)
          return null
        }
      }
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'dummy',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy',
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        // For both credential and OAuth users, get the ID from our users collection
        try {
          const client = await clientPromise
          const usersCollection = client.db('tradebot').collection('users')
          const dbUser = await usersCollection.findOne({ email: user.email })
          if (dbUser) {
            token.id = dbUser._id.toString()
            token.role = dbUser.role || 'user'
            token.email = dbUser.email
            token.name = dbUser.name
          } else {
            // If user not found in our collection, use the provided user data
            token.id = user.id
            token.email = user.email
            token.name = user.name
          }
        } catch (error) {
          console.error('Error fetching user in JWT callback:', error)
          token.id = user.id
          token.email = user.email
          token.name = user.name
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        // Add role to session for admin checks
        session.user.role = token.role as string
      }
      return session
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        // For Google OAuth users, ensure they get saved to our users collection with default role
        try {
          const client = await clientPromise
          const usersCollection = client.db('tradebot').collection('users')
          
          const existingUser = await usersCollection.findOne({ email: user.email })
          if (!existingUser) {
            const result = await usersCollection.insertOne({
              name: user.name,
              email: user.email,
              image: user.image,
              emailVerified: new Date(),
              role: 'user',
              status: 'active',
              authProvider: 'google',
              createdAt: new Date(),
              updatedAt: new Date()
            })
            console.log('Created new Google OAuth user:', result.insertedId)
          } else {
            // Update last login for existing user
            await usersCollection.updateOne(
              { email: user.email },
              { $set: { lastLoginAt: new Date(), updatedAt: new Date() } }
            )
            console.log('Updated existing Google OAuth user login:', existingUser._id)
          }
        } catch (error) {
          console.error('Error saving Google OAuth user:', error)
          return false
        }
      }
      return true
    },
  },
  pages: {
    signIn: '/signin',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
}