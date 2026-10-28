import { databases, DATABASE_ID, currentTenantId } from '../lib/appwrite';
import { ID } from 'appwrite';

export interface SystemNotificationPayload {
  userId: string;
  tenantId?: string | null;
  title: string;
  message: string;
  type?: string;
  referenceId?: string | null;
  referenceType?: 'deal' | 'ticket' | 'contract' | 'proposal' | 'client' | 'activity' | 'finance' | string | null;
}

/**
 * Envia uma notificação persistente compatível com o esquema do Appwrite (user_id, tenant_id, message, type, is_read, created_at).
 * O título e mensagem são concatenados de forma padronizada ("Título · Mensagem") para exibição rica no sino.
 * O tipo embute o referenceId no padrão "tipo:id" (ex: "deal:6adb...") para deep-linking automático ao clicar.
 */
export async function sendSystemNotification({
  userId,
  tenantId,
  title,
  message,
  type = 'info',
  referenceId,
  referenceType,
}: SystemNotificationPayload): Promise<any> {
  if (!userId) return null;

  const resolvedTenantId = tenantId || currentTenantId;
  if (!resolvedTenantId) {
    throw new Error('[NotificationService] tenant_id obrigatório para criar notificação.');
  }

  const now = new Date().toISOString();
  const refType = referenceType || (type.includes(':') ? type.split(':')[0] : type);
  const refId = referenceId || (type.includes(':') ? type.split(':')[1] : null);
  const encodedType = refId ? `${refType}:${refId}` : refType;
  const formattedMessage = title ? `${title} · ${message}` : message;

  try {
    const created = await databases.createDocument(DATABASE_ID, 'notifications', ID.unique(), {
      user_id: userId,
      tenant_id: resolvedTenantId,
      message: formattedMessage,
      type: encodedType,
      is_read: false,
      created_at: now,
    });

    if (created && (created as any).success === false) {
      throw new Error((created as any).error || '[NotificationService] Falha ao criar notificação no servidor.');
    }

    return created;
  } catch (err: any) {
    console.warn('[NotificationService] Falha ao gravar notificação:', err?.message || err);
    throw err;
  }
}

/**
 * Notifica atribuição de Card/Oportunidade no Pipeline
 */
export async function notifyDealAssigned(
  assigneeId: string,
  dealName: string,
  dealId: string,
  assignedByName?: string,
  tenantId?: string | null
): Promise<void> {
  await sendSystemNotification({
    userId: assigneeId,
    tenantId,
    title: '📋 Oportunidade Atribuída',
    message: `${assignedByName ? `${assignedByName} atribuiu` : 'Você foi atribuído como responsável pelo'} card "${dealName}".`,
    type: `deal:${dealId}`,
    referenceId: dealId,
    referenceType: 'deal',
  });
}

/**
 * Notifica celebração de Oportunidade Ganha/Fechada
 */
export async function notifyDealWon(
  ownerId: string,
  dealName: string,
  dealId: string,
  formattedValue?: string,
  tenantId?: string | null
): Promise<void> {
  await sendSystemNotification({
    userId: ownerId,
    tenantId,
    title: '🎉 Negócio Ganho!',
    message: `A oportunidade "${dealName}" ${formattedValue ? `(${formattedValue}) ` : ''}foi movida para a etapa de fechamento!`,
    type: `deal:${dealId}`,
    referenceId: dealId,
    referenceType: 'deal',
  });
}

/**
 * Notifica agendamento de atividade / tarefa
 */
export async function notifyActivityAssigned(
  responsibleId: string,
  subject: string,
  dealName: string,
  dealId: string,
  tenantId?: string | null
): Promise<void> {
  await sendSystemNotification({
    userId: responsibleId,
    tenantId,
    title: '⏰ Nova Atividade Atribuída',
    message: `Você tem uma tarefa agendada: "${subject}" no card "${dealName}".`,
    type: `deal:${dealId}`,
    referenceId: dealId,
    referenceType: 'deal',
  });
}

/**
 * Notifica nova mensagem no chat da negociação
 */
export async function notifyDealComment(
  recipientId: string,
  dealName: string,
  dealId: string,
  senderName: string,
  snippet: string,
  tenantId?: string | null
): Promise<void> {
  await sendSystemNotification({
    userId: recipientId,
    tenantId,
    title: `💬 Mensagem em ${dealName}`,
    message: `${senderName}: "${snippet}"`,
    type: `deal:${dealId}`,
    referenceId: dealId,
    referenceType: 'deal',
  });
}

/**
 * Notifica menção de usuário (@Nome) no chat
 */
export async function notifyDealMention(
  recipientId: string,
  dealName: string,
  dealId: string,
  senderName: string,
  snippet: string,
  tenantId?: string | null
): Promise<void> {
  await sendSystemNotification({
    userId: recipientId,
    tenantId,
    title: `📣 Menção em ${dealName}`,
    message: `${senderName} mencionou você: "${snippet}"`,
    type: `deal:${dealId}`,
    referenceId: dealId,
    referenceType: 'deal',
  });
}

/**
 * Notifica atribuição ou abertura de chamado / ticket
 */
export async function notifyTicketAssigned(
  assigneeId: string,
  ticketNumber: number | string,
  ticketTitle: string,
  ticketId: string,
  tenantId?: string | null
): Promise<void> {
  await sendSystemNotification({
    userId: assigneeId,
    tenantId,
    title: `🎫 Chamado #${ticketNumber}`,
    message: `Você foi atribuído ao atendimento de "${ticketTitle}".`,
    type: `ticket:${ticketId}`,
    referenceId: ticketId,
    referenceType: 'ticket',
  });
}

/**
 * Notifica assinatura de contrato concluída
 */
export async function notifyContractSigned(
  userId: string,
  contractTitle: string,
  contractId: string,
  clientName?: string,
  tenantId?: string | null
): Promise<void> {
  await sendSystemNotification({
    userId,
    tenantId,
    title: '✍️ Contrato Assinado',
    message: `O contrato "${contractTitle}" ${clientName ? `do cliente ${clientName} ` : ''}foi assinado com sucesso.`,
    type: `contract:${contractId}`,
    referenceId: contractId,
    referenceType: 'contract',
  });
}

/**
 * Notifica aprovação de proposta comercial
 */
export async function notifyProposalApproved(
  userId: string,
  proposalTitle: string,
  proposalId: string,
  tenantId?: string | null
): Promise<void> {
  await sendSystemNotification({
    userId,
    tenantId,
    title: '✅ Proposta Aprovada',
    message: `A proposta "${proposalTitle}" foi aprovada pelo cliente.`,
    type: `proposal:${proposalId}`,
    referenceId: proposalId,
    referenceType: 'proposal',
  });
}
