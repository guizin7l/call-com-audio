const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    const room = String(roomId || "").trim().slice(0, 50);
    if (!room) return;

    const peers = [...(io.sockets.adapter.rooms.get(room) || [])]
      .filter((id) => id !== socket.id);

    socket.join(room);
    socket.data.roomId = room;
    socket.emit("existing-peers", peers);
    socket.to(room).emit("peer-joined", socket.id);
  });

  socket.on("signal", ({ to, data }) => {
    if (to && data) io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("disconnect", () => {
    const room = socket.data.roomId;
    if (room) socket.to(room).emit("peer-left", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Call com áudio rodando em http://localhost:${PORT}`);
});