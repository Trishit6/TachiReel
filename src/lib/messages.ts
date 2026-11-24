import type { SupabaseClient } from '@supabase/supabase-js';
import { formatRelativeTime } from './format';

export type Conversation = {
  id: string;
  peerId: string | null;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderId: string | null;
};

type ConversationRow = {
  conversation_id: string;
  peer_id: string | null;
  peer_display_name: string | null;
  peer_username: string | null;
  peer_avatar_url: string | null;
  last_message: string | null;
  last_message_sender_id: string | null;
  last_message_at: string | null;
  conversation_created_at: string;
};

export type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export async function fetchConversations(client: SupabaseClient, userId: string): Promise<Conversation[]> {
  const { data, error } = await client.rpc('get_my_conversations');
  if (error) throw error;
  const rows = (data ?? []) as ConversationRow[];
  return rows.map((row) => {
    const isMine = Boolean(row.last_message_sender_id && row.last_message_sender_id === userId);
    return {
      id: row.conversation_id,
      peerId: row.peer_id,
      name: row.peer_display_name ?? (row.peer_username ? `@${row.peer_username}` : 'Unknown account'),
      username: row.peer_username,
      avatarUrl: row.peer_avatar_url,
      lastMessage: row.last_message ? `${isMine ? 'You: ' : ''}${row.last_message}` : 'No messages yet',
      lastMessageAt: row.last_message_at ?? row.conversation_created_at,
      lastSenderId: row.last_message_sender_id,
    };
  });
}

export async function fetchConversation(client: SupabaseClient, userId: string, id: string): Promise<Conversation | null> {
  const conversations = await fetchConversations(client, userId);
  return conversations.find((conversation) => conversation.id === id) ?? null;
}

export async function fetchMessages(client: SupabaseClient, conversationId: string): Promise<Message[]> {
  const { data, error } = await client
    .from('messages')
    .select('id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(client: SupabaseClient, conversationId: string, senderId: string, body: string): Promise<Message> {
  const { data, error } = await client
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() })
    .select('id, sender_id, body, created_at')
    .single();
  if (error) throw error;
  return data as Message;
}

export async function startConversation(client: SupabaseClient, peerId: string): Promise<string> {
  const { data, error } = await client.rpc('start_conversation', { peer_profile_id: peerId });
  if (error) {
    if (error.code === '42883' || /start_conversation/i.test(error.message)) {
      throw new Error('Starting new conversations needs the latest supabase/schema.sql (start_conversation RPC).');
    }
    throw error;
  }
  return data as string;
}

export function activeRecently(iso: string, now = Date.now()): boolean {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && now - time < 5 * 60 * 1000;
}

export function messageDay(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function messageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export { formatRelativeTime };
