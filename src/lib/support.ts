import type { ImagePickerAsset } from 'expo-image-picker';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fileExtension, readAssetBody } from './upload';

export type SupportCategory = 'account' | 'safety' | 'content' | 'reelyx' | 'other';
export type SupportStatus = 'open' | 'pending' | 'resolved' | 'closed';

export type SupportTicket = {
  id: string;
  user_id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: { body: string; created_at: string; author_role: 'user' | 'support' } | null;
};

export type SupportTicketMessage = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_role: 'user' | 'support';
  body: string;
  created_at: string;
  author: { display_name: string; username: string } | null;
};

export type SupportAttachment = {
  id: string;
  ticket_id: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  created_at: string;
  storage_path: string;
  signed_url?: string;
};

export type SupportStats = {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  total: number;
};

export type SupportChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  created_at: string;
};

const TICKET_SELECT = `
  id,
  user_id,
  subject,
  category,
  status,
  created_at,
  updated_at,
  messages:support_ticket_messages(count)
`;

const MESSAGE_SELECT = `
  id,
  ticket_id,
  author_id,
  author_role,
  body,
  created_at,
  author:profiles!support_ticket_messages_author_id_fkey(display_name, username)
`;

const SETUP_MESSAGE = 'Support is not set up in this database yet. Apply the latest supabase/schema.sql, then try again.';

function countOf(rows: { count: number }[] | null): number {
  return rows?.[0]?.count ?? 0;
}

function friendlyError(error: { message?: string; code?: string } | null | undefined): Error {
  const text = error?.message ?? '';
  if (error?.code === '42P01' || /relation .*support_|support_tickets|support_ticket_messages|support_chat_messages/i.test(text)) {
    return new Error(SETUP_MESSAGE);
  }
  if (/permission denied|row-level security/i.test(text)) return new Error('You do not have access to that support item.');
  return new Error(text || 'The support request could not be completed.');
}

export function validateTicketInput(input: { subject: string; body: string }): string | null {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length < 3 || subject.length > 140) return 'Use a subject between 3 and 140 characters.';
  if (body.length < 10 || body.length > 4000) return 'Describe the problem in 10 to 4,000 characters.';
  return null;
}

export async function fetchSupportStats(client: SupabaseClient | null, tickets?: SupportTicket[]): Promise<SupportStats> {
  const empty: SupportStats = { open: 0, pending: 0, resolved: 0, closed: 0, total: 0 };
  if (!client) return empty;

  const { data, error } = await client.rpc('get_my_support_stats');
  if (!error) {
    const row = (data as Record<string, number>[] | null)?.[0];
    if (row) {
      return {
        open: Number(row.open_count ?? 0),
        pending: Number(row.pending_count ?? 0),
        resolved: Number(row.resolved_count ?? 0),
        closed: Number(row.closed_count ?? 0),
        total: Number(row.total_count ?? 0),
      };
    }
  }

  // Older databases may not have the stats RPC; derive the same numbers from owned tickets.
  if (tickets) {
    return {
      open: tickets.filter((ticket) => ticket.status === 'open').length,
      pending: tickets.filter((ticket) => ticket.status === 'pending').length,
      resolved: tickets.filter((ticket) => ticket.status === 'resolved').length,
      closed: tickets.filter((ticket) => ticket.status === 'closed').length,
      total: tickets.length,
    };
  }
  return empty;
}

export async function fetchSupportTickets(client: SupabaseClient, userId: string): Promise<SupportTicket[]> {
  const { data, error } = await client
    .from('support_tickets')
    .select(TICKET_SELECT)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .returns<(Omit<SupportTicket, 'message_count' | 'last_message'> & { messages: { count: number }[] | null })[]>();
  if (error) throw friendlyError(error);

  const rows = data ?? [];
  const lastMessages = new Map<string, SupportTicket['last_message']>();
  if (rows.length > 0) {
    const { data: messageRows, error: messageError } = await client
      .from('support_ticket_messages')
      .select('ticket_id, body, created_at, author_role')
      .in('ticket_id', rows.map((row) => row.id))
      .order('created_at', { ascending: false });
    if (messageError) throw friendlyError(messageError);
    for (const row of messageRows ?? []) {
      if (!lastMessages.has(row.ticket_id)) {
        lastMessages.set(row.ticket_id, {
          body: row.body,
          created_at: row.created_at,
          author_role: row.author_role as 'user' | 'support',
        });
      }
    }
  }

  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    subject: row.subject,
    category: row.category as SupportCategory,
    status: row.status as SupportStatus,
    created_at: row.created_at,
    updated_at: row.updated_at,
    message_count: countOf(row.messages),
    last_message: lastMessages.get(row.id) ?? null,
  }));
}

export async function createSupportTicket(options: {
  client: SupabaseClient;
  userId: string;
  subject: string;
  category: SupportCategory;
  body: string;
}): Promise<SupportTicket> {
  const invalid = validateTicketInput(options);
  if (invalid) throw new Error(invalid);

  const { data: ticket, error: ticketError } = await options.client
    .from('support_tickets')
    .insert({
      user_id: options.userId,
      subject: options.subject.trim(),
      category: options.category,
      status: 'open',
    })
    .select('id, user_id, subject, category, status, created_at, updated_at')
    .single();
  if (ticketError) throw friendlyError(ticketError);

  const { error: messageError } = await options.client.from('support_ticket_messages').insert({
    ticket_id: ticket.id,
    author_id: options.userId,
    author_role: 'user',
    body: options.body.trim(),
  });
  if (messageError) {
    await options.client.from('support_tickets').delete().eq('id', ticket.id);
    throw friendlyError(messageError);
  }

  return {
    ...ticket,
    category: ticket.category as SupportCategory,
    status: ticket.status as SupportStatus,
    message_count: 1,
    last_message: { body: options.body.trim(), created_at: new Date().toISOString(), author_role: 'user' },
  };
}

export async function fetchSupportTicketDetail(client: SupabaseClient, ticketId: string) {
  const { data: ticket, error: ticketError } = await client
    .from('support_tickets')
    .select('id, user_id, subject, category, status, created_at, updated_at')
    .eq('id', ticketId)
    .maybeSingle();
  if (ticketError) throw friendlyError(ticketError);
  if (!ticket) throw new Error('That ticket is not available. It may belong to another account.');

  const { data: messageRows, error: messageError } = await client
    .from('support_ticket_messages')
    .select(MESSAGE_SELECT)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .returns<SupportTicketMessage[]>();
  if (messageError) throw friendlyError(messageError);

  const { data: attachmentRows, error: attachmentError } = await client
    .from('support_ticket_attachments')
    .select('id, ticket_id, file_name, content_type, byte_size, created_at, storage_path')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .returns<SupportAttachment[]>();
  if (attachmentError && !/relation .*support_ticket_attachments/i.test(attachmentError.message)) throw friendlyError(attachmentError);

  const attachments = attachmentRows ?? [];
  if (attachments.length > 0) {
    const { data: signed, error: signedError } = await client.storage
      .from('support-attachments')
      .createSignedUrls(attachments.map((item) => item.storage_path), 60 * 60);
    if (!signedError) {
      const urls = new Map((signed ?? []).filter((item) => Boolean(item.signedUrl)).map((item) => [item.path, item.signedUrl as string]));
      for (const item of attachments) item.signed_url = urls.get(item.storage_path);
    }
  }

  return {
    ticket: {
      ...ticket,
      category: ticket.category as SupportCategory,
      status: ticket.status as SupportStatus,
    },
    messages: messageRows ?? [],
    attachments,
  };
}

export async function addSupportReply(client: SupabaseClient, options: {
  userId: string;
  ticketId: string;
  body: string;
}): Promise<void> {
  const body = options.body.trim();
  if (body.length < 1 || body.length > 4000) throw new Error('Replies must be between 1 and 4,000 characters.');
  const { error } = await client.from('support_ticket_messages').insert({
    ticket_id: options.ticketId,
    author_id: options.userId,
    author_role: 'user',
    body,
  });
  if (error) throw friendlyError(error);
}

export async function setSupportTicketStatus(client: SupabaseClient, ticketId: string, status: 'open' | 'resolved' | 'closed'): Promise<void> {
  const { error } = await client.rpc('set_my_support_ticket_status', { p_ticket_id: ticketId, p_status: status });
  if (error) throw friendlyError(error);
}

const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function attachmentPath(userId: string, ticketId: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment';
  return `${userId}/${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

export async function uploadSupportFile(options: {
  client: SupabaseClient;
  userId: string;
  ticketId: string;
  file: File;
}): Promise<SupportAttachment> {
  const { client, userId, ticketId, file } = options;
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('That file is larger than 10 MB.');
  if (file.type && !ALLOWED_ATTACHMENT_TYPES.includes(file.type)) throw new Error('Choose an image, PDF or text file.');

  const storagePath = attachmentPath(userId, ticketId, file.name);
  const { error: uploadError } = await client.storage.from('support-attachments').upload(storagePath, await file.arrayBuffer(), {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data, error: insertError } = await client
    .from('support_ticket_attachments')
    .insert({
      ticket_id: ticketId,
      user_id: userId,
      storage_path: storagePath,
      file_name: file.name.slice(0, 180),
      content_type: file.type || 'application/octet-stream',
      byte_size: file.size,
    })
    .select('id, ticket_id, file_name, content_type, byte_size, created_at, storage_path')
    .single();
  if (insertError) {
    await client.storage.from('support-attachments').remove([storagePath]);
    throw friendlyError(insertError);
  }
  return data;
}

export async function uploadSupportImageAsset(options: {
  client: SupabaseClient;
  userId: string;
  ticketId: string;
  asset: ImagePickerAsset;
}): Promise<SupportAttachment> {
  const { client, userId, ticketId, asset } = options;
  const contentType = asset.mimeType ?? 'image/jpeg';
  if (!ALLOWED_ATTACHMENT_TYPES.includes(contentType)) throw new Error('Choose a JPEG, PNG or WebP image.');
  if (asset.fileSize && asset.fileSize > MAX_ATTACHMENT_BYTES) throw new Error('That file is larger than 10 MB.');

  const name = asset.fileName ?? `image.${fileExtension(asset)}`;
  const storagePath = attachmentPath(userId, ticketId, name);
  const { error: uploadError } = await client.storage.from('support-attachments').upload(storagePath, await readAssetBody(asset), {
    contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data, error: insertError } = await client
    .from('support_ticket_attachments')
    .insert({
      ticket_id: ticketId,
      user_id: userId,
      storage_path: storagePath,
      file_name: name.slice(0, 180),
      content_type: contentType,
      byte_size: asset.fileSize ?? 0,
    })
    .select('id, ticket_id, file_name, content_type, byte_size, created_at, storage_path')
    .single();
  if (insertError) {
    await client.storage.from('support-attachments').remove([storagePath]);
    throw friendlyError(insertError);
  }
  return data;
}

export async function fetchSupportChatHistory(client: SupabaseClient, userId: string): Promise<SupportChatMessage[]> {
  const { data, error } = await client
    .from('support_chat_messages')
    .select('id, role, body, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(40)
    .returns<SupportChatMessage[]>();
  if (error) {
    if (error.code === '42P01' || /support_chat_messages/i.test(error.message)) return [];
    throw friendlyError(error);
  }
  return data ?? [];
}

async function functionErrorMessage(error: unknown): Promise<string> {
  const candidate = error as { message?: string; context?: Response } | undefined;
  const context = candidate?.context;
  if (context && typeof context.text === 'function') {
    try {
      const text = await context.text();
      const parsed = JSON.parse(text) as { error?: string; message?: string; detail?: string };
      return parsed.message ?? parsed.error ?? parsed.detail ?? candidate?.message ?? 'Support chat is unavailable.';
    } catch {
      return candidate?.message ?? 'Support chat is unavailable.';
    }
  }
  return candidate?.message ?? 'Support chat is unavailable.';
}

export async function sendSupportChatMessage(client: SupabaseClient, message: string): Promise<string> {
  const text = message.trim();
  if (!text) throw new Error('Write a message before sending.');
  if (text.length > 2000) throw new Error('Messages must be 2,000 characters or fewer.');

  const { data, error } = await client.functions.invoke('tachireel-support-chat', { body: { message: text } });
  if (error) {
    const detail = await functionErrorMessage(error);
    if (/support_ai_not_configured|not configured|SUPPORT_AI_API_KEY/i.test(detail)) {
      throw new Error('The support assistant needs a server-side AI key. Ask an administrator to set the SUPPORT_AI_API_KEY Edge Function secret. Until then, the help articles and tickets are available.');
    }
    throw new Error(detail);
  }
  const reply = (data as { reply?: string; error?: string } | null)?.reply;
  if (!reply) throw new Error('The assistant could not answer. Open a ticket or use the help articles.');
  return reply;
}
