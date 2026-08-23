import { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, ScreenShare, ScreenShareOff, PhoneOff, Volume2 } from "lucide-react";
import { Channel } from "../types";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import { VoiceParticipant } from "../hooks/useVoiceCall";

interface Props {
  channel: Channel;
  participants: Record<string, VoiceParticipant>;
  micMuted: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  localSpeaking: boolean;
  error: string | null;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
  localVideoStream: MediaStream | null;
}

export function VoiceCallView({
  channel,
  participants,
  micMuted,
  videoEnabled,
  screenSharing,
  localSpeaking,
  error,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onLeave,
  localVideoStream,
}: Props) {
  const { user } = useAuth();
  const list = Object.values(participants);
  const tileCount = list.length + 1;
  const cols = tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : tileCount <= 9 ? 3 : 4;

  return (
    <div className="flex-1 flex flex-col bg-bg-secondary min-w-0 h-full">
      <div className="h-12 flex items-center gap-2 px-4 border-b border-black/20 shrink-0">
        <Volume2 size={18} className="text-text-muted" />
        <span className="font-semibold text-text-primary">{channel.name}</span>
      </div>

      {error && <div className="bg-danger/15 text-danger text-sm px-4 py-2">{error}</div>}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3 h-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          <ParticipantTile
            username={`${user?.username ?? "Você"} (você)`}
            color={user?.avatarColor}
            speaking={localSpeaking}
            videoStream={videoEnabled ? localVideoStream : null}
            muted={micMuted}
            mirrored
          />
          {list.map((p) => (
            <ParticipantTile
              key={p.userId}
              username={p.username}
              speaking={p.speaking}
              muted={p.muted}
              videoStream={p.sharingScreen ? p.screenStream ?? null : p.videoEnabled ? p.stream ?? null : null}
              audioStream={p.stream}
              isScreenShare={p.sharingScreen}
            />
          ))}
        </div>
      </div>

      <div className="h-20 flex items-center justify-center gap-3 bg-bg-primary shrink-0 border-t border-black/20">
        <CallButton onClick={onToggleMic} active={micMuted} activeColor="bg-danger" label={micMuted ? "Ativar microfone" : "Mutar"}>
          {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </CallButton>
        <CallButton onClick={onToggleCamera} active={videoEnabled} activeColor="bg-brand" label={videoEnabled ? "Desligar câmera" : "Ligar câmera"}>
          {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </CallButton>
        <CallButton onClick={onToggleScreenShare} active={screenSharing} activeColor="bg-brand" label={screenSharing ? "Parar compartilhamento" : "Compartilhar tela"}>
          {screenSharing ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}
        </CallButton>
        <button onClick={onLeave} className="w-14 h-11 rounded-full bg-danger hover:bg-red-600 flex items-center justify-center text-white transition-colors" title="Sair da chamada">
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  );
}

function CallButton({
  children,
  onClick,
  active,
  activeColor,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  activeColor: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors text-white ${active ? activeColor : "bg-bg-tertiary hover:bg-bg-elevated"}`}
    >
      {children}
    </button>
  );
}

function ParticipantTile({
  username,
  color,
  speaking,
  muted,
  videoStream,
  audioStream,
  mirrored,
  isScreenShare,
}: {
  username: string;
  color?: string;
  speaking?: boolean;
  muted?: boolean;
  videoStream?: MediaStream | null;
  audioStream?: MediaStream | null;
  mirrored?: boolean;
  isScreenShare?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current && videoStream) videoRef.current.srcObject = videoStream;
  }, [videoStream]);

  useEffect(() => {
    // Áudio remoto sempre tocado, independente de haver vídeo.
    if (audioRef.current && audioStream) audioRef.current.srcObject = audioStream;
  }, [audioStream]);

  return (
    <div
      className={`relative rounded-xl bg-bg-tertiary overflow-hidden flex items-center justify-center min-h-[160px] ${
        speaking ? "ring-2 ring-online" : ""
      }`}
    >
      {audioStream && !videoStream && <audio ref={audioRef} autoPlay />}
      {videoStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={mirrored}
          className={`w-full h-full object-cover ${mirrored && !isScreenShare ? "-scale-x-100" : ""} ${isScreenShare ? "object-contain bg-black" : ""}`}
        />
      ) : (
        <Avatar username={username} color={color} size={72} ring={speaking} />
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-md">
        {muted && <MicOff size={12} className="text-danger" />}
        <span className="text-xs text-white font-medium">{username}</span>
      </div>
      {audioStream && videoStream && <audio ref={audioRef} autoPlay />}
    </div>
  );
}
