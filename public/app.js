const socket = io();
const roomInput = document.getElementById("room");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const audioBtn = document.getElementById("audioBtn");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const localEmpty = document.getElementById("localEmpty");
const remoteEmpty = document.getElementById("remoteEmpty");
const statusEl = document.getElementById("status");

let roomId = "";
let screenStream = null;
let joined = false;
const peers = new Map();

function status(message) { statusEl.textContent = message; }

async function getPeer(peerId) {
  if (peers.has(peerId)) return peers.get(peerId);

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  if (screenStream) {
    screenStream.getTracks().forEach(track => pc.addTrack(track, screenStream));
  }

  pc.onicecandidate = event => {
    if (event.candidate) socket.emit("signal", {
      to: peerId, data: { type: "ice", candidate: event.candidate }
    });
  };

  pc.ontrack = event => {
    const stream = event.streams[0];
    remoteVideo.srcObject = stream;
    remoteEmpty.style.display = "none";
    audioBtn.disabled = false;
    remoteVideo.play().catch(() => status("Clique em “Ativar áudio recebido” para ouvir."));
    status("Conectado! Recebendo tela e áudio quando disponíveis.");
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") status("Conexão estabelecida.");
    if (pc.connectionState === "failed") status("A conexão falhou. Tente novamente ou use outra rede.");
  };

  peers.set(peerId, pc);
  return pc;
}

async function makeOffer(peerId) {
  const pc = await getPeer(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("signal", { to: peerId, data: { type: "offer", sdp: pc.localDescription } });
}

joinBtn.addEventListener("click", async () => {
  if (joined) return;
  roomId = roomInput.value.trim();
  if (!roomId) return status("Digite um código para a sala.");

  if (!navigator.mediaDevices?.getDisplayMedia) {
    return status("Seu navegador não permite compartilhar tela. Use Chrome ou Edge atualizado.");
  }

  try {
    status("Escolha a tela ou aba e marque a opção de compartilhar áudio...");
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    });

    localVideo.srcObject = screenStream;
    localEmpty.style.display = "none";
    screenStream.getVideoTracks()[0].addEventListener("ended", leaveRoom);

    const audioTracks = screenStream.getAudioTracks();
    if (!audioTracks.length) {
      status("Tela capturada, mas o navegador não forneceu áudio. Confira a opção de áudio no seletor.");
    } else {
      status("Áudio da tela capturado. Entrando na sala...");
    }

    socket.emit("join-room", roomId);
    joined = true;
    joinBtn.disabled = true;
    roomInput.disabled = true;
    leaveBtn.disabled = false;
  } catch (err) {
    console.error(err);
    status(err.name === "NotAllowedError"
      ? "Compartilhamento cancelado. Clique novamente e autorize a captura."
      : "Não consegui capturar a tela. Confira as permissões do navegador.");
  }
});

socket.on("existing-peers", async peerIds => {
  for (const id of peerIds) await makeOffer(id);
  if (!peerIds.length) status("Sala criada. Envie o código para outra pessoa entrar.");
});

socket.on("signal", async ({ from, data }) => {
  try {
    const pc = await getPeer(from);
    if (data.type === "offer") {
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", { to: from, data: { type: "answer", sdp: pc.localDescription } });
    } else if (data.type === "answer") {
      await pc.setRemoteDescription(data.sdp);
    } else if (data.type === "ice") {
      await pc.addIceCandidate(data.candidate);
    }
  } catch (err) {
    console.error(err);
    status("Erro ao estabelecer a chamada. Tente sair e entrar novamente.");
  }
});

socket.on("peer-left", peerId => {
  const pc = peers.get(peerId);
  if (pc) pc.close();
  peers.delete(peerId);
  remoteVideo.srcObject = null;
  remoteEmpty.style.display = "block";
  audioBtn.disabled = true;
  status("A outra pessoa saiu da sala.");
});

audioBtn.addEventListener("click", async () => {
  remoteVideo.muted = false;
  remoteVideo.volume = 1;
  try { await remoteVideo.play(); status("Áudio recebido ativado."); }
  catch { status("O navegador ainda bloqueou o áudio. Clique no controle de volume do vídeo."); }
});

function leaveRoom() {
  for (const pc of peers.values()) pc.close();
  peers.clear();
  if (screenStream) screenStream.getTracks().forEach(track => track.stop());
  screenStream = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  localEmpty.style.display = "block";
  remoteEmpty.style.display = "block";
  joined = false;
  joinBtn.disabled = false;
  roomInput.disabled = false;
  leaveBtn.disabled = true;
  audioBtn.disabled = true;
  status("Você saiu da sala.");
}
leaveBtn.addEventListener("click", leaveRoom);

socket.on("connect_error", () => status("Não consegui conectar ao servidor."));
