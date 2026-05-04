import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const { listingPrice, listingId, eventId, sellerId } = req.body;

  const amountPence = Math.round(listingPrice * 100) + 99; // buyer pays price + 99p

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountPence,
    currency: 'gbp',
    application_fee_amount: 99, // Exeticket keeps 99p
    transfer_data: {
      destination: sellerId, // seller's Stripe Connect account ID
    },
    metadata: { listingId, eventId, sellerId },
    capture_method: 'manual', // hold funds, don't capture yet
  });

  res.json({ clientSecret: paymentIntent.client_secret });
}
