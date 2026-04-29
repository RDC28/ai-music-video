import { NextResponse } from 'next/server';
import stripe from 'stripe';
import { createClient } from '@/utils/supabase';

const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;

  try {
    event = stripeClient.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  // Handle successful payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;
    const creditAmount = parseInt(session.metadata.credits);

    const supabase = createClient();
    
    // Update the user's credit balance in Supabase
    const { error } = await supabase
      .from('profiles')
      .update({ credits: supabase.sql`credits + ${creditAmount}` })
      .eq('id', userId);

    if (error) {
      console.error('Failed to update credits:', error);
      return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
