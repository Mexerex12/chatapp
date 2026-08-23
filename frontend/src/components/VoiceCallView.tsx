import { useEffect, useRef, useState } from "react";
import {
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  SlidersHorizontal,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Channel } from "../types";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import { AudioDeviceOption, VoiceParticipant } from "../hooks/useVoiceCall";

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
  localScreenStream: MediaStream | null;
  audioInputs: AudioDeviceOption[];
  audioOutputs: AudioDeviceOption[];
  selectedAudioInputId: string;
  selectedAudioOutputId: string;
  onSelectAudioInput: (deviceId: string) => void;
  onSelectAudioOutput: (deviceId: string) => void;
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
  localScreenStream,
  audioInputs,
  audioOutputs,
  selectedAudioInputId,
  selectedAudioOutputId,
  onSelectAudioInput,
  onSelectAudioOutput,
}: Props) {
  const { user } = useAuth();
  const list = Object.values(participants);
  const tileCount = list.length + 1;
  const cols = tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : tileCount <= 9 ? 3 : 4;
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  const [outputMuted, setOutputMuted] = useState(false);
  const [outputVolume, setOutputVolume] = useState(100);
  const audioLevel = outputMuted ? 0 : outputVolume / 100;

  return (
    <div className="flex-1 flex flex-col bg-bg-secondary min-w-0 h-full">
      <header className="min-h-14 flex items-center justify-between gap-3 px-5 border-b border-white/5 bg-bg-primary/70 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0">
            <Volume2 size={17} />
          </span>
          <div className="min-w-0">
            <h1 className="font-semibold text-text-primary leading-tight truncate">{channel.name}</h1>
            <p className="text-xs text-text-muted">{tileCount} {tileCount === 1 ? "pessoa na chamada" : "pessoas na chamada"}</p>
          </div>
        </div>
        <button
          onClick={() => setAudioPanelOpen((open) => !open)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${audioPanelOpen ? "bg-brand text-white" : "text-text-muted hover:bg-bg-tertiary hover:text-text-primary"}`}
          title="Configurações de áudio"
          aria-label="Configurações de áudio"
          aria-expanded={audioPanelOpen}
        >
          <SlidersHorizontal size={18} />
        </button>
      </header>

      {error && <div className="bg-danger/15 text-danger text-sm px-4 py-2">{error}</div>}

      {audioPanelOpen && (
        <section className="grid gap-4 px-5 py-4 border-b border-white/5 bg-bg-primary/40 animate-fade-in md:grid-cols-2" aria-label="Configurações de áudio">
        <section className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 border-b border-white/5 bg-bg-primary/40 animate-fade-in" aria-label="Configurações de áudio">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <Headphones size={16} className="text-text-muted" />
            <span className="font-medium">Áudio da chamada</span>
          </div>
          <button
            onClick={() => setOutputMuted((muted) => !muted)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${outputMuted ? "bg-danger/15 text-danger" : "bg-bg-tertiary text-text-primary hover:bg-bg-elevated"}`}
            title={outputMuted ? "Ativar áudio da chamada" : "Silenciar áudio da chamada"}
          >
            {outputMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            {outputMuted ? "Áudio desativado" : "Áudio ativado"}
          </button>
          <label className="flex items-center gap-3 text-xs text-text-muted min-w-[230px]">
          <label className="flex items-center gap-3 text-xs text-text-muted min-w-[230px] flex-1 max-w-sm">
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="100"
              value={outputVolume}
              onChange={(event) => setOutputVolume(Number(event.target.value))}
              className="accent-brand flex-1"
              aria-label="Volume do áudio da chamada"
            />
            <span className="w-8 text-right tabular-nums">{outputVolume}%</span>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-text-muted">
            <span>Dispositivo de entrada</span>
            <select value={selectedAudioInputId} onChange={(event) => onSelectAudioInput(event.target.value)} className="h-9 rounded-md bg-bg-tertiary px-2.5 text-sm text-text-primary outline-none ring-brand focus:ring-2">
              <option value="">Padrão do sistema</option>
              {audioInputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-text-muted">
            <span>Dispositivo de saída</span>
            <select value={selectedAudioOutputId} onChange={(event) => onSelectAudioOutput(event.target.value)} className="h-9 rounded-md bg-bg-tertiary px-2.5 text-sm text-text-primary outline-none ring-brand focus:ring-2">
              <option value="">Padrão do sistema</option>
              {audioOutputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
            </select>
          </label>
        </section>
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="grid gap-3 h-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          <ParticipantTile
            username={`${user?.username ?? "Você"} (você)`}
            color={user?.avatarColor}
            speaking={localSpeaking}
            videoStream={screenSharing ? localScreenStream : videoEnabled ? localVideoStream : null}
            muted={micMuted}
            mirrored
            isScreenShare={screenSharing}
          />
          {list.map((participant) => (
            <ParticipantTile
              key={participant.userId}
              username={participant.username}
              speaking={participant.speaking}
              muted={participant.muted}
              videoStream={participant.sharingScreen ? participant.screenStream ?? null : participant.videoEnabled ? participant.stream ?? null : null}
              audioStream={participant.stream}
              audioVolume={audioLevel}
              audioMuted={outputMuted}
              audioOutputDeviceId={selectedAudioOutputId}
              isScreenShare={participant.sharingScreen}
            />
          ))}
        </div>
      </main>

      <footer className="min-h-20 flex flex-wrap items-center justify-center gap-3 px-4 py-3 bg-bg-primary/95 shrink-0 border-t border-white/5">
        <CallButton onClick={onToggleMic} active={micMuted} activeColor="bg-danger" label={micMuted ? "Ativar microfone" : "Mutar microfone"}>
          {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </CallButton>
        <CallButton onClick={onToggleCamera} active={videoEnabled} activeColor="bg-brand" label={videoEnabled ? "Desligar câmera" : "Ligar câmera"}>
          {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </CallButton>
        <CallButton onClick={onToggleScreenShare} active={screenSharing} activeColor="bg-brand" label={screenSharing ? "Parar compartilhamento" : "Compartilhar tela"}>
          {screenSharing ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}
        </CallButton>
        <button onClick={onLeave} className="w-14 h-11 rounded-xl bg-danger hover:bg-red-600 flex items-center justify-center text-white transition-colors shadow-sm" title="Sair da chamada" aria-label="Sair da chamada">
          <PhoneOff size={20} />
        </button>
      </footer>
    </div>
  );
}

function CallButton({ children, onClick, active, activeColor, label }: { children: React.ReactNode; onClick: () => void; active: boolean; activeColor: string; label: string }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors text-white shadow-sm ${active ? activeColor : "bg-bg-tertiary hover:bg-bg-elevated"}`}>
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
  audioVolume = 1,
  audioMuted = false,
  audioOutputDeviceId,
  mirrored,
  isScreenShare,
}: {
  username: string;
  color?: string;
  speaking?: boolean;
  muted?: boolean;
  videoStream?: MediaStream | null;
  audioStream?: MediaStream | null;
  audioVolume?: number;
  audioMuted?: boolean;
  audioOutputDeviceId?: string;
  mirrored?: boolean;
  isScreenShare?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current && videoStream) videoRef.current.srcObject = videoStream;
  }, [videoStream]);

  useEffect(() => {
    if (audioRef.current && audioStream) audioRef.current.srcObject = audioStream;
  }, [audioStream]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = audioVolume;
    audioRef.current.muted = audioMuted;
  }, [audioMuted, audioVolume]);

  useEffect(() => {
    const audio = audioRef.current as (HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> }) | null;
    if (!audio?.setSinkId) return;
    audio.setSinkId(audioOutputDeviceId || "default").catch(() => {});
  }, [audioOutputDeviceId]);

  const audio = audioStream && <audio ref={audioRef} autoPlay />;

  return (
    <article className={`relative rounded-2xl bg-bg-tertiary overflow-hidden flex items-center justify-center min-h-[180px] border border-white/5 shadow-lg ${speaking ? "ring-2 ring-online" : ""}`}>
      {!videoStream && audio}
      {videoStream ? (
        <video ref={videoRef} autoPlay playsInline muted={mirrored} className={`w-full h-full object-cover ${mirrored && !isScreenShare ? "-scale-x-100" : ""} ${isScreenShare ? "object-contain bg-black" : ""}`} />
      ) : (
        <Avatar username={username} color={color} size={72} ring={speaking} />
      )}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/75 to-transparent pointer-events-none" />
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/45 backdrop-blur-sm px-2.5 py-1.5 rounded-lg">
        {muted && <MicOff size={12} className="text-danger" />}
        <span className="text-xs text-white font-medium">{username}</span>
      </div>
      {videoStream && audio}
    </article>
  );
}
