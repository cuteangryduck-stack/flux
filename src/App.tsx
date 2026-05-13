/**
@license
SPDX-License-Identifier: Apache-2.0
*/
import { useState, useRef, useEffect, FormEvent } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MessageSquare,
  Send,
  Loader2,
  Settings,
  Monitor,
  X,
  Palette,
  User,
  Moon,
  Sun,
  MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  sender: string;
  text: string;
  isMine: boolean;
  timestamp: string;
}

interface StatusData {
  type: 'status';
  peerId: string;
  name: string;
  color: string;
  mic: boolean;
  vid: boolean;
}

interface ChatData {
  type: 'chat';
  name: string;
  text: string;
}

interface PeerListData {
  type: 'peer-list';
  peers: string[];
}

interface EndMeetingData {
  type: 'end-meeting';
}

type PeerData = StatusData | ChatData | PeerListData | EndMeetingData;

interface Participant {
  peerId: string;
  name: string;
  color: string;
  mic: boolean;
  vid: boolean;
}

const RemoteVideo = ({ stream, participant }: { stream: MediaStream, participant?: Participant, key?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const isActive = participant ? participant.vid : true;

  return (
    <div className="relative bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-700 bg-sidebar border-theme aspect-[4/3] flex items-center justify-center">
      <video
        ref={videoRef}
        className={`w-full h-full object-cover ${!isActive ? 'hidden' : ''}`}
        autoPlay
        playsInline
        onLoadedMetadata={(e) => (e.target as HTMLVideoElement).play().catch(err => console.error("Remote play failed ", err))}
      />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-700">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-xl"
            style={{ backgroundColor: participant?.color || '#2563eb' }}
          >
            {participant?.name.charAt(0).toUpperCase() || '?'}
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
        <span className="text-xs font-medium text-white">{participant?.name || 'Remote User'}</span>
        <div className="flex gap-1.5 border-l border-white/20 pl-2">
          {participant?.mic ? <Mic className="w-3 h-3 text-white" /> : <MicOff className="w-3 h-3 text-red-500" />}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [inCall, setInCall] = useState(false);
  const [userName, setUserName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [meetingId, setMeetingId] = useState('------');
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [myName, setMyName] = useState('User');
  const [micActive, setMicActive] = useState(true);
  const [vidActive, setVidActive] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showSidebar, setShowSidebar] = useState(window.innerWidth >= 1024);
  const [profileColor, setProfileColor] = useState('#2563eb');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Temp settings for modal
  const [tempName, setTempName] = useState(myName);
  const [tempColor, setTempColor] = useState(profileColor);
  const [tempTheme, setTempTheme] = useState(theme);
  const [tempSound, setTempSound] = useState(soundEnabled);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Record<string, DataConnection>>({});
  const callsRef = useRef<Record<string, MediaConnection>>({});
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Audio refs
  const audioToggleRef = useRef<HTMLAudioElement | null>(null);
  const audioConnectRef = useRef<HTMLAudioElement | null>(null);
  const audioDisconnectRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio elements with more reliable URLs
    audioToggleRef.current = new Audio('https://www.soundjay.com/buttons/sounds/button-16.mp3');
    audioConnectRef.current = new Audio('https://www.soundjay.com/buttons/sounds/button-3.mp3');
    audioDisconnectRef.current = new Audio('https://www.soundjay.com/buttons/sounds/button-10.mp3');

    // Preload sounds
    [audioToggleRef, audioConnectRef, audioDisconnectRef].forEach(ref => {
      if (ref.current) {
        ref.current.load();
      }
    });
  }, []);

  const playSound = (type: 'toggle' | 'connect' | 'disconnect') => {
    if (!soundEnabled) return;
    const audio = type === 'toggle' ? audioToggleRef.current : type === 'connect' ? audioConnectRef.current : audioDisconnectRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  };

  useEffect(() => {
    if (inCall) {
      timerRef.current = setInterval(() => {
        setMeetingDuration(prev => prev + 1);
      }, 1000);
      playSound('connect');
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setMeetingDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [inCall]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, inCall]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const broadcast = (data: PeerData) => {
    Object.values(connectionsRef.current).forEach((conn: DataConnection) => {
      if (conn.open) {
        conn.send(data);
      }
    });
  };

  const sendStatusUpdate = (mic: boolean, vid: boolean, nameOverride?: string) => {
    broadcast({
      type: 'status',
      peerId: peerRef.current?.id || '',
      name: nameOverride || myName,
      color: profileColor,
      mic,
      vid
    });
  };

  const setupDataHandlers = (conn: DataConnection) => {
    const peerId = conn.peer;
    connectionsRef.current[peerId] = conn;

    const onOpen = () => {
      // Send initial status
      conn.send({
        type: 'status',
        peerId: peerRef.current?.id || '',
        name: myName,
        color: profileColor,
        mic: micActive,
        vid: vidActive
      });

      // If I'm the host, send the list of other peers to the new joiner
      if (isHost) {
        const otherPeers = Object.keys(connectionsRef.current).filter(id => id !== peerId);
        conn.send({
          type: 'peer-list',
          peers: otherPeers
        });
      }
    };

    if (conn.open) {
      onOpen();
    } else {
      conn.on('open', onOpen);
    }

    conn.on('data', (data: any) => {
      const peerData = data as PeerData;
      if (peerData.type === 'status') {
        setParticipants(prev => ({
          ...prev,
          [peerData.peerId]: {
            peerId: peerData.peerId,
            name: peerData.name,
            color: peerData.color,
            mic: peerData.mic,
            vid: peerData.vid
          }
        }));
      } else if (peerData.type === 'chat') {
        setMessages(prev => [...prev, { 
          sender: peerData.name, 
          text: peerData.text, 
          isMine: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      } else if (peerData.type === 'peer-list') {
        // As a joiner, I received a list of other peers from the host. Connect to them.
        peerData.peers.forEach(id => {
          if (!connectionsRef.current[id]) {
            connectToPeer(id, localStream);
          }
        });
      } else if (peerData.type === 'end-meeting') {
        handleHangup(true);
      }
    });

    conn.on('close', () => {
      removePeer(peerId);
    });
  };

  const removePeer = (peerId: string) => {
    delete connectionsRef.current[peerId];
    delete callsRef.current[peerId];
    setRemoteStreams(prev => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setParticipants(prev => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    playSound('disconnect');
  };

  const connectToPeer = (targetId: string, stream: MediaStream | null) => {
    if (!peerRef.current || connectionsRef.current[targetId]) return;
    
    const conn = peerRef.current.connect(targetId);
    setupDataHandlers(conn);

    // Only attempt media call if we have a stream or if we are just signaling
    // PeerJS requires a stream for .call(), so if null, we might skip or send empty
    if (stream) {
        const call = peerRef.current.call(targetId, stream);
        setupCallHandlers(call);
    }
  };

  const setupCallHandlers = (call: MediaConnection) => {
    const peerId = call.peer;
    callsRef.current[peerId] = call;

    call.on('stream', (remoteStream) => {
      setRemoteStreams(prev => ({
        ...prev,
        [peerId]: remoteStream
      }));
    });

    call.on('close', () => {
      removePeer(peerId);
    });
  };

  const startFlux = async (targetId: string, isJoining: boolean, chatOnly: boolean = false) => {
    setError(null);
    setIsConnecting(true);
    setIsHost(!isJoining);
    
    const finalMyName = userName.trim() || (isJoining ? "User 2" : "User");
    setMyName(finalMyName);

    let stream: MediaStream | null = null;
    
    if (!chatOnly) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          setLocalStream(stream);
          setMicActive(true);
          setVidActive(true);
        } catch (err) {
          console.warn("Camera/Mic access denied, continuing without media: ", err);
          setLocalStream(null);
          setMicActive(false);
          setVidActive(false);
        }
    } else {
        setLocalStream(null);
        setMicActive(false);
        setVidActive(false);
    }

    const peer = isJoining ? new Peer() : new Peer(targetId);
    peerRef.current = peer;

    peer.on('open', (id) => {
      if (isJoining) {
        connectToPeer(targetId, stream);
        setMeetingId(targetId);
        setInCall(true);
        setIsConnecting(false);
      } else {
        setMeetingId(id);
        setInCall(true);
        setIsConnecting(false);
      }
    });

    peer.on('call', (call) => {
      // Answer with stream if we have it, otherwise answer with nothing (audio only context usually fails if no track, but peerjs handles nullish)
      call.answer(stream || undefined);
      setupCallHandlers(call);
    });

    peer.on('connection', (conn) => {
      setupDataHandlers(conn);
    });

    peer.on('error', (err) => {
      setIsConnecting(false);
      if (err.type === 'peer-unavailable') setError("Wrong code. Meeting not found.");
      else if (err.type === 'unavailable-id') setError("Code in use. Try again.");
      else setError("Connection error.");
    });
  };

  const handleCreate = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    startFlux(code, false, false);
  };

  const handleJoin = (chatOnly: boolean = false) => {
    if (joinId.length === 6) {
      startFlux(joinId.toUpperCase(), true, chatOnly);
    }
  };

  const handleHangup = (force: boolean = false) => {
    if (!force && isHost) {
      broadcast({ type: 'end-meeting' });
    }
    playSound('disconnect');
    localStream?.getTracks().forEach(track => track.stop());
    peerRef.current?.destroy();

    // Reset state instead of reload for smoother transition
    setInCall(false);
    setRemoteStreams({});
    setParticipants({});
    setMessages([]);
    setMeetingDuration(0);
    setIsHost(false);
    connectionsRef.current = {};
    callsRef.current = {};

    setTimeout(() => window.location.reload(), 100);
  };

  const toggleMic = () => {
    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      track.enabled = !track.enabled;
      setMicActive(track.enabled);
      sendStatusUpdate(track.enabled, vidActive);
      playSound('toggle');
    } else {
      setError("Microphone is not available.");
      setTimeout(() => setError(null), 3000);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const track = localStream.getVideoTracks()[0];
      track.enabled = !track.enabled;
      setVidActive(track.enabled);
      sendStatusUpdate(micActive, track.enabled);
      playSound('toggle');
    } else {
      setError("Camera is not available.");
      setTimeout(() => setError(null), 3000);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        setIsScreenSharing(true);
        const videoTrack = stream.getVideoTracks()[0];
        
        // Replace track in all active calls
        Object.values(callsRef.current).forEach((call: MediaConnection) => {
          const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        });

        videoTrack.onended = () => {
          stopScreenShare();
        };
      } catch (err) {
        console.error("Error sharing screen:", err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    // Restore local camera stream
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      Object.values(callsRef.current).forEach((call: MediaConnection) => {
        const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });
    }
  };

  const handleSendMessage = (e: FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      broadcast({ type: 'chat', name: myName, text: chatInput.trim() });
      setMessages(prev => [...prev, {
        sender: "You",
        text: chatInput.trim(),
        isMine: true,
        timestamp
      }]);
      setChatInput('');
    }
  };

  return (
    <div className={`bg-zinc-900 text-white font-sans h-screen flex flex-col overflow-hidden bg-main text-primary`} data-theme={theme}>
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 border border-red-500"
          >
            <X className="w-4 h-4" /> {error}
          </motion.div>
        )}
        {!inCall && (
           <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 px-4 bg-footer"
           >
             <div className="max-w-md w-full bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-2xl bg-sidebar border-theme">
               <div className="flex flex-col items-center mb-10">
                 <h1 className="text-5xl font-black tracking-tight text-center bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">QwFlux</h1>
                 <p className="text-blue-200 text-sm mt-2">P2P Chat and Video meeting</p>
               </div>
              
               <div className="space-y-6">
                 <div>
                   <label className="block text-xs font-semibold text-zinc-500 uppercase mb-2 ml-1">Display Name</label>
                   <input 
                    type="text" 
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="User" 
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                 </div>

                 <div className="pt-4 border-t border-purple-800">
                   <button 
                    onClick={handleCreate}
                    disabled={isConnecting}
                    className="w-full py-3 bg-blue-400 hover:bg-blue-600 disabled:opacity-55 rounded-xl font-semibold mb-3 transition-all active:scale-95 flex items-center justify-center gap-2"
                   >
                    {isConnecting && !joinId ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Meeting"}
                   </button>
                  
                   <div className="relative flex items-center py-4">
                     <div className="flex-grow border-t border-zinc-800"></div>
                     <span className="flex-shrink mx-4 text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-black">or</span>
                     <div className="flex-grow border-t border-zinc-800"></div>
                   </div>

                   <div className="flex gap-2">
                     <input 
                      type="text" 
                      maxLength={6} 
                      value={joinId}
                      onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                      placeholder="Join Code" 
                      className="flex-1 bg-purple-800 border border-purple-700 rounded-xl px-4 py-3 text-center font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                     <button 
                      onClick={() => handleJoin(false)}
                      disabled={joinId.length !== 6 || isConnecting}
                      className={`px-6 rounded-xl font-semibold transition-all ${joinId.length === 6 ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-600'}`}
                     >
                      {isConnecting && joinId ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}
                     </button>
                   </div>
                   
                   {joinId.length === 6 && (
                       <button 
                        onClick={() => handleJoin(true)}
                        disabled={isConnecting}
                        className="w-full mt-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2"
                       >
                        <MessageCircle className="w-4 h-4" /> Join as Chat-Only
                       </button>
                   )}
                 </div>
               </div>
             </div>
           </motion.div>
        )}
       </AnimatePresence>

      {inCall && (
         <>
           <main className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden relative">
             <div className="flex-1 flex flex-col gap-4 min-h-0">
               <div className={`grid gap-4 w-full h-full content-center justify-center ${
                Object.keys(remoteStreams).length === 0 ? 'max-w-2xl mx-auto grid-cols-1' :
                Object.keys(remoteStreams).length === 1 ? 'max-w-5xl mx-auto grid-cols-1 md:grid-cols-2' :
                Object.keys(remoteStreams).length <= 3 ? 'grid-cols-1 md:grid-cols-2' :
                'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              }`}>
                {/* Local Video */}
                 <div className="relative bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-700 bg-sidebar border-theme aspect-[4/3] flex items-center justify-center w-full">
                   <video 
                    ref={localVideoRef}
                    className={`w-full h-full object-cover mirror ${!vidActive ? 'hidden' : ''}`} 
                    autoPlay 
                     muted 
                    playsInline 
                    onLoadedMetadata={(e) => (e.target as HTMLVideoElement).play().catch(err => console.error("Local play failed ", err))}
                  />
                  {!vidActive && (
                     <div className="absolute inset-0 flex items-center justify-center bg-main" style={{ backgroundColor: profileColor }}>
                       <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center border border-white/30 backdrop-blur-sm">
                         <span className="text-4xl font-black text-white">{myName.charAt(0).toUpperCase()}</span>
                       </div>
                     </div>
                  )}
                   <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1.5 rounded-lg text-sm flex items-center gap-3 backdrop-blur-md border border-white/10 text-white">
                     <span>{myName} (You)</span>
                     <div className="flex gap-1.5 border-l border-white/20 pl-2">
                      {micActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5 text-red-500" />}
                     </div>
                   </div>
                 </div>

                {/* Remote Videos */}
                {Object.entries(remoteStreams).map(([peerId, stream]) => (
                   <RemoteVideo 
                    key={peerId} 
                    stream={stream as MediaStream} 
                    participant={participants[peerId]} 
                  />
                ))}
               </div>
             </div>

            {/* Sidebar */}
             <AnimatePresence>
              {showSidebar && (
                 <motion.aside 
                  initial={{ x: 320, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 320, opacity: 0 }}
                  transition={{ type: 'tween', ease: 'easeInOut', duration: 0.3 }}
                  className="fixed inset-y-0 right-0 z-40 w-full sm:w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col gap-4 p-4 md:relative md:inset-auto md:border-l-0 md:p-0 md:bg-transparent md:z-0 md:w-80 h-full"
                 >
                   <div className="bg-zinc-800 rounded-2xl border border-zinc-700 p-4 shadow-xl bg-sidebar border-theme flex justify-between items-start">
                     <div>
                       <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1 block text-secondary">Meeting ID</label>
                       <div className="text-2xl font-mono font-black text-blue-400 tracking-tighter">{meetingId}</div>
                     </div>
                     <div className="flex flex-col items-end gap-2">
                       <button 
                        onClick={() => setShowSidebar(false)}
                        className="p-1 hover:bg-zinc-700 rounded-md transition-colors md:hidden"
                       >
                         <X className="w-4 h-4" />
                       </button>
                       <div className="text-right">
                         <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1 block text-secondary">Duration</label>
                         <div className="text-xl font-mono font-bold text-blue-500">{formatDuration(meetingDuration)}</div>
                       </div>
                     </div>
                   </div>

                   <div className="flex-1 bg-zinc-800 rounded-2xl border border-zinc-700 flex flex-col shadow-xl overflow-hidden bg-sidebar border-theme">
                     <div className="p-4 border-b border-zinc-700 border-theme flex justify-between items-center">
                       <h2 className="font-bold flex items-center gap-2 text-primary">
                         <MessageSquare className="w-4 h-4 text-blue-500" /> Chat
                       </h2>
                       <button 
                        onClick={() => setShowSidebar(false)}
                        className="p-1 hover:bg-zinc-700 rounded-md transition-colors hidden md:block"
                        title="Hide Sidebar"
                       >
                         <X className="w-4 h-4" />
                       </button>
                     </div>
                     <div 
                      className="flex-1 overflow-y-auto p-4 space-y-4 cursor-pointer"
                      onClick={() => setShowTimestamps(!showTimestamps)}
                     >
                      {messages.map((msg, i) => (
                         <div key={i} className={`flex flex-col ${msg.isMine ? 'items-end' : 'items-start'}`}>
                           <div className="flex items-center gap-2 mb-1 px-1">
                             <span className="text-[10px] text-zinc-500 font-bold text-secondary">{msg.sender}</span>
                            {showTimestamps && <span className="text-[8px] text-zinc-400 font-medium">{msg.timestamp}</span>}
                           </div>
                           <div 
                            className={`chat-bubble ${msg.isMine ? 'chat-mine' : 'chat-theirs'}`}
                            style={msg.isMine ? { backgroundColor: profileColor } : {}}
                           >
                            {msg.text}
                           </div>
                         </div>
                      ))}
                       <div ref={chatEndRef} />
                     </div>
                     <div className="p-4 bg-zinc-900/50 bg-main/50">
                       <form onSubmit={handleSendMessage} className="flex gap-2">
                         <input 
                          type="text" 
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Message..." 
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-main border-theme text-primary"
                        />
                         <button type="submit" className="bg-blue-600 p-2 rounded-lg hover:bg-blue-700 transition-colors accent-theme">
                           <Send className="w-4 h-4" />
                         </button>
                       </form>
                     </div>
                   </div>
                 </motion.aside>
              )}
             </AnimatePresence>
           </main>

           <footer className="h-20 bg-zinc-950 border-t border-zinc-800 flex items-center overflow-x-auto no-scrollbar px-6 bg-footer border-theme">
             <div className="flex items-center gap-4 mx-auto min-w-max">
               <button 
                onClick={toggleMic}
                className={`control-btn ${!micActive ? 'active-off' : ''}`}
                title="Toggle Microphone"
               >
                {micActive ? <Mic /> : <MicOff />}
               </button>
               <button 
                onClick={toggleVideo}
                className={`control-btn ${!vidActive ? 'active-off' : ''}`}
                title="Toggle Video"
               >
                {vidActive ? <Video /> : <VideoOff />}
               </button>
               <button 
                onClick={toggleScreenShare}
                className={`control-btn ${isScreenSharing ? 'bg-blue-600 border-blue-600' : ''}`}
                title="Share Screen"
               >
                 <Monitor />
               </button>
               <button 
                onClick={() => setShowParticipants(true)}
                className="control-btn"
                title="Participants"
               >
                 <User />
               </button>
               <button 
                onClick={() => setShowSidebar(!showSidebar)}
                className={`control-btn ${showSidebar ? 'bg-blue-600 border-blue-600' : ''}`}
                title="Toggle Chat"
               >
                 <MessageSquare />
               </button>
               <div className="w-px h-6 bg-zinc-800 mx-2"></div>
               <button 
                onClick={() => {
                  setTempName(myName);
                  setTempColor(profileColor);
                  setTempTheme(theme);
                  setTempSound(soundEnabled);
                  setShowSettings(true);
                }}
                className="control-btn"
                title="Settings"
               >
                 <Settings />
               </button>
               <button 
                onClick={handleHangup}
                className="control-btn bg-red-500 border-red-500 text-white hover:bg-red-600 transition-colors"
                title="Hang Up"
               >
                 <PhoneOff />
               </button>
             </div>
           </footer>

           <AnimatePresence>
            {showSettings && (
               <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
               >
                 <motion.div 
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl bg-sidebar border-theme"
                 >
                   <div className="p-6 border-b border-zinc-800 flex items-center justify-between border-theme">
                     <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
                       <Settings className="w-5 h-5 text-blue-500" /> Settings
                     </h2>
                     <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors hover:bg-main">
                       <X className="w-5 h-5 text-primary" />
                     </button>
                   </div>
                  
                   <div className="p-6 space-y-6">
                     <div className="space-y-3">
                       <label className="text-xs font-bold text-blue-300 uppercase tracking-wider flex items-center gap-2 text-secondary">
                         <User className="w-3 h-3" /> Name (Display)
                       </label>
                       <input 
                        type="text" 
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-main border-theme text-primary"
                      />
                     </div>

                     <div className="space-y-3">
                       <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2 text-secondary">
                         <Palette className="w-3 h-3" /> Profile Color
                       </label>
                       <div className="flex gap-3">
                        {['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706'].map(color => (
                           <button 
                            key={color}
                            onClick={() => setTempColor(color)}
                            className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-90 ${tempColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                       </div>
                     </div>

                     <div className="space-y-3">
                       <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2 text-secondary">
                         <Sun className="w-3 h-3" /> Appearance
                       </label>
                       <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'dark', name: 'Dark', icon: <Moon className="w-4 h-4" /> },
                          { id: 'light', name: 'Light', icon: <Sun className="w-4 h-4" /> },
                        ].map(t => (
                           <button 
                            key={t.id}
                            onClick={() => setTempTheme(t.id as any)}
                            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${tempTheme === t.id ? 'bg-blue-600 border-blue-500 text-white accent-theme' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 bg-main border-theme text-secondary'}`}
            >
                            {t.icon} {t.name}
                           </button>
                        ))}
                       </div>
                     </div>

                     <div className="pt-4 border-t border-zinc-800 border-theme">
                       <button 
                        onClick={() => setTempSound(!tempSound)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 rounded-xl bg-main border border-theme hover:bg-zinc-700 transition-colors"
                       >
                         <span className="text-sm font-medium text-primary flex items-center gap-2">
                          Sound Effects
                         </span>
                         <div className={`w-10 h-5 rounded-full transition-colors relative ${tempSound ? 'bg-blue-600' : 'bg-zinc-600'}`}>
                           <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempSound ? 'left-6' : 'left-1'}`} />
                         </div>
                       </button>
                     </div>
                   </div>

                   <div className="p-6 bg-zinc-950/50 border-t border-zinc-800 bg-footer border-theme">
                     <button 
                      onClick={() => {
                        setMyName(tempName);
                        setProfileColor(tempColor);
                        setTheme(tempTheme);
                        setSoundEnabled(tempSound);
                        if (tempName !== myName && inCall) {
                          sendStatusUpdate(micActive, vidActive, tempName);
                        }
                        setShowSettings(false);
                      }}
                       className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-semibold transition-colors bg-main text-primary"
                     >
                      Done
                     </button>
                   </div>
                 </motion.div>
               </motion.div>
            )}

            {showParticipants && (
               <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
               >
                 <motion.div 
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl bg-sidebar border-theme"
                 >
                   <div className="p-6 border-b border-zinc-800 flex items-center justify-between border-theme">
                     <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
                       <User className="w-5 h-5 text-blue-500" /> Participants ({Object.keys(participants).length + 1})
                     </h2>
                     <button onClick={() => setShowParticipants(false)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors hover:bg-main">
                       <X className="w-5 h-5 text-primary" />
                     </button>
                   </div>
                  
                   <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Me */}
                     <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-lg" style={{ backgroundColor: profileColor }}>
                          {myName.charAt(0).toUpperCase()}
                         </div>
                         <div>
                           <p className="text-sm font-bold text-primary">{myName} (You)</p>
                           <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{isHost ? 'Host' : 'Participant'}</p>
                         </div>
                       </div>
                       <div className="flex gap-2">
                        {micActive ? <Mic className="w-4 h-4 text-zinc-400" /> : <MicOff className="w-4 h-4 text-red-500" />}
                        {vidActive ? <Video className="w-4 h-4 text-zinc-400" /> : <VideoOff className="w-4 h-4 text-red-500" />}
                       </div>
                     </div>

                    {/* Others */}
                    {Object.values(participants).map((p: Participant) => (
                       <div key={p.peerId} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                         <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-lg" style={{ backgroundColor: p.color }}>
                            {p.name.charAt(0).toUpperCase()}
                           </div>
                           <div>
                             <p className="text-sm font-bold text-primary">{p.name}</p>
                             <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Participant</p>
                           </div>
                         </div>
                         <div className="flex gap-2">
                          {p.mic ? <Mic className="w-4 h-4 text-zinc-400" /> : <MicOff className="w-4 h-4 text-red-500" />}
                          {p.vid ? <Video className="w-4 h-4 text-zinc-400" /> : <VideoOff className="w-4 h-4 text-red-500" />}
                         </div>
                       </div>
                    ))}
                   </div>

                   <div className="p-6 bg-zinc-950/50 border-t border-zinc-800 bg-footer border-theme">
                     <button 
                      onClick={() => setShowParticipants(false)}
                      className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-semibold transition-colors bg-main text-primary"
                     >
                      Close
                     </button>
                   </div>
                 </motion.div>
               </motion.div>
            )}
           </AnimatePresence>
         </>
      )}
    </div>
  );
}
