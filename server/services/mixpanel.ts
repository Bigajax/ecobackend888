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
  plan_id: 'essentials' | 'monthly' | 'annual';
  mp_status: string;
  payment_method?: string;
  transaction_amount?: number;
  mp_id?: string;
  preference_id?: string;
}

// Interface para propriedades de payment failed
interface PaymentFailedProperties {
  plan_id?: 'essentials' | 'monthly' | 'annual';
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
    plan_id: 'essentials' | 'monthly' | 'annual';
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

// Interface para os eventos do funil sono/protocolo (convenção pt "Domínio · ação")
interface FunilProtocoloCompraProperties {
  email?: string | null;
  value: number; // número (ex.: 15.9), nunca string
  plan_id: 'monthly' | 'annual';
}

/**
 * Track "Funil Protocolo · Compra aprovada" (início do trial).
 *
 * Disparado server-side pelo webhook do Mercado Pago quando o trial é autorizado.
 * É o sinal de conversão usado para otimização — NÃO representa receita real
 * (cobrança é R$0 hoje; quem cancelar no trial entra aqui mesmo assim). Receita
 * real vem do evento "Pagamento confirmado" abaixo.
 */
export function trackFunilProtocoloCompraAprovada(
  userId: string,
  props: FunilProtocoloCompraProperties
): void {
  if (!mixpanel) {
    console.warn('[Mixpanel] Token not configured, skipping Compra aprovada');
    return;
  }

  try {
    mixpanel.track('Funil Protocolo · Compra aprovada', {
      distinct_id: userId,
      email: props.email ?? undefined,
      value: props.value,
      plan_id: props.plan_id,
      currency: 'BRL',
      stage: 'trial_start',
      provider: 'mercadopago',
      source: 'backend_webhook',
      timestamp: new Date().toISOString(),
    });

    console.log('[Mixpanel] Funil Protocolo · Compra aprovada tracked:', {
      userId,
      value: props.value,
      plan_id: props.plan_id,
    });
  } catch (error) {
    console.error('[Mixpanel] Error tracking Compra aprovada:', error);
  }
}

/**
 * Track "Funil Protocolo · Pagamento confirmado" (cobrança real pós-trial / renovação).
 *
 * É o sinal trial→pago — a métrica que mede se a assinatura com trial converte de
 * verdade em receita. Disparado server-side na 1ª cobrança real e nas renovações.
 */
export function trackFunilProtocoloPagamentoConfirmado(
  userId: string,
  props: FunilProtocoloCompraProperties & { charged_quantity?: number }
): void {
  if (!mixpanel) {
    console.warn('[Mixpanel] Token not configured, skipping Pagamento confirmado');
    return;
  }

  try {
    mixpanel.track('Funil Protocolo · Pagamento confirmado', {
      distinct_id: userId,
      email: props.email ?? undefined,
      value: props.value,
      plan_id: props.plan_id,
      currency: 'BRL',
      stage: 'paid',
      charged_quantity: props.charged_quantity,
      provider: 'mercadopago',
      source: 'backend_webhook',
      timestamp: new Date().toISOString(),
    });

    console.log('[Mixpanel] Funil Protocolo · Pagamento confirmado tracked:', {
      userId,
      value: props.value,
      charged_quantity: props.charged_quantity,
    });
  } catch (error) {
    console.error('[Mixpanel] Error tracking Pagamento confirmado:', error);
  }
}

// Propriedades dos eventos server-side do Pix do sono (compra única vitalícia).
// Diferente da assinatura: SEM plan_id/trial; a chave é o guest_id (fio mestre).
interface SonoPixEventProperties {
  external_reference: string;
  payment_id: string;
  product_key: string;
}

/**
 * Track "Funil Protocolo · Pagamento confirmado" para o Pix único do sono.
 *
 * Fonte da verdade do pagamento: dispara no webhook do Mercado Pago quando a
 * cobrança é aprovada — resiliente ao usuário fechar a aba após sair pro banco
 * (é justo aí que o funil morre). `distinct_id = guest_id` alinha com os demais
 * eventos guest do funil. `payment_type: 'pix_lifetime'` separa da assinatura.
 */
export function trackSonoPagamentoConfirmado(
  guestId: string,
  props: SonoPixEventProperties & { value?: number | null }
): void {
  if (!mixpanel) {
    console.warn('[Mixpanel] Token not configured, skipping Sono Pagamento confirmado');
    return;
  }

  try {
    mixpanel.track('Funil Protocolo · Pagamento confirmado', {
      distinct_id: guestId,
      guest_id: guestId,
      value: props.value ?? undefined,
      currency: 'BRL',
      stage: 'paid',
      payment_type: 'pix_lifetime',
      external_reference: props.external_reference,
      payment_id: props.payment_id,
      product_key: props.product_key,
      provider: 'mercadopago',
      source: 'backend_webhook',
      timestamp: new Date().toISOString(),
    });

    console.log('[Mixpanel] Sono · Pagamento confirmado tracked:', {
      guestId,
      value: props.value,
      payment_id: props.payment_id,
    });
  } catch (error) {
    console.error('[Mixpanel] Error tracking Sono Pagamento confirmado:', error);
  }
}

/**
 * Track "Funil Protocolo · Unlock concedido" — o acesso às 7 noites foi liberado
 * server-side (sono_guest_flow_events.unlocked = true) após o pagamento. Fecha o
 * funil: Pix gerado → copiado → pago → unlock.
 */
export function trackSonoUnlockConcedido(
  guestId: string,
  props: SonoPixEventProperties
): void {
  if (!mixpanel) {
    console.warn('[Mixpanel] Token not configured, skipping Sono Unlock concedido');
    return;
  }

  try {
    mixpanel.track('Funil Protocolo · Unlock concedido', {
      distinct_id: guestId,
      guest_id: guestId,
      external_reference: props.external_reference,
      payment_id: props.payment_id,
      product_key: props.product_key,
      provider: 'mercadopago',
      source: 'backend_webhook',
      timestamp: new Date().toISOString(),
    });

    console.log('[Mixpanel] Sono · Unlock concedido tracked:', {
      guestId,
      payment_id: props.payment_id,
    });
  } catch (error) {
    console.error('[Mixpanel] Error tracking Sono Unlock concedido:', error);
  }
}

/**
 * Verifica se Mixpanel está configurado
 */
export function isMixpanelConfigured(): boolean {
  return mixpanel !== null;
}
