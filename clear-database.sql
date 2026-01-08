-- WARNING: This will completely clear your Supabase database
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/orgefuaujqiluulzhzeg
-- This operation is IRREVERSIBLE - make sure you have backups if needed!

-- Disable triggers to avoid issues during cleanup
SET session_replication_role = 'replica';

-- Drop all tables in public schema (CASCADE will drop dependent objects)
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all tables
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;

    -- Drop all views
    FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public')
    LOOP
        EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.viewname) || ' CASCADE';
    END LOOP;

    -- Drop all functions
    FOR r IN (SELECT proname, oidvectortypes(proargtypes) as argtypes
              FROM pg_proc
              INNER JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
              WHERE pg_namespace.nspname = 'public')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.argtypes || ') CASCADE';
    END LOOP;

    -- Drop all sequences
    FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public')
    LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequencename) || ' CASCADE';
    END LOOP;

    -- Drop all custom types
    FOR r IN (SELECT typname FROM pg_type
              INNER JOIN pg_namespace ON pg_type.typnamespace = pg_namespace.oid
              WHERE pg_namespace.nspname = 'public' AND typtype = 'e')
    LOOP
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END $$;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Verify everything is cleared
SELECT 'Tables: ' || COUNT(*)::text FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'Views: ' || COUNT(*)::text FROM pg_views WHERE schemaname = 'public'
UNION ALL
SELECT 'Functions: ' || COUNT(*)::text FROM pg_proc
    INNER JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
    WHERE pg_namespace.nspname = 'public'
UNION ALL
SELECT 'Sequences: ' || COUNT(*)::text FROM pg_sequences WHERE schemaname = 'public'
UNION ALL
SELECT 'Types: ' || COUNT(*)::text FROM pg_type
    INNER JOIN pg_namespace ON pg_type.typnamespace = pg_namespace.oid
    WHERE pg_namespace.nspname = 'public' AND typtype = 'e';
