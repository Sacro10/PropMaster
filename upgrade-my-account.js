/**
 * Automatic Account Upgrade Script
 * Run this with: node upgrade-my-account.js
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing environment variables')
  console.error('Make sure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function upgradeAccountToPremium() {
  try {
    console.log('🔍 Finding your account...')

    // Get the first user (assuming it's your account)
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers()

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`)
    }

    if (!users || users.users.length === 0) {
      throw new Error('No users found. Please sign up first.')
    }

    const user = users.users[0]
    console.log(`✅ Found user: ${user.email}`)

    // Get the account for this user
    const { data: accountMembers, error: membersError } = await supabase
      .from('account_members')
      .select('account_id')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .limit(1)

    if (membersError) {
      throw new Error(`Failed to fetch account: ${membersError.message}`)
    }

    if (!accountMembers || accountMembers.length === 0) {
      throw new Error('No account found for this user. Please complete signup first.')
    }

    const accountId = accountMembers[0].account_id
    console.log(`✅ Found account ID: ${accountId}`)

    // Update the account to Premium
    console.log('⬆️  Upgrading to Premium...')

    const { data: updatedAccount, error: updateError } = await supabase
      .from('accounts')
      .update({
        plan: 'premium',
        subscription_status: 'active',
        max_units: 999999,
        updated_at: new Date().toISOString()
      })
      .eq('id', accountId)
      .select()
      .single()

    if (updateError) {
      throw new Error(`Failed to update account: ${updateError.message}`)
    }

    console.log('✅ Account upgraded successfully!')
    console.log('\n📊 Account Details:')
    console.log(`   Plan: ${updatedAccount.plan.toUpperCase()}`)
    console.log(`   Status: ${updatedAccount.subscription_status}`)
    console.log(`   Max Units: ${updatedAccount.max_units === 999999 ? 'Unlimited' : updatedAccount.max_units}`)
    console.log('\n🎉 You now have access to all Premium features!')
    console.log('\n💡 Refresh your browser to see the changes.')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

// Run the upgrade
upgradeAccountToPremium()
