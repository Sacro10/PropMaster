/**
 * Database Query Example Component
 *
 * This demonstrates how to query data from Supabase with full TypeScript support.
 * Shows CRUD operations (Create, Read, Update, Delete) for properties.
 */

import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import type { Property, PropertyInsert } from '../database.types'

export function DatabaseExample() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newPropertyName, setNewPropertyName] = useState('')
  const [newPropertyAddress, setNewPropertyAddress] = useState('')

  // Fetch properties on mount
  useEffect(() => {
    fetchProperties()
  }, [])

  const fetchProperties = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      setProperties(data || [])
    } catch (err: any) {
      setError(err.message)
      console.error('Error fetching properties:', err)
    } finally {
      setLoading(false)
    }
  }

  const addProperty = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setError(null)

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('You must be logged in to add properties')
      }

      // Create new property
      const newProperty: PropertyInsert = {
        user_id: user.id,
        name: newPropertyName,
        address: newPropertyAddress,
        units: 1,
      }

      const { data, error } = await supabase
        .from('properties')
        .insert(newProperty)
        .select()
        .single()

      if (error) throw error

      // Add to list and clear form
      setProperties([data, ...properties])
      setNewPropertyName('')
      setNewPropertyAddress('')
    } catch (err: any) {
      setError(err.message)
      console.error('Error adding property:', err)
    }
  }

  const deleteProperty = async (id: string) => {
    try {
      setError(null)

      const { error } = await supabase.from('properties').delete().eq('id', id)

      if (error) throw error

      // Remove from list
      setProperties(properties.filter((p) => p.id !== id))
    } catch (err: any) {
      setError(err.message)
      console.error('Error deleting property:', err)
    }
  }

  const updatePropertyUnits = async (id: string, newUnits: number) => {
    try {
      setError(null)

      const { data, error } = await supabase
        .from('properties')
        .update({ units: newUnits })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Update in list
      setProperties(properties.map((p) => (p.id === id ? data : p)))
    } catch (err: any) {
      setError(err.message)
      console.error('Error updating property:', err)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-8">Loading properties...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Database Query Example</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Add Property Form */}
      <form onSubmit={addProperty} className="mb-8 p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-semibold mb-4">Add New Property</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Property Name</label>
            <input
              type="text"
              value={newPropertyName}
              onChange={(e) => setNewPropertyName(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Sunset Apartments"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <input
              type="text"
              value={newPropertyAddress}
              onChange={(e) => setNewPropertyAddress(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123 Main St"
              required
            />
          </div>
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Add Property
        </button>
      </form>

      {/* Properties List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Properties ({properties.length})
          </h3>
          <button
            onClick={fetchProperties}
            className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
          >
            Refresh
          </button>
        </div>

        {properties.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No properties yet. Add one above to get started!
          </div>
        ) : (
          <div className="space-y-3">
            {properties.map((property) => (
              <div
                key={property.id}
                className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-lg">{property.name}</h4>
                    <p className="text-sm text-gray-600">{property.address}</p>
                    <div className="mt-2 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <label className="text-sm">Units:</label>
                        <input
                          type="number"
                          value={property.units}
                          onChange={(e) =>
                            updatePropertyUnits(
                              property.id,
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-20 px-2 py-1 border rounded text-sm"
                          min="0"
                        />
                      </div>
                      <span className="text-xs text-gray-500">
                        Created: {new Date(property.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteProperty(property.id)}
                    className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> This example requires the <code>properties</code> table
          to exist in your Supabase database with RLS policies enabled.
          <br />
          See <code>src/lib/examples/DatabaseExample.tsx</code> for the code.
        </p>
      </div>
    </div>
  )
}
