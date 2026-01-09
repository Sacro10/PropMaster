#!/bin/bash

# Property Management App - Database Migration Runner
# This script applies the 003_complete_schema.sql migration to the database

echo "🗄️  Property Management App - Database Migration"
echo ""
echo "⚠️  WARNING: This will modify your database schema"
echo "   Make sure you have a backup before proceeding!"
echo ""
read -p "Do you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Migration cancelled."
  exit 0
fi

echo ""
echo "📋 Running migration: 003_complete_schema.sql"
echo ""

# Set environment variables
export SUPABASE_URL="https://orgefuaujqiluulzhzeg.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2VmdWF1anFpbHV1bHpoemVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjcwOCwiZXhwIjoyMDgzMzcyNzA4fQ.ycG37inQesKufMZ_sUhk_WwCjDna8LfMORe6XOCnu9Q"

# Run the migration using psql or a TypeScript migration runner
# Option 1: Using psql (if you have direct database access)
# psql "$DATABASE_URL" -f supabase/migrations/003_complete_schema.sql

# Option 2: Using Supabase CLI
# supabase db push

# Option 3: Manual execution - Copy and paste the SQL into Supabase SQL Editor
echo "To run this migration, you have the following options:"
echo ""
echo "Option 1: Use Supabase Dashboard SQL Editor"
echo "  1. Go to: https://supabase.com/dashboard/project/orgefuaujqiluulzhzeg/sql/new"
echo "  2. Copy the contents of: supabase/migrations/003_complete_schema.sql"
echo "  3. Paste into the SQL Editor"
echo "  4. Click 'Run'"
echo ""
echo "Option 2: Use Supabase CLI (if installed)"
echo "  Run: supabase db push"
echo ""
echo "Option 3: Use the migration runner script"
echo "  Run: npx ts-node server/src/scripts/runMigration.ts"
echo ""

# Create a TypeScript migration runner
cat > server/src/scripts/runMigration.ts << 'EOFTS'
/**
 * Database Migration Runner
 * Applies the 003_complete_schema.sql migration to the database
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  try {
    console.log('📖 Reading migration file...');

    const migrationPath = join(__dirname, '../../../supabase/migrations/003_complete_schema.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('🚀 Executing migration...');
    console.log('   Migration size:', sql.length, 'characters');
    console.log('');

    // Split the SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log('📝 Found', statements.length, 'SQL statements to execute');
    console.log('');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';

      try {
        const { error } = await supabase.rpc('exec_sql', { sql_string: statement });

        if (error) {
          console.error(`❌ Statement ${i + 1} failed:`, error.message);
          errorCount++;
        } else {
          successCount++;
          process.stdout.write(`\r✅ Executed ${successCount}/${statements.length} statements`);
        }
      } catch (err) {
        console.error(`\n❌ Statement ${i + 1} error:`, err);
        errorCount++;
      }
    }

    console.log('\n');
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log('');

    if (errorCount === 0) {
      console.log('✅ Migration completed successfully!');
      process.exit(0);
    } else {
      console.log('⚠️  Migration completed with errors. Please review the output above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
EOFTS

echo "✅ Created migration runner script at: server/src/scripts/runMigration.ts"
echo ""
echo "To run the migration now, execute:"
echo "  npx ts-node server/src/scripts/runMigration.ts"
echo ""
