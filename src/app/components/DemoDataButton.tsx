/**
 * Demo Data Button Component
 * UI for seeding and deleting demo data
 */

import React, { useState } from 'react';
import { Database, Trash2, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { seedDemoData, deleteDemoData } from '../../lib/demoData';

export function DemoDataButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; counts?: any } | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const handleSeedData = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await seedDemoData();
      setResult(response);
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || 'Failed to seed data',
      });
    } finally {
      setLoading(false);
      setTimeout(() => setShowMenu(false), 3000);
    }
  };

  const handleDeleteData = async () => {
    if (!confirm('Are you sure you want to delete ALL data for this account? This cannot be undone!')) {
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await deleteDemoData();
      setResult(response);
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || 'Failed to delete data',
      });
    } finally {
      setLoading(false);
      setTimeout(() => setShowMenu(false), 3000);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
        title="Demo Data Tools"
      >
        <Database className="w-4 h-4" />
        Demo Data
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Database className="w-5 h-5" />
              Demo Data Tools
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Development utilities for testing
            </p>
          </div>

          <div className="p-4 space-y-3">
            {!loading && !result && (
              <>
                <button
                  onClick={handleSeedData}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Database className="w-4 h-4" />
                  Seed Demo Data
                </button>

                <button
                  onClick={handleDeleteData}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete All Data
                </button>
              </>
            )}

            {loading && (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-gray-700 dark:text-gray-300">Processing...</span>
              </div>
            )}

            {result && (
              <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                <div className="flex items-start gap-3">
                  {result.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${result.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                      {result.message}
                    </p>
                    {result.success && result.counts && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-green-700 dark:text-green-400">
                          ✓ {result.counts.properties} properties
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-400">
                          ✓ {result.counts.units} units
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-400">
                          ✓ {result.counts.tenants} tenants
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-400">
                          ✓ {result.counts.maintenance} maintenance requests
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-400">
                          ✓ {result.counts.payments} payments
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              ⚠️ Use only in development. Seed creates sample data, Delete removes ALL account data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
