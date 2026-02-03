/**
 * Mixpanel Analytics Service
 * Tracking de conversão premium (backend - Camada 3)
 */

import Mixpanel from 'mixpanel';

// Inicializar Mixpanel com token do ambiente
const mixpanel = process.env.MIXPANEL_TOKEN
  ? Mixpanel.init(process.env.MIXPANEL_TOKEN, {
      protocol: 'https',
      host: 'api-eu.mixpanel.com', // EU data residency
    })
  : null;

// Interface para propriedades de subscription paid
interface SubscriptionPaidProperties {
  plan_id: 'monthly' | 'annual';
  mp_status: string;
  payment_method?: string;
  transaction_amount?: number;
  mp_id?: string;
  preference_id?: string;
}

// Interface para propriedades de payment failed
interface PaymentFailedProperties {
  plan_id?: 'monthly' | 'annual';
  mp_status?: string;
  error_message?: string;
  mp_id?: string;
  preference_id?: string;
}

/**
 * Track quando assinatura é paga com sucesso (webhook)
 */
export function trackSubscriptionPaid(
  userId: string,
  props: SubscriptionPaidProperties
): void {
  if (!mixpanel) {
    console.warn('[Mixpanel] Token not configured, skipping trackSubscriptionPaid');
    return;
  }

  try {
    mixpanel.track('Subscription Paid', {
      distinct_id: userId,
      ...props,
      provider: 'mercadopago',
      source: 'backend_webhook',
      timestamp: new Date().toISOString(),
    });

    console.log('[Mixpanel] Subscription Paid tracked:', {
      userId,
      plan_id: props.plan_id,
      mp_status: props.mp_status,
    });
  } catch (error) {
    console.error('[Mixpanel] Error tracking Subscription Paid:', error);
  }
}

/**
 * Track quando pagamento falha (webhook)
 */
export function trackPaymentFailed(
  userId: string,
  props: PaymentFailedProperties
): void {
  if (!mixpanel) {
    console.warn('[Mixpanel] Token not configured, skipping trackPaymentFailed');
    return;
  }

  try {
    mixpanel.track('Payment Failed', {
      distinct_id: userId,
      ...props,
      provider: 'mercadopago',
      source: 'backend_webhook',
      timestamp: new Date().toISOString(),
    });

    console.log('[Mixpanel] Payment Failed tracked:', {
      userId,
      mp_status: props.mp_status,
      error_message: props.error_message,
    });
  } catch (error) {
    console.error('[Mixpanel] Error tracking Payment Failed:', error);
  }
}

/**
 * Track quando assinatura é criada (webhook)
 */
export function trackSubscriptionCreated(
  userId: string,
  props: {
    plan_id: 'monthly' | 'annual';
    mp_status: string;
    preapproval_id?: string;
    preference_id?: string;
  }
): void {
  if (!mixpanel) {
    console.warn('[Mixpanel] Token not configured, skipping trackSubscriptionCreated');
    return;
  }

  try {
    mixpanel.track('Subscription Created', {
      distinct_id: userId,
      ...props,
      provider: 'mercadopago',
      source: 'backend_webhook',
      timestamp: new Date().toISOString(),
    });

    console.log('[Mixpanel] Subscription Created tracked:', {
      userId,
      plan_id: props.plan_id,
      mp_status: props.mp_status,
    });
  } catch (error) {
    console.error('[Mixpanel] Error tracking Subscription Created:', error);
  }
}

/**
 * Verifica se Mixpanel está configurado
 */
export function isMixpanelConfigured(): boolean {
  return mixpanel !== null;
}
