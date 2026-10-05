import type { Prisma } from '@prisma/client';

type AuditClient = Prisma.TransactionClient;

export type AuditInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
};

// Call inside the business transaction so a committed action and its audit event
// either both persist or both roll back.
export const recordAuditEvent = (client: AuditClient, event: AuditInput) =>
  client.auditEvent.create({ data: event });
