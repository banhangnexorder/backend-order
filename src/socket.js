import { Server } from "socket.io";

export const initSocket = (server) => {

  const io = new Server(server, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {

    socket.on("join_store", (storeId) => {
      socket.join(`store_${storeId}`);
    });

  });

  return io;
};