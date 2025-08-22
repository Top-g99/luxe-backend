require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Test database connection
async function testConnection() {
  try {
    console.log('🔌 Testing Supabase connection...');
    
    // Create Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    console.log('✅ Supabase client created');
    
    // Test query - get user count
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('count', { count: 'exact' });
    
    if (userError) {
      throw userError;
    }
    
    console.log('✅ Database query successful');
    console.log(`📊 Found ${users} users in database`);
    
    // Test query - get properties
    const { data: properties, error: propError } = await supabase
      .from('properties')
      .select('*');
    
    if (propError) {
      throw propError;
    }
    
    console.log(`🏠 Found ${properties.length} properties in database`);
    
    // Test query - get bookings
    const { data: bookings, error: bookError } = await supabase
      .from('bookings')
      .select('*');
    
    if (bookError) {
      throw bookError;
    }
    
    console.log(`📅 Found ${bookings.length} bookings in database`);
    
    console.log('\n🎉 All database tests passed! Your Supabase setup is working perfectly!');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testConnection();
