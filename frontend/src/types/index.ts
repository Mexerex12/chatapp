export interface User {
  id: string;
  username: string;
  email?: string;
  avatarColor: string;
  avatarUrl?: string | null;
  status?: "online" | "offline" | "idle";
}

export type ChannelType = "TEXT" | "VOICE";

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  serverId: string;
  position: number;
}

export type Role = "OWNER" | "ADMIN" | "MEMBER";

export interface ServerSummary {
  id: string;
  name: string;
  iconUrl?: string | null;
  ownerId: string;
  myRole: Role;
  memberCount?: number;
  channels: Channel[];
}

export interface ServerMemberInfo extends User {
  role: Role;
  membershipId: string;
}

export interface Message {
  id: string;
  content: string;
  channelId: string;
  authorId: string;
  createdAt: string;
  author: { id: string; username: string; avatarColor: string; avatarUrl?: string | null };
}

export interface FriendRequestItem {
  id: string;
  senderId?: string;
  receiverId?: string;
  sender?: { id: string; username: string; avatarColor: string };
  receiver?: { id: string; username: string; avatarColor: string };
}
