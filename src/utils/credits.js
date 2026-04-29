import { createClient } from './supabase'

/**
 * Credit Management System
 * Handles checking and deducting credits for AI usage.
 */
export const creditManager = {
  // Costs in credits
  COSTS: {
    SCRIPT: 1,
    IMAGE: 5,
    VIDEO_VEO: 50,
  },

  async getBalance(userId) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single()
    
    if (error) throw error
    return data.credits
  },

  async deductCredits(userId, amount) {
    const supabase = createClient()
    
    // We use a RPC (Stored Procedure) to ensure atomic decrement
    // This prevents "Double Spend" issues
    const { data, error } = await supabase.rpc('deduct_credits', {
      user_id: userId,
      amount: amount
    })

    if (error) throw new Error("Insufficient credits or database error")
    return data
  }
}
