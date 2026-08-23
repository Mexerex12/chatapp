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
  stream?: MediaStream;
  screenStream?: MediaStream;
}

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  audioTransceiver: RTCRtpTransceiver;
  cameraTransceiver: RTCRtpTransceiver;
  screenTransceiver: RTCRtpTransceiver;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  polite: boolean;
  cameraStream: MediaStream;
  screenStream: MediaStream;
}

interface OutboundAudioProcessor {
  ctx: AudioContext;
  track: MediaStreamTrack;
  microphoneGain: GainNode;
}

export function useVoiceCall(socket: Socket | null, channelId: string | null, _username: string, myUserId: string) {
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Record<string, VoiceParticipant>>({});
  const [micMuted, setMicMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioInputs, setAudioInputs] = useState<AudioDeviceOption[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<AudioDeviceOption[]>([]);
  const [selectedAudioInputId, setSelectedAudioInputId] = useState("");
  const [selectedAudioOutputId, setSelectedAudioOutputId] = useState("");
  const [microphoneGain, setMicrophoneGain] = useState(200);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const analyserRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const outboundAudioProcessorRef = useRef<OutboundAudioProcessor | null>(null);
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

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const toOption = (device: MediaDeviceInfo, index: number) => ({
      deviceId: device.deviceId,
      label: device.label || `${device.kind === "audioinput" ? "Microfone" : "Saída de áudio"} ${index + 1}`,
    });
    setAudioInputs(devices.filter((device) => device.kind === "audioinput").map(toOption));
    setAudioOutputs(devices.filter((device) => device.kind === "audiooutput").map(toOption));
  }, []);

  useEffect(() => {
    void refreshAudioDevices();
    navigator.mediaDevices?.addEventListener("devicechange", refreshAudioDevices);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refreshAudioDevices);
  }, [refreshAudioDevices]);

  const updateParticipant = useCallback((userId: string, patch: Partial<VoiceParticipant>) => {
    setParticipants((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? {
          userId,
          username: userId,
          muted: false,
          videoEnabled: false,
          sharingScreen: false,
          speaking: false,
        }),
        ...patch,
      },
    }));
  }, []);

  const createOutboundAudioTrack = useCallback((microphoneTrack: MediaStreamTrack, screenAudioTrack?: MediaStreamTrack, gainPercent = microphoneGain) => {
    outboundAudioProcessorRef.current?.ctx.close().catch(() => {});

    const ctx = new AudioContext();
    const destination = ctx.createMediaStreamDestination();
    const microphoneSource = ctx.createMediaStreamSource(new MediaStream([microphoneTrack]));
    const microphoneGain = ctx.createGain();
    microphoneGain.gain.value = gainPercent / 100;
    microphoneSource.connect(microphoneGain).connect(destination);

    if (screenAudioTrack) {
      const screenAudioSource = ctx.createMediaStreamSource(new MediaStream([screenAudioTrack]));
      screenAudioSource.connect(destination);
    }

    const track = destination.stream.getAudioTracks()[0];
    outboundAudioProcessorRef.current = { ctx, track, microphoneGain };
    return track;
  }, [microphoneGain]);

  const replaceOutboundAudioTrack = useCallback(async (track: MediaStreamTrack | null) => {
    for (const entry of peersRef.current.values()) {
      await entry.audioTransceiver.sender.replaceTrack(track);
    }
  }, []);

  const emitSignal = useCallback(
    (peerUserId: string, type: string, payload: unknown, chId: string) => {
      socket?.emit("voice:signal", {
        to: peerUserId,
        from: myUserId,
        type,
        payload,
        channelId: chId,
      });
    },
    [socket, myUserId]
  );

  const createPeerConnection = useCallback(
    (peerUserId: string, chId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(peerUserId);
      if (existing) return existing.pc;

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const polite = myUserId.localeCompare(peerUserId) > 0;

      // Reserve the media sections from the first offer. This is the key to making
      // camera/screen-share toggles work without adding new m-lines later.
      const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
      const cameraTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
      const screenTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });

      const entry: PeerEntry = {
        pc,
        audioTransceiver,
        cameraTransceiver,
        screenTransceiver,
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
        pendingCandidates: [],
        polite,
        cameraStream: new MediaStream(),
        screenStream: new MediaStream(),
      };

      const localAudio = outboundAudioProcessorRef.current?.track ?? localStreamRef.current?.getAudioTracks()[0];
      const localCamera = localStreamRef.current?.getVideoTracks()[0];
      const localScreen = screenStreamRef.current?.getVideoTracks()[0];

      void audioTransceiver.sender.replaceTrack(localAudio ?? null);
      void cameraTransceiver.sender.replaceTrack(localCamera ?? null);
      void screenTransceiver.sender.replaceTrack(localScreen ?? null);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          emitSignal(peerUserId, "ice-candidate", event.candidate.toJSON(), chId);
        }
      };

      pc.ontrack = (event) => {
        const track = event.track;
        const stream = event.streams[0];

        // Compare transceiver objects first. MID values are assigned only after
        // negotiation and can briefly be null while an incoming screen track is
        // announced, which previously made the screen track look like camera
        // media and left the viewer with an empty screen tile.
        const isScreenTrack = event.transceiver === entry.screenTransceiver || (
          event.transceiver.mid !== null && event.transceiver.mid === entry.screenTransceiver.mid
        );
        if (isScreenTrack) {
          const screenStream = stream ?? entry.screenStream;
          if (!stream && !screenStream.getTrackById(track.id)) screenStream.addTrack(track);
          updateParticipant(peerUserId, {
            screenStream,
            sharingScreen: true,
          });
          track.onended = () => {
            screenStream.removeTrack(track);
            updateParticipant(peerUserId, {
              screenStream: screenStream.getVideoTracks().length ? screenStream : undefined,
              sharingScreen: screenStream.getVideoTracks().length > 0,
            });
          };
          return;
        }

        const isCameraTrack = event.transceiver === entry.cameraTransceiver || (
          event.transceiver.mid !== null && event.transceiver.mid === entry.cameraTransceiver.mid
        );
        if (isCameraTrack) {
          if (stream) {
            updateParticipant(peerUserId, { stream });
          } else {
            if (!entry.cameraStream.getTrackById(track.id)) entry.cameraStream.addTrack(track);
            updateParticipant(peerUserId, { stream: entry.cameraStream });
          }
          return;
        }

        // Audio has no visual representation, but it must remain attached to a
        // stream so VoiceCallView can play it.
        if (stream) {
          updateParticipant(peerUserId, { stream });
        } else {
          if (!entry.cameraStream.getTrackById(track.id)) entry.cameraStream.addTrack(track);
          updateParticipant(peerUserId, { stream: entry.cameraStream });
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          entry.makingOffer = true;
          const offer = await pc.createOffer();
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription(offer);
          emitSignal(peerUserId, "offer", pc.localDescription, chId);
        } catch (err) {
          console.error("WebRTC negotiation failed", err);
        } finally {
          entry.makingOffer = false;
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          void pc.restartIce();
        }
      };

      peersRef.current.set(peerUserId, entry);
      return pc;
    },
    [emitSignal, myUserId, updateParticipant]
  );

  const renegotiatePeer = useCallback(async (peerUserId: string) => {
    const entry = peersRef.current.get(peerUserId);
    if (!entry || entry.pc.signalingState !== "stable") return;

    try {
      entry.makingOffer = true;
      const offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      const chId = channelIdRef.current;
      if (chId) emitSignal(peerUserId, "offer", entry.pc.localDescription, chId);
    } catch (err) {
      console.error("WebRTC renegotiation failed", err);
    } finally {
      entry.makingOffer = false;
    }
  }, [emitSignal]);

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
        if (analyserRef.current) analyserRef.current.raf = requestAnimationFrame(tick);
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
    setLocalSpeaking(false);
  }, []);

  const join = useCallback(
    async (chId: string) => {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        localStreamRef.current = stream;
        const microphoneTrack = stream.getAudioTracks()[0];
        if (!microphoneTrack) throw new Error("Microfone não disponível");
        createOutboundAudioTrack(microphoneTrack);
        startSpeakingDetector(stream, chId);
        void refreshAudioDevices();
      } catch {
        setError("Não foi possível acessar o microfone. Verifique as permissões.");
        return;
      }

      socket?.emit("voice:join", chId, async (res: { ok?: boolean; error?: string; peers?: string[] }) => {
        if (res.error) {
          localStreamRef.current?.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
          stopSpeakingDetector();
          setError(res.error);
          return;
        }

        setConnected(true);
        // createPeerConnection reserves the audio/camera/screen transceivers.
        // Its negotiationneeded handler creates the initial offer. Keeping a
        // single offer path prevents duplicate offers and signaling collisions.
        for (const peerUserId of res.peers ?? []) {
          createPeerConnection(peerUserId, chId);
        }
      });
    },
    [socket, createOutboundAudioTrack, createPeerConnection, refreshAudioDevices, startSpeakingDetector, stopSpeakingDetector]
  );

  const selectAudioInput = useCallback(async (deviceId: string) => {
    const chId = channelIdRef.current;
    if (!chId || deviceId === selectedAudioInputId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      const nextTrack = stream.getAudioTracks()[0];
      if (!nextTrack) throw new Error("Microfone não disponível");

      nextTrack.enabled = !micMuted;
      const currentStream = localStreamRef.current;
      currentStream?.getAudioTracks().forEach((track) => {
        currentStream.removeTrack(track);
        track.stop();
      });
      currentStream?.addTrack(nextTrack);
      const outboundTrack = createOutboundAudioTrack(nextTrack, screenStreamRef.current?.getAudioTracks()[0]);
      await replaceOutboundAudioTrack(outboundTrack);
      stopSpeakingDetector();
      startSpeakingDetector(stream, chId);
      setSelectedAudioInputId(deviceId);
      setError(null);
    } catch {
      setError("Não foi possível trocar o microfone. Verifique as permissões do dispositivo.");
    }
  }, [createOutboundAudioTrack, micMuted, replaceOutboundAudioTrack, selectedAudioInputId, startSpeakingDetector, stopSpeakingDetector]);

  const changeMicrophoneGain = useCallback(async (gainPercent: number) => {
    const nextGain = Math.min(200, Math.max(100, gainPercent));
    const processor = outboundAudioProcessorRef.current;
    if (processor) processor.microphoneGain.gain.setTargetAtTime(nextGain / 100, processor.ctx.currentTime, 0.015);
    setMicrophoneGain(nextGain);
  }, []);

  const leave = useCallback(() => {
    const chId = channelIdRef.current;
    if (chId) socket?.emit("voice:leave", chId);
    for (const [, entry] of peersRef.current) entry.pc.close();
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    outboundAudioProcessorRef.current?.ctx.close().catch(() => {});
    outboundAudioProcessorRef.current = null;
    localStreamRef.current = null;
    screenStreamRef.current = null;
    stopSpeakingDetector();
    setConnected(false);
    setParticipants({});
    setMicMuted(false);
    setVideoEnabled(false);
    setScreenSharing(false);
  }, [socket, stopSpeakingDetector]);

  useEffect(() => {
    if (!socket) return;

    async function onSignal(data: { from: string; type: string; payload: unknown; channelId: string }) {
      if (data.channelId !== channelIdRef.current) return;

      let entry = peersRef.current.get(data.from);
      if (!entry && data.type !== "offer") return;

      if (data.type === "offer") {
        const pc = entry?.pc ?? createPeerConnection(data.from, data.channelId);
        entry = peersRef.current.get(data.from)!;

        const offerCollision = entry.makingOffer || pc.signalingState !== "stable";
        entry.ignoreOffer = !entry.polite && offerCollision;
        if (entry.ignoreOffer) return;

        try {
          entry.isSettingRemoteAnswerPending = false;
          await pc.setRemoteDescription(new RTCSessionDescription(data.payload as RTCSessionDescriptionInit));
          for (const candidate of entry.pendingCandidates.splice(0)) {
            await pc.addIceCandidate(candidate).catch(() => {});
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          emitSignal(data.from, "answer", pc.localDescription, data.channelId);
        } catch (err) {
          console.error("WebRTC offer handling failed", err);
        }
      } else if (data.type === "answer") {
        if (!entry) return;
        try {
          entry.isSettingRemoteAnswerPending = true;
          await entry.pc.setRemoteDescription(new RTCSessionDescription(data.payload as RTCSessionDescriptionInit));
          entry.isSettingRemoteAnswerPending = false;
          for (const candidate of entry.pendingCandidates.splice(0)) {
            await entry.pc.addIceCandidate(candidate).catch(() => {});
          }
        } catch (err) {
          entry.isSettingRemoteAnswerPending = false;
          console.error("WebRTC answer handling failed", err);
        }
      } else if (data.type === "ice-candidate") {
        if (!entry) return;
        const candidate = data.payload as RTCIceCandidateInit;
        if (!entry.pc.remoteDescription) {
          entry.pendingCandidates.push(candidate);
          return;
        }
        try {
          await entry.pc.addIceCandidate(candidate);
        } catch (err) {
          if (!entry.ignoreOffer) console.error("WebRTC ICE candidate failed", err);
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
      if (!data.sharing) {
        updateParticipant(data.userId, { screenStream: undefined });
      }
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
  }, [socket, createPeerConnection, emitSignal, removePeer, updateParticipant]);

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
      localStreamRef.current?.getVideoTracks().forEach((track) => {
        localStreamRef.current?.removeTrack(track);
        track.stop();
      });

      for (const entry of peersRef.current.values()) {
        await entry.cameraTransceiver.sender.replaceTrack(null);
      }
      setVideoEnabled(false);
      socket?.emit("voice:video-toggle", { channelId: chId, enabled: false });
      return;
    }

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = camStream.getVideoTracks()[0];
      localStreamRef.current?.addTrack(track);

      for (const entry of peersRef.current.values()) {
        await entry.cameraTransceiver.sender.replaceTrack(track);
      }

      setVideoEnabled(true);
      socket?.emit("voice:video-toggle", { channelId: chId, enabled: true });
    } catch {
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  }, [socket, videoEnabled]);

  const stopScreenShare = useCallback(async () => {
    const chId = channelIdRef.current;
    const screenStream = screenStreamRef.current;
    // Clear the reference before stopping the track. Calling track.stop() can
    // synchronously run a browser's `ended` handler, which otherwise causes a
    // second stop operation against a newly-created share.
    screenStreamRef.current = null;

    screenStream?.getTracks().forEach((track) => track.stop());

    const microphoneTrack = localStreamRef.current?.getAudioTracks()[0];
    const outboundTrack = microphoneTrack ? createOutboundAudioTrack(microphoneTrack) : null;
    await replaceOutboundAudioTrack(outboundTrack);

    for (const entry of peersRef.current.values()) {
      await entry.screenTransceiver.sender.replaceTrack(null);
    }

    setScreenSharing(false);
    if (chId) socket?.emit("voice:screenshare-toggle", { channelId: chId, sharing: false });
  }, [createOutboundAudioTrack, replaceOutboundAudioTrack, socket]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      await stopScreenShare();
      return;
    }

    const chId = channelIdRef.current;
    if (!chId) return;

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const track = display.getVideoTracks()[0];
      if (!track) {
        display.getTracks().forEach((mediaTrack) => mediaTrack.stop());
        throw new Error("Nenhuma tela foi selecionada");
      }
      track.contentHint = "detail";
      screenStreamRef.current = display;

      const microphoneTrack = localStreamRef.current?.getAudioTracks()[0];
      if (microphoneTrack) {
        const outboundTrack = createOutboundAudioTrack(microphoneTrack, display.getAudioTracks()[0]);
        await replaceOutboundAudioTrack(outboundTrack);
      }

      for (const entry of peersRef.current.values()) {
        await entry.screenTransceiver.sender.replaceTrack(track);
      }

      track.onended = () => {
        void stopScreenShare();
      };

      setScreenSharing(true);
      socket?.emit("voice:screenshare-toggle", { channelId: chId, sharing: true });
    } catch {
      // Cancelar o seletor de tela não é um erro.
    }
  }, [createOutboundAudioTrack, replaceOutboundAudioTrack, socket, screenSharing, stopScreenShare]);

  useEffect(() => () => leave(), [leave]);

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
    localScreenStream: screenStreamRef,
    audioInputs,
    audioOutputs,
    selectedAudioInputId,
    selectedAudioOutputId,
    microphoneGain,
    selectAudioInput,
    changeMicrophoneGain,
    setSelectedAudioOutputId,
  };
}
