import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useNotify } from "../context/NotificationContext";
import { useVoiceCall } from "../hooks/useVoiceCall";
import { ServerSidebar } from "../components/ServerSidebar";
import { ChannelSidebar } from "../components/ChannelSidebar";
import { ChatArea } from "../components/ChatArea";
import { MemberSidebar } from "../components/MemberSidebar";
import { VoiceCallView } from "../components/VoiceCallView";
import { FriendsView } from "../components/FriendsView";
import { CreateServerModal } from "../components/CreateServerModal";
import { JoinServerModal } from "../components/JoinServerModal";
import { CreateChannelModal } from "../components/CreateChannelModal";
import { ServerSettingsModal } from "../components/ServerSettingsModal";
import { Channel, ServerSummary, ServerMemberInfo, Message, FriendRequestItem } from "../types";

type ModalState =
  | { type: "createServer" }
  | { type: "joinServer" }
  | { type: "createChannel"; channelType: "TEXT" | "VOICE" }
  | { type: "serverSettings" }
  | null;

export default function HomePage() {
  const { user } = useAuth();
  const socket = useSocket();
  const notify = useNotify();

  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [members, setMembers] = useState<ServerMemberInfo[]>([]);
  const [voicePresence, setVoicePresence] = useState<Record<string, string[]>>({});
  const [modal, setModal] = useState<ModalState>(null);
  const [loadingServers, setLoadingServers] = useState(true);

  const activeChannelRef = useRef<Channel | null>(null);
  activeChannelRef.current = activeChannel;

  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;

  const voiceChannel = activeChannel?.type === "VOICE" ? activeChannel : null;
  const call = useVoiceCall(socket, voiceChannel?.id ?? null, user?.username ?? "", user?.id ?? "");

  // ---- Carregar servidores ----
  useEffect(() => {
    api
      .get("/servers")
      .then(({ data }) => setServers(data.servers))
      .finally(() => setLoadingServers(false));
  }, []);

  // ---- Carregar membros ao trocar de servidor ----
  const loadMembers = useCallback(async (serverId: string) => {
    const { data } = await api.get(`/servers/${serverId}/members`);
    setMembers(data.members);
  }, []);

  useEffect(() => {
    if (activeServerId) loadMembers(activeServerId);
    else setMembers([]);
    setActiveChannel(null);
  }, [activeServerId, loadMembers]);

  // Seleciona automaticamente o primeiro canal de texto ao entrar em um servidor.
  useEffect(() => {
    if (activeServer && !activeChannel) {
      const firstText = [...activeServer.channels].sort((a, b) => a.position - b.position).find((c) => c.type === "TEXT");
      if (firstText) setActiveChannel(firstText);
    }
  }, [activeServer, activeChannel]);

  // ---- Listeners globais de socket (presença, notificações, voz) ----
  useEffect(() => {
    if (!socket) return;

    function onPresenceUpdate(data: { userId: string; status: string }) {
      setMembers((prev) => prev.map((m) => (m.id === data.userId ? { ...m, status: data.status as any } : m)));
    }

    function onVoicePresence(data: { channelId: string; userIds: string[] }) {
      setVoicePresence((prev) => ({ ...prev, [data.channelId]: data.userIds }));
    }

    function onVoiceUserJoined(data: { userId: string; username: string; channelId: string }) {
      if (data.userId === user?.id) return;
      const inSameServer = activeServer?.channels.some((c) => c.id === data.channelId);
      if (inSameServer) notify(`${data.username} entrou em um canal de voz`, undefined, "call");
    }

    function onNewMessage(msg: Message) {
      if (msg.authorId === user?.id) return;
      if (activeChannelRef.current?.id === msg.channelId) return;
      notify(`Nova mensagem de ${msg.author.username}`, msg.content, "message");
    }

    function onFriendRequestReceived(req: FriendRequestItem) {
      notify("Nova solicitação de amizade", req.sender?.username, "friend");
    }

    function onFriendRequestAccepted() {
      notify("Solicitação de amizade aceita", undefined, "friend");
    }

    socket.on("presence:update", onPresenceUpdate);
    socket.on("voice:presence-update", onVoicePresence);
    socket.on("voice:user-joined", onVoiceUserJoined);
    socket.on("message:new", onNewMessage);
    socket.on("friend:request-received", onFriendRequestReceived);
    socket.on("friend:request-accepted", onFriendRequestAccepted);

    return () => {
      socket.off("presence:update", onPresenceUpdate);
      socket.off("voice:presence-update", onVoicePresence);
      socket.off("voice:user-joined", onVoiceUserJoined);
      socket.off("message:new", onNewMessage);
      socket.off("friend:request-received", onFriendRequestReceived);
      socket.off("friend:request-accepted", onFriendRequestAccepted);
    };
  }, [socket, user?.id, activeServer, notify]);

  // ---- Entrar/sair de canal de voz automaticamente ao selecioná-lo ----
  const joinedChannelId = useRef<string | null>(null);
  useEffect(() => {
    if (voiceChannel && joinedChannelId.current !== voiceChannel.id) {
      if (joinedChannelId.current) call.leave();
      joinedChannelId.current = voiceChannel.id;
      call.join(voiceChannel.id);
    } else if (!voiceChannel && joinedChannelId.current) {
      joinedChannelId.current = null;
      call.leave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceChannel?.id]);

  function handleSelectChannel(channel: Channel) {
    setActiveChannel(channel);
  }

  function handleServerCreated(server: ServerSummary) {
    setServers((prev) => [...prev, server]);
    setActiveServerId(server.id);
  }

  function handleChannelCreated(channel: Channel) {
    setServers((prev) => prev.map((s) => (s.id === activeServerId ? { ...s, channels: [...s.channels, channel] } : s)));
  }

  async function handleLeaveServer() {
    if (!activeServerId) return;
    if (!confirm("Tem certeza que deseja sair deste servidor?")) return;
    await api.post(`/servers/${activeServerId}/leave`);
    setServers((prev) => prev.filter((s) => s.id !== activeServerId));
    setActiveServerId(null);
  }

  function handleServerUpdated(patch: Partial<ServerSummary>) {
    setServers((prev) => prev.map((s) => (s.id === activeServerId ? { ...s, ...patch } : s)));
  }

  function handleServerDeleted() {
    setServers((prev) => prev.filter((s) => s.id !== activeServerId));
    setActiveServerId(null);
    setModal(null);
  }

  function voiceParticipantCount(channelId: string) {
    return voicePresence[channelId]?.length ?? 0;
  }

  if (loadingServers) {
    return <div className="h-screen flex items-center justify-center bg-bg-secondary text-text-muted">Carregando…</div>;
  }

  return (
    <div className="h-screen flex bg-bg-secondary overflow-hidden">
      <ServerSidebar
        servers={servers}
        activeServerId={activeServerId}
        onSelectServer={setActiveServerId}
        onCreateClick={() => setModal({ type: "createServer" })}
        onJoinClick={() => setModal({ type: "joinServer" })}
      />

      {activeServer ? (
        <>
          <ChannelSidebar
            server={activeServer}
            activeChannelId={activeChannel?.id ?? null}
            onSelectChannel={handleSelectChannel}
            voiceChannelId={voiceChannel && call.connected ? voiceChannel.id : null}
            voiceParticipantCount={voiceParticipantCount}
            onOpenSettings={() => setModal({ type: "serverSettings" })}
            onOpenCreateChannel={(t) => setModal({ type: "createChannel", channelType: t })}
            onLeaveServer={handleLeaveServer}
            micMuted={call.micMuted}
            onToggleMic={call.toggleMic}
            inCall={call.connected}
          />

          {activeChannel?.type === "VOICE" ? (
            <VoiceCallView
              channel={activeChannel}
              participants={call.participants}
              micMuted={call.micMuted}
              videoEnabled={call.videoEnabled}
              screenSharing={call.screenSharing}
              localSpeaking={call.localSpeaking}
              error={call.error}
              onToggleMic={call.toggleMic}
              onToggleCamera={call.toggleCamera}
              onToggleScreenShare={call.toggleScreenShare}
              onLeave={() => setActiveChannel(null)}
              localVideoStream={call.localStream.current}
              localScreenStream={call.localScreenStream.current}
            />
          ) : activeChannel ? (
            <ChatArea channel={activeChannel} socket={socket} />
          ) : (
            <div className="flex-1" />
          )}

          <MemberSidebar members={members} />
        </>
      ) : (
        <FriendsView socket={socket} />
      )}

      {modal?.type === "createServer" && <CreateServerModal onClose={() => setModal(null)} onCreated={handleServerCreated} />}
      {modal?.type === "joinServer" && <JoinServerModal onClose={() => setModal(null)} onJoined={handleServerCreated} />}
      {modal?.type === "createChannel" && activeServerId && (
        <CreateChannelModal serverId={activeServerId} defaultType={modal.channelType} onClose={() => setModal(null)} onCreated={handleChannelCreated} />
      )}
      {modal?.type === "serverSettings" && activeServer && (
        <ServerSettingsModal server={activeServer} onClose={() => setModal(null)} onUpdated={handleServerUpdated} onDeleted={handleServerDeleted} />
      )}
    </div>
  );
}
