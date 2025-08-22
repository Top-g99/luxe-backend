const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Helper function to create a client with user JWT
const createUserClient = (jwt) => {
    return createClient(supabaseUrl, supabaseServiceKey, {
        global: {
            headers: {
                Authorization: `Bearer ${jwt}`
            }
        }
    });
};

// Database helper functions
const db = {
    // Properties
    async getProperties(filters = {}, page = 1, limit = 10) {
        let query = supabase
            .from('properties')
            .select(`
        *,
        profiles!properties_host_id_fkey (
          first_name,
          last_name,
          avatar_url
        )
      `)
            .eq('status', 'active');

        // Apply filters
        if (filters.location) {
            query = query.ilike('location', `%${filters.location}%`);
        }

        if (filters.minPrice) {
            query = query.gte('price_per_night', filters.minPrice);
        }

        if (filters.maxPrice) {
            query = query.lte('price_per_night', filters.maxPrice);
        }

        if (filters.amenities && filters.amenities.length > 0) {
            query = query.overlaps('amenities', filters.amenities);
        }

        // Pagination
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        return { data, count };
    },

    async getPropertyById(id) {
        const { data, error } = await supabase
            .from('properties')
            .select(`
        *,
        profiles!properties_host_id_fkey (
          first_name,
          last_name,
          avatar_url,
          phone
        ),
        reviews (
          id,
          rating,
          comment,
          created_at,
          bookings!reviews_booking_id_fkey (
            profiles!bookings_guest_id_fkey (
              first_name,
              last_name
            )
          )
        )
      `)
            .eq('id', id)
            .eq('status', 'active')
            .single();

        if (error) throw error;
        return data;
    },

    // Bookings
    async createBooking(bookingData) {
        const { data, error } = await supabase
            .from('bookings')
            .insert(bookingData)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getUserBookings(userId) {
        const { data, error } = await supabase
            .from('bookings')
            .select(`
        *,
        properties (
          id,
          title,
          location,
          image_urls,
          profiles!properties_host_id_fkey (
            first_name,
            last_name
          )
        )
      `)
            .eq('guest_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async updateBookingStatus(bookingId, status) {
        const { data, error } = await supabase
            .from('bookings')
            .update({ status })
            .eq('id', bookingId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Availability check
    async checkPropertyAvailability(propertyId, checkInDate, checkOutDate) {
        const { data, error } = await supabase
            .from('bookings')
            .select('id, status')
            .eq('property_id', propertyId)
            .or(`status.eq.confirmed,status.eq.pending`)
            .overlaps('check_in_date', checkInDate, checkOutDate)
            .or('check_out_date.overlaps', checkInDate, checkOutDate);

        if (error) throw error;

        // If there are any overlapping bookings, property is not available
        return data.length === 0;
    },

    // Get property details for price calculation
    async getPropertyForBooking(propertyId) {
        const { data, error } = await supabase
            .from('properties')
            .select('id, price_per_night, cleaning_fee, security_deposit')
            .eq('id', propertyId)
            .eq('status', 'active')
            .single();

        if (error) throw error;
        return data;
    }
};

module.exports = {
    supabase,
    createUserClient,
    db
};