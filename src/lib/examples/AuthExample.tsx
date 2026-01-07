/**
 * Auth Example Component
 *
 * This demonstrates how to use the auth helper functions in a React component.
 * You can use this as a reference or starting point for your own auth flows.
 */

import { useState, useEffect } from 'react'
import {
  getSession,
  signInWithPassword,
  signUp,
  signOut,
  onAuthStateChange,
} from '../auth'
import type { User } from '@supabase/supabase-js'

export function AuthExample() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check for existing session on mount
  useEffect(() => {
    async function checkSession() {
      const { user } = await getSession()
      setUser(user)
    }
    checkSession()
  }, [])

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChange((event, session) => {
      console.log('Auth event:', event)
      setUser(session?.user ?? null)
    })

    return () => unsubscribe()
  }, [])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { user, error } = await signInWithPassword(email, password)

    if (error) {
      setError(error.message)
    } else {
      setUser(user)
    }

    setLoading(false)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { user, error } = await signUp(email, password, {
      data: {
        subscription_tier: 'basic',
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setUser(user)
    }

    setLoading(false)
  }

  const handleSignOut = async () => {
    setLoading(true)
    await signOut()
    setUser(null)
    setLoading(false)
  }

  // If user is logged in, show their info and sign out button
  if (user) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold mb-4">Welcome!</h2>
        <div className="space-y-2 mb-4">
          <p>
            <strong>Email:</strong> {user.email}
          </p>
          <p>
            <strong>User ID:</strong> {user.id}
          </p>
          <p>
            <strong>Created:</strong> {new Date(user.created_at).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="w-full py-2 px-4 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    )
  }

  // If not logged in, show login/signup forms
  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Authentication Example</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <form className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
            required
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="flex-1 py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Sign In'}
          </button>

          <button
            onClick={handleSignUp}
            disabled={loading}
            className="flex-1 py-2 px-4 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Sign Up'}
          </button>
        </div>
      </form>

      <p className="mt-4 text-sm text-gray-600">
        This is an example component demonstrating the auth helpers.
        <br />
        See <code>src/lib/examples/AuthExample.tsx</code> for the code.
      </p>
    </div>
  )
}
