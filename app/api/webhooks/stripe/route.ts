import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET missing");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId =
      session.client_reference_id ??
      (session.metadata?.user_id as string | null);
    if (!userId) {
      console.error("[webhook] No user_id in session");
      return NextResponse.json({ received: true });
    }

    try {
      const supabase = createAdminClient();
      await supabase.from("profiles").upsert(
        {
          id: userId,
          stripe_customer_id: session.customer as string | null,
          subscription_status: "active",
        },
        { onConflict: "id" },
      );
    } catch (err) {
      console.error("[webhook] Failed to update profile", err);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 },
      );
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    try {
      const supabase = createAdminClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();
      if (profile) {
        await supabase
          .from("profiles")
          .update({ subscription_status: "canceled" })
          .eq("id", profile.id);
      }
    } catch (err) {
      console.error("[webhook] Failed to update subscription status", err);
    }
  }

  return NextResponse.json({ received: true });
}
