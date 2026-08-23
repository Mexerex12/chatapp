import { useCallback, useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { api } from "../api/client";

export interface VoiceParticipant {
  userId: string;
  username: string;
  muted: boolean;
  videoEnabled: boolean;
  sharingScreen: boolean;
  speaking: boolean;
  stream?: MediaStream; // stream de câmera/microfone remoto
  screenStream?: MediaStream; // stream de compartilhamento de tela remoto
}

interface PeerEntry {
  pc: RTCPeerConnection;
  cameraStream?: MediaStream;
  screenShareStream?: MediaStream;
}

// Cada participante remoto pode nos enviar até 2 "video tracks" (câmera e tela).
// Para diferenciar no ontrack, usamos o msid/transceiver "kind"+ordem: track de
// tela é identificada pela track.label/contentHint que setamos como "screen".

export function useVoiceCall(socket: Socket | null, channelId: string | null, _username: string, myUserId: string) {
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Record<string, VoiceParticipant>>({});
  const [micMuted, setMicMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const analyserRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const channelIdRef = useRef<string | null>(channelId);
  channelIdRef.current = channelId;

  useEffect(() => {
    api
      .get("/config/ice-servers")
      .then(({ data }) => {
        if (data.iceServers?.length) iceServersRef.current = data.iceServers;
      })
      .catch(() => {});
  }, []);

  const updateParticipant = useCallback((userId: string, patch: Partial<VoiceParticipant>) => {
    setParticipants((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? { userId, username: userId, muted: false, videoEnabled: false, sharingScreen: false, speaking: false }), ...patch },
    }));
  }, []);

  const createPeerConnection = useCallback(
    (peerUserId: string, chId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

      const local = localStreamRef.current;
      if (local) {
        for (const track of local.getTracks()) pc.addTrack(track, local);
      }
      if (screenStreamRef.current) {
        for (const track of screenStreamRef.current.getTracks()) pc.addTrack(track, screenStreamRef.current);
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit("voice:signal", { to: peerUserId, from: myUserId, type: "ice-candidate", payload: event.candidate, channelId: chId });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        const isScreen = stream?.id.startsWith("screen-") || event.track.contentHint === "detail";
        updateParticipant(peerUserId, isScreen ? { screenStream: stream, sharingScreen: true } : { stream });
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          // conexão caiu — o evento voice:user-left do servidor cuida da limpeza,
          // mas garantimos que não fique um peer "morto" pendurado.
        }
      };

      peersRef.current.set(peerUserId, { pc });
      return pc;
    },
    [socket, myUserId, updateParticipant]
  );

  const removePeer = useCallback((peerUserId: string) => {
    const entry = peersRef.current.get(peerUserId);
    entry?.pc.close();
    peersRef.current.delete(peerUserId);
    setParticipants((prev) => {
      const next = { ...prev };
      delete next[peerUserId];
      return next;
    });
  }, []);

  const startSpeakingDetector = useCallback(
    (stream: MediaStream, chId: string) => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let wasSpeaking = false;
      let lastEmit = 0;

      function tick() {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const speaking = avg > 12;
        const now = Date.now();
        if (speaking !== wasSpeaking && now - lastEmit > 200) {
          wasSpeaking = speaking;
          lastEmit = now;
          setLocalSpeaking(speaking);
          socket?.emit("voice:speaking", { channelId: chId, speaking });
        }
        analyserRef.current!.raf = requestAnimationFrame(tick);
      }
      analyserRef.current = { ctx, raf: requestAnimationFrame(tick) };
    },
    [socket]
  );

  const stopSpeakingDetector = useCallback(() => {
    if (analyserRef.current) {
      cancelAnimationFrame(analyserRef.current.raf);
      analyserRef.current.ctx.close().catch(() => {});
      analyserRef.current = null;
    }
  }, []);

  const join = useCallback(
    async (chId: string) => {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        startSpeakingDetector(stream, chId);
      } catch (e) {
        setError("Não foi possível acessar o microfone. Verifique as permissões.");
        return;
      }

      socket?.emit("voice:join", chId, async (res: { ok?: boolean; error?: string; peers?: string[] }) => {
        if (res.error) {
          setError(res.error);
          return;
        }
        setConnected(true);
        // Nós somos o "novo" participante: iniciamos a oferta para cada peer já presente.
        for (const peerUserId of res.peers ?? []) {
          const pc = createPeerConnection(peerUserId, chId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket?.emit("voice:signal", { to: peerUserId, from: myUserId, type: "offer", payload: offer, channelId: chId });
        }
      });
    },
    [socket, myUserId, createPeerConnection, startSpeakingDetector]
  );

  const leave = useCallback(() => {
    const chId = channelIdRef.current;
    if (chId) socket?.emit("voice:leave", chId);
    for (const [, entry] of peersRef.current) entry.pc.close();
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    stopSpeakingDetector();
    setConnected(false);
    setParticipants({});
    setMicMuted(false);
    setVideoEnabled(false);
    setScreenSharing(false);
  }, [socket, stopSpeakingDetector]);

  // ---- Sinalização recebida ----
  useEffect(() => {
    if (!socket) return;

    async function onSignal(data: { from: string; type: string; payload: unknown; channelId: string }) {
      if (data.channelId !== channelIdRef.current) return;
      let entry = peersRef.current.get(data.from);

      if (data.type === "offer") {
        const pc = entry?.pc ?? createPeerConnection(data.from, data.channelId);
        await pc.setRemoteDescription(new RTCSessionDescription(data.payload as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket?.emit("voice:signal", { to: data.from, from: myUserId, type: "answer", payload: answer, channelId: data.channelId });
      } else if (data.type === "answer") {
        await entry?.pc.setRemoteDescription(new RTCSessionDescription(data.payload as RTCSessionDescriptionInit));
      } else if (data.type === "ice-candidate") {
        try {
          await entry?.pc.addIceCandidate(new RTCIceCandidate(data.payload as RTCIceCandidateInit));
        } catch {
          /* candidato pode chegar antes da remote description em raras corridas; ignorar */
        }
      }
    }

    function onUserJoined(data: { userId: string; username: string; channelId: string }) {
      if (data.channelId !== channelIdRef.current) return;
      updateParticipant(data.userId, { username: data.username });
    }

    function onUserLeft(data: { userId: string; channelId: string }) {
      if (data.channelId !== channelIdRef.current) return;
      removePeer(data.userId);
    }

    function onMuteUpdate(data: { userId: string; muted: boolean }) {
      updateParticipant(data.userId, { muted: data.muted });
    }
    function onVideoUpdate(data: { userId: string; enabled: boolean }) {
      updateParticipant(data.userId, { videoEnabled: data.enabled });
    }
    function onScreenshareUpdate(data: { userId: string; sharing: boolean }) {
      updateParticipant(data.userId, { sharingScreen: data.sharing });
    }
    function onSpeakingUpdate(data: { userId: string; speaking: boolean }) {
      updateParticipant(data.userId, { speaking: data.speaking });
    }

    socket.on("voice:signal", onSignal);
    socket.on("voice:user-joined", onUserJoined);
    socket.on("voice:user-left", onUserLeft);
    socket.on("voice:mute-update", onMuteUpdate);
    socket.on("voice:video-update", onVideoUpdate);
    socket.on("voice:screenshare-update", onScreenshareUpdate);
    socket.on("voice:speaking-update", onSpeakingUpdate);

    return () => {
      socket.off("voice:signal", onSignal);
      socket.off("voice:user-joined", onUserJoined);
      socket.off("voice:user-left", onUserLeft);
      socket.off("voice:mute-update", onMuteUpdate);
      socket.off("voice:video-update", onVideoUpdate);
      socket.off("voice:screenshare-update", onScreenshareUpdate);
      socket.off("voice:speaking-update", onSpeakingUpdate);
    };
  }, [socket, myUserId, createPeerConnection, removePeer, updateParticipant]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const muted = !track.enabled;
    setMicMuted(muted);
    if (channelIdRef.current) socket?.emit("voice:mute", { channelId: channelIdRef.current, muted });
  }, [socket]);

  const toggleCamera = useCallback(async () => {
    const chId = channelIdRef.current;
    if (!chId) return;
    if (videoEnabled) {
      const stream = localStreamRef.current;
      const track = stream?.getVideoTracks()[0];
      if (track) {
        stream!.removeTrack(track);
        track.stop();
        for (const [, entry] of peersRef.current) {
          const sender = entry.pc.getSenders().find((s) => s.track?.kind === "video" && s.track.contentHint !== "detail");
          if (sender) entry.pc.removeTrack(sender);
        }
      }
      setVideoEnabled(false);
      socket?.emit("voice:video-toggle", { channelId: chId, enabled: false });
      return;
    }
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = camStream.getVideoTracks()[0];
      localStreamRef.current?.addTrack(track);
      for (const [, entry] of peersRef.current) {
        entry.pc.addTrack(track, localStreamRef.current!);
      }
      setVideoEnabled(true);
      socket?.emit("voice:video-toggle", { channelId: chId, enabled: true });
    } catch {
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  }, [socket, videoEnabled]);

  const toggleScreenShare = useCallback(async () => {
    const chId = channelIdRef.current;
    if (!chId) return;
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      for (const [, entry] of peersRef.current) {
        const sender = entry.pc.getSenders().find((s) => s.track?.contentHint === "detail");
        if (sender) entry.pc.removeTrack(sender);
      }
      screenStreamRef.current = null;
      setScreenSharing(false);
      socket?.emit("voice:screenshare-toggle", { channelId: chId, sharing: false });
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      track.contentHint = "detail";
      // Prefixo "screen-" no id do stream ajuda o outro lado a identificar a track no ontrack.
      const screenStream = new MediaStream([track]);
      Object.defineProperty(screenStream, "id", { value: `screen-${myUserId}-${Date.now()}` });
      screenStreamRef.current = screenStream;

      for (const [, entry] of peersRef.current) {
        entry.pc.addTrack(track, screenStream);
      }
      track.onended = () => {
        toggleScreenShare();
      };
      setScreenSharing(true);
      socket?.emit("voice:screenshare-toggle", { channelId: chId, sharing: true });
    } catch {
      // usuário cancelou o picker do sistema — não é um erro real, ignorar
    }
  }, [socket, screenSharing, myUserId]);

  useEffect(() => () => leave(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connected,
    participants,
    join,
    leave,
    micMuted,
    videoEnabled,
    screenSharing,
    localSpeaking,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    error,
    localStream: localStreamRef,
  };
}
