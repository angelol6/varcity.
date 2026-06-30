import { createClient } from '@supabase/supabase-js'

// Variabili lette dal file .env (hardcoded for GitHub Pages deployment)
const supabaseUrl = 'https://iyyprqcrfwwqihglfkaa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eXBycWNyZnd3cWloZ2xma2FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4Mjc1ODQsImV4cCI6MjA5ODQwMzU4NH0.2skvG6vdXx27xeUncNkLe1Q6lsTXnxB9nF9lW-1Hbx0';

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;
